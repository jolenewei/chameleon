import { DEFAULT_MODEL, MSG, STORAGE } from "@common/constants";
const ENV_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
const ENV_MODEL   = import.meta.env.VITE_OPENAI_MODEL as string | undefined;

console.log("[Chameleon] SW loaded");

// helper: prefer options value, fall back to .env
async function getApiKey(): Promise<string | undefined> {
  const obj = await chrome.storage.sync.get([STORAGE.API_KEY]);
  const saved = obj[STORAGE.API_KEY] as string | undefined;
  return saved || ENV_API_KEY;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      console.log("[Chameleon] onMessage", message?.type);

      switch (message?.type) {
        case MSG.REWRITE_TEXT: {
          const { text, tone, goal, customTone, customGoal, customPrompt, compareTones, tonesForCompare } = message.payload;

          // get key & model (env fallback)
          const [apiKey, modelObj] = await Promise.all([
            getApiKey(),
            chrome.storage.sync.get([STORAGE.MODEL]),
          ]);
          const model = (modelObj[STORAGE.MODEL] as string) || ENV_MODEL || DEFAULT_MODEL;

          console.log("[Chameleon] rewrite request", {
            hasKey: !!apiKey,
            model,
            compareTones: !!compareTones,
            textLen: (text || "").length,
          });

          if (!apiKey) {
            sendResponse({ ok: false, error: "NO_API_KEY" });
            chrome.runtime.openOptionsPage();
            return;
          }

          const prompt = buildPrompt({
            text,
            tone,
            goal,
            customTone,
            customGoal,
            customPrompt,
            compareTones,
          });

          const data = await callOpenAI({
            apiKey,
            model,
            prompt,
            compareTones,
            tones: tonesForCompare,
          });

          console.log("[Chameleon] rewrite success", data);
          sendResponse({ ok: true, data });
          return;
        }
        case MSG.APPLY_REWRITE: {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) { sendResponse({ ok: false, error: "NO_ACTIVE_TAB" }); return; }

            // try to send to an already-injected content script
            await chrome.tabs.sendMessage(tab.id, { type: MSG.APPLY_REWRITE, payload: message.payload });
            sendResponse({ ok: true });
          } catch {
            // if the receiving end doesn't exist, inject the script, then retry once
            try {
              await chrome.scripting.executeScript({
                target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id! },
                files: ["contentScript.js"],
              });
              const [tab2] = await chrome.tabs.query({ active: true, currentWindow: true });
              await chrome.tabs.sendMessage(tab2.id!, { type: MSG.APPLY_REWRITE, payload: message.payload });
              sendResponse({ ok: true });
            } catch (e: any) {
              sendResponse({ ok: false, error: "INJECT_OR_SEND_FAILED: " + (e?.message || String(e)) });
            }
          }
          return;
        }
        case MSG.SAVE_LAST_SOURCE: {
          await chrome.storage.session.set({ [STORAGE.LAST_SOURCE_TEXT]: message.payload?.text || "" });
          sendResponse({ ok: true });
          return;
        }
        case MSG.GET_LAST_SOURCE: {
          const s = await chrome.storage.session.get([STORAGE.LAST_SOURCE_TEXT]);
          sendResponse({ ok: true, text: s[STORAGE.LAST_SOURCE_TEXT] || "" });
          return;
        }
        case MSG.OPEN_OPTIONS: {
          chrome.runtime.openOptionsPage();
          sendResponse({ ok: true });
          return;
        }
        case MSG.OPEN_POPUP: {
          try {
            const txt = message?.payload?.text?.trim?.();
            if (txt) {
              await chrome.storage.session.set({ [STORAGE.LAST_SOURCE_TEXT]: txt });
            }
            await chrome.action.openPopup();
            sendResponse({ ok: true });
          } catch (e) {
            try {
              const url = chrome.runtime.getURL("src/popup/index.html");
              await chrome.windows.create({ url, type: "popup", width: 460, height: 560 });
              sendResponse({ ok: true, fallback: true });
            } catch (e2) {
              sendResponse({ ok: false, error: String(e2) });
            }
          }
          return;
        }
        default:
          sendResponse({ ok: false, error: "UNKNOWN_MESSAGE" });
          return;
      }
    } catch (e: any) {
      console.error("[Chameleon] SW error", e); 
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true; // async
});

function buildPrompt(opts: {
  text: string;
  tone?: string | null;
  goal?: string | null;
  customTone?: string;
  customGoal?: string;
  customPrompt?: string;
  compareTones?: boolean;
}) {
  const { text, tone, goal, customTone, customGoal, customPrompt, compareTones } = opts;

  const base = `
You are Chameleon, an assistant that rewrites email snippets for Gmail users.

Rules:
- Keep the original meaning and facts.
- Improve clarity and flow; concise by default.
- Preserve names, links, dates, numbers.
- Produce clean email paragraphing (blank lines between paragraphs).
- Do NOT wrap the body with quotes or code fences.
- If a "Subject" would help, propose one.

Input:
---
${text}
---
`;

  if (compareTones) {
    return base + `Rewrite the input in the requested tones. Output JSON array of { "tone": string, "text": string }.`;
  }

  const t0 = tone === "custom" ? (customTone || "") : tone || "";
  const t = t0 === "auto" ? "" : t0;
  const g0 = goal === "custom" ? (customGoal || "") : goal || "";
  const g = g0 === "auto" ? "" : g0;

  let directives = "";
  if (t) directives += `Tone: ${t}.\n`;
  if (t0 === "auto") directives += `Infer likely tone from context.\n`;
  if (g) directives += `Goal: ${g}.\n`;
  if (g0 === "auto") directives += `Infer the likely goal from the message (e.g., follow-up, ask for help, apply for a job) and optimize for it.\n`;
  if (customPrompt) directives += `Additional notes: ${customPrompt}\n`;

  return (
    base +
    directives +
    `Now return **ONLY** valid JSON:\n{"subject": string, "body": string}\n- "subject": a concise subject line (can be empty if not applicable)\n- "body": the email body with paragraph breaks using \\n\\n\n`
  );
}

async function callOpenAI(params: {
  apiKey: string;
  model: string;
  prompt: string;
  compareTones?: boolean;
  tones?: string[];
}) {
  const { apiKey, model, prompt, compareTones, tones = [] } = params;

  const messages = compareTones
    ? [
        { role: "system", content: "Return valid JSON only when JSON is requested." },
        { role: "user", content: prompt },
        { role: "user", content: `Tones to compare: ${tones.join(", ")}.` }
      ]
    : [
        { role: "system", content: "Return only what the user requested. If they asked for JSON, return valid JSON and nothing else." },
        { role: "user", content: prompt }
      ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.3 })
  });

  if (!res.ok) {
    let detail = ""; try { detail = await res.text(); } catch {}
    if (res.status === 429) throw new Error("OpenAI 429: Rate limit or no credits. Check billing/limits.");
    if (res.status === 401) throw new Error("OpenAI 401: Invalid API key.");
    throw new Error(`OpenAI error ${res.status}: ${detail || res.statusText}`);
  }

  const data = (await res.json()) as any;
  const raw = (data.choices?.[0]?.message?.content ?? "").trim();

  if (compareTones) {
    try { return { compare: JSON.parse(raw) }; }
    catch { return { compare: tones.map(t => ({ tone: t, text: raw })) }; }
  }

  // try to parse {subject, body}; fall back to treating whole thing as body
  try {
    const obj = JSON.parse(raw);
    const subject = (obj?.subject ?? "").toString();
    const body = (obj?.body ?? "").toString();
    return { text: body, subject };
  } catch {
    return { text: raw, subject: "" };
  }
}
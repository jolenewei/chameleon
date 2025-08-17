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
            await chrome.action.openPopup();
            sendResponse({ ok: true });
          } catch (e) {
            sendResponse({ ok: false, error: String(e) });
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
- Return only the rewritten text (no preface).
- Match requested tone and align to stated goal when provided.
- Try to format like an email with the correct indentation if the message seems like the full email.

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
  const g = g0 == "auto" ? "" : g0;

  let directives = "";
  if (t) directives += `Tone: ${t}.\n`; 
  if (t0 === "auto") directives += `Infer the likely tone from the context of their message (e.g. formal / casual / apologetic ) and optimize for it.\n`;
  if (g) directives += `Goal: ${g}.\n`;
  if (g0 === "auto") directives += `Infer the likely goal from their message (e.g. follow-up / ask for help / apply for a job) and optimize for it.\n`;
  if (customPrompt) directives += `Additional notes: ${customPrompt}\n`;

  return base + directives + "Now return the rewritten text only.";
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
        { role: "system", content: "Return only the rewritten email text. No preamble." },
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

  const data = await res.json() as any;
  const text = (data.choices?.[0]?.message?.content ?? "").trim();

  if (compareTones) {
    try { return { compare: JSON.parse(text) }; }
    catch { return { compare: tones.map(t => ({ tone: t, text })) }; }
  }
  return { text };
}
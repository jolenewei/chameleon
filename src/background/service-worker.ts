import { DEFAULT_MODEL, MSG, STORAGE } from "@common/constants";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case MSG.REWRITE_TEXT: {
          const { text, tone, goal, customTone, customGoal, customPrompt, compareTones, tonesForCompare } = message.payload;

          const sync = await chrome.storage.sync.get([STORAGE.API_KEY, STORAGE.MODEL]);
          const apiKey = sync[STORAGE.API_KEY];
          const model = sync[STORAGE.MODEL] || DEFAULT_MODEL;

          if (!apiKey) {
            sendResponse({ ok: false, error: "NO_API_KEY" });
            chrome.runtime.openOptionsPage();
            return;
          }

          const prompt = buildPrompt({ text, tone, goal, customTone, customGoal, customPrompt, compareTones });
          const data = await callOpenAI({ apiKey, model, prompt, compareTones, tones: tonesForCompare });

          sendResponse({ ok: true, data });
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
        default:
          sendResponse({ ok: false, error: "UNKNOWN_MESSAGE" });
          return;
      }
    } catch (e: any) {
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

Input:
---
${text}
---
`;

  if (compareTones) {
    return base + `Rewrite the input in the requested tones. Output JSON array of { "tone": string, "text": string }.`;
  }

  const t = tone === "custom" ? (customTone || "") : tone || "";
  const g = goal === "custom" ? (customGoal || "") : goal || "";

  let directives = "";
  if (t) directives += `Tone: ${t}.\n`;
  if (g) directives += `Goal: ${g}.\n`;
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

  const body = compareTones
    ? {
        model,
        input: [
          { role: "developer", content: "Return valid JSON only when JSON is requested." },
          { role: "user", content: prompt },
          { role: "user", content: `Tones to compare: ${tones.join(", ")}.` }
        ],
        text_format: {
          type: "json_schema",
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tone: { type: "string" },
                text: { type: "string" }
              },
              required: ["tone", "text"]
            }
          }
        }
      }
    : {
        model,
        input: [
          { role: "developer", content: "Return only the rewritten email text. No preamble." },
          { role: "user", content: prompt }
        ]
      };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as any;
  const text = (data.output_text ?? data.content?.[0]?.text ?? data.choices?.[0]?.message?.content ?? "").trim();

  if (compareTones) {
    try { return { compare: JSON.parse(text) }; }
    catch { return { compare: tones.map(t => ({ tone: t, text })) }; }
  }

  return { text };
}

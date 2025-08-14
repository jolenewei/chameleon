import React, { useEffect, useState } from "react";
import { DEFAULT_MODEL, STORAGE } from "@common/constants";

export default function Options() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      const obj = await chrome.storage.sync.get([STORAGE.API_KEY, STORAGE.MODEL]);
      setApiKey(obj[STORAGE.API_KEY] || "");
      setModel(obj[STORAGE.MODEL] || DEFAULT_MODEL);
    })();
  }, []);

  async function save() {
    await chrome.storage.sync.set({ [STORAGE.API_KEY]: apiKey.trim(), [STORAGE.MODEL]: (model || DEFAULT_MODEL).trim() });
    setStatus("Saved ✓");
  }

  async function test() {
    setStatus("Testing…");
    try {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ model: model || DEFAULT_MODEL, input: [{ role: "user", content: "Say OK." }] })
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      setStatus("Connection OK ✓");
    } catch (e: any) {
      setStatus("Failed: " + e.message);
    }
  }

  return (
    <main className="opt">
      <h1>Chameleon Settings</h1>
      <label>OpenAI API Key</label>
      <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-…" />
      <label>Model</label>
      <input value={model} onChange={e=>setModel(e.target.value)} placeholder="e.g., gpt-5-mini" />
      <div className="hint">Your key is stored locally via chrome.storage and used only to call OpenAI.</div>
      <div className="row">
        <button onClick={save}>Save</button>
        <button onClick={test}>Test</button>
      </div>
      <div className="status">{status}</div>
    </main>
  );
}

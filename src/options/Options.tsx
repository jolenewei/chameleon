import React, { useEffect, useState } from "react";
import { STORAGE } from "@common/constants";

export default function Options() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [status, setStatus] = useState("");

  // load existing settings
  useEffect(() => {
    (async () => {
      const s = await chrome.storage.sync.get([STORAGE.API_KEY, STORAGE.MODEL]);
      setApiKey(s[STORAGE.API_KEY] || "");
      setModel(s[STORAGE.MODEL] || "gpt-4o-mini");
    })();
  }, []);

  async function save() {
    await chrome.storage.sync.set({
      [STORAGE.API_KEY]: apiKey.trim(),
      [STORAGE.MODEL]: model.trim(),
    });
    setStatus("✓ Saved");
    setTimeout(() => setStatus(""), 1800);
  }

  async function test() {
    setStatus("Testing…");
    try {
      if (!apiKey.startsWith("sk-")) throw new Error("That doesn’t look like an API key.");
      setStatus("✓ Looks good");
    } catch (e: any) {
      setStatus("⚠ " + (e?.message || "Test failed"));
    }
    setTimeout(() => setStatus(""), 2200);
  }

  const ok = status.startsWith("✓");

  return (
    <main className="opt">
      <header className="opt-hdr">
        <div className="brand">
          <img src="/assets/icon48.png" alt="Chameleon" />
          <div className="t">
            <h1>Chameleon</h1>
            <p>adapts your emails to what you want</p>
          </div>
        </div>
      </header>

      <section className="opt-body">
        <div className="field">
          <label>OpenAI API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
          />
          <p className="hint">
            Stored locally with <code>chrome.storage</code>. Used only to call OpenAI.
          </p>
        </div>

        <div className="field">
          <label>Model</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g., gpt-4o-mini"
          />
        </div>

        <div className="actions">
          <button className="btn btn-primary" onClick={save}>Save</button>
          <button className="btn btn-ghost" onClick={test}>Test</button>
        </div>

        {status && (
          <div className={`status ${ok ? "ok" : "err"}`}>{status}</div>
        )}
      </section>
    </main>
  );
}
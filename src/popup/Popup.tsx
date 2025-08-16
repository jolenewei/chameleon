import React, { useEffect, useMemo, useState } from "react";
import { MSG } from "@common/constants";

type CompareItem = { tone: string; text: string };

const tones = ["casual","formal","friendly","assertive","slightly formal"] as const;
const goals = ["auto","follow-up","apply for job","ask for help"] as const;

export default function Popup() {
  const [source, setSource] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  const [tone, setTone] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [customTone, setCustomTone] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");

  const [tab, setTab] = useState<"rewrite"|"compare">("rewrite");
  const [comparePicks, setComparePicks] = useState<string[]>([]);
  const [compareResults, setCompareResults] = useState<CompareItem[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const reply = await chrome.runtime.sendMessage({ type: MSG.GET_LAST_SOURCE });
        if (reply?.ok && reply.text) setSource(reply.text);
      } catch (err) {
        // SW might not be awake yet — no big deal
        console.warn("[Chameleon] popup init: SW sleeping", err);
      }
    })();
  }, []);

  async function rewrite(usingText?: string) {
    const text = (usingText ?? source).trim();
    if (!text) return;
    setBusy(true);

    const payload = {
      text,
      tone: tone || (customTone ? "custom" : null),
      goal: goal || (customGoal ? "custom" : null),
      customTone,
      customGoal,
      customPrompt,
      compareTones: false
    };

    const res = await chrome.runtime.sendMessage({ type: MSG.REWRITE_TEXT, payload });
    if (!res?.ok) {
      handleError(res?.error);
      setBusy(false);
      return;
    }
    setResult(res.data.text || "");
    setBusy(false);
  }

  async function rewriteAgain() {
    const seed = (result || source).trim();
    if (!seed) return;
    await rewrite(seed);
  }

  async function applyInGmail() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !result) return;
      await chrome.tabs.sendMessage(tab.id, { type: MSG.APPLY_REWRITE, payload: { text: result } });
      window.close();
    } catch (err) {
      alert("Open Gmail (refresh it), place your cursor in the compose box, then try Replace in Gmail again.");
      console.warn("[Chameleon] tabs.sendMessage failed", err);
    }
  }

  async function runCompare() {
    const list = comparePicks.length ? comparePicks : (tones as unknown as string[]);
    const text = source.trim();
    if (!text) return;
    setBusy(true);

    const payload = {
      text,
      tone: null,
      goal: null,
      customTone: "",
      customGoal: "",
      customPrompt,
      compareTones: true,
      tonesForCompare: list
    };
    const res = await chrome.runtime.sendMessage({ type: MSG.REWRITE_TEXT, payload });
    if (!res?.ok) {
      handleError(res?.error);
      setBusy(false);
      return;
    }
    setCompareResults(res.data.compare || []);
    setBusy(false);
  }

  function handleError(err?: string) {
    if (err === "NO_API_KEY") alert("Set your OpenAI API key in Options first (gear icon).");
    else alert("Error: " + (err || "unknown"));
  }

  const canApply = useMemo(() => !!result && !busy, [result, busy]);

  return (
    <div className="popup">
      {/* Header */}
      <header className="hdr">
        <div className="brand">
          <img src="/assets/icon48.png" alt="icon" />
          <div className="title-wrap">
            <h1 className="h1">CHAMELEON</h1>
            <p className="tag">adapts your emails to what you want</p>
          </div>
        </div>
        <button className="settings" title="Settings" onClick={() => chrome.runtime.sendMessage({ type: MSG.OPEN_OPTIONS })}>
          <img src="/assets/settings-icon.png" alt="settings" />
        </button>
      </header>

      {/* Selected text */}
      <section className="sec">
        <label>Selected Text</label>
        <textarea
          className="textarea--source"
          rows={3}
          value={source}
          onChange={e=>setSource(e.target.value)}
          placeholder="Select text in Gmail or paste here..."
        />
      </section>

      {/* Controls */}
      <section className="sec">
        <div className="group">
          <div className="field-head"><span className="label">Tone</span></div>
          <div className="row wrap">
            {tones.map(t => (
              <button key={t} className={`pill ${tone===t ? "active":""}`} onClick={()=>setTone(t)}>{cap(t)}</button>
            ))}
            <input className="custom" value={customTone} onChange={e=>{ setCustomTone(e.target.value); setTone(null); }} placeholder="Custom tone…" />
          </div>
        </div>

        <div className="group">
          <div className="field-head"><span className="label">Goal</span></div>
          <div className="row wrap">
            {goals.map(g => (
              <button key={g} className={`pill ${goal===g ? "active":""}`} onClick={()=>setGoal(g)}>{cap(g)}</button>
            ))}
          </div>
          <input className="custom-goal" value={customGoal} onChange={e=>{ setCustomGoal(e.target.value); setGoal(null); }} placeholder="Custom goal…" />
        </div>

        <div className="group">
          <label>Extra Instructions (Optional)</label>
          <input value={customPrompt} onChange={e=>setCustomPrompt(e.target.value)} placeholder="e.g., shorter, include date, keep bullets…" />
        </div>
      </section>

      {/* Tabs */}
      <nav className="tabs">
        <button className={`tab ${tab==="rewrite"?"active":""}`} onClick={()=>setTab("rewrite")}>Single Rewrite</button>
        <button className={`tab ${tab==="compare"?"active":""}`} onClick={()=>setTab("compare")}>Compare Tones</button>
      </nav>

      {/* Bodies */}
      {tab === "rewrite" ? (
        <section className="sec">
          <div className="row">
            <button className="primary" disabled={busy} onClick={()=>rewrite()}>Rewrite</button>
            <button className="primary" disabled={!canApply} onClick={applyInGmail}>Replace in Gmail</button>
            <button className="primary" disabled={!result || busy} onClick={rewriteAgain}>Rewrite Again</button>
          </div>

          <label>Result</label>
          <textarea
            className="textarea--result"
            rows={4}
            value={result}
            onChange={e=>setResult(e.target.value)}
            placeholder="Your rewrite will appear here…"
          />
        </section>
      ) : (
        <section className="sec">
          <p className="small">Pick tones to compare, or leave none selected to compare all.</p>
          <div className="row wrap">
            {tones.map(t => (
              <button
                key={t}
                className={`pill ${comparePicks.includes(t) ? "active":""}`}
                onClick={()=>{
                  setComparePicks(p => p.includes(t) ? p.filter(x=>x!==t) : [...p, t]);
                }}
              >
                {cap(t)}
              </button>
            ))}
          </div>
          <div className="row">
            <button className="primary" disabled={busy} onClick={runCompare}>Generate Comparison</button>
          </div>
          <div className="grid">
            {compareResults.map((it, i)=>(
              <div className="tone-card" key={i}>
                <div className="tone-title">{cap(it.tone)}</div>
                <div className="tone-body">{it.text}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="ftr">
        <small>Tip: select text in Gmail, then click the extension icon.</small>
      </footer>
    </div>
  );
}

function cap(s: string){ return s[0].toUpperCase() + s.slice(1); }

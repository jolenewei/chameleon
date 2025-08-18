// ---- constants / messaging ids ----
const MSG = {
  REWRITE_TEXT: "CHAMELEON_REWRITE_TEXT",
  APPLY_REWRITE: "CHAMELEON_APPLY_REWRITE",
  SAVE_LAST_SOURCE: "CHAMELEON_SAVE_LAST_SOURCE",
  GET_LAST_SOURCE: "CHAMELEON_GET_LAST_SOURCE",
  OPEN_OPTIONS: "CHAMELEON_OPEN_OPTIONS",
  OPEN_POPUP: "CHAMELEON_OPEN_POPUP", // ✅ added
};

// ---- tiny logger to prove we’re injected ----
(function hello() {
  const where = window.top === window ? "top" : "frame";
  console.log(`[Chameleon CS] loaded in ${where} window`, location.href);
})();

// ---- find gmail compose editable ----
function findActiveEditable() {
  // prefer current selection container
  const sel = window.getSelection && window.getSelection();
  if (sel && sel.anchorNode) {
    const near = closestEditable(sel.anchorNode);
    if (near) return near;
  }

  // common Gmail compose areas
  const a = document.querySelector('div[contenteditable="true"][aria-label*="Message"]');
  if (a) return a;

  const b = document.querySelector('div[role="textbox"][contenteditable="true"]');
  if (b) return b;

  // any visible editable as last resort
  const cands = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
  return cands.find(el => el.offsetParent !== null) || null;
}

function closestEditable(node) {
  let el = node instanceof Element ? node : (node && node.parentElement) || null;
  while (el) {
    if (
      el.matches &&
      (el.matches('div[contenteditable="true"][aria-label*="Message"]') ||
       el.matches('div[role="textbox"][contenteditable="true"]') ||
       el.matches('div[contenteditable="true"]'))
    ) return el;
    el = el.parentElement;
  }
  return null;
}

// ---- inline UI (mini chip + toast) ----
const CHAMELEON_STYLE_ID = "chameleon-inline-style";
const STYLE = `
#chameleon-mini {
  position: fixed; /* viewport coords */
  z-index: 2147483647;
  background: #16a34a; /* green */
  color: #fff;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  box-shadow: 0 6px 18px rgba(0,0,0,0.25);
  cursor: pointer;
  user-select: none;
  display: none;
  align-items: center;
  gap: 6px;
}
#chameleon-mini .dot { width: 6px; height: 6px; border-radius: 999px; background: #fff; opacity: .9; }
#chameleon-mini:hover { filter: brightness(1.05); }
#chameleon-toast {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 24px;
  background: #111;
  color: #fff;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12px;
  display: none;
  z-index: 2147483647;
}
`;
function ensureStyle() {
  if (!document.getElementById(CHAMELEON_STYLE_ID)) {
    const el = document.createElement("style");
    el.id = CHAMELEON_STYLE_ID;
    el.textContent = STYLE;
    document.documentElement.appendChild(el);
  }
}

let mini, toast, lastRange = null;

function init() {
  ensureStyle();

  mini = document.createElement("div");
  mini.id = "chameleon-mini";
  mini.innerHTML = `<span class="dot"></span><span>Rewrite in Chameleon</span>`;
  document.documentElement.appendChild(mini);
  mini.addEventListener("mousedown", (e) => e.preventDefault());
  mini.addEventListener("click", onMiniClick);

  toast = document.createElement("div");
  toast.id = "chameleon-toast";
  toast.textContent = "Replaced ✓";
  document.documentElement.appendChild(toast);

  document.addEventListener("selectionchange", handleSelection, true);
  window.addEventListener("scroll", hideMini, true);
  window.addEventListener("resize", hideMini, true);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === MSG.APPLY_REWRITE) {
      console.log("[Chameleon CS] APPLY_REWRITE received");
      applyRewrite((msg.payload && msg.payload.text) || "");
      sendResponse({ ok: true });
    }
  });

  console.log("[Chameleon CS] init complete");
}
init();

function handleSelection() {
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.isCollapsed) { hideMini(); return; }

  const editable = findActiveEditable();
  if (!editable || !sel.anchorNode || !editable.contains(sel.anchorNode)) { hideMini(); return; }

  lastRange = sel.getRangeAt(0).cloneRange();
  const rect = lastRange.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) { hideMini(); return; }

  positionMini(rect);
  mini.style.display = "flex";
}

function positionMini(rect) {
  const padding = 8;
  // position: fixed => rect.* are viewport-relative; don't add scroll offsets
  mini.style.left = `${rect.right + padding}px`;
  mini.style.top  = `${rect.top}px`;
}

function hideMini() { if (mini) mini.style.display = "none"; }

async function onMiniClick() {
  const text = getSelectedText() || (findActiveEditable()?.innerText || "").trim();
  if (!text) return;

  try {
    // Save first so the popup can read it on mount
    await chrome.runtime.sendMessage({ type: MSG.SAVE_LAST_SOURCE, payload: { text } });
    // Then ask background to open the popup (will use openPopup or fallback window)
    await chrome.runtime.sendMessage({ type: MSG.OPEN_POPUP, payload: { text } });
  } catch (err) {
    console.warn("[Chameleon CS] OPEN_POPUP failed", err);
  }

  mini.innerHTML = `<span class="dot"></span><span>Loading…</span>`;
  setTimeout(() => (mini.innerHTML = `<span class="dot"></span><span>Rewrite in Chameleon</span>`), 900);
}

function getSelectedText() {
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.isCollapsed) return "";
  return sel.toString().trim();
}

function applyRewrite(newText) {
  const editable = findActiveEditable();
  if (!editable) {
    console.warn("[Chameleon CS] no editable found");
    return;
  }

  // prefer exact range replace when we have it
  if (lastRange) {
    lastRange.deleteContents();
    const node = document.createTextNode(newText);
    lastRange.insertNode(node);

    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const range = document.createRange();
      range.setStartAfter(node);
      range.collapse(true);
      sel.addRange(range);
    }

    flashToast();
    return;
  }

  // fallback: execCommand
  document.execCommand("insertText", false, newText);
  flashToast();
}

function flashToast() {
  if (!toast) return;
  toast.style.display = "block";
  setTimeout(() => (toast.style.display = "none"), 1500);
}

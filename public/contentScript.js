const MSG = {
  REWRITE_TEXT: "CHAMELEON_REWRITE_TEXT",
  APPLY_REWRITE: "CHAMELEON_APPLY_REWRITE",
  SAVE_LAST_SOURCE: "CHAMELEON_SAVE_LAST_SOURCE",
  GET_LAST_SOURCE: "CHAMELEON_GET_LAST_SOURCE",
  OPEN_OPTIONS: "CHAMELEON_OPEN_OPTIONS",
};

// gmail editable finder
function findActiveEditable() {
  const candidates = Array.from(
    document.querySelectorAll('div[aria-label="Message Body"][contenteditable="true"]')
  );

  const sel = window.getSelection();
  if (sel && sel.anchorNode) {
    const el = closestEditable(sel.anchorNode);
    if (el) return el;
  }
  return candidates.find((el) => el.matches(":focus-within")) || candidates[0] || null;
}
function closestEditable(node) {
  let n = node instanceof Element ? node : (node && node.parentElement) || null;
  while (n) {
    if (n.matches && n.matches('div[aria-label="Message Body"][contenteditable="true"]')) {
      return n;
    }
    n = n.parentElement;
  }
  return null;
}

// inline css
const CHAMELEON_STYLE_ID = "chameleon-inline-style";
const STYLE = `
#chameleon-mini {
  position: fixed;
  z-index: 2147483647;
  background: #111;
  color: #fff;
  padding: 6px 10px;
  border-radius: 14px;
  font-size: 12px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  box-shadow: 0 6px 18px rgba(0,0,0,0.25);
  cursor: pointer;
  user-select: none;
  display: none;
  align-items: center;
  gap: 6px;
}
#chameleon-mini .dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
#chameleon-mini:hover { background: #222; }
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
  if (document.getElementById(CHAMELEON_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = CHAMELEON_STYLE_ID;
  el.textContent = STYLE;
  document.documentElement.appendChild(el);
}

// main logic
let mini;
let toast;
let lastRange = null;

init();

function init() {
  ensureStyle();

  mini = document.createElement("div");
  mini.id = "chameleon-mini";
  mini.innerHTML = `<span class="dot"></span><span>Rewrite ✨</span>`;
  document.documentElement.appendChild(mini);
  mini.addEventListener("mousedown", (e) => e.preventDefault());
  mini.addEventListener("click", onMiniClick);

  toast = document.createElement("div");
  toast.id = "chameleon-toast";
  toast.textContent = "Replaced ✓";
  document.documentElement.appendChild(toast);

  document.addEventListener("selectionchange", handleSelection);
  window.addEventListener("scroll", hideMini, true);
  window.addEventListener("resize", hideMini, true);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === MSG.APPLY_REWRITE) {
      applyRewrite((msg.payload && msg.payload.text) || "");
      sendResponse({ ok: true });
    }
  });
}

function handleSelection() {
  const sel = window.getSelection();
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
  mini.style.left = `${rect.right + padding}px`;
  mini.style.top = `${rect.top + window.scrollY - 2}px`;
}

function hideMini() { mini.style.display = "none"; }

async function onMiniClick() {
  const text = getSelectedText();
  if (!text) return;
  await chrome.runtime.sendMessage({ type: MSG.SAVE_LAST_SOURCE, payload: { text } });
  mini.innerHTML = `<span class="dot"></span><span>Loaded…</span>`;
  setTimeout(() => (mini.innerHTML = `<span class="dot"></span><span>Rewrite ✨</span>`), 900);
}

function getSelectedText() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return "";
  return sel.toString().trim();
}

function applyRewrite(newText) {
  const editable = findActiveEditable();
  if (!editable) return;

  if (lastRange) {
    lastRange.deleteContents();
    const node = document.createTextNode(newText);
    lastRange.insertNode(node);

    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    sel.addRange(range);

    flashToast();
  } else {
    document.execCommand("insertText", false, newText);
    flashToast();
  }
}

function flashToast() {
  toast.style.display = "block";
  setTimeout(() => (toast.style.display = "none"), 1500);
}

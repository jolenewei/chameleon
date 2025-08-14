export function findActiveEditable(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll('div[aria-label="Message Body"][contenteditable="true"]')) as HTMLElement[];

  const sel = window.getSelection();
  if (sel?.anchorNode) {
    const el = closestEditable(sel.anchorNode);
    if (el) return el;
  }
  return candidates.find(el => el.matches(":focus-within")) || candidates[0] || null;
}

function closestEditable(node: Node | null): HTMLElement | null {
  let n = node instanceof Element ? node : node?.parentElement || null;
  while (n) {
    if (n.matches && n.matches('div[aria-label="Message Body"][contenteditable="true"]')) return n as HTMLElement;
    n = n.parentElement;
  }
  return null;
}

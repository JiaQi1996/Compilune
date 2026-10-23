// Shared by the workbench and the embedded editor. Browser title tooltips have
// no configurable delay, so suppress them only while the pointer is inside.
const suppressed = new Map();
export const tooltipDelay = 1500;
export const tooltipText = (element) =>
  element.getAttribute("title") || suppressed.get(element) || "";

export function installTooltips(doc = document) {
  const win = doc.defaultView;
  const style = doc.createElement("style");
  style.textContent = `
    .compilune-tooltip {
      position: fixed; z-index: 2147483647; pointer-events: none;
      max-width: min(560px, calc(100vw - 20px));
      max-height: calc(100vh - 20px); overflow: hidden;
      padding: 7px 10px; border-radius: 6px;
      border: 1px solid var(--line, #d9ded7);
      background: var(--surface, var(--bg, #f8f7f4));
      color: var(--text, var(--fg, #242c28));
      box-shadow: 0 4px 16px #0002;
      font: var(--ui-size, 13px)/1.5 -apple-system, "Segoe UI", sans-serif;
      white-space: pre-wrap; overflow-wrap: anywhere;
    }
  `;
  doc.head.append(style);
  let owner = null, text = "", timer = null, tip = null;
  let point = { x: 0, y: 0 }, target = null;
  let description = null;

  function hide() {
    win.clearTimeout(timer);
    timer = null;
    tip?.remove();
    tip = null;
    if (owner && description !== null) {
      if (description) owner.setAttribute("aria-describedby", description);
      else owner.removeAttribute("aria-describedby");
    }
    description = null;
  }
  function dismiss() {
    hide();
    owner = null;
    text = "";
  }
  function restore(except = new Set()) {
    for (const [element, value] of suppressed) {
      if (except.has(element)) continue;
      if (!element.hasAttribute("title")) element.setAttribute("title", value);
      suppressed.delete(element);
    }
  }
  function position() {
    const box = tip.getBoundingClientRect();
    const x = Math.max(10, Math.min(point.x + 12, win.innerWidth - box.width - 10));
    const y = point.y + 20 + box.height <= win.innerHeight - 10
      ? point.y + 20 : Math.max(10, point.y - box.height - 10);
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function update(element) {
    const ancestors = [];
    for (let el = element; el instanceof win.Element; el = el.parentElement)
      ancestors.push(el);
    const next = ancestors.find((el) => tooltipText(el));
    const nextText = next ? tooltipText(next) : "";
    restore(new Set(ancestors));
    // Suppress every titled ancestor, including when the pointer hits an SVG.
    for (const el of ancestors) {
      if (!el.hasAttribute("title")) continue;
      const value = el.getAttribute("title");
      if (value) suppressed.set(el, value);
      el.removeAttribute("title");
    }
    if (owner === next && text === nextText) return;
    dismiss();
    owner = next || null;
    text = nextText;
    if (!owner) return;
    timer = win.setTimeout(() => {
      timer = null;
      if (!owner?.isConnected || doc.visibilityState === "hidden") return;
      const box = owner.getBoundingClientRect();
      if (point.x < box.left || point.x > box.right || point.y < box.top || point.y > box.bottom) return;
      tip = doc.createElement("div");
      tip.id = "compilune-hover-tooltip";
      tip.className = "compilune-tooltip";
      tip.setAttribute("role", "tooltip");
      tip.textContent = text;
      // Modal dialogs occupy the top layer; their tooltips must live there too.
      (owner.closest("dialog[open]") || doc.body).append(tip);
      description = owner.getAttribute("aria-describedby") || "";
      owner.setAttribute("aria-describedby", [description, tip.id].filter(Boolean).join(" "));
      position();
    }, tooltipDelay);
  }
  const move = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    point = { x: event.clientX, y: event.clientY };
    target = event.target;
    update(target);
  };
  doc.addEventListener("pointerover", move, true);
  doc.addEventListener("pointermove", move, true);
  doc.addEventListener("pointerout", (event) => {
    if (event.relatedTarget) return;
    target = null;
    dismiss();
    restore();
  }, true);
  for (const type of ["pointerdown", "keydown", "scroll", "wheel"])
    doc.addEventListener(type, dismiss, true);
  win.addEventListener("blur", () => { target = null; dismiss(); restore(); });
  win.addEventListener("resize", dismiss);
  new win.MutationObserver((records) => {
    // Keep changing actions (Compile/Stop, pin/unpin) current under the pointer.
    for (const record of records) {
      if (record.type !== "attributes") continue;
      const value = record.target.getAttribute("title");
      if (value && suppressed.has(record.target)) {
        suppressed.set(record.target, value);
        record.target.removeAttribute("title");
      }
    }
    if (owner && !owner.isConnected) { dismiss(); restore(); return; }
    if (owner) update(target?.isConnected ? target : owner);
  }).observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
}

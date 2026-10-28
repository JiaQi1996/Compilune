import { codeFolding, foldGutter, foldService } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { scanTeXBlocks } from "./fold-data.js";
const indexes = new WeakMap();
function index(doc) {
  let result = indexes.get(doc);
  if (!result) {
    result = new Map();
    for (const block of scanTeXBlocks(doc.toString()).blocks)
      if (!result.has(block.line) || result.get(block.line).to < block.to) result.set(block.line, block);
    indexes.set(doc, result);
  }
  return result;
}
export const texFolding = [
  foldService.of((state, lineStart) => index(state.doc).get(lineStart) || null),
  codeFolding({
    preparePlaceholder: (state, range) => state.doc.lineAt(range.to).number - state.doc.lineAt(range.from).number,
    placeholderDOM(_view, onclick, lines) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "cm-foldPlaceholder"; button.textContent = `… ${lines} 行`;
      button.title = `展开已折叠的 ${lines} 行代码`; button.setAttribute("aria-label", button.title);
      button.onclick = onclick;
      return button;
    },
  }),
  foldGutter({
    markerDOM(open) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "cm-fold-toggle";
      button.textContent = open ? "▾" : "▸";
      button.title = open ? "折叠此代码块" : "展开此代码块";
      button.setAttribute("aria-label", button.title); button.setAttribute("aria-expanded", String(open));
      return button;
    },
  }),
  EditorView.baseTheme({
    ".cm-foldGutter": { width: "20px", color: "var(--accent)" },
    ".cm-foldGutter .cm-gutterElement": { padding: "0", textAlign: "center" },
    ".cm-fold-toggle": { width: "20px", height: "1.65em", padding: "0", font: "inherit", lineHeight: "1.65", opacity: ".75", borderRadius: "4px" },
    ".cm-fold-toggle:hover, .cm-fold-toggle:focus-visible": { opacity: "1", background: "var(--hover)" },
    ".cm-foldPlaceholder": { font: "inherit", fontSize: ".86em", color: "var(--accent)", background: "var(--hover)", border: "1px solid var(--line)", borderRadius: "5px", padding: "0 6px", margin: "0 5px", lineHeight: "1.4", verticalAlign: "baseline" },
  }),
];

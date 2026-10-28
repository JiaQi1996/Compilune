import { ViewPlugin, hoverTooltip, showTooltip, EditorView } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import { getSearchQuery, searchPanelOpen } from "@codemirror/search";
import katex from "katex";
import { mathRanges, mathExpression, graphicsRanges } from "./preview-data.js";

let requestHost, currentPath;
const pending = new Map();
let sequence = 0;
export function configureInsights(post, path) { requestHost = post; currentPath = path; }
export function receiveInsight(message) {
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id); clearTimeout(request.timer); request.resolve(message);
}
function requestPreview(symbol, type = "referencePreview") {
  return new Promise(resolve => {
    const id = String(++sequence);
    const timer = setTimeout(() => { pending.delete(id); resolve({ error: "预览暂不可用，请先成功编译项目" }); }, 6000);
    pending.set(id, { resolve, timer });
    requestHost({ type, id, path: symbol.path, label: symbol.label, file: symbol.file, sourcePath: currentPath() });
  });
}
const element = (tag, cls, text) => {
  const node = document.createElement(tag); node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
function imageCard(result, label) {
  const card = element("section", "insight-card insight-image-only");
  card.setAttribute("aria-label", label);
  if (result.image && /^data:image\/(png|jpeg);base64,/.test(result.image)) {
    const image = element("img", "insight-image"); image.src = result.image; image.alt = label;
    card.append(image);
  } else card.append(element("p", "insight-image-error", result.error || "图片暂不可预览"));
  return card;
}
export async function completionPreview(symbol) {
  const data = symbol.preview;
  if (symbol.kind === "ref" && data && ["figure", "table"].includes(data.kind))
    return imageCard(await requestPreview(symbol), data.caption || symbol.label);
  const card = element("section", "insight-card");
  card.setAttribute("aria-label", symbol.kind === "cite" ? "文献预览" : "引用预览");
  card.append(element("div", "insight-eyebrow", symbol.kind === "cite" ? "BIBLIOGRAPHY" : "REFERENCE"));
  card.append(element("strong", "insight-title", data?.title || symbol.label));
  if (symbol.kind === "cite") {
    const list = element("dl", "insight-metadata");
    for (const [label, value] of [["第一作者", data?.author], ["发表年份", data?.year], ["期刊 / 会议", data?.venue]])
      list.append(element("dt", "", label), element("dd", "", value || "未提供"));
    card.append(list);
  }
  card.append(element("div", "insight-source", symbol.label + " · " + symbol.path + ":" + symbol.line));
  return card;
}
export async function localImagePreview(file, sourcePath = currentPath(), exact = false) {
  const result = await requestPreview({ path: sourcePath, file, label: exact ? "exact" : "relative" }, "localImagePreview");
  return imageCard(result, file);
}
export const imageHoverPreview = hoverTooltip((view, pos) => {
  const range = graphicsRanges(view.state.doc.toString()).find(r => pos >= r.from && pos <= r.to);
  if (!range) return null;
  return { pos: range.from, end: range.to, above: true, create() {
    const dom = element("section", "insight-card insight-image-only insight-image-loading");
    dom.setAttribute("aria-label", "正在读取本地图片");
    localImagePreview(range.file).then(card => {
      if (dom.isConnected) { dom.className = card.className; dom.replaceChildren(...card.childNodes); view.requestMeasure(); }
    });
    return { dom };
  } };
}, { hoverTime: 450 });

// Prefer the requested left-hand card. In a narrow editor, stack it below the list.
export function positionCompletionInfo(view, list, option, info, space, tooltip) {
  const wasPaired = tooltip.querySelector(".insight-info-paired") != null;
  const baseLeft = list.left - (wasPaired ? 230 : 0);
  const width = Math.min(300, space.right - space.left - 16);
  if (baseLeft - space.left >= width + 12)
    return { class: "insight-info-left", style: `right:calc(100% + 10px);top:0;width:${width}px;max-height:${space.bottom - Math.max(list.top, space.top) - 8}px` };
  if (baseLeft + 230 + 212 < space.right - 8)
    return { class: "insight-info-paired", style: `right:calc(100% + 10px);top:0;width:220px;max-height:${space.bottom - Math.max(list.top, space.top) - 8}px` };
  const left = Math.max(space.left + 8 - baseLeft, Math.min(0, space.right - baseLeft - width - 8));
  const below = space.bottom - list.bottom - 16, above = list.top - space.top - 16;
  return { class: "insight-info-stacked", style: `left:${left}px;${below < 180 && above > below ? "bottom" : "top"}:calc(100% + 8px);width:${width}px;max-height:${Math.max(110, below < 180 && above > below ? above : below)}px` };
}

// Count progressively; sparse checkpoints avoid retaining millions of match objects.
export const searchCounter = ViewPlugin.fromClass(class {
  constructor(view) { this.view = view; this.refresh(); }
  update(update) {
    if (update.docChanged || update.selectionSet || getSearchQuery(update.startState) !== getSearchQuery(update.state) || searchPanelOpen(update.startState) !== searchPanelOpen(update.state)) this.refresh();
  }
  refresh() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.measure());
  }
  measure() {
    const { state } = this.view, query = getSearchQuery(state);
    const panel = this.view.dom.querySelector(".cm-search");
    if (!panel || !searchPanelOpen(state)) { this.cancel(); this.doc = null; return; }
    let counter = panel.querySelector(".cm-search-count");
    if (!counter) {
      counter = element("span", "cm-search-count"); counter.role = "status"; counter.setAttribute("aria-live", "polite");
      panel.querySelector("input[name=search]")?.after(counter);
    }
    this.counter = counter;
    if (this.doc !== state.doc || !this.query?.eq(query)) {
      this.cancel(); this.doc = state.doc; this.query = query; this.total = 0; this.checkpoints = [];
      if (!query.valid) { counter.textContent = "0 / 0"; counter.title = query.search ? "搜索表达式无效" : "当前匹配 / 全部匹配"; return; }
      this.cursor = query.getCursor(state); counter.textContent = "查找中…";
      const count = () => {
        const deadline = performance.now() + 7;
        let next;
        do {
          next = this.cursor.next();
          if (next.done) { this.timer = null; this.ordinal(); return; }
          if (this.total % 128 === 0) this.checkpoints.push({ from: next.value.from, index: this.total });
          this.total++;
        } while (performance.now() < deadline);
        this.timer = setTimeout(count, 0);
      };
      this.timer = setTimeout(count, 0);
    } else if (this.timer == null) this.ordinal();
  }
  ordinal() {
    if (!this.counter?.isConnected) return;
    const state = this.view.state, selection = state.selection.main;
    let current = 0;
    if (this.total && this.query.valid) {
      let lo = 0, hi = this.checkpoints.length;
      while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (this.checkpoints[mid].from <= selection.from) lo = mid; else hi = mid; }
      const point = this.checkpoints[lo], cursor = this.query.getCursor(state, point.from);
      let index = point.index;
      for (let i = 0; i <= 128; i++) {
        const next = cursor.next(); if (next.done || next.value.from > selection.from) break;
        index++;
        const { from, to } = next.value;
        if ((selection.from === from && selection.to === to) || (selection.empty && selection.head >= from && selection.head < to)) { current = index; break; }
      }
    }
    this.counter.textContent = `${current} / ${this.total}`;
    this.counter.title = `当前第 ${current} 个，共 ${this.total} 个匹配`;
  }
  cancel() { clearTimeout(this.timer); this.timer = null; }
  destroy() { this.cancel(); cancelAnimationFrame(this.frame); }
});

const mathState = StateField.define({
  create: state => mathRanges(state.doc.toString()),
  update: (ranges, tr) => tr.docChanged ? mathRanges(tr.newDoc.toString()) : ranges,
});
function makeMathTooltip(state, range, pos, live) {
  const source = state.doc.toString();
  const expression = mathExpression(source, range);
  return { pos, above: true, strictSide: false, create() {
    const dom = element("section", "insight-card math-preview");
    dom.append(element("div", "insight-eyebrow", live ? "实时公式预览 · KaTeX" : "公式预览 · KaTeX"));
    const content = element("div", "math-render"); dom.append(content);
    try {
      if (!expression) throw Error("公式尚未完整");
      if (expression.length > 16000) throw Error("公式过长，请查看编译后的 PDF");
      katex.render(expression, content, { displayMode: true, throwOnError: true, trust: false, strict: "ignore", maxExpand: 500, maxSize: 20 });
    } catch (error) {
      content.textContent = range.complete ? "此公式暂不支持实时预览，请以编译后的 PDF 为准" : "公式尚未完整，继续输入后自动更新";
      content.classList.add("insight-note"); content.title = String(error.message).slice(0, 300);
    }
    return { dom };
  } };
}
const liveMathEffect = StateEffect.define();
const liveMathState = StateField.define({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(liveMathEffect)) return effect.value;
    return tr.docChanged || tr.selection ? null : value;
  },
  provide: field => showTooltip.from(field),
});
const liveMath = ViewPlugin.fromClass(class {
  constructor(view) { this.view = view; }
  update(update) {
    if (!(update.docChanged || update.selectionSet || update.focusChanged)) return;
    clearTimeout(this.timer);
    const view = this.view;
    this.timer = setTimeout(() => {
      if (!view.hasFocus || !view.state.selection.main.empty) {
        if (view.state.field(liveMathState)) view.dispatch({ effects: liveMathEffect.of(null) });
        return;
      }
      const pos = view.state.selection.main.head;
      const range = view.state.field(mathState).find(r => pos >= r.start && pos <= r.end);
      if (range) view.dispatch({ effects: liveMathEffect.of(makeMathTooltip(view.state, range, pos, true)) });
    }, 160);
  }
  destroy() { clearTimeout(this.timer); }
});
export const mathPreview = [mathState, liveMathState, liveMath, hoverTooltip((view, pos) => {
  if (view.state.field(liveMathState)) return null;
  const range = view.state.field(mathState).find(r => pos >= r.from && pos <= r.to);
  return range ? makeMathTooltip(view.state, range, pos, false) : null;
}, { hoverTime: 450 })];

export const insightTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-tooltip-autocomplete:has(.insight-info-paired)": { transform: "translateX(230px)" },
  ".cm-tooltip.cm-tooltip-autocomplete:has(.insight-info-paired) > ul": { minWidth: "210px", maxWidth: "210px" },
  ".cm-search-count": { display: "inline-block", minWidth: "62px", padding: "0 8px", fontVariantNumeric: "tabular-nums", color: "var(--accent)", fontWeight: "600" },
  ".cm-tooltip.cm-completionInfo": { padding: "0", borderRadius: "12px", overflow: "auto", whiteSpace: "normal", background: "var(--bg)", color: "var(--fg)", border: "1px solid var(--line)", boxShadow: "0 10px 34px #0002" },
  ".cm-completionInfo .insight-card": { width: "100%" },
  ".insight-card": { width: "min(310px, calc(100vw - 32px))", padding: "15px", color: "var(--fg)", background: "var(--bg)", fontFamily: "-apple-system,BlinkMacSystemFont,sans-serif", fontSize: "var(--ui-size)", lineHeight: "1.5", whiteSpace: "normal" },
  ".insight-eyebrow": { color: "var(--accent)", fontSize: ".73em", letterSpacing: ".09em", marginBottom: "8px", fontWeight: "700" },
  ".insight-title": { display: "block", fontSize: "1.07em", lineHeight: "1.5", overflowWrap: "anywhere" },
  ".insight-metadata": { display: "grid", gridTemplateColumns: "auto 1fr", gap: "7px 12px", margin: "14px 0" },
  ".insight-metadata dt": { opacity: ".6", fontSize: ".85em" },
  ".insight-metadata dd": { margin: "0", overflowWrap: "anywhere" },
  ".insight-source": { borderTop: "1px solid var(--line)", paddingTop: "9px", marginTop: "12px", fontSize: ".75em", opacity: ".65", overflowWrap: "anywhere" },
  ".insight-card.insight-image-only": { padding: "6px" },
  ".insight-image-only .insight-image": { marginTop: "0", maxHeight: "300px" },
  ".insight-image-error": { fontSize: "12px", lineHeight: "1.5", opacity: ".7", margin: "6px", overflowWrap: "anywhere" },
  ".insight-image-loading": { minHeight: "80px", minWidth: "160px", opacity: ".65" },
  ".cm-tooltip:has(> .insight-image-only)": { borderRadius: "10px", overflow: "hidden", boxShadow: "0 8px 30px #0002" },
  ".insight-image": { display: "block", width: "100%", maxHeight: "230px", objectFit: "contain", marginTop: "12px", background: "white", borderRadius: "6px" },
  ".insight-note": { fontSize: ".85em", opacity: ".7", margin: "10px 0 0" },
  ".cm-tooltip:has(.math-preview)": { borderRadius: "12px", border: "1px solid var(--line)", overflow: "hidden", boxShadow: "0 8px 30px #0002" },
  ".math-preview": { width: "max-content", maxWidth: "min(560px, calc(100vw - 32px))" },
  ".math-render": { overflowX: "auto", maxHeight: "250px", padding: "4px 2px" },
  ".math-render .katex-display": { margin: ".3em 0" },
});

import { parseBibTeX, citationMetadata, readableTeX } from "./bibliography.js";

export function maskTeX(source) {
  return source.replace(/\\begin\{(verbatim\*?|lstlisting|minted)\}[\s\S]*?\\end\{\1\}|\\verb\*?([^\w\s])[\s\S]*?\2/g,
    s => s.replace(/[^\n]/g, " ")).replace(/(\\*)%[^\n]*/g, (s, slashes) => slashes.length % 2 ? s : slashes + " ".repeat(s.length - slashes.length));
}
function group(source, at) {
  while (/\s/.test(source[at] || "") && at < source.length) at++;
  if (source[at] !== "{") return null;
  const start = ++at;
  let depth = 1;
  while (at < source.length && depth) {
    if (source[at] === "\\") { at += 2; continue; }
    if (source[at] === "{") depth++;
    if (source[at] === "}") depth--;
    at++;
  }
  return depth ? null : { text: source.slice(start, at - 1), end: at };
}
// Plain descriptors only: safe in JavaScriptCore as well as Node, no DOM or TeX execution.
export function previewIndex(source, file) {
  const entries = [];
  if (/\.bib$/i.test(file)) {
    try {
      for (const entry of parseBibTeX(source, false).entries) {
        const { key, ...metadata } = citationMetadata(entry);
        entries.push({ label: entry.key, kind: "cite", preview: { kind: "citation", ...metadata } });
      }
    } catch { /* An incomplete bibliography still keeps ordinary key completion. */ }
    return { entries };
  }
  const text = maskTeX(source), stack = [];
  const tokens = /\\(begin|end)\{([^{}]+)\}|\\label\s*\{/g;
  for (let m; (m = tokens.exec(text));) {
    if (m[1] === "begin") stack.push({ name: m[2], start: m.index, labels: [] });
    else if (m[1] === "end") {
      const index = stack.findLastIndex(item => item.name === m[2]);
      if (index < 0) continue;
      const block = stack[index]; stack.splice(index);
      if (!/^(?:figure|table|longtable)\*?$/.test(block.name)) continue;
      const body = text.slice(block.start, tokens.lastIndex);
      const captionAt = /\\caption(?:\[[^\]]*\])?\s*/.exec(body);
      const caption = captionAt ? readableTeX(group(body, captionAt.index + captionAt[0].length)?.text) : "";
      const graphics = /\\includegraphics\*?(?:\[[^\]]*\])?\s*/.exec(body);
      let image = graphics ? group(body, graphics.index + graphics[0].length)?.text || "" : "";
      image = image.replace(/^\\detokenize\{([\s\S]*)\}$/, "$1");
      const preview = { kind: /^figure/.test(block.name) ? "figure" : "table", caption, image,
        startLine: String(text.slice(0, block.start).split("\n").length),
        endLine: String(text.slice(0, tokens.lastIndex).split("\n").length) };
      for (const label of block.labels) entries.push({ label, kind: "ref", preview });
    } else {
      const value = group(text, tokens.lastIndex - 1);
      if (!value) continue;
      // Labels in nested subfigures belong to the enclosing float as well.
      for (const item of stack) item.labels.push(value.text);
    }
  }
  return { entries };
}

export function mathRanges(source) {
  const text = maskTeX(source), ranges = [];
  const token = /\$\$|\\\[|\\\]|\\begin\{((?:equation|align|alignat|gather|multline|flalign|displaymath|math)\*?)\}|\\end\{([^{}]+)\}/g;
  let open = null;
  for (let m; (m = token.exec(text));) {
    let escapes = 0;
    for (let p = m.index - 1; p >= 0 && text[p] === "\\"; p--) escapes++;
    if (escapes % 2) continue;
    const tag = m[0];
    if (!open) {
      if (tag === "\\]" || m[2]) continue;
      open = { from: m.index, start: token.lastIndex, tag, env: m[1] };
    } else if ((open.tag === "$$" && tag === "$$") || (open.tag === "\\[" && tag === "\\]") || (open.env && m[2] === open.env)) {
      ranges.push({ ...open, to: token.lastIndex, end: m.index, complete: true }); open = null;
    }
  }
  if (open) ranges.push({ ...open, to: text.length, end: text.length, complete: false });
  return ranges;
}
export function mathExpression(source, range) {
  let body = maskTeX(source.slice(range.start, range.end)).replace(/\\label\s*\{[^{}]*\}/g, "");
  const env = range.env?.replace(/\*$/, "");
  if (["align", "flalign", "alignat"].includes(env)) {
    if (env === "alignat") body = body.replace(/^\s*\{\d+\}/, "");
    body = "\\begin{aligned}" + body + "\\end{aligned}";
  } else if (env === "gather") body = "\\begin{gathered}" + body + "\\end{gathered}";
  else if (env === "multline") body = "\\begin{gathered}" + body + "\\end{gathered}";
  return body.trim();
}

export function graphicsRanges(source) {
  const text = maskTeX(source), out = [];
  for (const m of text.matchAll(/\\includegraphics\*?(?:\s*\[[^\]]*\])?\s*/g)) {
    const value = group(text, m.index + m[0].length);
    if (value) out.push({ from: m.index, to: value.end, file: value.text.replace(/^\\detokenize\{([\s\S]*)\}$/, "$1") });
  }
  return out;
}

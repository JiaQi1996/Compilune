const levels = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};
function mask(source) {
  return source
    .replace(
      /\\begin\{(verbatim\*?|lstlisting|minted)\}[\s\S]*?\\end\{\1\}/g,
      (s) => s.replace(/[^\n]/g, " "),
    )
    .replace(/(?<!\\)%[^\n]*/g, (s) => " ".repeat(s.length));
}
function group(text, start, open = "{", close = "}") {
  let p = start;
  while (/\s/.test(text[p] || "") && p < text.length) p++;
  if (text[p] !== open) return null;
  let depth = 1,
    begin = ++p;
  while (p < text.length && depth) {
    if (text[p] === "\\") {
      p += 2;
      continue;
    }
    if (text[p] === open) depth++;
    if (text[p] === close) depth--;
    p++;
  }
  return depth ? null : { text: text.slice(begin, p - 1), end: p };
}
export function scanSymbols(source, file) {
  const text = mask(source),
    out = [];
  const add = (kind, label, offset, extra = {}) =>
    out.push({
      kind,
      label,
      path: file,
      line: text.slice(0, offset).split("\n").length,
      offset,
      ...extra,
    });
  const token =
    /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph|label|bibitem|(?:re)?newcommand|providecommand|(?:re)?newenvironment|NewDocumentCommand|RenewDocumentCommand)\*?/g;
  for (let m; (m = token.exec(text)); ) {
    const name = m[1];
    let p = token.lastIndex;
    if (name in levels) {
      const optional = group(text, p, "[", "]");
      if (optional) p = optional.end;
      const title = group(text, p);
      if (title) add("section", title.text, m.index, { level: levels[name] });
      continue;
    }
    if (name === "bibitem") {
      const optional = group(text, p, "[", "]");
      if (optional) p = optional.end;
    }
    let value = group(text, p);
    if (!value && name.includes("command")) {
      const bare = /^\s*(\\[A-Za-z@]+)/.exec(text.slice(p));
      if (bare) value = { text: bare[1], end: p + bare[0].length };
    }
    if (!value) continue;
    if (name === "label" || name === "bibitem") {
      add(name === "label" ? "ref" : "cite", value.text, m.index);
      continue;
    }
    p = value.end;
    const count = group(text, p, "[", "]");
    let args = count ? Number(count.text) || 0 : 0;
    if (count) p = count.end;
    if (name.includes("DocumentCommand")) {
      const spec = group(text, p);
      if (spec) {
        args = (spec.text.match(/[mrovb]/g) || []).length;
        p = spec.end;
      }
    }
    add(
      name.includes("environment") ? "environment" : "command",
      value.text,
      m.index,
      { arguments: args },
    );
    const optional = group(text, p, "[", "]");
    if (optional) p = optional.end;
    const body = group(text, p);
    if (body) p = body.end;
    if (name.includes("environment")) {
      const end = group(text, p);
      if (end) p = end.end;
    }
    token.lastIndex = p;
  }
  if (file.toLowerCase().endsWith(".bib"))
    for (const m of text.matchAll(
      /@(?!comment\b|preamble\b|string\b)[\w-]+\s*[{(]\s*([^,\s]+)\s*,/gi,
    ))
      add("cite", m[1], m.index);
  return out;
}

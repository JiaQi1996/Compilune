// A shared, non-executing BibTeX reader used by both native hosts.
export function parseBibTeX(input, strict = true) {
  if (!strict && typeof input === "string" && !input.trim()) return { entries: [], keys: [] };
  if (typeof input !== "string" || !input.trim()) throw new Error("剪贴板为空，请先复制 BibTeX 文献。");
  if (strict && input.length > 1_000_000) throw new Error("文献内容过大，请分批插入。");
  if (input.includes("\0")) throw new Error("BibTeX 内容包含无效字符，未插入任何内容。");
  const text = input.replace(/^\uFEFF/, "");
  let p = 0;
  const entries = [], keys = new Set();
  const fail = () => { throw new Error(`BibTeX 格式无效（第 ${text.slice(0, p).split("\n").length} 行），未插入任何内容。`); };
  function whitespace() {
    while (p < text.length) {
      if (/\s/.test(text[p])) p++;
      else if (text[p] === "%") { while (p < text.length && text[p] !== "\n") p++; }
      else break;
    }
  }
  function identifier() {
    whitespace();
    const match = /^[A-Za-z][A-Za-z0-9_:-]*/.exec(text.slice(p));
    if (!match) fail();
    p += match[0].length;
    return match[0];
  }
  function braced() {
    let depth = 1;
    p++;
    while (p < text.length && depth) {
      const char = text[p++];
      if (char === "\\") { if (p >= text.length) fail(); p++; }
      else if (char === "{") depth++;
      else if (char === "}") depth--;
    }
    if (depth) fail();
  }
  function quoted() {
    p++;
    while (p < text.length) {
      const char = text[p];
      if (char === "{") braced();
      else if (char === "\\") { p += 2; }
      else if (char === '"') { p++; return; }
      else if (char === "}") fail();
      else p++;
    }
    fail();
  }
  function value() {
    do {
      whitespace();
      if (text[p] === "{") braced();
      else if (text[p] === '"') quoted();
      else {
        const match = /^(?:[0-9]+|[A-Za-z][A-Za-z0-9_:.+-]*)/.exec(text.slice(p));
        if (!match) fail();
        p += match[0].length;
      }
      whitespace();
      if (text[p] !== "#") return;
      p++;
    } while (p < text.length);
    fail();
  }
  while (p < text.length) {
    whitespace();
    if (p === text.length) break;
    if (text[p] !== "@") {
      if (strict) fail();
      const next = text.indexOf("@", p);
      if (next < 0) break;
      p = next;
    }
    const start = p++;
    const type = identifier().toLowerCase();
    whitespace();
    const open = text[p++], close = open === "{" ? "}" : ")";
    if (open !== "{" && open !== "(") fail();
    const bodyStart = p;
    whitespace();
    if (type === "comment") {
      if (open === "{") { p = bodyStart - 1; braced(); }
      else {
        let depth = 1;
        while (p < text.length && depth) {
          const c = text[p++];
          if (c === "\\") p++;
          else if (c === "(") depth++;
          else if (c === ")") depth--;
        }
        if (depth) fail();
      }
      continue;
    }
    if (type === "preamble" || type === "string") {
      if (type === "string") {
        identifier(); whitespace(); if (text[p++] !== "=") fail();
      }
      value();
      if (text[p] === ",") { p++; whitespace(); }
      if (text[p++] !== close) fail();
      continue;
    }
    const keyStart = p;
    while (p < text.length && text[p] !== "," && text[p] !== close) p++;
    const key = text.slice(keyStart, p).trim();
    if (!key || key.length > 512 || /[\s,{}()"\\#%]/.test(key) || text[p++] !== ",") fail();
    if (keys.has(key)) throw new Error(`文献键重复：${key}，未插入任何内容。`);
    const fields = new Set();
    whitespace();
    while (p < text.length && text[p] !== close) {
      const field = identifier().toLowerCase();
      if (fields.has(field)) fail();
      fields.add(field);
      whitespace();
      if (text[p++] !== "=") fail();
      value();
      if (text[p] === ",") { p++; whitespace(); }
      else if (text[p] !== close) fail();
    }
    if (!fields.size || text[p++] !== close) fail();
    keys.add(key);
    entries.push({ key, type, text: text.slice(start, p) });
  }
  if (strict && !entries.length) throw new Error("剪贴板中没有可引用的 BibTeX 文献，未插入任何内容。");
  return { entries, keys: [...keys] };
}

export function citationPlan(clipboard, existing, projectKeys = []) {
  const parsed = parseBibTeX(clipboard);
  const keys = new Set(projectKeys);
  for (const key of parsed.keys)
    if (keys.has(key)) throw new Error(`项目中已存在文献键 ${key}，未插入任何内容。`);
  const separator = existing.length ? (existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n") : "";
  return {
    text: existing + separator + clipboard.replace(/^\uFEFF/, "").trim().replaceAll("\r\n", "\n") + "\n",
    citation: "\\cite{" + parsed.keys.join(",") + "}",
    keys: parsed.keys,
  };
}

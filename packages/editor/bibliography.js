// A shared, non-executing BibTeX reader used by both native hosts.
export function parseBibTeX(input, strict = true) {
  if (!strict && typeof input === "string" && !input.trim()) return { entries: [], keys: [] };
  if (typeof input !== "string" || !input.trim()) throw new Error("剪贴板为空，请先复制 BibTeX 文献。");
  if (strict && input.length > 1_000_000) throw new Error("文献内容过大，请分批插入。");
  if (input.includes("\0")) throw new Error("BibTeX 内容包含无效字符，未插入任何内容。");
  const text = input.replace(/^\uFEFF/, "");
  let p = 0, unresolved = [], lastValueEnd = 0;
  const entries = [], keys = new Set(), strings = Object.create(null), stringDependencies = Object.create(null);
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
    let result = "";
    do {
      whitespace();
      const start = p;
      if (text[p] === "{") { braced(); result += text.slice(start + 1, p - 1); }
      else if (text[p] === '"') { quoted(); result += text.slice(start + 1, p - 1); }
      else {
        const match = /^(?:[0-9]+|[A-Za-z][A-Za-z0-9_:.+-]*)/.exec(text.slice(p));
        if (!match) fail();
        p += match[0].length;
        const name = match[0].toLowerCase();
        if (strings[name] !== undefined) { result += strings[name]; unresolved.push(...(stringDependencies[name] || [])); }
        else {
          result += match[0];
          if (!/^\d+$/.test(name) && !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/.test(name)) unresolved.push(name);
        }
      }
      lastValueEnd = p;
      whitespace();
      if (text[p] !== "#") return result;
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
      let name;
      if (type === "string") {
        name = identifier().toLowerCase(); whitespace(); if (text[p++] !== "=") fail();
      }
      unresolved = [];
      const parsedValue = value();
      if (name) { strings[name] = parsedValue; stringDependencies[name] = [...unresolved]; }
      if (text[p] === ",") { p++; whitespace(); }
      if (text[p++] !== close) fail();
      continue;
    }
    const keyStart = p;
    while (p < text.length && text[p] !== "," && text[p] !== close) p++;
    const key = text.slice(keyStart, p).trim();
    if (!key || key.length > 512 || /[\s,{}()"\\#%]/.test(key) || text[p++] !== ",") fail();
    if (keys.has(key)) throw new Error(`文献键重复：${key}，未插入任何内容。`);
    const fields = new Set(), values = Object.create(null), fieldRanges = Object.create(null), dependencies = Object.create(null);
    whitespace();
    while (p < text.length && text[p] !== close) {
      const field = identifier().toLowerCase();
      if (fields.has(field)) fail();
      fields.add(field);
      whitespace();
      if (text[p++] !== "=") fail();
      whitespace();
      const valueStart = p;
      unresolved = [];
      values[field] = value();
      fieldRanges[field] = { from: valueStart, to: lastValueEnd };
      dependencies[field] = [...new Set(unresolved)];
      if (text[p] === ",") { p++; whitespace(); }
      else if (text[p] !== close) fail();
    }
    if (!fields.size || text[p++] !== close) fail();
    keys.add(key);
    entries.push({ key, type, text: text.slice(start, p), from: start, to: p, fields: values, fieldRanges, dependencies });
  }
  if (strict && !entries.length) throw new Error("剪贴板中没有可引用的 BibTeX 文献，未插入任何内容。");
  return { entries, keys: [...keys] };
}

export function readableTeX(value = "") {
  return value.replace(/\\(?:href|texorpdfstring)\{[^{}]*\}/g, "")
    .replace(/\\(?:text[a-z]+|emph|protect|NoCaseChange)\s*/g, "")
    .replace(/\\([&%_#$])/g, "$1").replace(/[{}]/g, "").replace(/~/g, " ")
    .replace(/\\(?:LaTeX|TeX)\b/g, s => s.slice(1)).replace(/\s+/g, " ").trim();
}
function firstAuthor(author = "") {
  let depth = 0, end = author.length;
  for (let i = 0; i < author.length; i++) {
    if (author[i] === "\\") { i++; continue; }
    if (author[i] === "{") depth++;
    if (author[i] === "}") depth--;
    if (depth === 0 && /^\s+and\s+/i.test(author.slice(i))) { end = i; break; }
  }
  return readableTeX(author.slice(0, end));
}
export function citationMetadata(entry) {
  const f = entry.fields || {};
  return { key: entry.key, title: readableTeX(f.title), author: firstAuthor(f.author),
    year: readableTeX(f.year || /^(\d{4})/.exec(f.date || "")?.[1] || ""),
    venue: readableTeX(f.journal || f.journaltitle || f.booktitle || f.eventtitle) };
}

export function citationInfo(clipboard, projectKeys = []) {
  const parsed = parseBibTeX(clipboard);
  const keys = new Set(projectKeys);
  return {
    keys: parsed.keys,
    entries: parsed.entries.map(citationMetadata),
    existingKeys: parsed.keys.filter((key) => keys.has(key)),
    newKeys: parsed.keys.filter((key) => !keys.has(key)),
  };
}

export function citationPlan(clipboard, existing, projectKeys = [], confirmedExistingKeys = []) {
  const parsed = parseBibTeX(clipboard);
  const info = citationInfo(clipboard, projectKeys);
  const confirmed = new Set(confirmedExistingKeys);
  for (const key of info.existingKeys)
    if (!confirmed.has(key)) throw new Error(`项目中已存在文献键 ${key}，请确认是否仅插入引用，未修改任何内容。`);
  let addition = clipboard.replace(/^\uFEFF/, "");
  // Remove duplicate entries by source range, retaining comments and @string
  // definitions needed by new entries in a mixed clipboard.
  for (const entry of [...parsed.entries].reverse())
    if (info.existingKeys.includes(entry.key))
      addition = addition.slice(0, entry.from) + addition.slice(entry.to);
  const separator = existing.length ? (existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n") : "";
  return {
    text: info.newKeys.length ? existing + separator + addition.trim().replaceAll("\r\n", "\n") + "\n" : existing,
    citation: "\\cite{" + parsed.keys.join(",") + "}",
    ...info,
  };
}

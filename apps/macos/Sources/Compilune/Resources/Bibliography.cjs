var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// bibliography-host.js
var bibliography_host_exports = {};
__export(bibliography_host_exports, {
  bibliographyDuplicates: () => bibliographyDuplicates,
  citationInfo: () => citationInfo,
  citationMetadata: () => citationMetadata,
  citationPlan: () => citationPlan,
  deduplicateBibliography: () => deduplicateBibliography,
  parseBibTeX: () => parseBibTeX,
  parseBuildLog: () => parseBuildLog,
  previewIndex: () => previewIndex,
  readableTeX: () => readableTeX
});
module.exports = __toCommonJS(bibliography_host_exports);

// bibliography.js
function parseBibTeX(input, strict = true) {
  if (!strict && typeof input === "string" && !input.trim()) return { entries: [], keys: [] };
  if (typeof input !== "string" || !input.trim()) throw new Error("\u526A\u8D34\u677F\u4E3A\u7A7A\uFF0C\u8BF7\u5148\u590D\u5236 BibTeX \u6587\u732E\u3002");
  if (strict && input.length > 1e6) throw new Error("\u6587\u732E\u5185\u5BB9\u8FC7\u5927\uFF0C\u8BF7\u5206\u6279\u63D2\u5165\u3002");
  if (input.includes("\0")) throw new Error("BibTeX \u5185\u5BB9\u5305\u542B\u65E0\u6548\u5B57\u7B26\uFF0C\u672A\u63D2\u5165\u4EFB\u4F55\u5185\u5BB9\u3002");
  const text = input.replace(/^\uFEFF/, "");
  let p = 0, unresolved = [], lastValueEnd = 0;
  const entries = [], keys = /* @__PURE__ */ new Set(), strings = /* @__PURE__ */ Object.create(null), stringDependencies = /* @__PURE__ */ Object.create(null);
  const fail = () => {
    throw new Error(`BibTeX \u683C\u5F0F\u65E0\u6548\uFF08\u7B2C ${text.slice(0, p).split("\n").length} \u884C\uFF09\uFF0C\u672A\u63D2\u5165\u4EFB\u4F55\u5185\u5BB9\u3002`);
  };
  function whitespace() {
    while (p < text.length) {
      if (/\s/.test(text[p])) p++;
      else if (text[p] === "%") {
        while (p < text.length && text[p] !== "\n") p++;
      } else break;
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
      if (char === "\\") {
        if (p >= text.length) fail();
        p++;
      } else if (char === "{") depth++;
      else if (char === "}") depth--;
    }
    if (depth) fail();
  }
  function quoted() {
    p++;
    while (p < text.length) {
      const char = text[p];
      if (char === "{") braced();
      else if (char === "\\") {
        p += 2;
      } else if (char === '"') {
        p++;
        return;
      } else if (char === "}") fail();
      else p++;
    }
    fail();
  }
  function value() {
    let result = "";
    do {
      whitespace();
      const start = p;
      if (text[p] === "{") {
        braced();
        result += text.slice(start + 1, p - 1);
      } else if (text[p] === '"') {
        quoted();
        result += text.slice(start + 1, p - 1);
      } else {
        const match = /^(?:[0-9]+|[A-Za-z][A-Za-z0-9_:.+-]*)/.exec(text.slice(p));
        if (!match) fail();
        p += match[0].length;
        const name = match[0].toLowerCase();
        if (strings[name] !== void 0) {
          result += strings[name];
          unresolved.push(...stringDependencies[name] || []);
        } else {
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
      if (open === "{") {
        p = bodyStart - 1;
        braced();
      } else {
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
        name = identifier().toLowerCase();
        whitespace();
        if (text[p++] !== "=") fail();
      }
      unresolved = [];
      const parsedValue = value();
      if (name) {
        strings[name] = parsedValue;
        stringDependencies[name] = [...unresolved];
      }
      if (text[p] === ",") {
        p++;
        whitespace();
      }
      if (text[p++] !== close) fail();
      continue;
    }
    const keyStart = p;
    while (p < text.length && text[p] !== "," && text[p] !== close) p++;
    const key = text.slice(keyStart, p).trim();
    if (!key || key.length > 512 || /[\s,{}()"\\#%]/.test(key) || text[p++] !== ",") fail();
    if (keys.has(key)) throw new Error(`\u6587\u732E\u952E\u91CD\u590D\uFF1A${key}\uFF0C\u672A\u63D2\u5165\u4EFB\u4F55\u5185\u5BB9\u3002`);
    const fields = /* @__PURE__ */ new Set(), values = /* @__PURE__ */ Object.create(null), fieldRanges = /* @__PURE__ */ Object.create(null), dependencies = /* @__PURE__ */ Object.create(null);
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
      if (text[p] === ",") {
        p++;
        whitespace();
      } else if (text[p] !== close) fail();
    }
    if (!fields.size || text[p++] !== close) fail();
    keys.add(key);
    entries.push({ key, type, text: text.slice(start, p), from: start, to: p, fields: values, fieldRanges, dependencies });
  }
  if (strict && !entries.length) throw new Error("\u526A\u8D34\u677F\u4E2D\u6CA1\u6709\u53EF\u5F15\u7528\u7684 BibTeX \u6587\u732E\uFF0C\u672A\u63D2\u5165\u4EFB\u4F55\u5185\u5BB9\u3002");
  return { entries, keys: [...keys] };
}
function readableTeX(value = "") {
  return value.replace(/\\(?:href|texorpdfstring)\{[^{}]*\}/g, "").replace(/\\(?:text[a-z]+|emph|protect|NoCaseChange)\s*/g, "").replace(/\\([&%_#$])/g, "$1").replace(/[{}]/g, "").replace(/~/g, " ").replace(/\\(?:LaTeX|TeX)\b/g, (s) => s.slice(1)).replace(/\s+/g, " ").trim();
}
function firstAuthor(author = "") {
  let depth = 0, end = author.length;
  for (let i = 0; i < author.length; i++) {
    if (author[i] === "\\") {
      i++;
      continue;
    }
    if (author[i] === "{") depth++;
    if (author[i] === "}") depth--;
    if (depth === 0 && /^\s+and\s+/i.test(author.slice(i))) {
      end = i;
      break;
    }
  }
  return readableTeX(author.slice(0, end));
}
function citationMetadata(entry) {
  const f = entry.fields || {};
  return {
    key: entry.key,
    title: readableTeX(f.title),
    author: firstAuthor(f.author),
    year: readableTeX(f.year || /^(\d{4})/.exec(f.date || "")?.[1] || ""),
    venue: readableTeX(f.journal || f.journaltitle || f.booktitle || f.eventtitle)
  };
}
function citationInfo(clipboard, projectKeys = []) {
  const parsed = parseBibTeX(clipboard);
  const keys = new Set(projectKeys);
  return {
    keys: parsed.keys,
    entries: parsed.entries.map(citationMetadata),
    existingKeys: parsed.keys.filter((key) => keys.has(key)),
    newKeys: parsed.keys.filter((key) => !keys.has(key))
  };
}
function citationPlan(clipboard, existing, projectKeys = [], confirmedExistingKeys = []) {
  const parsed = parseBibTeX(clipboard);
  const info = citationInfo(clipboard, projectKeys);
  const confirmed = new Set(confirmedExistingKeys);
  for (const key of info.existingKeys)
    if (!confirmed.has(key)) throw new Error(`\u9879\u76EE\u4E2D\u5DF2\u5B58\u5728\u6587\u732E\u952E ${key}\uFF0C\u8BF7\u786E\u8BA4\u662F\u5426\u4EC5\u63D2\u5165\u5F15\u7528\uFF0C\u672A\u4FEE\u6539\u4EFB\u4F55\u5185\u5BB9\u3002`);
  let addition = clipboard.replace(/^\uFEFF/, "");
  for (const entry of [...parsed.entries].reverse())
    if (info.existingKeys.includes(entry.key))
      addition = addition.slice(0, entry.from) + addition.slice(entry.to);
  const separator = existing.length ? existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n" : "";
  return {
    text: info.newKeys.length ? existing + separator + addition.trim().replaceAll("\r\n", "\n") + "\n" : existing,
    citation: "\\cite{" + parsed.keys.join(",") + "}",
    ...info
  };
}

// preview-data.js
function maskTeX(source) {
  return source.replace(
    /\\begin\{(verbatim\*?|lstlisting|minted)\}[\s\S]*?\\end\{\1\}|\\verb\*?([^\w\s])[\s\S]*?\2/g,
    (s) => s.replace(/[^\n]/g, " ")
  ).replace(/(\\*)%[^\n]*/g, (s, slashes) => slashes.length % 2 ? s : slashes + " ".repeat(s.length - slashes.length));
}
function group(source, at) {
  while (/\s/.test(source[at] || "") && at < source.length) at++;
  if (source[at] !== "{") return null;
  const start = ++at;
  let depth = 1;
  while (at < source.length && depth) {
    if (source[at] === "\\") {
      at += 2;
      continue;
    }
    if (source[at] === "{") depth++;
    if (source[at] === "}") depth--;
    at++;
  }
  return depth ? null : { text: source.slice(start, at - 1), end: at };
}
function previewIndex(source, file) {
  const entries = [];
  if (/\.bib$/i.test(file)) {
    try {
      for (const entry of parseBibTeX(source, false).entries) {
        const { key, ...metadata } = citationMetadata(entry);
        entries.push({ label: entry.key, kind: "cite", preview: { kind: "citation", ...metadata } });
      }
    } catch {
    }
    return { entries };
  }
  const text = maskTeX(source), stack = [];
  const tokens = /\\(begin|end)\{([^{}]+)\}|\\label\s*\{/g;
  for (let m; m = tokens.exec(text); ) {
    if (m[1] === "begin") stack.push({ name: m[2], start: m.index, labels: [] });
    else if (m[1] === "end") {
      const index = stack.findLastIndex((item) => item.name === m[2]);
      if (index < 0) continue;
      const block = stack[index];
      stack.splice(index);
      if (!/^(?:figure|table|longtable)\*?$/.test(block.name)) continue;
      const body = text.slice(block.start, tokens.lastIndex);
      const captionAt = /\\caption(?:\[[^\]]*\])?\s*/.exec(body);
      const caption = captionAt ? readableTeX(group(body, captionAt.index + captionAt[0].length)?.text) : "";
      const graphics = /\\includegraphics\*?(?:\[[^\]]*\])?\s*/.exec(body);
      let image = graphics ? group(body, graphics.index + graphics[0].length)?.text || "" : "";
      image = image.replace(/^\\detokenize\{([\s\S]*)\}$/, "$1");
      const preview = {
        kind: /^figure/.test(block.name) ? "figure" : "table",
        caption,
        image,
        startLine: String(text.slice(0, block.start).split("\n").length),
        endLine: String(text.slice(0, tokens.lastIndex).split("\n").length)
      };
      for (const label of block.labels) entries.push({ label, kind: "ref", preview });
    } else {
      const value = group(text, tokens.lastIndex - 1);
      if (!value) continue;
      for (const item of stack) item.labels.push(value.text);
    }
  }
  return { entries };
}

// build-log.js
function parseBuildLog(log) {
  const stack = [], rows = [];
  let pending = "", wrapped = "", previous = null;
  const ext = "(?:tex|ltx|sty|cls|bib|bst|cfg|def|tikz|dtx|ins)";
  const direct = new RegExp('^\\s*"?(.+?\\.' + ext + ')"?\\s*:(\\d+)(?::(\\d+))?:\\s*(.*)$', "i");
  const tokens = new RegExp('\\((?:"([^"\\n]+\\.' + ext + ')"|([^()\\n]*?\\.' + ext + ")(?=[\\s()]|$))|[()]", "gi");
  const pathStart = /^(?:\.{0,2}[\\/]|[A-Za-z]:[\\/]|[^\s:()]+[\\/])/;
  for (const original of String(log).split(/\r?\n/)) {
    const raw = original.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    const row = { text: raw };
    const joined = wrapped + raw;
    const m = direct.exec(joined);
    if (m) {
      Object.assign(row, { file: m[1].trim(), line: Number(m[2]), column: Number(m[3] || 1), message: m[4] });
      previous = { file: row.file, line: row.line, message: row.message };
      pending = "";
      wrapped = "";
    } else {
      const bang = /^\s*!\s*(.*)$/.exec(raw);
      if (bang) {
        pending = bang[1];
        previous = null;
      }
      const line = /^\s*l\.(\d+)(?:\s+(.*)|\s*)$/.exec(raw);
      if (line) {
        const number = Number(line[1]);
        const last = previous?.line === number ? previous : null;
        Object.assign(row, {
          file: last?.file || [...stack].reverse().find(Boolean) || "",
          line: number,
          column: 1,
          message: pending || last?.message || line[2] || "\u7F16\u8BD1\u9519\u8BEF"
        });
        pending = "";
        wrapped = "";
      } else if (!bang) {
        tokens.lastIndex = 0;
        for (let t; t = tokens.exec(raw); ) {
          if (t[0] === ")") stack.pop();
          else stack.push((t[1] || t[2] || "").trim());
        }
        const fragment = wrapped ? joined : raw.trimStart();
        const looksLikePath = pathStart.test(fragment) && !/[<>]/.test(fragment) && !/\s{2,}/.test(fragment);
        wrapped = raw.trim() && looksLikePath && !/[.!?]\s*$/.test(raw.replace(/\.\s*$/, "")) ? fragment : "";
      } else wrapped = "";
    }
    rows.push(row);
  }
  return { rows };
}

// fold-data.js
function scanTeXBlocks(source) {
  const blocks = [], ignored = [], envs = [], braces = [];
  const starts = [0];
  for (let p = 0; p < source.length; p++) if (source[p] === "\n") starts.push(p + 1);
  function lineAt(pos) {
    let lo = 0, hi = starts.length;
    while (lo + 1 < hi) {
      const mid = lo + hi >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid;
    }
    return { from: starts[lo], to: lo + 1 < starts.length ? starts[lo + 1] - 1 : source.length, number: lo + 1 };
  }
  function escaped(pos) {
    let n = 0;
    while (pos > 0 && source[--pos] === "\\") n++;
    return n % 2 === 1;
  }
  function add(start, end, kind) {
    const line = lineAt(start);
    if (end > line.to && lineAt(end).number > line.number)
      blocks.push({ line: line.from, from: line.to, to: end, kind });
  }
  const rawEnvs = /^(?:verbatim\*?|[BL]?Verbatim|SaveVerbatim|lstlisting|minted|comment|filecontents\*?)$/;
  const token = /\\(?:begin|end)\s*\{([^{}\r\n]+)\}|\\(?:verb|lstinline)\*?(?![A-Za-z@])|\\(?:string|detokenize)(?![A-Za-z@])|\$\$|\\\[|\\\]|[{}%]/g;
  let math = null;
  for (let m; m = token.exec(source); ) {
    if (escaped(m.index)) continue;
    const text = m[0];
    if (text === "%") {
      const end = source.indexOf("\n", m.index);
      token.lastIndex = end < 0 ? source.length : end;
      ignored.push({ from: m.index, to: token.lastIndex });
    } else if (text === "\\string") {
      let at2 = token.lastIndex;
      while (at2 < source.length && /\s/.test(source[at2])) at2++;
      const next = /^\\(?:[A-Za-z@]+|.)|^[\s\S]/.exec(source.slice(at2));
      token.lastIndex = at2 + (next?.[0].length || 0);
      ignored.push({ from: m.index, to: token.lastIndex });
    } else if (text === "\\detokenize") {
      let at2 = token.lastIndex;
      while (at2 < source.length && /\s/.test(source[at2])) at2++;
      if (source[at2] !== "{") continue;
      let depth = 1;
      at2++;
      while (at2 < source.length && depth) {
        if (source[at2] === "\\") {
          at2 += 2;
          continue;
        }
        if (source[at2] === "{") depth++;
        if (source[at2] === "}") depth--;
        at2++;
      }
      token.lastIndex = at2;
      ignored.push({ from: m.index, to: at2 });
    } else if (/^\\(?:verb|lstinline)/.test(text)) {
      let at2 = token.lastIndex;
      if (text.startsWith("\\lstinline") && source[at2] === "[") {
        const close2 = source.indexOf("]", at2 + 1);
        if (close2 >= 0) at2 = close2 + 1;
      }
      const delimiter = source[at2];
      if (!delimiter || /\s/.test(delimiter)) continue;
      const close = source.indexOf(delimiter, at2 + 1), newline = source.indexOf("\n", at2);
      token.lastIndex = close >= 0 && (newline < 0 || close < newline) ? close + 1 : newline < 0 ? source.length : newline;
      ignored.push({ from: m.index, to: token.lastIndex });
    } else if (m[1] !== void 0) {
      const name = m[1].trim();
      if (text.startsWith("\\begin")) {
        if (rawEnvs.test(name)) {
          const pattern = new RegExp("\\\\end\\s*\\{" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\}", "g");
          pattern.lastIndex = token.lastIndex;
          const end = pattern.exec(source);
          ignored.push({ from: token.lastIndex, to: end ? end.index : source.length });
          if (end) {
            add(m.index, end.index, name);
            token.lastIndex = pattern.lastIndex;
          } else token.lastIndex = source.length;
        } else envs.push({ name, from: m.index });
      } else {
        const index = envs.findLastIndex((env) => env.name === name);
        if (index < 0) continue;
        if (index === envs.length - 1) add(envs[index].from, m.index, name);
        envs.splice(index);
      }
    } else if (text === "{") braces.push(m.index);
    else if (text === "}") {
      const start = braces.pop();
      if (start !== void 0) add(start, m.index, "group");
    } else if (!math && (text === "$$" || text === "\\[")) math = { from: m.index, delimiter: text };
    else if (math && (text === "$$" && math.delimiter === "$$" || text === "\\]" && math.delimiter === "\\[")) {
      add(math.from, m.index, "math");
      math = null;
    }
  }
  let masked = "", at = 0;
  for (const range of ignored) {
    masked += source.slice(at, range.from) + source.slice(range.from, range.to).replace(/[^\n]/g, " ");
    at = range.to;
  }
  masked += source.slice(at);
  return { blocks, masked };
}

// bibliography-dedup.js
var normalize = (value) => readableTeX(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
function authorIdentity(value, details = null) {
  const authors = [];
  let depth = 0, start = 0;
  for (let i = 0; i <= value.length; i++) {
    if (value[i] === "\\") {
      i++;
      continue;
    }
    if (value[i] === "{") depth++;
    if (value[i] === "}") depth--;
    const separator = depth === 0 && /^\s+and\s+/i.exec(value.slice(i));
    if (i !== value.length && !separator) continue;
    const raw = value.slice(start, i).trim();
    if (!raw || /^others$/i.test(raw)) return "";
    if (/^\{[\s\S]*\}$/.test(raw)) authors.push("organization:" + normalize(raw));
    else {
      const parts = readableTeX(raw).split(",").map((x) => x.trim());
      let family, given;
      if (parts.length > 1) {
        family = parts[0] + (parts.length > 2 ? " " + parts.slice(1, -1).join(" ") : "");
        given = parts.at(-1);
      } else {
        const words = parts[0].split(/\s+/);
        const particle = words.findIndex((word, index) => index > 0 && index < words.length - 1 && /^[a-z]/.test(word));
        if (particle > 0) {
          family = words.slice(particle).join(" ");
          given = words.slice(0, particle).join(" ");
        } else {
          family = words.pop();
          given = words.join(" ");
        }
      }
      const initials = (given.match(/[\p{L}\p{N}]+/gu) || []).map((word) => normalize([...word][0])).join("");
      const key = normalize(family) + ":" + initials;
      authors.push(key);
      if (details) details.push({ key, given: (given.match(/[\p{L}\p{N}]+/gu) || []).map(normalize) });
    }
    if (separator) {
      i += separator[0].length - 1;
      start = i + 1;
    }
  }
  return authors.sort().join("|");
}
function identity(entry) {
  if ((entry.dependencies.title || []).length || (entry.dependencies.author || []).length) return "";
  const title = normalize(entry.fields.title || ""), authors = authorIdentity(entry.fields.author || "");
  return title && authors ? title + "::" + authors : "";
}
function groupAt(text, at, open = "{", close = "}") {
  while (at < text.length && /\s/.test(text[at])) at++;
  if (text[at] !== open) return null;
  const start = ++at;
  let depth = 1;
  for (; at < text.length; at++) {
    if (text[at] === "\\") {
      at++;
      continue;
    }
    if (text[at] === open) depth++;
    if (text[at] === close && --depth === 0) return { from: start, to: at, end: at + 1 };
    if (text[at] !== close) {
    }
  }
  return null;
}
function citationLocations(source, path) {
  const text = scanTeXBlocks(source).masked, out = [];
  const command = /\\([A-Za-z]*cite[A-Za-z]*|bibentry)\*?(?![A-Za-z@])/gi;
  for (let m; m = command.exec(text); ) {
    let slashes = 0;
    for (let i = m.index - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
    if (slashes % 2 || /^(?:new|declare)/i.test(m[1])) continue;
    let at = command.lastIndex;
    if (/cites$/i.test(m[1])) for (let i = 0; i < 2; i++) {
      const globalNote = groupAt(text, at, "(", ")");
      if (!globalNote) break;
      at = globalNote.end;
    }
    while (true) {
      const optional = groupAt(text, at, "[", "]");
      if (!optional) break;
      at = optional.end;
    }
    do {
      const group2 = groupAt(text, at);
      if (!group2) break;
      const value = text.slice(group2.from, group2.to);
      const keys = value.split(",").map((key) => key.trim());
      if (keys.length && keys.every((key) => key && !/[\s{}\\]/.test(key))) {
        let position = group2.from;
        const parts = value.split(",").map((part, index) => {
          const from = position, key = keys[index], keyFrom = from + part.indexOf(key);
          position += part.length + 1;
          return { from, to: from + part.length, key, keyFrom, keyTo: keyFrom + key.length };
        });
        out.push({
          path,
          line: source.slice(0, m.index).split("\n").length,
          command: m[1],
          keys,
          from: group2.from,
          to: group2.to,
          parts,
          text: source.slice(Math.max(0, source.lastIndexOf("\n", m.index) + 1), source.indexOf("\n", group2.end) < 0 ? source.length : source.indexOf("\n", group2.end)).slice(0, 240)
        });
      }
      at = group2.end;
      while (true) {
        const optional = groupAt(text, at, "[", "]");
        if (!optional) break;
        at = optional.end;
      }
    } while (/cites$/i.test(m[1]));
  }
  return out;
}
function recordsFor(documents) {
  const records = [], locations = [];
  for (const document of documents) {
    if (/\.bib$/i.test(document.path)) {
      const offset = document.text.startsWith("\uFEFF") ? 1 : 0;
      for (const entry of parseBibTeX(document.text, false).entries) records.push({
        ...entry,
        path: document.path,
        from: entry.from + offset,
        to: entry.to + offset,
        fieldRanges: Object.fromEntries(Object.entries(entry.fieldRanges).map(([name, range]) => [name, { from: range.from + offset, to: range.to + offset }])),
        id: document.path + ":" + (entry.from + offset),
        line: document.text.slice(0, entry.from + offset).split("\n").length
      });
    } else locations.push(...citationLocations(document.text, document.path));
  }
  return { records, locations };
}
function loadedBibliographies(documents) {
  const bibs = documents.filter((document) => /\.bib$/i.test(document.path)).map((document) => document.path), result = /* @__PURE__ */ new Set();
  const normalizePath = (value) => {
    const parts = [];
    for (const part of value.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    return parts.join("/");
  };
  for (const document of documents.filter((document2) => !/\.bib$/i.test(document2.path))) {
    const text = scanTeXBlocks(document.text).masked;
    for (const match of text.matchAll(/\\(?:bibliography|addbibresource)(?:\s*\[[^\]]*\])?\s*\{([^{}]*)\}/g)) {
      for (let name of match[1].split(",")) {
        name = name.trim();
        if (!name || name.includes("\\")) continue;
        if (!/\.bib$/i.test(name)) name += ".bib";
        const candidates = [normalizePath(name), normalizePath(document.path.slice(0, document.path.lastIndexOf("/") + 1) + name)];
        const matches = bibs.filter((file) => candidates.includes(file));
        if (matches.length) matches.forEach((file) => result.add(file));
        else {
          const same = bibs.filter((file) => file.split("/").at(-1) === name.split("/").at(-1));
          if (same.length === 1) result.add(same[0]);
        }
      }
    }
  }
  return result;
}
function bibliographyDuplicates(documents) {
  const loaded = loadedBibliographies(documents);
  const { records, locations } = recordsFor(documents), byIdentity = /* @__PURE__ */ new Map(), byKey = /* @__PURE__ */ new Map();
  for (const record of records) {
    const key = identity(record);
    if (key) {
      const group2 = byIdentity.get(key) || [];
      group2.push(record);
      byIdentity.set(key, group2);
    }
    const uses = byKey.get(record.key) || [];
    uses.push(record);
    byKey.set(record.key, uses);
  }
  const groups = [];
  for (const entries of byIdentity.values()) {
    if (entries.length < 2) continue;
    const keys = new Set(entries.map((entry) => entry.key));
    const references = locations.filter((location) => location.keys.some((key) => keys.has(key)));
    const years = new Set(entries.map((entry) => entry.fields.year || entry.fields.date?.slice(0, 4)).filter(Boolean));
    const dois = new Set(entries.map((entry) => readableTeX(entry.fields.doi || "").toLowerCase().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/, "")).filter(Boolean));
    const names = entries.map((entry) => {
      const details = [];
      authorIdentity(entry.fields.author, details);
      return details;
    });
    let differentNames = false;
    for (const first of names) for (const other of names) for (const author of first) for (const match of other.filter((item) => item.key === author.key))
      for (let i = 0; i < Math.min(author.given.length, match.given.length); i++) if (author.given[i].length > 1 && match.given[i].length > 1 && author.given[i] !== match.given[i]) differentNames = true;
    const collision = entries.some((entry) => byKey.get(entry.key).some((other) => identity(other) !== identity(entry)));
    const inherited = entries.some((entry) => ["crossref", "xref", "xdata"].some((field) => (entry.fields[field] || "").split(",").some((key) => keys.has(key.trim()))));
    const blocked = collision ? "\u540C\u4E00\u5F15\u7528\u952E\u8FD8\u6307\u5411\u5176\u4ED6\u6587\u732E\uFF0C\u8BF7\u5148\u89E3\u51B3\u5F15\u7528\u952E\u51B2\u7A81" : inherited ? "\u7EC4\u5185\u5B58\u5728 Bib \u7EE7\u627F\u5173\u7CFB\uFF0C\u8BF7\u5148\u5C55\u5F00\u7EE7\u627F\u5B57\u6BB5\u518D\u5408\u5E76" : "";
    const warnings = [...differentNames ? ["\u4F5C\u8005\u5168\u540D\u4E0D\u540C\uFF0C\u4EC5\u9996\u5B57\u6BCD\u76F8\u540C\uFF0C\u8BF7\u6838\u5BF9\u4F5C\u8005\u8EAB\u4EFD"] : [], ...years.size > 1 ? ["\u53D1\u8868\u5E74\u4EFD\u4E0D\u540C\uFF0C\u8BF7\u6838\u5BF9\u7248\u672C"] : [], ...dois.size > 1 ? ["DOI \u4E0D\u540C\uFF0C\u8BF7\u6838\u5BF9\u662F\u5426\u4E3A\u540C\u4E00\u7BC7\u8BBA\u6587"] : []];
    const preferred = [...entries].sort((a, b) => Number(loaded.has(b.path)) - Number(loaded.has(a.path)) || Object.keys(b.fields).length - Object.keys(a.fields).length || a.path.localeCompare(b.path) || a.from - b.from)[0];
    groups.push({
      id: entries[0].id,
      title: citationMetadata(preferred).title,
      author: preferred.fields.author,
      entries: entries.map((entry) => ({
        id: entry.id,
        key: entry.key,
        path: entry.path,
        line: entry.line,
        ...citationMetadata(entry),
        fieldCount: Object.keys(entry.fields).length,
        raw: entry.text
      })),
      keep: preferred.id,
      references,
      warnings,
      blocked
    });
  }
  return { groups, entryCount: records.length };
}
function deduplicateBibliography(documents, choices) {
  const preview = bibliographyDuplicates(documents), { records, locations } = recordsFor(documents);
  if (!Array.isArray(choices) || choices.length > preview.groups.length) throw Error("\u65E0\u6548\u53BB\u91CD\u9009\u62E9");
  const replacements = /* @__PURE__ */ Object.create(null), removed = /* @__PURE__ */ new Set(), kept = /* @__PURE__ */ new Map(), selected = /* @__PURE__ */ new Set();
  for (const choice of choices) {
    const group2 = preview.groups.find((group3) => group3.id === choice.id);
    if (!group2 || selected.has(group2.id) || group2.blocked || !group2.entries.some((entry) => entry.id === choice.keep)) throw Error("\u53BB\u91CD\u9884\u89C8\u5DF2\u53D8\u5316\u6216\u9009\u62E9\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5");
    selected.add(group2.id);
    const canonical = records.find((entry) => entry.id === choice.keep);
    const members = group2.entries.map((entry) => records.find((record) => record.id === entry.id));
    kept.set(canonical.id, members);
    for (const entry of members) if (entry.id !== canonical.id) {
      removed.add(entry.id);
      replacements[entry.key] = canonical.key;
    }
  }
  const plans = [];
  for (const document of documents) {
    const edits = [];
    if (/\.bib$/i.test(document.path)) {
      for (const entry of records.filter((entry2) => entry2.path === document.path)) {
        if (removed.has(entry.id)) {
          edits.push({ from: entry.from, to: entry.to, text: "" });
          continue;
        }
        let text = entry.text;
        const internal = [];
        for (const field of ["crossref", "xref", "xdata", "related", "entryset"]) {
          const original = entry.fields[field];
          if (!original) continue;
          const value = [...new Set(original.split(",").map((key) => replacements[key.trim()] || key.trim()))].join(",");
          if (value !== original) {
            const range = entry.fieldRanges[field];
            internal.push({ from: range.from - entry.from, to: range.to - entry.from, text: "{" + value + "}" });
          }
        }
        for (const edit of internal.sort((a, b) => b.from - a.from)) text = text.slice(0, edit.from) + edit.text + text.slice(edit.to);
        const members = kept.get(entry.id), extra = [];
        if (members) {
          const fields = new Set(Object.keys(entry.fields));
          for (const other of members) for (const [name, value] of Object.entries(other.fields)) {
            if (fields.has(name)) continue;
            if ((other.dependencies[name] || []).length) throw Error(`\u6761\u76EE ${other.key} \u7684\u5B57\u6BB5 ${name} \u4F7F\u7528\u672A\u89E3\u6790\u7684\u5B57\u7B26\u4E32\u5B8F\uFF0C\u8BF7\u8865\u5168\u5B8F\u5B9A\u4E49\u540E\u91CD\u65B0\u53BB\u91CD`);
            fields.add(name);
            const mapped = ["crossref", "xref", "xdata", "related", "entryset"].includes(name) ? value.split(",").map((key) => replacements[key.trim()] || key.trim()).join(",") : value;
            extra.push(`  ${name} = {${mapped}},`);
          }
        }
        if (extra.length) {
          const close = text.at(-1), body = text.slice(0, -1).trimEnd();
          text = body + (body.endsWith(",") ? "" : ",") + "\n" + extra.join("\n") + "\n" + close;
        }
        if (text !== entry.text) edits.push({ from: entry.from, to: entry.to, text });
      }
    } else {
      for (const location of locations.filter((location2) => location2.path === document.path)) {
        if (!location.keys.some((key) => replacements[key] && replacements[key] !== key)) continue;
        const seen = /* @__PURE__ */ new Set();
        let text = "";
        for (const part of location.parts) {
          const key = replacements[part.key] || part.key;
          const prefix = document.text.slice(part.from, part.keyFrom), suffix = document.text.slice(part.keyTo, part.to);
          if (seen.has(key)) {
            if ((prefix + suffix).trim()) text += prefix + suffix;
          } else {
            text += (seen.size ? "," : "") + prefix + key + suffix;
            seen.add(key);
          }
        }
        edits.push({ from: location.from, to: location.to, text });
      }
    }
    let after = document.text;
    for (const edit of edits.sort((a, b) => b.from - a.from)) after = after.slice(0, edit.from) + edit.text + after.slice(edit.to);
    if (after !== document.text) plans.push({ path: document.path, before: document.text, after });
  }
  return { plans, groups: selected.size, removed: removed.size, replacements };
}

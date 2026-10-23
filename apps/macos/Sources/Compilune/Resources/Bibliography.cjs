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

// bibliography.js
var bibliography_exports = {};
__export(bibliography_exports, {
  citationPlan: () => citationPlan,
  parseBibTeX: () => parseBibTeX
});
module.exports = __toCommonJS(bibliography_exports);
function parseBibTeX(input, strict = true) {
  if (!strict && typeof input === "string" && !input.trim()) return { entries: [], keys: [] };
  if (typeof input !== "string" || !input.trim()) throw new Error("\u526A\u8D34\u677F\u4E3A\u7A7A\uFF0C\u8BF7\u5148\u590D\u5236 BibTeX \u6587\u732E\u3002");
  if (strict && input.length > 1e6) throw new Error("\u6587\u732E\u5185\u5BB9\u8FC7\u5927\uFF0C\u8BF7\u5206\u6279\u63D2\u5165\u3002");
  if (input.includes("\0")) throw new Error("BibTeX \u5185\u5BB9\u5305\u542B\u65E0\u6548\u5B57\u7B26\uFF0C\u672A\u63D2\u5165\u4EFB\u4F55\u5185\u5BB9\u3002");
  const text = input.replace(/^\uFEFF/, "");
  let p = 0;
  const entries = [], keys = /* @__PURE__ */ new Set();
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
      if (type === "string") {
        identifier();
        whitespace();
        if (text[p++] !== "=") fail();
      }
      value();
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
    const fields = /* @__PURE__ */ new Set();
    whitespace();
    while (p < text.length && text[p] !== close) {
      const field = identifier().toLowerCase();
      if (fields.has(field)) fail();
      fields.add(field);
      whitespace();
      if (text[p++] !== "=") fail();
      value();
      if (text[p] === ",") {
        p++;
        whitespace();
      } else if (text[p] !== close) fail();
    }
    if (!fields.size || text[p++] !== close) fail();
    keys.add(key);
    entries.push({ key, type, text: text.slice(start, p) });
  }
  if (strict && !entries.length) throw new Error("\u526A\u8D34\u677F\u4E2D\u6CA1\u6709\u53EF\u5F15\u7528\u7684 BibTeX \u6587\u732E\uFF0C\u672A\u63D2\u5165\u4EFB\u4F55\u5185\u5BB9\u3002");
  return { entries, keys: [...keys] };
}
function citationPlan(clipboard, existing, projectKeys = []) {
  const parsed = parseBibTeX(clipboard);
  const keys = new Set(projectKeys);
  for (const key of parsed.keys)
    if (keys.has(key)) throw new Error(`\u9879\u76EE\u4E2D\u5DF2\u5B58\u5728\u6587\u732E\u952E ${key}\uFF0C\u672A\u63D2\u5165\u4EFB\u4F55\u5185\u5BB9\u3002`);
  const separator = existing.length ? existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n" : "";
  return {
    text: existing + separator + clipboard.replace(/^\uFEFF/, "").trim().replaceAll("\r\n", "\n") + "\n",
    citation: "\\cite{" + parsed.keys.join(",") + "}",
    keys: parsed.keys
  };
}

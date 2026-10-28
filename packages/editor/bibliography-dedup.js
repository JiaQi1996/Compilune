import { parseBibTeX, citationMetadata, readableTeX } from "./bibliography.js";
import { scanTeXBlocks } from "./fold-data.js";
const normalize = value => readableTeX(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
function authorIdentity(value, details = null) {
  const authors = []; let depth = 0, start = 0;
  for (let i = 0; i <= value.length; i++) {
    if (value[i] === "\\") { i++; continue; }
    if (value[i] === "{") depth++;
    if (value[i] === "}") depth--;
    const separator = depth === 0 && /^\s+and\s+/i.exec(value.slice(i));
    if (i !== value.length && !separator) continue;
    const raw = value.slice(start, i).trim();
    if (!raw || /^others$/i.test(raw)) return "";
    if (/^\{[\s\S]*\}$/.test(raw)) authors.push("organization:" + normalize(raw));
    else {
      const parts = readableTeX(raw).split(",").map(x => x.trim());
      let family, given;
      if (parts.length > 1) { family = parts[0] + (parts.length > 2 ? " " + parts.slice(1,-1).join(" ") : ""); given = parts.at(-1); }
      else {
        const words = parts[0].split(/\s+/);
        const particle = words.findIndex((word,index)=>index>0 && index<words.length-1 && /^[a-z]/.test(word));
        if (particle>0) { family=words.slice(particle).join(" ");given=words.slice(0,particle).join(" "); }
        else { family=words.pop();given=words.join(" "); }
      }
      const initials = (given.match(/[\p{L}\p{N}]+/gu) || []).map(word => normalize([...word][0])).join("");
      const key=normalize(family) + ":" + initials;
      authors.push(key);
      if(details)details.push({key,given:(given.match(/[\p{L}\p{N}]+/gu) || []).map(normalize)});
    }
    if (separator) { i += separator[0].length - 1; start = i + 1; }
  }
  return authors.sort().join("|");
}
function identity(entry) {
  if ((entry.dependencies.title || []).length || (entry.dependencies.author || []).length) return "";
  const title = normalize(entry.fields.title || ""), authors = authorIdentity(entry.fields.author || "");
  return title && authors ? title + "::" + authors : "";
}
function groupAt(text, at, open="{", close="}") {
  while (at < text.length && /\s/.test(text[at])) at++;
  if (text[at] !== open) return null;
  const start = ++at; let depth = 1;
  for (; at < text.length; at++) {
    if (text[at] === "\\") { at++; continue; }
    if (text[at] === open) depth++;
    if (text[at] === close && --depth === 0) return { from: start, to: at, end: at + 1 };
    if (text[at] !== close) { /* only closing characters decrement depth */ }
  }
  return null;
}
export function citationLocations(source, path) {
  const text = scanTeXBlocks(source).masked, out = [];
  const command = /\\([A-Za-z]*cite[A-Za-z]*|bibentry)\*?(?![A-Za-z@])/gi;
  for (let m; (m = command.exec(text));) {
    let slashes = 0; for (let i=m.index-1;i>=0 && text[i]==="\\";i--) slashes++;
    if (slashes % 2 || /^(?:new|declare)/i.test(m[1])) continue;
    let at = command.lastIndex;
    if (/cites$/i.test(m[1])) for(let i=0;i<2;i++){const globalNote=groupAt(text,at,"(",")");if(!globalNote)break;at=globalNote.end;}
    while (true) { const optional = groupAt(text, at, "[", "]"); if (!optional) break; at = optional.end; }
    do {
      const group = groupAt(text, at); if (!group) break;
      const value = text.slice(group.from, group.to);
      const keys = value.split(",").map(key=>key.trim());
      if (keys.length && keys.every(key => key && !/[\s{}\\]/.test(key))) {
        let position=group.from;
        const parts=value.split(',').map((part,index)=>{const from=position,key=keys[index],keyFrom=from+part.indexOf(key);position+=part.length+1;return {from,to:from+part.length,key,keyFrom,keyTo:keyFrom+key.length};});
        out.push({ path, line: source.slice(0, m.index).split("\n").length, command: m[1], keys,
          from: group.from, to: group.to, parts, text: source.slice(Math.max(0, source.lastIndexOf("\n", m.index)+1), source.indexOf("\n", group.end)<0 ? source.length : source.indexOf("\n", group.end)).slice(0,240) });
      }
      at = group.end;
      while (true) { const optional = groupAt(text, at, "[", "]"); if (!optional) break; at = optional.end; }
    } while (/cites$/i.test(m[1]));
  }
  return out;
}
function recordsFor(documents) {
  const records = [], locations = [];
  for (const document of documents) {
    if (/\.bib$/i.test(document.path)) {
      const offset = document.text.startsWith("\uFEFF") ? 1 : 0;
      for (const entry of parseBibTeX(document.text, false).entries) records.push({ ...entry,
        path: document.path, from: entry.from + offset, to: entry.to + offset,
        fieldRanges: Object.fromEntries(Object.entries(entry.fieldRanges).map(([name, range]) => [name, { from: range.from+offset, to: range.to+offset }])),
        id: document.path + ":" + (entry.from + offset), line: document.text.slice(0, entry.from+offset).split("\n").length });
    } else locations.push(...citationLocations(document.text, document.path));
  }
  return { records, locations };
}
function loadedBibliographies(documents) {
  const bibs=documents.filter(document=>/\.bib$/i.test(document.path)).map(document=>document.path), result=new Set();
  const normalizePath=value=>{const parts=[];for(const part of value.split("/")){if(!part || part===".")continue;if(part==="..")parts.pop();else parts.push(part);}return parts.join("/");};
  for(const document of documents.filter(document=>!/\.bib$/i.test(document.path))) {
    const text=scanTeXBlocks(document.text).masked;
    for(const match of text.matchAll(/\\(?:bibliography|addbibresource)(?:\s*\[[^\]]*\])?\s*\{([^{}]*)\}/g)) {
      for(let name of match[1].split(',')) {
        name=name.trim();if(!name || name.includes('\\'))continue;if(!/\.bib$/i.test(name))name+='.bib';
        const candidates=[normalizePath(name),normalizePath(document.path.slice(0,document.path.lastIndexOf('/')+1)+name)];
        const matches=bibs.filter(file=>candidates.includes(file));
        if(matches.length)matches.forEach(file=>result.add(file));
        else {const same=bibs.filter(file=>file.split('/').at(-1)===name.split('/').at(-1));if(same.length===1)result.add(same[0]);}
      }
    }
  }
  return result;
}
export function bibliographyDuplicates(documents) {
  const loaded=loadedBibliographies(documents);
  const { records, locations } = recordsFor(documents), byIdentity = new Map(), byKey = new Map();
  for (const record of records) {
    const key = identity(record);
    if (key) { const group = byIdentity.get(key) || []; group.push(record); byIdentity.set(key, group); }
    const uses = byKey.get(record.key) || []; uses.push(record); byKey.set(record.key, uses);
  }
  const groups = [];
  for (const entries of byIdentity.values()) {
    if (entries.length < 2) continue;
    const keys = new Set(entries.map(entry=>entry.key));
    const references = locations.filter(location => location.keys.some(key=>keys.has(key)));
    const years = new Set(entries.map(entry=>entry.fields.year || entry.fields.date?.slice(0,4)).filter(Boolean));
    const dois = new Set(entries.map(entry=>readableTeX(entry.fields.doi || "").toLowerCase().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/, "")).filter(Boolean));
    const names=entries.map(entry=>{const details=[];authorIdentity(entry.fields.author,details);return details;});
    let differentNames=false;
    for(const first of names)for(const other of names)for(const author of first)for(const match of other.filter(item=>item.key===author.key))
      for(let i=0;i<Math.min(author.given.length,match.given.length);i++)if(author.given[i].length>1 && match.given[i].length>1 && author.given[i]!==match.given[i])differentNames=true;
    const collision = entries.some(entry => byKey.get(entry.key).some(other => identity(other) !== identity(entry)));
    const inherited = entries.some(entry => ["crossref", "xref", "xdata"].some(field => (entry.fields[field] || "").split(",").some(key => keys.has(key.trim()))));
    const blocked = collision ? "同一引用键还指向其他文献，请先解决引用键冲突" : inherited ? "组内存在 Bib 继承关系，请先展开继承字段再合并" : "";
    const warnings = [...(differentNames ? ["作者全名不同，仅首字母相同，请核对作者身份"] : []), ...(years.size > 1 ? ["发表年份不同，请核对版本"] : []), ...(dois.size > 1 ? ["DOI 不同，请核对是否为同一篇论文"] : [])];
    const preferred = [...entries].sort((a,b) => Number(loaded.has(b.path))-Number(loaded.has(a.path)) || Object.keys(b.fields).length - Object.keys(a.fields).length || a.path.localeCompare(b.path) || a.from-b.from)[0];
    groups.push({ id: entries[0].id, title: citationMetadata(preferred).title, author: preferred.fields.author,
      entries: entries.map(entry=>({ id: entry.id, key: entry.key, path: entry.path, line: entry.line,
        ...citationMetadata(entry), fieldCount: Object.keys(entry.fields).length, raw: entry.text })),
      keep: preferred.id, references, warnings, blocked });
  }
  return { groups, entryCount: records.length };
}
export function deduplicateBibliography(documents, choices) {
  const preview = bibliographyDuplicates(documents), { records, locations } = recordsFor(documents);
  if (!Array.isArray(choices) || choices.length > preview.groups.length) throw Error("无效去重选择");
  const replacements = Object.create(null), removed = new Set(), kept = new Map(), selected = new Set();
  for (const choice of choices) {
    const group = preview.groups.find(group=>group.id===choice.id);
    if (!group || selected.has(group.id) || group.blocked || !group.entries.some(entry=>entry.id===choice.keep)) throw Error("去重预览已变化或选择无效，请重新检查");
    selected.add(group.id);
    const canonical = records.find(entry=>entry.id===choice.keep);
    const members = group.entries.map(entry=>records.find(record=>record.id===entry.id));
    kept.set(canonical.id, members);
    for (const entry of members) if (entry.id !== canonical.id) { removed.add(entry.id); replacements[entry.key] = canonical.key; }
  }
  const plans = [];
  for (const document of documents) {
    const edits = [];
    if (/\.bib$/i.test(document.path)) {
      for (const entry of records.filter(entry=>entry.path===document.path)) {
        if (removed.has(entry.id)) { edits.push({ from: entry.from, to: entry.to, text: "" }); continue; }
        let text = entry.text;
        const internal = [];
        for (const field of ["crossref", "xref", "xdata", "related", "entryset"]) {
          const original = entry.fields[field]; if (!original) continue;
          const value = [...new Set(original.split(",").map(key=>replacements[key.trim()] || key.trim()))].join(",");
          if (value !== original) { const range = entry.fieldRanges[field]; internal.push({ from: range.from-entry.from, to: range.to-entry.from, text: "{"+value+"}" }); }
        }
        for (const edit of internal.sort((a,b)=>b.from-a.from)) text=text.slice(0,edit.from)+edit.text+text.slice(edit.to);
        const members = kept.get(entry.id), extra = [];
        if (members) {
          const fields = new Set(Object.keys(entry.fields));
          for (const other of members) for (const [name, value] of Object.entries(other.fields)) {
            if (fields.has(name)) continue;
            // Unknown string macros cannot be moved across bibliography scopes.
            if ((other.dependencies[name] || []).length) throw Error(`条目 ${other.key} 的字段 ${name} 使用未解析的字符串宏，请补全宏定义后重新去重`);
            fields.add(name);
            const mapped = ["crossref","xref","xdata","related","entryset"].includes(name) ? value.split(",").map(key=>replacements[key.trim()] || key.trim()).join(",") : value;
            extra.push(`  ${name} = {${mapped}},`);
          }
        }
        if (extra.length) {
          const close=text.at(-1), body=text.slice(0,-1).trimEnd();
          text=body+(body.endsWith(",")?"":",")+"\n"+extra.join("\n")+"\n"+close;
        }
        if (text!==entry.text) edits.push({from:entry.from,to:entry.to,text});
      }
    } else {
      for (const location of locations.filter(location=>location.path===document.path)) {
        if (!location.keys.some(key=>replacements[key] && replacements[key]!==key)) continue;
        const seen=new Set();let text="";
        for(const part of location.parts) {
          const key=replacements[part.key] || part.key;
          const prefix=document.text.slice(part.from,part.keyFrom),suffix=document.text.slice(part.keyTo,part.to);
          if(seen.has(key)){if((prefix+suffix).trim())text+=prefix+suffix;}
          else {text+=(seen.size ? "," : "")+prefix+key+suffix;seen.add(key);}
        }
        edits.push({from:location.from,to:location.to,text});
      }
    }
    let after=document.text;
    for (const edit of edits.sort((a,b)=>b.from-a.from)) after=after.slice(0,edit.from)+edit.text+after.slice(edit.to);
    if (after!==document.text) plans.push({ path:document.path, before:document.text, after });
  }
  return { plans, groups: selected.size, removed: removed.size, replacements };
}

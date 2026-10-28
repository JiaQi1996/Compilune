// Lightweight TeX block scanner shared by folding and citation scans. Offsets
// stay in UTF-16, as required by CodeMirror and the native editor bridge.
export function scanTeXBlocks(source) {
  const blocks = [], ignored = [], envs = [], braces = [];
  const starts = [0];
  for (let p = 0; p < source.length; p++) if (source[p] === "\n") starts.push(p + 1);
  function lineAt(pos) {
    let lo = 0, hi = starts.length;
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid; }
    return { from: starts[lo], to: lo + 1 < starts.length ? starts[lo + 1] - 1 : source.length, number: lo + 1 };
  }
  function escaped(pos) { let n = 0; while (pos > 0 && source[--pos] === "\\") n++; return n % 2 === 1; }
  function add(start, end, kind) {
    const line = lineAt(start);
    if (end > line.to && lineAt(end).number > line.number)
      blocks.push({ line: line.from, from: line.to, to: end, kind });
  }
  const rawEnvs = /^(?:verbatim\*?|[BL]?Verbatim|SaveVerbatim|lstlisting|minted|comment|filecontents\*?)$/;
  const token = /\\(?:begin|end)\s*\{([^{}\r\n]+)\}|\\(?:verb|lstinline)\*?(?![A-Za-z@])|\\(?:string|detokenize)(?![A-Za-z@])|\$\$|\\\[|\\\]|[{}%]/g;
  let math = null;
  for (let m; (m = token.exec(source));) {
    if (escaped(m.index)) continue;
    const text = m[0];
    if (text === "%") {
      const end = source.indexOf("\n", m.index);
      token.lastIndex = end < 0 ? source.length : end;
      ignored.push({ from: m.index, to: token.lastIndex });
    } else if (text === "\\string") {
      let at=token.lastIndex;while(at<source.length && /\s/.test(source[at]))at++;
      const next=/^\\(?:[A-Za-z@]+|.)|^[\s\S]/.exec(source.slice(at));
      token.lastIndex=at+(next?.[0].length || 0);ignored.push({from:m.index,to:token.lastIndex});
    } else if (text === "\\detokenize") {
      let at=token.lastIndex;while(at<source.length && /\s/.test(source[at]))at++;
      if(source[at]!=="{")continue;
      let depth=1;at++;
      while(at<source.length && depth){if(source[at]==="\\"){at+=2;continue;}if(source[at]==="{")depth++;if(source[at]==="}")depth--;at++;}
      token.lastIndex=at;ignored.push({from:m.index,to:at});
    } else if (/^\\(?:verb|lstinline)/.test(text)) {
      let at = token.lastIndex;
      if (text.startsWith("\\lstinline") && source[at] === "[") {
        const close = source.indexOf("]", at + 1); if (close >= 0) at = close + 1;
      }
      const delimiter = source[at];
      if (!delimiter || /\s/.test(delimiter)) continue;
      const close = source.indexOf(delimiter, at + 1), newline = source.indexOf("\n", at);
      token.lastIndex = close >= 0 && (newline < 0 || close < newline) ? close + 1 : newline < 0 ? source.length : newline;
      ignored.push({ from: m.index, to: token.lastIndex });
    } else if (m[1] !== undefined) {
      const name = m[1].trim();
      if (text.startsWith("\\begin")) {
        if (rawEnvs.test(name)) {
          const pattern = new RegExp('\\\\end\\s*\\{' + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '\\}', 'g');
          pattern.lastIndex = token.lastIndex;
          const end = pattern.exec(source);
          ignored.push({ from: token.lastIndex, to: end ? end.index : source.length });
          if (end) { add(m.index, end.index, name); token.lastIndex = pattern.lastIndex; }
          else token.lastIndex = source.length;
        } else envs.push({ name, from: m.index });
      } else {
        const index = envs.findLastIndex(env => env.name === name);
        if (index < 0) continue;
        if (index === envs.length - 1) add(envs[index].from, m.index, name);
        envs.splice(index);
      }
    } else if (text === "{") braces.push(m.index);
    else if (text === "}") { const start = braces.pop(); if (start !== undefined) add(start, m.index, "group"); }
    else if (!math && (text === "$$" || text === "\\[")) math = { from: m.index, delimiter: text };
    else if (math && ((text === "$$" && math.delimiter === "$$") || (text === "\\]" && math.delimiter === "\\["))) {
      add(math.from, m.index, "math"); math = null;
    }
  }
  let masked = "", at = 0;
  for (const range of ignored) { masked += source.slice(at, range.from) + source.slice(range.from, range.to).replace(/[^\n]/g, " "); at = range.to; }
  masked += source.slice(at);
  return { blocks, masked };
}

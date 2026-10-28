// Parse diagnostics as text. Rendering and project-local path validation belong
// to the hosts; no log content is interpreted as HTML or executable input.
export function parseBuildLog(log) {
  const stack = [], rows = [];
  let pending = "", wrapped = "", previous = null;
  const ext = "(?:tex|ltx|sty|cls|bib|bst|cfg|def|tikz|dtx|ins)";
  const direct = new RegExp('^\\s*"?(.+?\\.' + ext + ')"?\\s*:(\\d+)(?::(\\d+))?:\\s*(.*)$', 'i');
  const tokens = new RegExp('\\((?:"([^"\\n]+\\.' + ext + ')"|([^()\\n]*?\\.' + ext + ')(?=[\\s()]|$))|[()]', 'gi');
  const pathStart = /^(?:\.{0,2}[\\/]|[A-Za-z]:[\\/]|[^\s:()]+[\\/])/;
  for (const original of String(log).split(/\r?\n/)) {
    const raw = original.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    const row = { text: raw };
    // max_print_line counts encoded bytes, so a Chinese path can wrap with far
    // fewer than 79 JavaScript characters, even inside an extension or line number.
    const joined = wrapped + raw;
    const m = direct.exec(joined);
    if (m) {
      Object.assign(row, { file: m[1].trim(), line: Number(m[2]), column: Number(m[3] || 1), message: m[4] });
      previous = { file: row.file, line: row.line, message: row.message };
      pending = ""; wrapped = "";
    } else {
      const bang = /^\s*!\s*(.*)$/.exec(raw);
      if (bang) { pending = bang[1]; previous = null; }
      const line = /^\s*l\.(\d+)(?:\s+(.*)|\s*)$/.exec(raw);
      if (line) {
        const number = Number(line[1]);
        const last = previous?.line === number ? previous : null;
        Object.assign(row, {
          file: last?.file || [...stack].reverse().find(Boolean) || "",
          line: number, column: 1, message: pending || last?.message || line[2] || "编译错误",
        });
        pending = ""; wrapped = "";
      } else if (!bang) {
        tokens.lastIndex = 0;
        for (let t; (t = tokens.exec(raw));) {
          if (t[0] === ")") stack.pop();
          else stack.push((t[1] || t[2] || "").trim());
        }
        // Only path-shaped output may begin a continuation. Stop at a blank,
        // an error message, or ordinary prose. Hosts still validate the result.
        const fragment = wrapped ? joined : raw.trimStart();
        const looksLikePath = pathStart.test(fragment) && !/[<>]/.test(fragment) && !/\s{2,}/.test(fragment);
        wrapped = raw.trim() && looksLikePath && !/[.!?]\s*$/.test(raw.replace(/\.\s*$/, ""))
          ? fragment : "";
      } else wrapped = "";
    }
    rows.push(row);
  }
  return { rows };
}

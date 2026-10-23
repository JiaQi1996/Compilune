import {
  EditorState,
  Compartment,
  EditorSelection,
  Prec,
  Transaction,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  toggleLineComment,
  undo,
  redo,
} from "@codemirror/commands";
import {
  StreamLanguage,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
} from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import {
  search,
  searchKeymap,
  openSearchPanel,
  closeSearchPanel,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  gotoLine,
} from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  acceptCompletion,
  startCompletion,
  closeBrackets,
  closeBracketsKeymap,
  snippetCompletion,
  snippet,
  hasNextSnippetField,
  nextSnippetField,
  closeCompletion,
} from "@codemirror/autocomplete";
import { installTooltips, tooltipText } from "../workbench/tooltips.js";
installTooltips();

let hostPlatform = /Mac/.test(navigator.platform) ? "darwin" : "win32";
const post = (body) => {
  if (window.webkit?.messageHandlers?.folio)
    window.webkit.messageHandlers.folio.postMessage(body);
  else if (window.parent !== window)
    window.parent.postMessage({ channel: "folio-editor", message: body }, "*");
};
let path = "",
  size = 13,
  uiSize = 13,
  dark = false,
  symbols = [],
  files = [],
  indexSignature = "",
  flushToken = null;
const documents = new Map();
const style = new Compartment();
const bindings = new Compartment();
let nativeHistory = false,
  commandRecords = [],
  optionsSignature = "",
  restoring = false,
  navigation = [],
  forwardNavigation = [];
const commandHelp = {
  section: "将选中文字设为章节标题",
  bold: "加粗选中文字；再次点击取消加粗",
  italic: "将选中文字设为斜体；再次点击取消斜体",
  underline: "为选中文字添加或取消下划线",
  list: "将选中段落转换为无序列表",
  ordered: "将选中段落转换为有序列表",
  math: "插入行内公式，或将选区放入数学区域",
  cite: "插入文献引用并显示文献键候选",
  pasteCitation: "校验剪贴板中的 BibTeX，追加到文献文件并插入引用",
  ref: "插入交叉引用并显示标签候选",
  image: "选择图片；项目外图片将复制到 figures 文件夹",
  find: "打开当前文件的查找面板",
  replace: "打开当前文件的查找与替换面板",
  table: "指定行数和列数后插入 LaTeX 表格",
  completion: "显示光标处的命令、参数或项目符号补全",
  back: "返回上一次源码位置",
  forward: "前进到下一次源码位置",
  palette: "打开命令面板，按名称查找并执行操作",
  goto: "输入行号或行:列，跳到当前文件中的位置",
  symbols: "查找项目章节并跳到源码",
};
const defaultHints = new Map();
function shortcutLabel(key) {
  if (hostPlatform !== "darwin")
    return key
      .replaceAll("Mod-", "Ctrl+")
      .replaceAll("Ctrl-", "Ctrl+")
      .replaceAll("Alt-", "Alt+")
      .replaceAll("Shift-", "Shift+")
      .replace("Enter", "Enter")
      .replace(/[a-z]$/, (s) => s.toUpperCase());
  return key
    .replaceAll("Mod-", "⌘")
    .replaceAll("Ctrl-", "⌃")
    .replaceAll("Alt-", "⌥")
    .replaceAll("Shift-", "⇧")
    .replace("Enter", "↩")
    .replace("Space", "空格")
    .replace(/[a-z]$/, (s) => s.toUpperCase());
}
function helpWithKey(id, text, fallback = "") {
  const binding = commandRecords.find((c) => c.id === id),
    key = binding ? shortcutLabel(binding.key) : fallback;
  const display =
    hostPlatform === "darwin"
      ? key
      : key
          .replaceAll("⌘", "Ctrl+")
          .replaceAll("⌃", "Ctrl+")
          .replaceAll("⌥", "Alt+")
          .replaceAll("⇧", "Shift+")
          .replaceAll("↩", "Enter");
  return text + (display ? "（" + display + "）" : "");
}
function updateButtonHelp(root = document) {
  const buttons = [
    ...(root.matches?.("button") ? [root] : []),
    ...root.querySelectorAll("button"),
  ];
  for (const button of buttons) {
    if (button.dataset.command) {
      const id = button.dataset.command;
      if (!defaultHints.has(id))
        defaultHints.set(
          id,
          tooltipText(button).match(/(?:[⌘⌃⌥⇧]|F\d+).*$/)?.[0] || "",
        );
      button.title = helpWithKey(
        id,
        commandHelp[id] || button.textContent.trim(),
        defaultHints.get(id),
      );
    } else if (button.closest(".cm-search")) {
      const info = {
        next: ["findNext", "跳到下一处匹配", "⌘G"],
        prev: ["findPrevious", "跳到上一处匹配", "⌘⇧G"],
        select: ["", "选中当前文件中的全部匹配", ""],
        replace: ["replaceNext", "替换当前匹配并查找下一处", "⌘⌥↩"],
        replaceAll: ["replaceAll", "替换当前文件中的全部匹配，可撤销", "⌘⌥⇧↩"],
        close: ["", "关闭查找与替换面板", "Esc"],
      }[button.name];
      if (info) button.title = helpWithKey(...info);
    } else if (button.id === "picker-close")
      button.title = "关闭跳转或命令面板（Esc）";
    else if (button.id === "insert-cancel") button.title = "取消插入，保留原文";
    else if (button.id === "insert-confirm")
      button.title = "按当前填写的内容生成并插入 LaTeX 源码";
    else if (!tooltipText(button))
      button.title =
        "执行：" +
        (button.getAttribute("aria-label") || button.textContent.trim());
    if (button.title) button.setAttribute("aria-label", button.title);
  }
  for (const field of root.querySelectorAll(
    ".cm-search input[type=checkbox]",
  )) {
    const hint = {
      case: "区分英文字母大小写",
      re: "把查找内容作为正则表达式",
      word: "仅匹配完整单词",
    }[field.name];
    if (hint) {
      field.title = hint;
      field.closest("label").title = hint;
    }
  }
}
const theme = () =>
  EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: size + "px",
        backgroundColor: dark ? "#212723" : "#fdfdfb",
        color: dark ? "#e0e5dc" : "#242c28",
      },
      ".cm-content": {
        fontFamily:
          hostPlatform === "darwin"
            ? "SFMono-Regular, Menlo, monospace"
            : "Cascadia Code, Consolas, monospace",
        lineHeight: "1.65",
        padding: "16px 0",
      },
      ".cm-scroller": { overflow: "auto" },
      ".cm-line": { padding: "0 18px" },
      ".cm-gutters": {
        backgroundColor: dark ? "#212723" : "#fdfdfb",
        color: dark ? "#9aa895" : "#7b8575",
        border: "none",
        fontSize: size + "px",
      },
      ".cm-activeLine, .cm-activeLineGutter": {
        backgroundColor: dark ? "#34432f66" : "#e2e8dd66",
      },
      ".cm-cursor": { borderLeftColor: dark ? "#a4bf98" : "#526b56" },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: dark ? "#526b5666" : "#b6caae66",
      },
      ".cm-panels": {
        fontSize: uiSize + "px",
        backgroundColor: dark ? "#252a27" : "#f0f1ec",
        color: dark ? "#e0e5dc" : "#242c28",
      },
      ".cm-tooltip": {
        fontSize: uiSize + "px",
        backgroundColor: dark ? "#252a27" : "#ffffff",
        border: "1px solid " + (dark ? "#465142" : "#d9dfd3"),
      },
      ".cm-tooltip.cm-tooltip-autocomplete": {
        borderRadius: "10px",
        overflow: "hidden",
        padding: "4px 0",
        boxShadow: dark ? "0 14px 36px #0006" : "0 12px 32px #1c302022",
      },
      ".cm-tooltip-autocomplete > ul": {
        fontFamily:
          hostPlatform === "darwin"
            ? "SFMono-Regular, Menlo, monospace"
            : "Cascadia Code, Consolas, monospace",
        minWidth: "290px",
        maxWidth: "min(390px, 90vw)",
        maxHeight: "260px",
      },
      ".cm-tooltip-autocomplete > ul > li": {
        padding: "7px 10px",
        margin: "2px 4px",
        borderRadius: "6px",
        lineHeight: "1.4",
      },
      ".cm-tooltip.cm-tooltip-autocomplete ul li[aria-selected]": {
        background: dark ? "#3b4d3c" : "#e2eadf",
        color: dark ? "#edf3e7" : "#263d2d",
      },
      ".cm-completionLabel": { fontWeight: "500" },
      ".cm-completionDetail": {
        display: "block",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: Math.max(8, uiSize - 2) + "px",
        fontStyle: "normal",
        opacity: ".7",
        margin: "2px 0 0 22px",
      },
      ".cm-completionMatchedText": {
        textDecoration: "none",
        fontWeight: "700",
        color: dark ? "#bfdaad" : "#456c48",
      },
      ".cm-completionIcon": {
        color: dark ? "#b7cfa7" : "#64815d",
        opacity: ".85",
      },
      ".cm-completionIcon:after": {
        content: '"ƒ"',
        fontStyle: "normal",
        fontSize: "12px",
      },
      ".cm-completionIcon-type:after": { content: '"{}"' },
      ".cm-completionIcon-reference:after": { content: '"#"' },
      ".cm-completionIcon-file:after": { content: '"↳"' },
      ".cm-snippetField": {
        backgroundColor: dark ? "#a4bf9830" : "#90a47a24",
        borderRadius: "2px",
      },
      ".cm-searchMatch": { backgroundColor: "#c8b97055" },
      ".cm-searchMatch-selected": { backgroundColor: "#91aa7588" },
    },
    { dark },
  );
const commandWords = {
  section: ["section{${Title}}", "Section heading"],
  subsection: ["subsection{${Subtitle}}", "Subsection heading"],
  subsubsection: ["subsubsection{${Title}}", "Subsubsection heading"],
  textbf: ["textbf{${text}}", "Bold text"],
  textit: ["textit{${text}}", "Italic text"],
  underline: ["underline{${text}}", "Underline text"],
  begin: [
    "begin{${1:environment}}\n  ${0}\n\\end{${1:environment}}",
    "Environment · Tab to move to body",
  ],
  frac: ["frac{${numerator}}{${denominator}}", "Fraction"],
  sqrt: ["sqrt{${expression}}", "Square root"],
  cite: ["cite{${}}", "Bibliography citation"],
  ref: ["ref{${}}", "Cross-reference"],
  label: ["label{${label}}", "Define a label"],
  includegraphics: [
    "includegraphics[width=\\linewidth]{${}}",
    "Insert image · graphicx",
  ],
  input: ["input{${}}", "Include a source file"],
  usepackage: ["usepackage{${}}", "Load a package"],
  title: ["title{${Title}}", "Document title"],
  author: ["author{${Author}}", "Document author"],
  emph: ["emph{${text}}", "Emphasized text"],
};

Object.assign(commandWords, {
  end: ["end{${}}", "End an environment"],
  include: ["include{${}}", "Include a source file"],
  eqref: ["eqref{${}}", "Equation reference"],
  autoref: ["autoref{${}}", "Automatic reference"],
  pageref: ["pageref{${}}", "Page reference"],
  cref: ["cref{${}}", "Clever reference · cleveref"],
  Cref: ["Cref{${}}", "Capitalized reference · cleveref"],
  citep: ["citep{${}}", "Parenthetical citation · natbib"],
  citet: ["citet{${}}", "Textual citation · natbib"],
  parencite: ["parencite{${}}", "Parenthetical citation · biblatex"],
  textcite: ["textcite{${}}", "Textual citation · biblatex"],
  autocite: ["autocite{${}}", "Automatic citation · biblatex"],
  bibliography: ["bibliography{${}}", "Bibliography database"],
  addbibresource: ["addbibresource{${}}", "Bibliography resource · biblatex"],
  bibliographystyle: ["bibliographystyle{${}}", "Bibliography style"],
  documentclass: ["documentclass{${}}", "Document class"],
});
const argumentPattern = /\\(cite[A-Za-z]*|parencite|textcite|autocite|footcite|(?:auto|eq|page|v|V|c|C)?ref|input|include|includegraphics|addbibresource|bibliography|bibliographystyle|documentclass|usepackage)\*?(?:\[[^\]]*\])*\{([^{}]*)$/;
function argumentContext(state) {
  const before = state.sliceDoc(Math.max(0, state.selection.main.head - 400), state.selection.main.head);
  return /\\(?:begin|end)\{[^{}]*$/.test(before) || argumentPattern.test(before);
}
function chainedSnippetCompletion(template, options) {
  const completion = snippetCompletion(template, options), apply = completion.apply;
  completion.apply = (view, option, from, to) => {
    apply(view, option, from, to);
    if (argumentContext(view.state)) setTimeout(() => {
      if (argumentContext(view.state)) startCompletion(view);
    }, 0);
  };
  return completion;
}

// Common commands plus project-defined macros are offered without network services.
for (const name of [
  "documentclass",
  "maketitle",
  "date",
  "today",
  "tableofcontents",
  "clearpage",
  "newpage",
  "footnote",
  "caption",
  "centering",
  "bibliography",
  "bibliographystyle",
  "addbibresource",
  "printbibliography",
  "url",
  "href",
  "texttt",
  "textrm",
  "textsf",
  "textsc",
  "textsuperscript",
  "textsubscript",
  "emph",
  "item",
  "paragraph",
  "subparagraph",
  "chapter",
  "part",
  "vspace",
  "hspace",
  "quad",
  "qquad",
  "noindent",
  "linewidth",
  "textwidth",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "theta",
  "lambda",
  "mu",
  "pi",
  "rho",
  "sigma",
  "phi",
  "omega",
  "sum",
  "prod",
  "int",
  "infty",
  "partial",
  "nabla",
  "times",
  "cdot",
  "leq",
  "geq",
  "neq",
  "approx",
  "equiv",
  "left",
  "right",
  "mathbf",
  "mathbb",
  "mathcal",
  "mathrm",
  "operatorname",
  "overline",
  "underbrace",
  "overbrace",
  "hat",
  "tilde",
  "vec",
  "begin",
  "end",
]) {
  if (!commandWords[name]) commandWords[name] = [name, "LaTeX command"];
}
function completions(context) {
  post({ type: "requestIndex" });
  const before = context.state.sliceDoc(
    Math.max(0, context.pos - 400),
    context.pos,
  );
  const env = before.match(/\\(?:begin|end)\{([^{}]*)$/);
  if (env)
    return {
      from: context.pos - env[1].length,
      options: [
        ...new Set([
          "document",
          "equation",
          "align",
          "align*",
          "gather",
          "figure",
          "table",
          "tabular",
          "itemize",
          "enumerate",
          "description",
          "abstract",
          "theorem",
          "proof",
          "center",
          "quote",
          "verbatim",
          ...symbols
            .filter((s) => s.kind === "environment")
            .map((s) => s.label),
        ]),
      ].map((label) => ({ label, type: "type" })),
      ...(context.state.selection.main.empty ? { validFor: /[^{}]*/ } : { filter: false }),
    };
  const arg = before.match(argumentPattern);
  if (arg) {
    const typed = arg[2].split(",").at(-1).trimStart(), name = arg[1];
    let items;
    if (/cite/i.test(name) || /ref$/i.test(name)) {
      const kind = /cite/i.test(name) ? "cite" : "ref";
      items = symbols.filter((symbol) => symbol.kind === kind)
        .map((symbol) => ({ label: symbol.label, type: kind === "cite" ? "reference" : "variable", detail: symbol.path + ":" + symbol.line }));
    } else {
      const packageNames = ["amsmath", "amssymb", "graphicx", "hyperref", "geometry", "booktabs", "xcolor", "biblatex", "natbib", "mathtools", "siunitx", "enumitem", "cleveref", "subcaption"];
      const classNames = ["article", "report", "book", "beamer", "letter", "standalone", "ctexart", "ctexrep", "ctexbook"];
      const styleNames = ["plain", "unsrt", "alpha", "abbrv", "plainnat", "unsrtnat", "abbrvnat"];
      const extensions = { input: /\.tex$/i, include: /\.tex$/i, includegraphics: /\.(?:pdf|png|jpe?g|eps)$/i,
        bibliography: /\.bib$/i, addbibresource: /\.bib$/i, bibliographystyle: /\.bst$/i, documentclass: /\.cls$/i, usepackage: /\.sty$/i };
      const labels = files.filter((file) => extensions[name]?.test(file)).map((file) =>
        ["include", "bibliography", "bibliographystyle", "documentclass", "usepackage"].includes(name) ? file.replace(/\.[^.]+$/, "") : file);
      labels.push(...(name === "usepackage" ? packageNames : name === "documentclass" ? classNames : name === "bibliographystyle" ? styleNames : []));
      items = [...new Set(labels)].map((label) => ({ label, type: "file" }));
    }
    return { from: context.pos - typed.length, options: items,
      ...(context.state.selection.main.empty ? { validFor: /[^{}\s,]*/ } : { filter: false }) };
  }
  const word = context.matchBefore(/\\[A-Za-z@]*/);
  if (!word) return null;
  const custom = symbols
    .filter((s) => s.kind === "command")
    .map((s) => {
      const label = s.label.replace(/^\\/, "");
      return chainedSnippetCompletion(
        label +
          Array.from(
            { length: s.arguments || 0 },
            (_, i) => "{${argument" + (i + 1) + "}}",
          ).join(""),
        {
          label,
          detail: "Project definition · " + s.path + ":" + s.line,
          type: "function",
        },
      );
    });
  return {
    from: word.from + 1,
    options: [
      ...custom,
      ...Object.entries(commandWords)
        .filter(([name]) => !custom.some((c) => c.label === name))
        .map(([label, [template, detail]]) =>
          chainedSnippetCompletion(template, {
            label,
            displayLabel: "\\" + label,
            detail,
            type: "keyword",
          }),
        ),
    ],
    validFor: /[A-Za-z@]*/,
  };
}
function position() {
  const sel = view.state.selection.main;
  return {
    anchor: sel.anchor,
    head: sel.head,
    scroll: view.scrollDOM.scrollTop,
  };
}
function reportPosition() {
  if (path && !restoring) post({ type: "position", path, ...position() });
}
function changeReport(event = "input") {
  if (path)
    post({
      type: "change",
      path,
      text: view.state.doc.toString(),
      composing: view.composing,
      event,
    });
}
function notice(message) {
  post({ type: "notice", message });
}
function mathContext() {
  const before = view.state
    .sliceDoc(0, view.state.selection.main.from)
    .replace(/(?<!\\)%[^\n]*/g, "");
  return (
    (before.match(/(?<!\\)\$/g) || []).length % 2 === 1 ||
    before.lastIndexOf("\\[") > before.lastIndexOf("\\]") ||
    /\\begin\{(?:equation|align|gather)\*?\}(?:(?!\\end\{)[\s\S])*$/.test(
      before,
    )
  );
}
function wrap(left, right) {
  const sel = view.state.selection.main,
    text = view.state.doc.toString(),
    selected = text.slice(sel.from, sel.to);
  if (
    ["\\textbf{", "\\textit{", "\\underline{"].includes(left) &&
    mathContext()
  ) {
    notice("当前位置在数学区域，请使用数学字体命令。");
    return false;
  }
  if (left === "\\underline{" && selected.includes("\n\n")) {
    notice("下划线仅支持行内文本。");
    return false;
  }
  let from = sel.from,
    to = sel.to,
    insert = left + selected + right,
    anchor = from + left.length,
    head = anchor + selected.length;
  if (left.startsWith("\\text") || left === "\\underline{") {
    if (selected.startsWith(left) && selected.endsWith(right)) {
      insert = selected.slice(left.length, -right.length);
      anchor = from;
      head = from + insert.length;
    } else if (
      text.slice(Math.max(0, from - left.length), from) === left &&
      text.slice(to, to + right.length) === right
    ) {
      from -= left.length;
      to += right.length;
      insert = selected;
      anchor = from;
      head = from + selected.length;
    }
  }
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.single(anchor, head),
    userEvent: "input.format",
  });
  view.focus();
  return true;
}
function list(ordered) {
  const env = ordered ? "enumerate" : "itemize",
    sel = view.state.selection.main,
    value = view.state.sliceDoc(sel.from, sel.to);
  if (/\\(?:begin|end)\{/.test(value)) {
    notice("选区包含已有环境，请先缩小选区。");
    return false;
  }
  const items = value
    .split(/\n\s*\n|\n/)
    .map((x) => "\\item " + x)
    .join("\n");
  return replaceRange(
    "\\begin{" + env + "}\n" + items + "\n\\end{" + env + "}",
  );
}
function replaceRange(text) {
  const s = view.state.selection.main;
  view.dispatch({
    changes: { from: s.from, to: s.to, insert: text },
    selection: { anchor: s.from + text.length },
    userEvent: "input.insert",
  });
  view.focus();
  return true;
}
function currentLocation() {
  return { path, ...position() };
}
function navigate(target, remember = true) {
  if (remember && path) {
    navigation.push(currentLocation());
    forwardNavigation = [];
  }
  post({
    type: "navigate",
    path: target.path,
    line: target.line,
    anchor: target.anchor,
    head: target.head,
    scroll: target.scroll,
  });
}
function historyNavigate(back) {
  const from = back ? navigation : forwardNavigation,
    to = back ? forwardNavigation : navigation;
  const target = from.pop();
  if (!target) return false;
  to.push(currentLocation());
  navigate(target, false);
  return true;
}
function definition() {
  const text = view.state.doc.toString(),
    cursor = view.state.selection.main.head;
  const regex =
    /\\(cite\w*|ref|eqref|autoref|input|include|includegraphics)(?:\[[^\]]*\])?\{([^{}]*)\}/g;
  for (const m of text.matchAll(regex)) {
    if (cursor < m.index || cursor > m.index + m[0].length) continue;
    const kind = m[1].startsWith("cite")
      ? "cite"
      : /ref$/.test(m[1])
        ? "ref"
        : "file";
    const key =
      m[2]
        .split(",")
        .find(
          (k) =>
            text.indexOf(k, m.index) <= cursor &&
            cursor <= text.indexOf(k, m.index) + k.length,
        ) || m[2].split(",")[0];
    let rows =
      kind === "file"
        ? files
            .filter(
              (f) =>
                f === key ||
                f === key + ".tex" ||
                f.endsWith("/" + key) ||
                f.endsWith("/" + key + ".tex"),
            )
            .map((f) => ({ label: f, path: f, line: 1 }))
        : symbols.filter((s) => s.kind === kind && s.label === key.trim());
    if (rows.length === 1) {
      navigate(rows[0]);
      return true;
    }
    if (rows.length) {
      showPicker("definition", rows);
      return true;
    }
    notice("未找到 " + key + " 的定义。");
    return false;
  }
  const word = [...text.matchAll(/\\[A-Za-z@]+/g)].find(
    (m) => m.index <= cursor && cursor <= m.index + m[0].length,
  )?.[0];
  const rows = symbols.filter((s) => s.kind === "command" && s.label === word);
  if (rows.length === 1) {
    navigate(rows[0]);
    return true;
  }
  notice("将光标放到引用、文件路径或自定义命令上再跳转。");
  return false;
}
let pickerRows = null;
function showPicker(kind, rows = null) {
  const d = document.querySelector("#picker"),
    input = document.querySelector("#picker-query");
  pickerRows = rows;
  d.dataset.kind = kind;
  document.querySelector("#picker-title").textContent =
    {
      files: "快速打开文件",
      definition: "定义候选",
      symbols: "跳转章节",
      palette: "编辑命令",
      goto: "跳转行:列",
    }[kind] || kind;
  input.value = "";
  if (!d.open) d.showModal();
  renderPicker();
  input.focus();
  return true;
}
function renderPicker() {
  const kind = document.querySelector("#picker").dataset.kind,
    q = document.querySelector("#picker-query").value.toLowerCase();
  let rows =
    pickerRows ||
    (kind === "palette"
      ? commandRecords.map((c) => ({
          ...c,
          label: c.title + "   " + shortcutLabel(c.key),
        }))
      : kind === "files"
        ? files
            .filter((f) => /\.(tex|bib|sty|cls|md|txt)$/i.test(f))
            .map((f) => ({ label: f, path: f, line: 1 }))
        : symbols.filter((s) => s.kind === "section"));
  const container = document.querySelector("#picker-results");
  container.replaceChildren();
  if (kind === "goto") {
    container.textContent =
      "输入 1–" + view.state.doc.lines + " 的行号，可加 :列号";
    return;
  }
  rows = rows.filter((r) => r.label.toLowerCase().includes(q)).slice(0, 200);
  for (const r of rows) {
    const b = document.createElement("button");
    b.textContent =
      r.label +
      (r.path && kind !== "files" ? " · " + r.path + ":" + r.line : "");
    b.title =
      kind === "palette"
        ? "执行编辑命令：" +
          r.title +
          (r.key ? "（" + shortcutLabel(r.key) + "）" : "")
        : "打开 " + r.path + "，定位到第 " + r.line + " 行";
    b.onclick = () => {
      document.querySelector("#picker").close();
      if (kind === "palette") command(r.id);
      else navigate(r);
    };
    container.append(b);
  }
}
function replacePanel() {
  openSearchPanel(view);
  requestAnimationFrame(() =>
    view.dom.querySelector("input[name=replace]")?.focus(),
  );
  return true;
}
function font(delta) {
  size = delta === 0 ? 13 : Math.min(30, Math.max(8, size + delta));
  view.dispatch({ effects: style.reconfigure(theme()) });
  post({ type: "font", size });
  return true;
}
let insertKind = "";
function insertionDialog(kind) {
  insertKind = kind;
  const d = document.querySelector("#insert-dialog");
  document.querySelector("#insert-title").textContent =
    kind === "table" ? "插入表格" : "插入链接";
  document.querySelector("#insert-a").value =
    kind === "table" ? "2" : "https://";
  document.querySelector("#insert-b").value =
    kind === "table"
      ? "3"
      : view.state.sliceDoc(
          view.state.selection.main.from,
          view.state.selection.main.to,
        );
  document.querySelector("#label-a").textContent =
    kind === "table" ? "列数（1–10）" : "链接地址";
  document.querySelector("#label-b").textContent =
    kind === "table" ? "行数（1–50）" : "显示文字";
  d.showModal();
  return true;
}
function command(name) {
  if (view.composing) return false;
  switch (name) {
    case "undo":
      if (nativeHistory) {
        post({ type: "undo" });
        return true;
      }
      return undo(view);
    case "redo":
      if (nativeHistory) {
        post({ type: "redo" });
        return true;
      }
      return redo(view);
    case "bold":
      return wrap("\\textbf{", "}");
    case "italic":
      return wrap("\\textit{", "}");
    case "underline":
      return wrap("\\underline{", "}");
    case "section":
      return wrap("\\section{", "}");
    case "subsection":
      return wrap("\\subsection{", "}");
    case "subsubsection":
      return wrap("\\subsubsection{", "}");
    case "list":
      return list(false);
    case "ordered":
      return list(true);
    case "math":
      return wrap("$", "$");
    case "displayMath":
      return wrap("\\[\n", "\n\\]");
    case "cite":
      wrap("\\cite{", "}");
      return startCompletion(view);
    case "pasteCitation": {
      if (view.composing) { notice("请先完成输入法输入"); return false; }
      changeReport();
      const selection = view.state.selection.main;
      post({ type: "pasteCitation", path, text: view.state.doc.toString(), from: selection.from, to: selection.to, scroll: view.scrollDOM.scrollTop });
      return true;
    }
    case "ref":
      wrap("\\ref{", "}");
      return startCompletion(view);
    case "image":
      post({ type: "insertImage" });
      return true;
    case "table":
      return insertionDialog("table");
    case "link":
      return insertionDialog("link");
    case "find":
      return openSearchPanel(view);
    case "replace":
      return replacePanel();
    case "findNext":
      return findNext(view);
    case "findPrevious":
      return findPrevious(view);
    case "replaceNext":
      return replaceNext(view);
    case "replaceAll":
      return replaceAll(view);
    case "files":
      return showPicker("files");
    case "symbols":
      return showPicker("symbols");
    case "definition":
      return definition();
    case "goto":
      return showPicker("goto");
    case "palette":
      return showPicker("palette");
    case "back":
      return historyNavigate(true);
    case "forward":
      return historyNavigate(false);
    case "forwardSync":
      post({
        type: "forwardSync",
        line: view.state.doc.lineAt(view.state.selection.main.head).number,
      });
      return true;
    case "projectSearch":
    case "projectReplace":
      post({ type: "projectSearch" });
      return true;
    case "save":
      changeReport();
      post({ type: "save" });
      return true;
    case "compile":
      changeReport();
      post({ type: "compile" });
      return true;
    case "fontUp":
      return font(1);
    case "fontDown":
      return font(-1);
    case "fontReset":
      return font(0);
    case "completion":
      return startCompletion(view);
    case "comment":
      return toggleLineComment(view);
    default:
      return false;
  }
}
const fallback = [
  ["Mod-z", "undo"],
  ["Mod-Shift-z", "redo"],
  ["Mod-b", "bold"],
  ["Mod-i", "italic"],
  ["Mod-u", "underline"],
  ["Mod-f", "find"],
  ["Mod-Alt-f", "replace"],
  ["Mod-p", "files"],
  ["Ctrl-g", "goto"],
  ["Mod-Shift-p", "palette"],
  ["Mod-g", "findNext"],
  ["Mod-Shift-g", "findPrevious"],
  ["Mod-Alt-Enter", "replaceNext"],
  ["Mod-Shift-Alt-Enter", "replaceAll"],
  ["Mod-=", "fontUp"],
  ["Mod--", "fontDown"],
  ["Mod-0", "fontReset"],
].map(([key, id]) => ({ key, id, title: id }));
function mappedKeys(rows) {
  return rows
    .filter((r) => r.key)
    .flatMap((r) => {
      const a = [
        {
          key:
            hostPlatform === "darwin"
              ? r.key
              : r.key.replaceAll("Mod-", "Ctrl-"),
          run: () => command(r.id),
          preventDefault: true,
        },
      ];
      if (r.id === "fontUp" && r.key === "Mod-=")
        a.push({
          key: "Mod-Shift-=",
          run: () => command(r.id),
          preventDefault: true,
        });
      return a;
    });
}
const extensions = [
  EditorState.allowMultipleSelections.of(true),
  Prec.highest(
    keymap.of([
      {
        key: "Tab",
        run: (v) => {
          if (!hasNextSnippetField(v.state)) return acceptCompletion(v);
          closeCompletion(v);
          return nextSnippetField(v);
        },
      },
    ]),
  ),
  EditorState.phrases.of({
    Find: "查找",
    Replace: "替换",
    next: "下一处",
    previous: "上一处",
    all: "全选匹配",
    "match case": "区分大小写",
    regexp: "正则",
    "by word": "整词",
    replace: "替换当前",
    "replace all": "全部替换",
    close: "关闭",
    "Go to line": "跳转到行",
    go: "跳转",
  }),
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  drawSelection(),
  history(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  StreamLanguage.define(stex),
  syntaxHighlighting(defaultHighlightStyle),
  search({ top: true }),
  autocompletion({
    override: [completions],
    activateOnTyping: true,
    interactionDelay: 0,
  }),
  style.of(theme()),
  EditorView.lineWrapping,
  Prec.highest(bindings.of(keymap.of(mappedKeys(fallback)))),
  keymap.of([
    ...closeBracketsKeymap,
    { key: "Tab", run: acceptCompletion },
    ...completionKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...defaultKeymap,
    indentWithTab,
  ]),
  EditorView.updateListener.of((update) => {
    if (update.docChanged && !restoring)
      changeReport(
        update.transactions
          .map((t) => t.annotation(Transaction.userEvent))
          .find(Boolean) || "input",
      );
    if (update.selectionSet) {
      const line = update.state.doc.lineAt(update.state.selection.main.head);
      document.querySelector("#position").textContent =
        `行 ${line.number}，列 ${update.state.selection.main.head - line.from + 1}`;
      reportPosition();
    }
  }),
];

const view = new EditorView({
  state: EditorState.create({ doc: "", extensions }),
  parent: document.querySelector("#editor"),
});
commandRecords = fallback;
view.scrollDOM.addEventListener("scroll", () => {
  clearTimeout(window.positionTimer);
  window.positionTimer = setTimeout(reportPosition, 100);
});
view.contentDOM.addEventListener("compositionend", () =>
  setTimeout(() => {
    changeReport();
    if (flushToken) {
      post({ type: "flush", token: flushToken });
      flushToken = null;
    }
  }, 0),
);
function configureBindings() {
  view.dispatch({
    effects: bindings.reconfigure(keymap.of(mappedKeys(commandRecords))),
  });
  updateButtonHelp();
}
window.folio = {
  receive(message) {
    switch (message.type) {
      case "open": {
        reportPosition();
        if (path) documents.set(path, view.state);
        path = message.path;
        const existing = documents.get(path);
        restoring = true;
        view.setState(
          existing || EditorState.create({ doc: message.text, extensions }),
        );
        view.dispatch({ effects: style.reconfigure(theme()) });
        configureBindings();
        if (message.line) {
          const line = view.state.doc.line(
            Math.max(1, Math.min(message.line, view.state.doc.lines)),
          );
          view.dispatch({
            selection: { anchor: line.from },
            scrollIntoView: true,
          });
        } else if (!existing && message.position) {
          const p = message.position,
            len = view.state.doc.length;
          view.dispatch({
            selection: EditorSelection.single(
              Math.min(len, p.anchor || 0),
              Math.min(len, p.head || 0),
            ),
          });
          view.scrollDOM.scrollTop = p.scroll || 0;
        }
        if (Number.isInteger(message.anchor)) {
          const len = view.state.doc.length;
          view.dispatch({
            selection: EditorSelection.single(
              Math.min(len, message.anchor),
              Math.min(len, message.head ?? message.anchor),
            ),
          });
          view.scrollDOM.scrollTop = message.scroll || 0;
        }
        document.querySelector("#file-path").textContent = path;
        restoring = false;
        view.focus();
        reportPosition();
        break;
      }
      case "replaceDocument": {
        const state =
          message.path === path ? view.state : documents.get(message.path);
        if (state) {
          const next = state.update({
            changes: { from: 0, to: state.doc.length, insert: message.text },
            annotations: Transaction.addToHistory.of(false),
          }).state;
          documents.set(message.path, next);
          if (message.path === path) {
            restoring = true;
            view.setState(next);
            restoring = false;
          }
        }
        break;
      }
      case "rename":
        if (documents.has(message.path)) {
          documents.set(message.newPath, documents.get(message.path));
          documents.delete(message.path);
        }
        if (path === message.path) {
          path = message.newPath;
          document.querySelector("#file-path").textContent = path;
        }
        navigation = navigation.map((p) =>
          p.path === message.path ? { ...p, path: message.newPath } : p,
        );
        break;
      case "forget":
        documents.delete(message.path);
        break;
      case "reset":
        documents.clear();
        navigation = [];
        forwardNavigation = [];
        path = "";
        restoring = true;
        view.setState(EditorState.create({ doc: "", extensions }));
        restoring = false;
        document.querySelector("#file-path").textContent = "选择一个文件";
        break;
      case "empty":
        path = "";
        restoring = true;
        view.setState(EditorState.create({ doc: "", extensions }));
        restoring = false;
        break;
      case "restorePosition": {
        const len = view.state.doc.length;
        view.dispatch({
          selection: EditorSelection.single(
            Math.min(len, message.anchor),
            Math.min(len, message.head ?? message.anchor),
          ),
        });
        view.scrollDOM.scrollTop = message.scroll || 0;
        if (message.focus) view.focus();
        break;
      }
      case "insert":
        replaceRange(message.text);
        break;
      case "index": {
        const signature = JSON.stringify([message.symbols || [], message.files || []]);
        const changed = signature !== indexSignature;
        indexSignature = signature;
        symbols = message.symbols || [];
        files = message.files || [];
        if (changed && view.hasFocus && argumentContext(view.state))
          setTimeout(() => { if (view.hasFocus && argumentContext(view.state)) startCompletion(view); }, 0);
        break;
      }
      case "options": {
        const signature = JSON.stringify(message);
        if (signature === optionsSignature) break;
        optionsSignature = signature;
        if (message.platform) hostPlatform = message.platform;
        size = Math.max(8, Math.min(30, Number(message.size) || 13));
        uiSize = Math.max(8, Math.min(30, Number(message.uiSize) || 13));
        document.documentElement.style.setProperty("--ui-size", uiSize + "px");
        dark = !!message.dark;
        if (typeof message.toolbarVisible === "boolean")
          document.querySelector("#toolbar").hidden = !message.toolbarVisible;
        nativeHistory = !!message.globalHistory;
        document.documentElement.dataset.dark = String(dark);
        if (message.bindings) commandRecords = message.bindings;
        view.dispatch({ effects: style.reconfigure(theme()) });
        configureBindings();
        break;
      }
      case "command":
        command(message.name);
        break;
      case "flush":
        if (view.composing) {
          flushToken = message.token;
        } else {
          changeReport();
          reportPosition();
          post({ type: "flush", token: message.token });
        }
        break;
    }
  },
  snapshot: () => ({
    path,
    text: view.state.doc.toString(),
    size,
    dark,
    position: position(),
  }),
  command,
  view,
};
for (const b of document.querySelectorAll("[data-command]")) {
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.onclick = () => command(b.dataset.command);
}
document.querySelector("#picker-query").oninput = renderPicker;
document.querySelector("#picker-query").onkeydown = (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (document.querySelector("#picker").dataset.kind === "goto") {
      const m = /^(\d+)(?::(\d+))?$/.exec(e.target.value);
      if (!m || +m[1] < 1 || +m[1] > view.state.doc.lines) {
        document.querySelector("#picker-results").textContent =
          "行号或列号无效";
        return;
      }
      const line = view.state.doc.line(+m[1]),
        col = +(m[2] || 1);
      if (col < 1 || col > line.length + 1) {
        document.querySelector("#picker-results").textContent = "列号超出范围";
        return;
      }
      navigation.push(currentLocation());
      forwardNavigation = [];
      view.dispatch({
        selection: { anchor: line.from + col - 1 },
        scrollIntoView: true,
      });
      document.querySelector("#picker").close();
      view.focus();
    } else document.querySelector("#picker-results button")?.click();
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    document.querySelector("#picker-results button")?.focus();
  }
};
document.querySelector("#picker-close").onclick = () =>
  document.querySelector("#picker").close();
document.body.insertAdjacentHTML(
  "beforeend",
  '<dialog id="insert-dialog"><header><b id="insert-title"></b></header><label id="label-a"></label><input id="insert-a"><label id="label-b"></label><input id="insert-b"><p id="insert-error"></p><button id="insert-cancel">取消</button><button id="insert-confirm">插入</button></dialog>',
);
document.querySelector("#insert-cancel").onclick = () =>
  document.querySelector("#insert-dialog").close();
document.querySelector("#insert-confirm").onclick = () => {
  const a = document.querySelector("#insert-a").value,
    b = document.querySelector("#insert-b").value;
  if (insertKind === "table") {
    const columns = +a,
      rows = +b;
    if (
      !Number.isInteger(columns) ||
      !Number.isInteger(rows) ||
      columns < 1 ||
      columns > 10 ||
      rows < 1 ||
      rows > 50
    ) {
      document.querySelector("#insert-error").textContent =
        "列数1–10，行数1–50";
      return;
    }
    const body = Array.from(
      { length: rows },
      (_, r) =>
        Array.from({ length: columns }, (_, c) =>
          r === 0 ? "Column " + (c + 1) : "",
        ).join(" & ") + " \\\\",
    ).join("\n");
    replaceRange(
      "\\begin{tabular}{" +
        "l".repeat(columns) +
        "}\n" +
        body +
        "\n\\end{tabular}",
    );
  } else {
    if (/[{}\n]/.test(a)) {
      document.querySelector("#insert-error").textContent =
        "地址不能含花括号或换行";
      return;
    }
    replaceRange(
      "\\href{" + a.replace(/%/g, "\\%").replace(/#/g, "\\#") + "}{" + b + "}",
    );
    notice("链接需要 hyperref 宏包。");
  }
  document.querySelector("#insert-dialog").close();
};
new MutationObserver((records) => {
  for (const record of records)
    for (const node of record.addedNodes)
      if (
        node.nodeType === 1 &&
        (node.matches("button,.cm-search") ||
          node.querySelector("button,.cm-search"))
      )
        updateButtonHelp(node);
}).observe(document.body, { childList: true, subtree: true });
updateButtonHelp();
post({ type: "ready" });

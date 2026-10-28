import { icon, escapeHTML as esc } from "./icons.js";
import { PDFPreview } from "./pdf.js";
import { installTooltips } from "./tooltips.js";
import { aliasError, projectAlias } from "./project-names.js";
installTooltips();
const $ = (selector) => document.querySelector(selector);
const state = {
  projects: [],
  settings: {},
  ws: null,
  dark: false,
  version: "",
  arch: "arm64",
  platform: "win32",
  tools: null,
  librarySort: "opened",
  archived: false,
  libraryFilter: "all",
  libraryGrid: true,
  view: "library",
  mode: "files",
  fileExpansion: new Map(),
  outlineExpansion: new Map(),
  treeScroll: { files: 0, outline: 0 },
  treeSelection: "",
  format: false,
  ready: false,
  pendingEditor: [],
  lastArea: "editor",
  settingsTab: "appearance",
  log: "",
  editorQueue: Promise.resolve(),
  replacePlan: [],
};
const request = async (action, payload = {}) => {
  const result = await window.folioHost.request(action, payload);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
const attempt = (fn) =>
  Promise.resolve()
    .then(fn)
    .catch((error) => notify(error.message, true));
function notify(message, error = false) {
  $("#toast").textContent = message;
  $("#toast").classList.toggle("error", error);
  $("#toast").hidden = false;
  $("#status-message").textContent = message;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, 4500);
  if (error && state.ws && /编译/.test(message)) showLog(true);
}
function button(name, label, classes = "icon-button") {
  const el = document.createElement("button");
  el.className = classes;
  el.innerHTML = icon(name);
  el.title = label;
  el.setAttribute("aria-label", label);
  return el;
}
function setIcon(selector, name, label) {
  $(selector).innerHTML =
    icon(name) + (label ? `<span>${esc(label)}</span>` : "");
}
function sendEditor(message) {
  if (state.ready) $("#editor").contentWindow.folio.receive(message);
  else state.pendingEditor.push(message);
}
function options() {
  const prefs = state.settings;
  return {
    type: "options",
    platform: "win32",
    size: prefs.codeSize || 13,
    uiSize: prefs.uiSize || 13,
    dark: state.dark,
    toolbarVisible: state.format,
    globalHistory: true,
    bindings: prefs.bindings || [],
  };
}
function applyAppearance() {
  document.documentElement.dataset.theme = state.dark ? "dark" : "light";
  document.documentElement.style.setProperty(
    "--ui-size",
    (state.settings.uiSize || 13) + "px",
  );
  sendEditor(options());
}
function updateLibrary(data) {
  if (data.projects) state.projects = data.projects;
  if (data.settings) state.settings = data.settings;
  if (data.version) state.version = data.version;
  if (data.arch) state.arch = data.arch;
  if (data.platform) state.platform = data.platform;
  if (data.dark !== undefined) state.dark = data.dark;
  if (data.toolchain) state.tools = data.toolchain;
  applyAppearance();
  renderLibrary();
}
function projectMenu(project, event) {
  showMenu(event, [
    [
      "pin",
      project.pinned ? "取消置顶" : "置顶项目",
      () => request("projectAction", { id: project.id, action: "pin" }),
    ],
    [
      "file",
      "设置项目别名…",
      () => editProjectAlias(project),
    ],
    [
      "folder",
      "在资源管理器中显示",
      () => request("projectAction", { id: project.id, action: "reveal" }),
    ],
    [
      "refresh",
      "重新关联文件夹",
      () => request("projectAction", { id: project.id, action: "relink" }),
    ],
    null,
    [
      "archive",
      project.archived ? "恢复到项目库" : "归档项目",
      () => request("projectAction", { id: project.id, action: "archive" }),
    ],
    [
      "trash",
      "从项目库移除",
      () => request("projectAction", { id: project.id, action: "remove" }),
    ],
  ]);
}
function renderLibrary() {
  const query = $("#library-query").value.toLowerCase(),
    projects = state.projects
      .filter(
        (p) =>
          !!p.archived === state.archived &&
          (state.libraryFilter !== "pinned" || p.pinned) &&
          `${p.name} ${p.path}`.toLowerCase().includes(query),
      )
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          (state.libraryFilter !== "recent" && state.librarySort === "name"
            ? a.name.localeCompare(b.name, "zh-CN", { numeric: true })
            : (b[
                state.libraryFilter === "recent" ? "opened" : state.librarySort
              ] || 0) -
              (a[
                state.libraryFilter === "recent" ? "opened" : state.librarySort
              ] || 0)),
      );
  $("#project-count").textContent = projects.length;
  $("#projects-heading").firstChild.textContent = state.archived
    ? "已归档项目 "
    : "我的项目 ";
  $("#show-archived").classList.toggle("active", state.archived);
  $("#library-version").textContent =
    `v${state.version} · Windows ${state.arch === "arm64" ? "ARM64" : "x64"}`;
  const titles = {
    all: "全部项目",
    recent: "最近打开",
    pinned: "已置顶",
    archived: "已归档",
  };
  $("#library-title").textContent = titles[state.libraryFilter] + ".";
  for (const button of document.querySelectorAll("#library-nav button"))
    button.classList.toggle(
      "active",
      button.dataset.filter === state.libraryFilter,
    );
  $("#library-sort").disabled = state.libraryFilter === "recent";
  const grid = $("#project-grid");
  grid.classList.toggle("list-view", !state.libraryGrid);
  grid.replaceChildren();
  for (const project of projects) {
    const card = document.createElement("article");
    card.className = "project-card";
    card.tabIndex = 0;
    card.title = "双击打开项目：" + project.name;
    card.innerHTML = `<div class="project-cover ${project.cover ? "" : "fallback"}"></div><div class="project-info"><h3 title="${esc(project.name)}">${esc(project.name)}</h3><div class="project-path" title="${esc(project.path)}">${esc(project.path)}</div><div class="project-date">${esc(formatDate(project.edited))}</div><span class="project-badge">本地项目</span></div>`;
    if (project.cover?.startsWith("data:image/png;base64,")) {
      const image = document.createElement("img");
      image.src = project.cover;
      image.alt = project.name + " PDF 封面";
      card.querySelector(".project-cover").append(image);
    }
    const pin = button(
      "pin",
      project.pinned ? "取消置顶" : "置顶项目",
      "icon-button pin-button" + (project.pinned ? " pinned" : ""),
    );
    pin.onclick = (event) => {
      event.stopPropagation();
      attempt(() =>
        request("projectAction", { id: project.id, action: "pin" }),
      );
    };
    const more = button("more", "项目操作", "icon-button project-more");
    more.onclick = (event) => {
      event.stopPropagation();
      projectMenu(project, event);
    };
    card.append(pin, more);
    card.ondblclick = (event) => {
      if (!event.target.closest("button"))
        attempt(() => request("openProject", { id: project.id }));
    };
    card.onkeydown = (event) => {
      if (event.key === "Enter" && event.target === card)
        attempt(() => request("openProject", { id: project.id }));
    };
    card.oncontextmenu = (event) => projectMenu(project, event);
    grid.append(card);
  }
  if (!projects.length)
    grid.innerHTML = `<div class="empty-library">${icon("folder", 36)}<h3>${state.archived ? "这里还没有归档项目" : query ? "没有找到匹配的项目" : "第一份文稿，从这里开始"}</h3><p>${query ? "试试其他名称或路径" : "新建项目，或打开已有的 LaTeX 文件夹。"}</p></div>`;
  const recent = state.projects
      .filter((p) => !p.archived)
      .sort((a, b) => b.opened - a.opened)[0],
    slot = $("#continue-card");
  slot.replaceChildren();
  if (recent && state.libraryFilter === "all" && !query) {
    const row = document.createElement("div");
    row.className = "continue-card";
    row.innerHTML = `<div class="continue-mark">${icon("clock", 24)}</div><div class="continue-info"><small>继续上次的写作</small><h3 title="${esc(recent.name)}">${esc(recent.name)}</h3></div>`;
    const open = button("chevron", "继续写作", "continue-link");
    open.innerHTML = "继续写作 " + icon("chevron", 16);
    open.onclick = () =>
      attempt(() => request("openProject", { id: recent.id }));
    if (recent.cover?.startsWith("data:image/png;base64,")) {
      const image = document.createElement("img");
      image.src = recent.cover;
      image.alt = "上次成功 PDF";
      row.querySelector(".continue-mark").replaceChildren(image);
    }
    row.append(open);
    slot.append(row);
  }
}
function formatDate(time) {
  if (!time) return "尚未编辑";
  const delta = Date.now() - time;
  if (delta < 60000) return "刚刚编辑";
  if (delta < 86400000) return "今天编辑";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(time));
}
function updateWorkspace(ws) {
  const previous = state.ws;
  state.ws = ws;
  const projectChanged = previous?.project.id !== ws.project.id;
  if (projectChanged) restoreNavigation(ws);
  else if (previous?.revision !== ws.revision) state.refreshSearch?.();
  $("#library").hidden = state.view !== "library";
  $("#workspace").hidden = state.view !== "workspace";
  $("#window-title").textContent =
    state.view === "workspace" ? ws.project.name : "项目库";
  $("#status-engine").textContent = ws.config.engine;
  $("#compile").classList.toggle("running", ws.running);
  $("#stop-build").hidden = true;
  setIcon(
    "#compile",
    ws.running ? "stop" : "play",
    ws.running ? "停止" : "编译 Ctrl+R",
  );
  $("#toolbar-engine").textContent = ws.config.engine + " ▾";
  $("#toolbar-project-name").textContent = ws.project.name;
  $("#toolbar-project-status").textContent = ws.running
    ? "正在本地编译…"
    : ws.dirty.length
      ? `${ws.dirty.length} 个文件尚未保存`
      : "所有更改已保存";
  $("#compile").title = ws.running
    ? "正在编译；点击排队下一次构建"
    : "编译主文件（Ctrl+R）";
  $("#pdf-stale").hidden = !ws.pdfStale || !ws.hasPDF;
  $("#pdf-title").textContent = ws.config.root
    ? basename(ws.config.root).replace(/\.tex$/i, ".pdf")
    : "PDF 预览";
  $("#editor-empty").hidden = !!ws.selected;
  $("#project-root").innerHTML =
    icon("folder", 16) + `<span>${esc(ws.project.name)}</span>`;
  $("#project-root").classList.toggle("selected", state.treeSelection === "");
  $("#project-config").innerHTML =
    icon("settings", 15) +
    `<span class="config-main">${esc(ws.config.root || "选择主文件")}</span><span>${esc(ws.config.engine)}</span>`;
  if (!projectChanged && previous?.selected !== ws.selected)
    state.treeSelection = ws.selected || "";
  if (
    projectChanged ||
    JSON.stringify(previous.files) !== JSON.stringify(ws.files) ||
    previous.selected !== ws.selected
  )
    renderFiles();
  if (
    projectChanged ||
    JSON.stringify(previous.files) !== JSON.stringify(ws.files) ||
    JSON.stringify(previous.symbols) !== JSON.stringify(ws.symbols)
  )
    renderOutline();
  renderTabs();
  $("#workspace").classList.toggle("no-sidebar", ws.session.sidebar === false);
  $("#workspace").classList.toggle("no-preview", ws.session.preview === false);
  preview.stale = ws.pdfStale;
  sendEditor({
    type: "index",
    symbols: ws.symbols,
    files: ws.files.filter((f) => !f.directory).map((f) => f.path),
  });
  if (!state.toastTimer || $("#toast").hidden)
    $("#status-message").textContent = ws.running
      ? "正在本地编译…"
      : ws.conflicts.length
        ? "存在外部修改冲突"
        : ws.dirty.length
          ? `${ws.dirty.length} 个文件尚未保存`
          : "所有更改已保存";
}
function renderTabs() {
  const target = $("#tabs");
  target.replaceChildren();
  for (const file of state.ws?.tabs || []) {
    const tab = document.createElement("div");
    tab.className = "tab" + (state.ws.selected === file ? " active" : "");
    tab.title = file;
    tab.tabIndex = 0;
    tab.innerHTML =
      icon("file", 14) +
      `<span class="tab-name">${esc(basename(file))}</span>` +
      (state.ws.dirty.includes(file)
        ? '<span class="dirty-dot" title="未保存"></span>'
        : "");
    const close = button("close", "关闭 " + basename(file), "tab-close");
    close.onclick = (event) => {
      event.stopPropagation();
      attempt(() => request("closeTab", { path: file }));
    };
    tab.append(close);
    tab.onclick = () => attempt(() => request("openFile", { path: file }));
    tab.onkeydown = (event) => {
      if (event.key === "Enter")
        attempt(() => request("openFile", { path: file }));
    };
    tab.oncontextmenu = (event) =>
      showMenu(event, [
        [
          "refresh",
          "重新载入磁盘内容",
          () => request("reloadFile", { path: file }),
        ],
        ["save", "另存修改内容", () => request("saveCopy", { path: file })],
        [
          "folder",
          "在资源管理器中显示",
          () => request("revealFile", { path: file }),
        ],
      ]);
    target.append(tab);
  }
}
function basename(file) {
  return file.split("/").at(-1) || file;
}
function dirname(file) {
  const at = file.lastIndexOf("/");
  return at < 0 ? "" : file.slice(0, at);
}
function parentForSelection() {
  const entry = state.ws?.files.find((row) => row.path === state.treeSelection);
  return entry?.directory ? entry.path : entry ? dirname(entry.path) : "";
}
function fileMenu(file, event) {
  if (!state.ws) return;
  state.treeSelection = file;
  renderFiles();
  const entry = state.ws.files.find((row) => row.path === file),
    parent = entry?.directory ? file : entry ? dirname(file) : "";
  const items = [
    ["folder", "新建文件夹", () => newItem("folder", parent)],
    ["file", "新建文件", () => newItem("file", parent)],
    ["code", "新建 TeX 文件", () => newItem("tex", parent)],
    ["file", "新建 Bib 文件", () => newItem("bib", parent)],
  ];
  if (file)
    items.push(
      null,
      [
        "file",
        "重命名",
        async () => {
          const name = await promptText(
            "重命名",
            "文件或文件夹名称",
            basename(file),
          );
          if (name)
            await request("moveItem", {
              path: file,
              parent: dirname(file),
              name,
            });
        },
      ],
      [
        "folder",
        "在资源管理器中显示",
        () => request("revealFile", { path: file }),
      ],
      ["trash", "移到回收站", () => request("trashItem", { path: file })],
    );
  showMenu(event, items);
}
function treeExpanded(kind, key, depth) {
  const expansion = kind === "files" ? state.fileExpansion : state.outlineExpansion;
  return expansion.get(key) ?? (kind === "outline" && depth === 0);
}
function restoreNavigation(ws) {
  clearTimeout(state.navigationTimer);
  const saved = ws.session.navigation || {};
  const expansion = (value) => new Map(
    Object.entries(value && typeof value === "object" ? value : {})
      .filter(([, expanded]) => typeof expanded === "boolean"),
  );
  state.fileExpansion = expansion(saved.files);
  state.outlineExpansion = expansion(saved.outline);
  state.treeSelection = typeof saved.selection === "string" ? saved.selection : ws.selected || "";
  for (const mode of ["files", "outline"])
    state.treeScroll[mode] = Number.isFinite(saved.scroll?.[mode]) ? Math.max(0, saved.scroll[mode]) : 0;
  state.mode = saved.mode === "outline" ? "outline" : "files";
  showNavigationMode();
}
function persistNavigation() {
  if (!state.ws) return;
  const navigation = {
    mode: state.mode,
    files: Object.fromEntries(state.fileExpansion),
    outline: Object.fromEntries(state.outlineExpansion),
    selection: state.treeSelection,
    scroll: { ...state.treeScroll },
  };
  state.ws.session.navigation = navigation;
  const projectId = state.ws.project.id;
  attempt(() => request("session", { projectId, navigation }));
}
function showNavigationMode() {
  for (const mode of ["files", "outline"]) {
    $("#" + (mode === "files" ? "file" : "outline") + "-tree").hidden = state.mode !== mode;
    $("#" + mode + "-mode").classList.toggle("active", state.mode === mode);
  }
  const tree = $(state.mode === "files" ? "#file-tree" : "#outline-tree");
  tree.scrollTop = state.treeScroll[state.mode];
}
function renderFiles() {
  const tree = $("#file-tree");
  tree.replaceChildren();
  for (const file of state.ws?.files || []) {
    const pieces = file.path.split("/");
    if (
      pieces
        .slice(0, -1)
        .some((_, i) => !treeExpanded("files", pieces.slice(0, i + 1).join("/"), i))
    )
      continue;
    const row = document.createElement("div");
    row.className =
      "tree-row" + (state.treeSelection === file.path ? " selected" : "");
    row.style.setProperty("--depth", pieces.length - 1);
    row.tabIndex = 0;
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-level", pieces.length);
    row.title = file.path;
    const expanded = treeExpanded("files", file.path, pieces.length - 1);
    if (file.directory) row.setAttribute("aria-expanded", String(expanded));
    row.innerHTML = `<span class="caret ${file.directory && expanded ? "expanded" : ""}">${file.directory ? icon("chevron", 10) : ""}</span><span class="tree-icon">${icon(file.directory ? "folder" : file.path.endsWith(".tex") ? "code" : "file", 15)}</span><span class="tree-name">${esc(file.name)}</span>`;
    const toggle = () => {
      state.fileExpansion.set(file.path, !expanded);
    };
    row.onclick = () => {
      state.treeSelection = file.path;
      if (file.directory) toggle();
      else attempt(() => request("openFile", { path: file.path }));
      renderFiles();
      persistNavigation();
    };
    row.oncontextmenu = (event) => {
      event.stopPropagation();
      fileMenu(file.path, event);
    };
    row.onkeydown = (event) => {
      if (event.key === "Enter") row.click();
      if (event.key === "F2")
        fileMenu(file.path, {
          clientX: row.getBoundingClientRect().left + 30,
          clientY: row.getBoundingClientRect().bottom,
          preventDefault() {},
        });
    };
    row.draggable = true;
    row.ondragstart = (event) => {
      event.dataTransfer.setData(
        "application/x-folio-file",
        JSON.stringify({ project: state.ws.project.id, path: file.path }),
      );
      event.dataTransfer.effectAllowed = "move";
    };
    dropTarget(row, file.directory ? file.path : dirname(file.path));
    tree.append(row);
  }
  $("#project-root").classList.toggle("selected", state.treeSelection === "");
  if (state.mode === "files") tree.scrollTop = state.treeScroll.files;
}
function dropTarget(element, parent) {
  element.ondragover = (event) => {
    if (!event.dataTransfer.types.includes("application/x-folio-file")) return;
    event.preventDefault();
    event.stopPropagation();
    element.classList.add("drop-target");
    event.dataTransfer.dropEffect = "move";
  };
  element.ondragleave = (event) => {
    if (!element.contains(event.relatedTarget))
      element.classList.remove("drop-target");
  };
  element.ondrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    element.classList.remove("drop-target");
    attempt(async () => {
      const data = JSON.parse(
        event.dataTransfer.getData("application/x-folio-file"),
      );
      if (data.project !== state.ws?.project.id)
        throw new Error("只能在当前项目内移动");
      await request("moveItem", { path: data.path, parent });
    });
  };
}
function renderOutline() {
  const tree = $("#outline-tree");
  tree.replaceChildren();
  for (const file of (state.ws?.files || []).filter(
    (f) => !f.directory && /\.tex$/i.test(f.path),
  )) {
    const occurrences = new Map();
    const symbols = state.ws.symbols
      .filter((s) => s.kind === "section" && s.path === file.path)
      .sort((a, b) => a.offset - b.offset)
      .map((symbol) => {
        const identity = JSON.stringify([file.path, symbol.level, symbol.label]);
        const occurrence = occurrences.get(identity) || 0;
        occurrences.set(identity, occurrence + 1);
        return { ...symbol, key: identity + ":" + occurrence };
      });
    const fileKey = "file:" + file.path;
    const expanded = treeExpanded("outline", fileKey, 0);
    const root = document.createElement("div");
    root.className = "tree-row outline-row";
    root.style.setProperty("--depth", 0);
    root.title = "跳转 " + file.path;
    root.setAttribute("role", "treeitem");
    root.setAttribute("aria-level", "1");
    root.setAttribute("aria-expanded", String(expanded));
    root.innerHTML = `<button class="caret ${expanded ? "expanded" : ""}" title="展开或折叠 ${esc(file.path)}">${icon("chevron", 10)}</button><span class="tree-icon">${icon("file", 15)}</span><span class="tree-name">${esc(file.path)}</span>`;
    root.onclick = () =>
      attempt(() => request("openFile", { path: file.path, line: 1 }));
    root.querySelector("button").onclick = (event) => {
      event.stopPropagation();
      state.outlineExpansion.set(fileKey, !expanded);
      renderOutline();
      persistNavigation();
    };
    tree.append(root);
    if (!expanded) continue;
    const stack = [];
    for (const [index, symbol] of symbols.entries()) {
      while (stack.length && stack.at(-1).level >= symbol.level) stack.pop();
      const hidden = stack.some((s) => !treeExpanded("outline", s.key, s.depth));
      const depth = stack.length + 1;
      if (!hidden) {
        const row = document.createElement("div");
        row.className = "tree-row outline-row";
        row.style.setProperty("--depth", depth);
        row.title = `${file.path}:${symbol.line}`;
        row.setAttribute("role", "treeitem");
        row.setAttribute("aria-level", String(depth + 1));
        const children = symbols[index + 1]?.level > symbol.level;
        const expanded = treeExpanded("outline", symbol.key, depth);
        if (children) row.setAttribute("aria-expanded", String(expanded));
        row.innerHTML = `<button class="caret ${expanded ? "expanded" : ""}" title="展开或折叠章节" ${children ? "" : "disabled"}>${children ? icon("chevron", 10) : ""}</button><span class="outline-kind">H${symbol.level}</span><span class="tree-name">${esc(symbol.label)}</span>`;
        row.onclick = () =>
          attempt(() => request("openFile", { path: file.path, line: symbol.line }));
        row.querySelector("button").onclick = (event) => {
          event.stopPropagation();
          state.outlineExpansion.set(symbol.key, !expanded);
          renderOutline();
          persistNavigation();
        };
        tree.append(row);
      }
      stack.push({ ...symbol, depth });
    }
  }
  if (!tree.children.length)
    tree.innerHTML = '<p class="outline-placeholder">项目中的 TeX 章节将在这里显示。</p>';
  if (state.mode === "outline") tree.scrollTop = state.treeScroll.outline;
}

function showMenu(event, items) {
  event.preventDefault?.();
  const menu = $("#context-menu");
  menu.replaceChildren();
  for (const item of items) {
    if (!item) {
      menu.append(document.createElement("hr"));
      continue;
    }
    const [name, label, action] = item;
    const row = button(name, label, "menu-item");
    row.innerHTML = icon(name, 15) + `<span>${esc(label)}</span>`;
    if (name === "trash") row.classList.add("danger");
    row.onclick = () => {
      menu.hidden = true;
      attempt(action);
    };
    menu.append(row);
  }
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  menu.style.left =
    Math.max(5, Math.min(event.clientX, innerWidth - rect.width - 8)) + "px";
  menu.style.top =
    Math.max(48, Math.min(event.clientY, innerHeight - rect.height - 8)) + "px";
}
function promptForm(title, description, fields, confirm = "确认", validate = null) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "prompt-dialog";
    dialog.innerHTML = `<form><header class="dialog-header"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><button type="button" class="icon-button prompt-cancel" title="取消">×</button></header><div class="form-body">${fields}<p class="form-error" role="alert" hidden></p></div><footer class="dialog-footer"><button type="button" class="button secondary prompt-cancel" title="取消操作">取消</button><button class="button primary" type="submit" title="${esc(confirm)}">${esc(confirm)}</button></footer></form>`;
    document.body.append(dialog);
    let result = null;
    dialog.addEventListener(
      "close",
      () => {
        resolve(result);
        dialog.remove();
      },
      { once: true },
    );
    dialog.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      const error = validate?.(values);
      if (error) {
        const message = dialog.querySelector(".form-error");
        message.textContent = error;
        message.hidden = false;
        return;
      }
      result = values;
      dialog.close();
    };
    for (const button of dialog.querySelectorAll(".prompt-cancel"))
      button.onclick = () => dialog.close();
    dialog.showModal();
    const first = dialog.querySelector("input");
    first?.focus();
    first?.select();
  });
}
async function promptText(title, label, value = "") {
  const values = await promptForm(
    title,
    "",
    `<label class="field"><span>${esc(label)}</span><input name="value" value="${esc(value)}" required maxlength="200" aria-label="${esc(label)}"></label>`,
  );
  return values?.value;
}
async function editProjectAlias(project) {
  const folderName = project.path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1);
  let alias = projectAlias(project);
  while (true) {
    const values = await promptForm("设置项目别名", "别名不能与其他项目的显示名称重复；留空恢复文件夹名称。\n" + project.path,
      `<label class="field"><span>项目别名（可选）</span><input name="alias" value="${esc(alias)}" placeholder="${esc(folderName)}" maxlength="120" aria-label="项目别名"></label>`, "保存",
      (values) => aliasError(state.projects, values.alias, project.id));
    if (!values) return;
    alias = values.alias;
    const result = await request("projectAction", { id: project.id, action: "rename", name: alias });
    if (!result?.editAlias) return;
  }
}
async function newProject() {
  const templates = await request("templates");
  let values = { name: "Untitled", alias: "", template: "" };
  while (true) {
    values = await promptForm(
    "新建项目",
    "创建独立的本地文件夹，默认使用英文 article 模板。",
    `<label class="field"><span>文件夹名称</span><input name="name" value="${esc(values.name)}" required maxlength="120" aria-label="文件夹名称"></label><label class="field"><span>项目别名（可选）</span><input name="alias" value="${esc(values.alias)}" placeholder="留空使用文件夹名称" maxlength="120" aria-label="项目别名"></label><label class="field"><span>模板</span><select name="template" title="选择文稿模板"><option value="">基础英文文稿</option>${templates.map((name) => `<option ${name === values.template ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></label>`,
    "选择保存位置",
    (values) => aliasError(state.projects, values.alias),
  );
    if (!values) return;
    const result = await request("createProject", values);
    if (!result?.editProject) return;
  }
}
async function newItem(kind, parent = parentForSelection()) {
  const name = await promptText(
    kind === "folder" ? "新建文件夹" : "新建文件",
    `位置：${parent || "项目根目录"}`,
    kind === "folder"
      ? "New Folder"
      : kind === "tex"
        ? "Untitled.tex"
        : kind === "bib"
          ? "references.bib"
          : "notes.txt",
  );
  if (name) await request("createItem", { kind, parent, name });
}
function showLog(visible) {
  $("#build-panel").hidden = !visible;
  $("#show-log").classList.toggle("active", visible);
}
function openPDFSearch() {
  if (!state.ws?.hasPDF) {
    notify("请先编译生成 PDF");
    return;
  }
  $("#pdf-search").hidden = false;
  $("#pdf-query").focus();
  $("#pdf-query").select();
}
function editorCommand(command) {
  if (!state.ws || state.view !== "workspace") return;
  sendEditor({ type: "command", name: command });
}
async function handleCommand(command) {
  if (command === "newProject") return newProject();
  if (command === "settings") return openSettings();
  if (command === "library") return request("showLibrary");
  if (state.view !== "workspace") return;
  if (command === "newFile") return newItem("file");
  if (command === "logs") return showLog($("#build-panel").hidden);
  if (command === "projectSearch") return openSearch();
  if (command === "find" && state.lastArea === "pdf") return openPDFSearch();
  if (
    ["undo", "redo"].includes(command) &&
    ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    document.execCommand(command);
    return;
  }
  editorCommand(command);
}
async function openConfiguration() {
  if (!state.ws) return;
  const ws = state.ws,
    config = ws.config,
    dialog = $("#config-dialog");
  dialog.innerHTML = `<form><header class="dialog-header"><div><h2>项目配置</h2><p>编译路径均限制在当前项目文件夹内。</p></div><button type="button" class="icon-button dialog-close" title="关闭配置">×</button></header><div class="form-body"><label class="field"><span>主文件</span><select name="root" required title="选择编译主文件"><option value="">请选择主 TeX 文件</option>${ws.files
    .filter((f) => !f.directory && /\.tex$/i.test(f.path))
    .map(
      (f) =>
        `<option value="${esc(f.path)}" ${f.path === config.root ? "selected" : ""}>${esc(f.path)}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="field"><span>编译引擎</span><select name="engine" title="选择 LaTeX 编译引擎">${["pdfLaTeX", "XeLaTeX", "LuaLaTeX"].map((engine) => `<option ${engine === config.engine ? "selected" : ""}>${engine}</option>`).join("")}</select></label><label class="field"><span>插入文献的默认文件</span><select name="bibliographyFile" title="指定默认 .bib 文件，或在存在多个 .bib 时每次询问"><option value="">每次询问（存在多个 .bib 时）</option>${ws.files.filter((file) => !file.directory && /\.bib$/i.test(file.path)).map((file) => `<option value="${esc(file.path)}" ${file.path === config.bibliographyFile ? "selected" : ""}>${esc(file.path)}</option>`).join("")}</select></label><label class="form-check"><input type="checkbox" name="autoCompile" ${config.autoCompile ? "checked" : ""} ${state.settings.autoSaveEnabled ? "" : "disabled"} title="自动保存成功后编译此项目">此项目自动保存后编译</label>${state.settings.autoSaveEnabled ? "" : '<p class="section-note">不可用：需先在设置中开启自动保存。</p>'}<details><summary title="展开编译路径与高级选项">高级选项</summary><label class="field"><span>工作目录（留空使用主文件所在目录）</span><input name="workingDirectory" value="${esc(config.workingDirectory)}" placeholder="例如：." aria-label="工作目录"></label><label class="field"><span>输出目录（相对于工作目录）</span><input name="outputDirectory" value="${esc(config.outputDirectory)}" required aria-label="输出目录"></label><label class="field"><span>latexmk rc 文件（项目相对路径，可留空）</span><input name="rcFile" value="${esc(config.rcFile)}" aria-label="latexmk 配置文件"></label><label class="form-check"><input type="checkbox" name="shellEscape" ${config.shellEscape ? "checked" : ""} title="允许 TeX 运行文稿中的外部命令，仅用于你信任的文稿">允许 shell escape</label></details><p class="form-error"></p></div><footer class="dialog-footer"><button type="button" class="button secondary dialog-close" title="取消配置更改">取消</button><button type="submit" class="button primary" title="保存项目编译配置">保存配置</button></footer></form>`;
  for (const button of dialog.querySelectorAll(".dialog-close"))
    button.onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    attempt(async () => {
      const values = Object.fromEntries(new FormData(event.target));
      values.autoCompile = state.settings.autoSaveEnabled
        ? values.autoCompile === "on"
        : config.autoCompile;
      values.shellEscape = values.shellEscape === "on";
      try {
        await request("configure", values);
        dialog.close();
      } catch (error) {
        dialog.querySelector(".form-error").textContent = error.message;
      }
    });
  };
  dialog.showModal();
}
async function openBibliographyDuplicates() {
  if (!state.ws) return;
  const projectId=state.ws.project.id;
  const report=await request("bibliographyDuplicates");
  if (projectId!==state.ws?.project.id) return;
  if (!report.groups.length) { notify(`已检查 ${report.entryCount} 条文献，未发现题目和作者相同的重复条目`); return; }
  const dialog=document.createElement("dialog");dialog.className="prompt-dialog bibliography-dedup-dialog";
  dialog.innerHTML=`<header class="dialog-header"><div><h2>智能文献去重</h2><p>按题目和作者检查。选择保留条目，合并缺失字段并更新正文引用；一次撤销可还原全部修改。</p></div><button class="icon-button dedup-cancel" title="取消去重">×</button></header><div class="form-body">${report.groups.map((group,index)=>`<article class="citation-preview-card dedup-group" data-index="${index}"><label class="dedup-title"><input type="checkbox" data-selected ${group.blocked?'disabled':group.warnings.length?'':'checked'} title="合并这一组重复文献"><strong>${esc(group.title)}</strong></label><p class="section-note">${esc(group.author)}</p><div class="dedup-entry-list">${group.entries.map(entry=>`<div><code>${esc(entry.key)}</code><span>${esc(entry.path)}:${entry.line}</span></div>`).join('')}</div>${group.warnings.map(w=>`<p class="dedup-warning">${esc(w)}</p>`).join('')}${group.blocked?`<p class="form-error">${esc(group.blocked)}</p>`:''}<label class="field"><span>保留条目</span><select data-keep title="选择保留的引用键与 Bib 文件">${group.entries.map(entry=>`<option value="${esc(entry.id)}" ${entry.id===group.keep?'selected':''}>${esc(entry.key)} — ${esc(entry.path)}:${entry.line}（${entry.fieldCount} 个字段）</option>`).join('')}</select></label>${new Set(group.entries.map(e=>e.path)).size>1?'<p class="section-note">请确认正文已加载所选条目所在的 Bib 文件。</p>':''}<details ${group.references.length<=8?'open':''}><summary title="查看重复条目在正文的引用位置">引用位置（${group.references.length} 处）</summary><div class="dedup-references">${group.references.map((ref,refIndex)=>`<button type="button" class="dedup-reference" data-reference="${refIndex}" title="跳转到这处引用">${esc(ref.path)}:${ref.line}  \\${esc(ref.command)}{${esc(ref.keys.join(','))}}</button>`).join('')}</div></details><details><summary title="查看这些条目的完整 BibTeX">查看原始条目</summary>${group.entries.map(entry=>`<pre class="dedup-source">${esc(entry.raw)}</pre>`).join('')}</details></article>`).join('')}<p class="form-error dedup-error" role="alert" hidden></p></div><footer class="dialog-footer"><button class="button secondary dedup-cancel" title="取消，不修改任何文件">取消</button><button class="button primary dedup-apply" title="去重所选文献并自动修改引用">确认去重</button></footer>`;
  document.body.append(dialog);
  for (const button of dialog.querySelectorAll('.dedup-cancel')) button.onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  const apply=dialog.querySelector('.dedup-apply');
  const selected=()=>[...dialog.querySelectorAll('.dedup-group')].filter(row=>row.querySelector('[data-selected]').checked).map(row=>({id:report.groups[Number(row.dataset.index)].id,keep:row.querySelector('[data-keep]').value}));
  const update=()=>{const count=selected().length;apply.disabled=!count;apply.textContent=`确认去重（${count} 组）`;};
  dialog.onchange=update;update();
  for (const row of dialog.querySelectorAll('.dedup-group')) for (const button of row.querySelectorAll('[data-reference]')) button.onclick=()=>attempt(()=>{
    const reference=report.groups[Number(row.dataset.index)].references[Number(button.dataset.reference)];
    return request('openFile',{path:reference.path,line:reference.line});
  });
  apply.onclick=async()=>{
    apply.disabled=true;
    try {
      if(projectId!==state.ws?.project.id)throw Error('项目已切换，请重新检查');
      const result=await request('applyBibliographyDuplicates',{token:report.token,choices:selected()});
      dialog.close();notify(`已去重 ${result.removed} 条文献并更新引用，可整体撤销`);
    } catch(error) {const target=dialog.querySelector('.dedup-error');target.hidden=false;target.textContent=error.message;update();}
  };
  dialog.showModal();
}

async function openSearch() {
  if (!state.ws) return;
  const dialog = $("#search-dialog"), projectId = state.ws.project.id;
  const previous = state.projectSearch?.projectId === projectId ? state.projectSearch : null;
  const session = state.projectSearch = { projectId, query: previous?.query || "", replacement: previous?.replacement || "", hits: [], total: 0, current: null };
  dialog.innerHTML = `<header class="dialog-header"><div><h2>项目搜索与替换</h2><p>普通文本搜索，忽略大小写。应用替换前先查看预览。</p></div><button class="icon-button dialog-close" title="关闭项目搜索">×</button></header><div class="form-body"><div class="search-inputs"><input id="project-query" placeholder="查找内容" aria-label="项目查找内容"><button id="run-search" class="button secondary" title="搜索项目文本">搜索</button></div><div class="search-inputs"><input id="project-replacement" placeholder="替换为…" aria-label="项目替换内容"><button id="preview-replace" class="button secondary" title="预览所有替换">预览替换</button></div><div class="search-navigation"><span id="project-match-count" role="status" aria-live="polite">0 / 0</span><button id="project-prev" class="icon-button" title="上一个匹配（Shift+Enter）">↑</button><button id="project-next" class="icon-button" title="下一个匹配（Enter）">↓</button></div><p id="search-summary" class="section-note">当前匹配 / 全部匹配</p><div id="project-results" class="search-results"></div></div><footer class="dialog-footer"><button class="button secondary dialog-close" title="关闭项目搜索">关闭</button><button id="apply-replace" class="button primary" disabled title="应用预览中的替换，可撤销">应用全部替换</button></footer>`;
  $("#project-query").value = session.query; $("#project-replacement").value = session.replacement;
  state.replacePlan = [];
  let generation = 0, timer, previewing = false, busy = false;
  const updateCount = () => {
    $("#project-match-count").textContent = `${session.current == null ? 0 : session.current + 1} / ${session.total}`;
    $("#project-prev").disabled = busy || !session.hits.length || (session.total > session.hits.length && session.current === 0);
    $("#project-next").disabled = busy || !session.hits.length || (session.total > session.hits.length && session.current === session.hits.length - 1);
    for (const [i, row] of [...$("#project-results").children].entries()) row.classList.toggle("selected", i === session.current);
  };
  const select = async index => {
    const hit = session.hits[index]; if (!hit) return;
    await request("openFile", hit);
    if (projectId !== state.ws?.project.id) return;
    session.current = index; updateCount();
    $("#project-results").children[index]?.scrollIntoView({ block: "nearest" });
  };
  const step = delta => {
    if (!session.hits.length || busy) return;
    let index = session.current == null ? (delta > 0 ? 0 : session.hits.length - 1) : session.current + delta;
    if (session.total > session.hits.length) index = Math.min(session.hits.length - 1, Math.max(0, index));
    else index = (index + session.hits.length) % session.hits.length;
    return select(index);
  };
  const search = async previewMode => {
    clearTimeout(timer);
    const token = ++generation, query = $("#project-query").value;
    session.query = query; session.replacement = $("#project-replacement").value;
    session.current = null; session.hits = []; session.total = 0; state.replacePlan = [];
    previewing = previewMode; busy = !!query; updateCount();
    $("#project-results").replaceChildren(); $("#apply-replace").disabled = true;
    if (!query) { busy = false; $("#search-summary").textContent = "当前匹配 / 全部匹配"; return; }
    $("#search-summary").textContent = "正在搜索…";
    let result;
    try { result = await request("search", { query, ...(previewMode ? { replacement: session.replacement } : {}) }); }
    catch (error) { if (token === generation) { busy = false; updateCount(); $("#search-summary").textContent = error.message; } return; }
    if (token !== generation || projectId !== state.ws?.project.id || !dialog.open) return;
    busy = false; session.hits = result.hits; session.total = result.total;
    state.replacePlan = previewMode ? result.plan : [];
    $("#apply-replace").disabled = !state.replacePlan.length;
    $("#search-summary").textContent = previewMode ? `将修改 ${result.plan.length} 个文件；应用后可整体撤销。` : result.truncated ? `共 ${result.total} 个匹配，仅展示前 2,000 个；请缩小搜索范围。` : `共 ${result.total} 个匹配`;
    const target = $("#project-results"); target.replaceChildren();
    if (previewMode) for (const item of result.plan) {
      const element = document.createElement("div"); element.className = "replace-preview";
      element.innerHTML = `<b>${esc(item.path)}</b><pre>${esc(item.after.slice(0, 2000))}</pre>`; target.append(element);
    } else for (const [index, hit] of result.hits.entries()) {
      const row = document.createElement("button"); row.className = "search-hit"; row.title = `跳转 ${hit.path}:${hit.line}`;
      row.innerHTML = `<b>${esc(hit.path)}:${hit.line}</b><p>${esc(hit.text)}</p>`;
      row.onclick = () => attempt(() => select(index)); target.append(row);
    }
    updateCount();
    if (previewMode) { $("#project-prev").disabled = true; $("#project-next").disabled = true; }
  };
  state.refreshSearch = () => {
    if (!dialog.open || projectId !== state.ws?.project.id) return;
    ++generation; clearTimeout(timer); session.current = null; session.hits = []; session.total = 0; busy = true;
    state.replacePlan = []; $("#apply-replace").disabled = true; updateCount();
    timer = setTimeout(() => attempt(() => search(false)), 220);
  };
  for (const button of dialog.querySelectorAll(".dialog-close")) button.onclick = () => dialog.close();
  dialog.onclose = () => { ++generation; clearTimeout(timer); state.refreshSearch = null; };
  $("#run-search").onclick = () => attempt(() => search(false));
  $("#preview-replace").onclick = () => attempt(() => search(true));
  $("#project-prev").onclick = () => attempt(() => step(-1));
  $("#project-next").onclick = () => attempt(() => step(1));
  $("#project-query").onkeydown = event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    attempt(async () => { if (busy || previewing || session.query !== $("#project-query").value) await search(false); await step(event.shiftKey ? -1 : 1); });
  };
  $("#project-query").oninput = state.refreshSearch;
  $("#project-replacement").oninput = () => { session.replacement = $("#project-replacement").value; state.replacePlan = []; $("#apply-replace").disabled = true; if (previewing) state.refreshSearch(); };
  $("#apply-replace").onclick = () => attempt(async () => { await request("replaceProject", { plan: state.replacePlan }); await search(false); notify("项目替换已应用，可用 Ctrl+Z 撤销"); });
  dialog.showModal(); updateCount(); $("#project-query").focus();
  if (session.query) await search(false);
}
function displayShortcut(key) {
  return key
    .replaceAll("Mod-", "Ctrl+")
    .replaceAll("Ctrl-", "Ctrl+")
    .replaceAll("Alt-", "Alt+")
    .replaceAll("Shift-", "Shift+")
    .replace(/[a-z]$/, (s) => s.toUpperCase());
}
function canonicalShortcut(input) {
  if (!input.includes("+")) return input.trim();
  const parts = input.split("+").map((s) => s.trim()),
    key = parts.pop();
  const modifiers = parts.map(
    (s) =>
      ({ ctrl: "Mod", control: "Mod", alt: "Alt", shift: "Shift" })[
        s.toLowerCase()
      ] || s,
  );
  const tail =
    key.length === 1
      ? key.toLowerCase()
      : /^f\d+$/i.test(key)
        ? key.toUpperCase()
        : key;
  return [...modifiers, tail].join("-");
}
function settingRow(label, description, control) {
  return `<div class="setting-row"><div class="setting-label">${label}${description ? `<small>${description}</small>` : ""}</div>${control}</div>`;
}
function fontSlider(key, label, value, unit) {
  return `<div class="font-size-control"><input id="${key}-slider" type="range" min="8" max="30" step="1" value="${value}" data-font-size="${key}" aria-label="${label}" title="拖动调整${label}，8–30 ${unit}"><output for="${key}-slider">${value} ${unit}</output><button class="text-button" data-font-reset="${key}" title="恢复${label}默认值">重置</button></div>`;
}
function switchControl(key, label, disabled = false) {
  const on = state.settings[key];
  return `<button class="switch ${on ? "on" : ""}" data-setting="${key}" ${disabled ? "disabled" : ""} title="${esc(disabled ? "不可用：需先开启自动保存" : label)}" aria-label="${esc(label)}" role="switch" aria-checked="${!!on}"><span>${disabled ? "不可用" : on ? "已开启" : "已关闭"}</span><span class="switch-track"></span></button>`;
}
async function openSettings() {
  renderSettingsNav();
  await renderSettings();
  if (!$("#settings-dialog").open) $("#settings-dialog").showModal();
}
function renderSettingsNav() {
  const tabs = [
    ["appearance", "sun", "外观与字体"],
    ["saving", "save", "保存与编译"],
    ["tools", "terminal", "TeX 工具链"],
    ["shortcuts", "keyboard", "快捷键"],
    ["templates", "file", "自定义模板"],
    ["about", "code", "关于"],
  ];
  $("#settings-nav").innerHTML = tabs
    .map(
      ([id, name, label]) =>
        `<button data-tab="${id}" class="${id === state.settingsTab ? "active" : ""}" title="${label}">${icon(name, 17)}${label}</button>`,
    )
    .join("");
  for (const button of $("#settings-nav").querySelectorAll("button"))
    button.onclick = () => {
      state.settingsTab = button.dataset.tab;
      renderSettingsNav();
      attempt(renderSettings);
    };
}
async function changeSetting(changes) {
  await request("settings", changes);
}
async function renderSettings() {
  const target = $("#settings-content"),
    prefs = state.settings,
    tab = state.settingsTab;
  target.replaceChildren();
  if (tab === "appearance") {
    target.innerHTML = `<h3>外观与字体</h3><p class="section-note">界面、代码和 PDF 的大小分别调整。</p><div class="setting-group">${settingRow(
      "界面主题",
      "选择“系统”时随 Windows 外观自动变化。",
      `<div class="theme-options">${[
        ["system", "系统"],
        ["light", "浅色"],
        ["dark", "深色"],
      ]
        .map(
          ([id, label]) =>
            `<button data-theme="${id}" class="${prefs.theme === id ? "active" : ""}" title="${label}主题">${label}</button>`,
        )
        .join("")}</div>`,
    )}${settingRow("界面字号", "项目库、工具栏、侧栏、设置与对话框，8–30。", fontSlider("uiSize", "界面字号", prefs.uiSize, "px"))}${settingRow("代码字号", "独立调整代码与行号，8–30。", fontSlider("codeSize", "代码字号", prefs.codeSize, "px"))}</div>`;
    for (const button of target.querySelectorAll("[data-theme]"))
      button.onclick = () =>
        attempt(() => changeSetting({ theme: button.dataset.theme }));
  } else if (tab === "saving") {
    target.innerHTML = `<h3>保存与编译</h3><p class="section-note">自动编译在成功保存后触发，构建中最多排队下一次。</p><div class="setting-group">${settingRow("自动保存", "停止输入后将修改保存到本地文件。", switchControl("autoSaveEnabled", "自动保存"))}${settingRow("等待时间", "1–30 秒。恢复快照独立于自动保存。", `<input type="number" data-number="autoSaveDelay" min="1" max="30" value="${prefs.autoSaveDelay}" ${prefs.autoSaveEnabled ? "" : "disabled"} title="自动保存等待秒数">`)}${settingRow("打开项目后自动编译", "打开项目后保存并编译当前文稿。成功生成的 PDF 同步到主 TeX 文件所在目录。", switchControl("compileOnOpen", "打开项目后自动编译"))}${settingRow("保存后自动编译", "对应 Ctrl+S，不依赖自动保存开关。", switchControl("compileAfterManualSave", "保存后自动编译"))}${settingRow("自动保存后自动编译", prefs.autoSaveEnabled ? "对所有项目生效。" : "不可用：需先开启自动保存。", switchControl("compileAfterAutoSave", "自动保存后自动编译", !prefs.autoSaveEnabled))}</div><h3>编译过程文件</h3><div class="setting-group">${settingRow("成功编译后清理", "保留 PDF、SyncTeX 与源文件；失败时保留诊断文件。", switchControl("cleanAfterBuild", "成功编译后清理辅助文件"))}</div>`;
  } else if (tab === "tools") {
    target.innerHTML = `<h3>TeX 工具链</h3><p class="section-note">选择一种环境即可。推荐 TeX Live，也可使用 MiKTeX；安装后自动检测，或手动选择可执行目录。</p><div class="tool-path">${esc(prefs.texBin || "尚未检测到 TeX 可执行目录")}</div><div class="settings-actions"><button id="detect-tools" class="button primary" title="自动查找 TeX Live、MiKTeX 和 PATH 中的工具">${icon("refresh", 16)}自动检测</button><button id="choose-bin" class="button secondary" title="选择包含 latexmk 和 LaTeX 引擎的可执行目录">选择目录</button></div><div id="tool-results">${
      Object.entries(state.tools?.tools || {})
        .map(
          ([name, version]) =>
            `<div class="tool-result"><b>${esc(name)}</b><span>${esc(version)}</span></div>`,
        )
        .join("") ||
      '<p class="section-note">需要 latexmk、所选引擎及 synctex。</p>'
    }</div><h3>Perl 运行时</h3><div class="setting-group"><div class="tool-result"><b>${esc(state.tools?.perl?.label || "等待检测")}</b><span>${esc(state.tools?.perl?.available ? `${state.tools.perl.version} · ${state.tools.perl.architecture}` : state.tools?.perl?.error || "点击自动检测查看状态")}</span></div>${state.tools?.perl?.executable ? `<div class="tool-path">${esc(state.tools.perl.executable)}</div>` : ""}<p class="section-note">${state.tools?.perl?.source === "texlive" ? "当前沿用 TeX Live 自带的 Perl。Compilune 的内置运行时作为备用。" : "MiKTeX 使用 Compilune 内置的私有 Perl，无需另装 Perl。仅对应用启动的编译进程生效，不修改系统 PATH。"}${state.arch === "arm64" ? " 内置 Windows Perl 为 x64，通过 Windows 11 的仿真支持运行。" : ""}</p></div><div class="toolchain-choices"><section class="toolchain-choice"><header><b>TeX Live</b><span>完整安装</span></header><p>推荐完整安装，一次下载常用宏包、字体和编译工具，首次下载与磁盘占用较大。安装完成后，已安装的内容可离线使用，适合长期写作与离线场景。</p><button id="texlive-download" class="button primary" title="打开 TeX Live Windows 官方下载与安装页">${icon("download", 16)}下载 TeX Live</button></section><section class="toolchain-choice"><header><b>MiKTeX</b><span>按需安装</span></header><p>基础安装体积较小，可按需下载缺失宏包。首次获取这些宏包时需要联网；已安装的内容之后可离线使用，适合节省初始下载量和磁盘空间。</p><button id="miktex-download" class="button secondary" title="打开 MiKTeX 官方下载页">${icon("download", 16)}下载 MiKTeX</button></section></div><p class="section-note">TeX Live 也支持自定义精简安装。MiKTeX 的自动安装缺失宏包可在 MiKTeX Console 中开启；Compilune 已附带私有 Perl，仍需单独安装 TeX 环境。安装完成后点击自动检测。</p>`;
    $("#detect-tools").onclick = () =>
      attempt(async () => {
        $("#detect-tools").disabled = true;
        $("#detect-tools").textContent = "正在检测…";
        try {
          await request("detectTools");
        } finally {
          if (state.settingsTab === "tools") await renderSettings();
        }
      });
    $("#choose-bin").onclick = () => attempt(() => request("chooseBin"));
    $("#texlive-download").onclick = () =>
      attempt(() => request("external", { page: "texlive" }));
    $("#miktex-download").onclick = () =>
      attempt(() => request("external", { page: "miktex" }));
  } else if (tab === "shortcuts") {
    target.innerHTML = `<h3>快捷键</h3><p class="section-note">使用 Ctrl、Alt、Shift 组合，例如 Ctrl+Shift+F。留空禁用编辑器命令。</p><label class="field"><input id="shortcut-query" placeholder="搜索命令…" aria-label="搜索快捷键命令"></label><div id="shortcut-list"></div>`;
    const render = () => {
      const query = $("#shortcut-query").value.toLowerCase(),
        list = $("#shortcut-list");
      list.replaceChildren();
      for (const command of prefs.bindings.filter((c) =>
        (c.title + c.key).toLowerCase().includes(query),
      )) {
        const row = document.createElement("label");
        row.className = "shortcut-row";
        row.innerHTML = `<span>${esc(command.title)}</span><input value="${esc(displayShortcut(command.key))}" title="${esc(command.title)} 快捷键" ${["save", "compile", "undo", "redo"].includes(command.id) ? "disabled" : ""}>`;
        row.querySelector("input").onchange = (event) =>
          attempt(async () => {
            try {
              await changeSetting({
                bindings: state.settings.bindings.map((c) =>
                  c.id === command.id
                    ? { ...c, key: canonicalShortcut(event.target.value) }
                    : c,
                ),
              });
            } catch (error) {
              event.target.value = displayShortcut(command.key);
              throw error;
            }
          });
        list.append(row);
      }
    };
    $("#shortcut-query").oninput = render;
    render();
  } else if (tab === "templates") {
    const templates = await request("templates");
    if (state.settingsTab !== tab) return;
    target.innerHTML = `<h3>自定义模板</h3><p class="section-note">导入时会复制到应用的本地模板库，删除原文件夹后仍可使用，更新软件时保留。请将图片、cls、bib 等依赖放在模板文件夹内；新建项目会再复制一份，修改项目不会影响模板。</p><button id="import-template" class="button primary" title="复制本地模板文件夹到模板库">${icon("plus", 16)}导入模板</button><div id="template-list"></div>`;
    for (const name of templates) {
      const row = document.createElement("div");
      row.className = "template-row";
      row.innerHTML = `<span>${esc(name)}</span>`;
      const remove = button("trash", "移除模板 " + name);
      remove.onclick = () =>
        attempt(async () => {
          await request("removeTemplate", { name });
          await renderSettings();
        });
      row.append(remove);
      $("#template-list").append(row);
    }
    $("#import-template").onclick = () =>
      attempt(async () => {
        await request("importTemplate");
        await renderSettings();
      });
  } else
    target.innerHTML = `<div class="about"><img src="folio://app/assets/AppIcon.png" alt="Compilune 图标"><h3>Compilune</h3><p>v${esc(state.version)} · Windows ${state.arch === "arm64" ? "ARM64" : "x64"}</p><p>本地编译，离线写作。</p><p>MIT License · © 2026 JiaQi</p><button id="open-github" class="button secondary" title="打开 GitHub 项目">GitHub ↗</button></div>`;
  for (const control of target.querySelectorAll("[data-setting]"))
    control.onclick = () =>
      attempt(() =>
        changeSetting({
          [control.dataset.setting]: !state.settings[control.dataset.setting],
        }),
      );
  for (const control of target.querySelectorAll("[data-number]"))
    control.onchange = () =>
      attempt(() =>
        changeSetting({ [control.dataset.number]: Number(control.value) }),
      );
  for (const control of target.querySelectorAll("[data-font-size]")) {
    control.oninput = () => {
      state.settings[control.dataset.fontSize] = Number(control.value);
      control.nextElementSibling.textContent = control.value + " px";
      applyAppearance();
    };
    control.onchange = () =>
      attempt(() => changeSetting({ [control.dataset.fontSize]: Number(control.value) }));
  }
  for (const control of target.querySelectorAll("[data-font-reset]"))
    control.onclick = () =>
      attempt(() => changeSetting({
        [control.dataset.fontReset]: 13,
      }));
  if ($("#open-github"))
    $("#open-github").onclick = () =>
      attempt(() => request("external", { page: "github" }));
}
const preview = new PDFPreview({
  onReverse: (location) => attempt(() => request("backwardSync", location)),
  onSession: (layout) => {
    if (state.ws) attempt(() => request("session", layout));
  },
  onCover: (data) => {
    if (state.ws)
      attempt(() =>
        request("cacheCover", { projectId: state.ws.project.id, data }),
      );
  },
  onNotice: notify,
});
async function editorEvent(message, capturedProjectId = state.ws?.project.id) {
  if (!message || typeof message.type !== "string") return;
  const projectId = capturedProjectId;
  switch (message.type) {
    case "ready":
      state.ready = true;
      for (const message of state.pendingEditor.splice(0)) sendEditor(message);
      sendEditor(options());
      break;
    case "change":
      if (projectId) await request("edit", { ...message, projectId });
      break;
    case "position":
      if (projectId) await request("position", { ...message, projectId });
      break;
    case "flush":
      await request("flushAck", { token: message.token });
      break;
    case "notice":
      notify(message.message);
      break;
    case "requestIndex":
      if (projectId) await request("requestIndex");
      break;
    case "localImagePreview": {
      let result;
      try {
        if (projectId !== state.ws?.project.id) break;
        result = await request("localImagePreview", message);
        if (result.pdf) result = { image: await preview.localImage(result.pdf), note: result.note };
      } catch (error) { result = { error: error.message }; }
      if (projectId === state.ws?.project.id) sendEditor({ type: "referencePreview", id: message.id, ...result });
      break;
    }
    case "referencePreview": {
      let result;
      try {
        if (projectId !== state.ws?.project.id) break;
        const descriptor = await request("referencePreview", message);
        result = { image: await preview.referenceImage(descriptor.locations), note: descriptor.note };
      } catch (error) { result = { error: error.message }; }
      if (projectId === state.ws?.project.id) sendEditor({ type: "referencePreview", id: message.id, ...result });
      break;
    }
    case "navigate":
      if (projectId) await request("openFile", message);
      break;
    case "save":
      if (projectId) await request("save");
      break;
    case "compile":
      if (projectId) await request("compile");
      break;
    case "undo":
    case "redo":
      if (projectId) await request(message.type);
      break;
    case "projectSearch":
      if (projectId) await openSearch();
      break;
    case "forwardSync":
      if (projectId) await request("forwardSync", { line: message.line });
      break;
    case "deduplicateBibliography": if (projectId) await openBibliographyDuplicates(); break;
    case "pasteCitation": {
      if (!projectId || projectId !== state.ws?.project.id) break;
      const info = await request("citationClipboard", { ...message, projectId });
      const detail = info.existingKeys.length
        ? "项目中已存在以下文献键：" + info.existingKeys.join(", ") + "。" + (info.newKeys.length ? "已有文献不再追加；新文献将追加到所选 .bib，并在光标处插入全部引用。" : "确认后仅在光标处插入引用，不修改 .bib。")
        : "确认文献信息后，追加到文献文件并在原光标处插入引用。";
      let target = info.defaultFile || (info.files.length === 1 ? info.files[0] : "");
      const cards = `<div class="citation-preview-list">${info.entries.map(entry => `<article class="citation-preview-card"><div class="citation-preview-key">${esc(entry.key)}${info.existingKeys.includes(entry.key) ? ' · 已存在，将复用' : ''}</div><h3>${esc(entry.title || "标题未提供")}</h3><dl>${[["第一作者", entry.author], ["发表年份", entry.year], ["期刊 / 会议", entry.venue]].map(([name,value]) => `<dt>${name}</dt><dd>${esc(value || "未提供")}</dd>`).join("")}</dl></article>`).join("")}</div>`;
      const selector = info.newKeys.length && !target ? `<label class="field"><span>文献文件</span><select name="file" title="选择要追加文献的 .bib 文件">${info.files.map(file => `<option value="${esc(file)}">${esc(file)}</option>`).join("")}</select></label>` : "";
      const confirmation = await promptForm(info.existingKeys.length ? "文献已存在" : "智能插入文献", detail, cards + selector,
        info.newKeys.length ? (info.existingKeys.length ? "复用已有文献并插入" : "插入文献") : "仅插入引用");
      if (!confirmation) break;
      target ||= confirmation.file || "";
      if (projectId !== state.ws?.project.id) break;
      await request("pasteCitation", { ...message, projectId, clipboard: info.text, bibliographyFile: target,
        confirmedExistingKeys: info.existingKeys });
      break;
    }
    case "insertImage":
      if (projectId) await request("importImage");
      break;
    case "font":
      await changeSetting({
        codeSize: Math.max(8, Math.min(30, message.size)),
      });
      break;
  }
}
window.addEventListener("message", (event) => {
  if (
    event.source !== $("#editor").contentWindow ||
    event.data?.channel !== "folio-editor"
  )
    return;
  const message = event.data.message,
    projectId = state.ws?.project.id;
  if (["change", "position", "flush", "ready"].includes(message?.type))
    state.editorQueue = state.editorQueue
      .then(() => editorEvent(message, projectId))
      .catch((error) => notify(error.message, true));
  else
    state.editorQueue
      .then(() => editorEvent(message, projectId))
      .catch((error) => notify(error.message, true));
});
window.folioHost.onEvent((event) => {
  switch (event.type) {
    case "library":
      updateLibrary(event);
      break;
    case "opened":
      state.view = "workspace";
      state.ws = null;
      preview.clear().catch(() => {});
      state.treeSelection = event.workspace.selected || "";
      state.log = "";
      $("#build-log").textContent = "";
      showLog(false);
      sendEditor({ type: "reset" });
      updateWorkspace(event.workspace);
      sendEditor(options());
      if (event.document) sendEditor(event.document);
      break;
    case "activateWorkspace":
      state.view = "workspace";
      updateWorkspace(event.workspace);
      if (event.document) sendEditor(event.document);
      break;
    case "showLibrary":
      clearTimeout(state.navigationTimer);
      state.view = "library";
      $("#workspace").hidden = true;
      $("#library").hidden = false;
      $("#window-title").textContent = "项目库";
      updateLibrary(event);
      break;
    case "workspace":
      if (!state.ws || event.workspace.project.id === state.ws.project.id)
        updateWorkspace(event.workspace);
      break;
    case "closed":
      state.view = "library";
      state.ws = null;
      sendEditor({ type: "reset" });
      preview.clear();
      $("#workspace").hidden = true;
      $("#library").hidden = false;
      $("#window-title").textContent = "项目库";
      attempt(async () => updateLibrary(await request("bootstrap")));
      break;
    case "editor":
      sendEditor(event.message);
      break;
    case "flush":
      sendEditor({ type: "flush", token: event.token });
      break;
    case "notice":
      notify(event.message, event.error);
      break;
    case "buildFinished": {
      if (event.success) showLog(false);
      else {
        const target = $("#build-log");
        if (event.rows?.length) {
          target.replaceChildren();
          for (const row of event.rows) {
            if (row.path) {
              const link = document.createElement("button"); link.className = "diagnostic-link";
              link.textContent = `${row.path}:${row.line}${row.column > 1 ? ":" + row.column : ""} · ${row.message || "编译错误"}`;
              link.title = `跳转到 ${row.path}:${row.line}`;
              link.onclick = () => attempt(() => request("openFile", { path: row.path, line: row.line, column: row.column, diagnostic: true }));
              target.append(link, document.createTextNode("\n"));
            } else target.append(document.createTextNode(row.text + "\n"));
          }
        }
        showLog(true);
      }
      break;
    }
    case "buildStart":
      state.log = "";
      $("#build-log").textContent = "";
      break;
    case "buildLog":
      state.log = (state.log + event.text).slice(-2 * 1024 * 1024);
      $("#build-log").textContent = state.log;
      $("#build-log").scrollTop = $("#build-log").scrollHeight;
      break;
    case "pdf":
      attempt(() =>
        preview.load(event.data, {
          stale: event.stale,
          session: state.ws?.session || {},
        }),
      );
      break;
    case "pdfLocation":
      attempt(() => preview.locate(event.location));
      break;
    case "appearance":
      state.dark = event.dark;
      state.settings = event.settings;
      applyAppearance();
      break;
    case "settings":
      state.settings = event.settings;
      applyAppearance();
      if ($("#settings-dialog").open) {
        const fontOnly = event.changed?.length &&
          event.changed.every((key) => ["uiSize", "codeSize"].includes(key));
        if (fontOnly && state.settingsTab === "appearance") {
          for (const control of document.querySelectorAll("[data-font-size]")) {
            control.value = state.settings[control.dataset.fontSize];
            control.nextElementSibling.textContent = control.value + " px";
          }
        } else attempt(renderSettings);
      }
      break;
    case "tools":
      state.tools = event.toolchain;
      state.settings = event.settings;
      if ($("#settings-dialog").open && state.settingsTab === "tools")
        attempt(renderSettings);
      break;
    case "command":
      attempt(() => handleCommand(event.command));
      break;
  }
});
for (const [selector, name, label] of [
  ["#top-settings", "settings"],
  ["#open-project", "folder", "打开项目"],
  ["#new-project", "plus", "新建项目"],
  ["#library-search-icon", "search"],
  ["#show-archived", "archive"],
  ["#new-folder", "folder"],
  ["#new-item", "plus"],
  ["#refresh-files", "refresh"],
  ["#back-library", "back", "回到项目库"],
  ["#pdf-icon", "pdf"],
  ["#pdf-empty-icon", "pdf"],
  ["#pdf-find", "search"],
  ["#pdf-minus", "minus"],
  ["#pdf-plus", "plus"],
  ["#pdf-fit", "fit"],
  ["#toggle-sidebar", "panel"],
  ["#show-log", "terminal", "日志"],
  ["#save", "save"],
  ["#stop-build", "stop"],
  ["#compile", "play", "编译"],
  ["#toggle-preview", "pdf"],
])
  setIcon(selector, name, label);
$("#open-project").onclick = () => attempt(() => request("chooseProject"));
$("#new-project").onclick = () => attempt(newProject);
$("#top-settings").onclick = () => attempt(openSettings);
$("#library-query").oninput = renderLibrary;
$("#library-sort").onchange = (event) => {
  state.librarySort = event.target.value;
  renderLibrary();
};
$("#show-archived").onclick = () => {
  state.archived = !state.archived;
  renderLibrary();
};
$("#new-folder").onclick = () => attempt(() => newItem("folder"));
$("#new-item").onclick = (event) => fileMenu(state.treeSelection, event);
$("#refresh-files").onclick = () => attempt(() => request("refresh"));
$("#project-config").onclick = () => attempt(openConfiguration);
$("#back-library").onclick = () => attempt(() => request("showLibrary"));
$("#project-root").onclick = () => {
  state.treeSelection = "";
  renderFiles();
  persistNavigation();
};
$("#project-root").oncontextmenu = (event) => fileMenu("", event);
$("#file-tree").oncontextmenu = (event) => {
  if (!event.target.closest(".tree-row")) fileMenu("", event);
};
$("#file-tree").onclick = (event) => {
  if (!event.target.closest(".tree-row")) {
    state.treeSelection = "";
    renderFiles();
    persistNavigation();
  }
};
dropTarget($("#file-tree"), "");
dropTarget($("#project-root"), "");
for (const mode of ["files", "outline"])
  $("#" + mode + "-mode").onclick = () => {
    state.treeScroll[state.mode] = $(state.mode === "files" ? "#file-tree" : "#outline-tree").scrollTop;
    state.mode = mode;
    showNavigationMode();
    persistNavigation();
  };
for (const mode of ["files", "outline"]) {
  const tree = $(mode === "files" ? "#file-tree" : "#outline-tree");
  tree.onscroll = () => {
    if (!state.ws || state.view !== "workspace" || state.mode !== mode) return;
    state.treeScroll[mode] = tree.scrollTop;
    clearTimeout(state.navigationTimer);
    state.navigationTimer = setTimeout(persistNavigation, 200);
  };
}
$("#toggle-format").onclick = () => {
  state.format = !state.format;
  $("#toggle-format").classList.toggle("active", state.format);
  sendEditor(options());
};
$("#save").onclick = () => attempt(() => request("save"));
$("#compile").onclick = () =>
  attempt(() => request(state.ws?.running ? "stop" : "compile"));
$("#stop-build").onclick = () => attempt(() => request("stop"));
$("#show-log").onclick = () => showLog($("#build-panel").hidden);
$("#close-log").onclick = () => showLog(false);
$("#clear-log").onclick = () => {
  state.log = "";
  $("#build-log").textContent = "";
};
$("#toggle-sidebar").onclick = () => {
  if (!state.ws) return;
  state.ws.session.sidebar = state.ws.session.sidebar === false;
  updateWorkspace(state.ws);
  attempt(() => request("session", { sidebar: state.ws.session.sidebar }));
};
$("#toggle-preview").onclick = () => {
  state.ws.session.preview = state.ws.session.preview === false;
  updateWorkspace(state.ws);
  attempt(() => request("session", { preview: state.ws.session.preview }));
};
$("#pdf-find").onclick = openPDFSearch;
$("#pdf-close-find").onclick = () => {
  $("#pdf-search").hidden = true;
  $("#pdf-query").value = "";
  preview.find("");
};
$("#pdf-query").oninput = () => preview.find($("#pdf-query").value);
$("#pdf-query").onkeydown = (event) => {
  if (event.key === "Enter")
    preview.find(event.target.value, event.shiftKey, true);
  if (event.key === "Escape") $("#pdf-close-find").click();
};
$("#pdf-previous").onclick = () =>
  preview.find($("#pdf-query").value, true, true);
$("#pdf-next").onclick = () => preview.find($("#pdf-query").value, false, true);
$("#pdf-minus").onclick = () => preview.zoom(-1);
$("#pdf-plus").onclick = () => preview.zoom(1);
$("#pdf-fit").onclick = () => preview.fit();
$("#preview-panel").onpointerdown = () => {
  state.lastArea = "pdf";
};
$("#editor").onfocus = () => {
  state.lastArea = "editor";
};
window.addEventListener("blur", () => {
  if (document.activeElement === $("#editor")) state.lastArea = "editor";
});
for (const button of document.querySelectorAll(
  "#settings-dialog .dialog-close",
))
  button.onclick = () => $("#settings-dialog").close();
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest("#context-menu")) $("#context-menu").hidden = true;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") $("#context-menu").hidden = true;
  if (state.lastArea === "pdf" && event.key === "F3") {
    event.preventDefault();
    preview.find($("#pdf-query").value, event.shiftKey, true);
  }
});
for (const [selector, variable, min, max] of [
  ["#sidebar-splitter", "--sidebar-width", 180, 420],
  ["#preview-splitter", "--preview-width", 280, 900],
]) {
  const handle = $(selector);
  handle.onpointerdown = (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("dragging");
    const move = (next) => {
      const value =
        selector === "#sidebar-splitter"
          ? next.clientX
          : innerWidth - next.clientX;
      document.documentElement.style.setProperty(
        variable,
        Math.max(min, Math.min(max, value)) + "px",
      );
    };
    const stop = () => {
      handle.classList.remove("dragging");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
  };
}
$("#editor").src = "folio://app/editor/index.html";
attempt(async () => {
  const data = await request("bootstrap");
  updateLibrary(data);
  if (data.workspace) {
    state.view = "workspace";
    updateWorkspace(data.workspace);
    if (data.document) sendEditor(data.document);
  }
});

for (const [selector, name] of [
  ["#toolbar-library", "grid"],
  ["#toolbar-search", "search"],
  ["#toolbar-log", "terminal"],
  ["#library-layout", "grid"],
])
  setIcon(selector, name);
for (const [filter, name] of [
  ["all", "grid"],
  ["recent", "clock"],
  ["pinned", "pin"],
  ["archived", "archive"],
]) {
  const button = document.querySelector(`[data-filter="${filter}"]`);
  button.innerHTML = icon(name, 17) + button.textContent;
  button.onclick = () => {
    state.libraryFilter = filter;
    state.archived = filter === "archived";
    renderLibrary();
  };
}
$("#library-settings").innerHTML = icon("settings", 16) + "设置…";
$("#library-settings").onclick = () => attempt(openSettings);
$("#library-layout").onclick = () => {
  state.libraryGrid = !state.libraryGrid;
  renderLibrary();
};
$("#toolbar-build-slot").append($("#compile"));
$("#toolbar-view-slot").append($("#toggle-sidebar"), $("#toggle-preview"));
$("#toolbar-library").onclick = () => attempt(() => request("showLibrary"));
$("#toolbar-search").onclick = () => attempt(openSearch);
$("#toolbar-log").onclick = () => showLog($("#build-panel").hidden);
$("#toolbar-engine").onclick = () => attempt(openConfiguration);
$("#toolbar-citation").innerHTML = icon("citation", 18);
$("#toolbar-citation").onclick = () => editorCommand("pasteCitation");
$(".workspace-toolbar-title").oncontextmenu = (event) => {
  if (state.ws) showMenu(event, [["file", "设置项目别名…", () => editProjectAlias(state.ws.project)]]);
};
$("#export-pdf").onclick = () => attempt(() => request("exportPDF"));

$("#toolbar-sidebar-slot").append($("#toggle-sidebar"));

$("#toolbar-deduplicate").innerHTML=icon("deduplicate",18);
$("#toolbar-deduplicate").onclick=()=>attempt(openBibliographyDuplicates);

import { previewBibliographyDuplicates, applyBibliographyDuplicates } from "./bibliography-dedup.js";
import {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog,
  nativeTheme,
  protocol,
  net,
  shell,
  clipboard,
} from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Store } from "./store.js";
import { Workspace } from "./workspace.js";
import {
  resolveInside,
  readSource,
  textExtensions,
  validName,
  within,
  atomicWrite,
} from "./files.js";
import { findToolchain } from "./compiler.js";
import { citationClipboard, insertClipboardCitation } from "./bibliography.js";
import { referencePreview, localImagePreview } from "./previews.js";
import { projectPDFName } from "../../build/workbench/project-names.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "folio",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
app.setName("Compilune");
// Keep existing libraries, recovery snapshots and templates after the rename.
if (!app.commandLine.hasSwitch("user-data-dir") && !(!app.isPackaged && process.env.FOLIO_DATA_DIR)) {
  const legacy = path.join(app.getPath("appData"), "Folio TeX");
  try {
    if ((await fs.stat(legacy)).isDirectory()) app.setPath("userData", legacy);
  } catch {}
}
if (!app.isPackaged && process.env.FOLIO_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.FOLIO_DATA_DIR));
if (!app.requestSingleInstanceLock()) app.quit();
let window,
  store,
  workspace,
  closing = false,
  transitioning = false,
  toolchain = null;
let showingLibrary = true;
const flushes = new Map();
const emit = (message) => {
  if (window && !window.isDestroyed())
    window.webContents.send("folio:event", message);
};
const notice = (message, error = false) =>
  emit({ type: "notice", message, error });
const requireWorkspace = () => {
  if (!workspace || workspace.closed) throw new Error("请先打开项目");
  return workspace;
};
const library = () => ({
  projects: store.projects,
  settings: store.settings,
  platform: process.platform,
  arch: process.arch,
  version: app.getVersion(),
  dark: nativeTheme.shouldUseDarkColors,
  toolchain,
});
function applyTheme() {
  nativeTheme.themeSource = store.settings.theme;
  const dark = nativeTheme.shouldUseDarkColors;
  window?.setBackgroundColor(dark ? "#202622" : "#f8f8f5");
  if (process.platform === "win32")
    window?.setTitleBarOverlay({
      color: dark ? "#202622" : "#f8f8f5",
      symbolColor: dark ? "#dce4db" : "#39483c",
      height: 45,
    });
  emit({ type: "appearance", dark, settings: store.settings });
}
function flush() {
  if (!workspace) return Promise.resolve();
  const token = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      flushes.delete(token);
      reject(new Error("编辑器未确认最新内容，请完成输入后重试"));
    }, 5000);
    flushes.set(token, () => {
      clearTimeout(timeout);
      resolve();
    });
    emit({ type: "flush", token });
  });
}
async function confirmWorkspace() {
  if (!workspace) return true;
  const ws = workspace;
  ws.pause();
  try {
    await flush();
    const dirty = ws.dirty();
    if (dirty.length) {
      const result = await dialog.showMessageBox(window, {
        type: "question",
        title: "未保存的更改",
        message: "关闭前保存更改吗？",
        detail:
          dirty.slice(0, 12).join("\n") + (dirty.length > 12 ? "\n…" : ""),
        buttons: ["保存并关闭", "不保存", "取消"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (result.response === 2) {
        ws.resume();
        return false;
      }
      if (result.response === 0) await ws.save();
      else {
        for (const [file] of ws.buffers)
          try {
            ws.buffers.set(
              file,
              await readSource(await resolveInside(ws.project.path, file)),
            );
          } catch {
            ws.buffers.delete(file);
          }
        ws.history = [];
        ws.future = [];
      }
    }
    await ws.close();
    if (workspace === ws) workspace = null;
    showingLibrary = true;
    emit({ type: "closed" });
    return true;
  } catch (error) {
    ws.resume();
    throw error;
  }
}
async function transition(action) {
  if (transitioning) throw new Error("正在切换项目，请稍候");
  transitioning = true;
  try {
    return await action();
  } finally {
    transitioning = false;
  }
}
async function openProject(project) {
  return transition(async () => {
    if (workspace?.project.id === project.id) {
      showingLibrary = false;
      emit({
        type: "activateWorkspace",
        workspace: workspace.snapshot(),
        document: workspace.document(),
      });
      return true;
    }
    if (!(await confirmWorkspace())) return false;
    project.opened = Date.now();
    await store.persist();
    const ws = new Workspace(project, store, (message) => {
      if (workspace === ws || (!workspace && !ws.closed)) emit(message);
    });
    try {
      await ws.init();
      workspace = ws;
      showingLibrary = false;
      emit({
        type: "opened",
        workspace: ws.snapshot(),
        document: ws.document(),
      });
      if (ws.pdfData)
        emit({ type: "pdf", data: new Uint8Array(ws.pdfData), stale: true });
      emit({ type: "library", ...library() });
      if (store.settings.compileOnOpen && ws.config.root) setTimeout(() => {
        if (workspace===ws && !ws.closed && !showingLibrary)
          ws.compile().catch(error => notice(error.message,true));
      },0);
      return true;
    } catch (error) {
      ws.pause();
      ws.closed = true;
      clearInterval(ws.watch);
      ws.stop();
      throw error;
    }
  });
}
async function detect() {
  toolchain = await findToolchain(store.settings.texBin);
  if (toolchain.folder && toolchain.folder !== store.settings.texBin) {
    store.settings.texBin = toolchain.folder;
    await store.persist();
  }
  emit({ type: "tools", toolchain, settings: store.settings });
  return toolchain;
}
async function chooseFolder(title) {
  const result = await dialog.showOpenDialog(window, {
    title,
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
}
function showDocument(doc) {
  if (doc) emit({ type: "editor", message: doc });
  workspace?.publish();
}
const actions = {
  bootstrap: async () => ({
    ...library(),
    workspace: showingLibrary ? null : workspace?.snapshot() || null,
    document: showingLibrary ? null : workspace?.document() || null,
  }),
  flushAck: async (p) => {
    if (typeof p.token === "string") {
      flushes.get(p.token)?.();
      flushes.delete(p.token);
    }
  },
  chooseProject: async () => {
    const selected = await chooseFolder("打开 LaTeX 项目");
    const folder = selected ? await fs.realpath(selected) : null;
    if (folder) {
      if (!(await store.projectAt(folder))) {
        const conflicts = store.nameConflicts(path.basename(folder));
        if (conflicts.length) {
          const result = await dialog.showMessageBox(window, {
            type: "warning", message: "不同位置存在同名项目",
            detail: "建议打开后在项目名称的右键菜单中设置别名，方便区分。\n当前位置：" + folder + "\n已有项目：\n" + conflicts.map((p) => p.path).join("\n"),
            buttons: ["继续打开", "取消"], defaultId: 1, cancelId: 1, noLink: true,
          });
          if (result.response !== 0) return false;
        }
      }
      const project = await store.register(folder);
      return openProject(project);
    }
    return false;
  },
  createProject: async (p) => {
    try {
      const alias = store.validateAlias(p.alias || "");
      const parent = await chooseFolder("选择新项目的保存位置");
      if (!parent) return false;
      const name = validName(p.name || "Untitled"), folder = path.join(parent, name);
      if (await store.projectAt(folder) || await fs.lstat(folder).then(() => true, (error) => { if (error.code === "ENOENT") return false; throw error; }))
        throw new Error("此位置已有文件夹或项目，不能重复新建，也不会覆盖原文件。\n" + folder + "\n请打开已有项目，或选择不同名称、保存位置。");
      const conflicts = alias ? [] : store.nameConflicts(name);
      if (conflicts.length) {
        const result = await dialog.showMessageBox(window, {
          type: "warning", message: "不同位置存在同名项目",
          detail: "建议设置项目别名，方便区分。\n当前位置：" + folder + "\n已有项目：\n" + conflicts.map((row) => row.path).join("\n"),
          buttons: ["返回设置别名", "仍使用文件夹名称", "取消"], defaultId: 0, cancelId: 2, noLink: true,
        });
        if (result.response === 0) return { editProject: true };
        if (result.response !== 1) return false;
      }
      return await openProject(await store.create(parent, name, p.template || null, alias, conflicts.length > 0));
    } catch (error) {
      await dialog.showMessageBox(window, { type: "warning", message: "未创建项目", detail: error.message, buttons: ["返回修改"], noLink: true });
      return { editProject: true };
    }
  },
  openProject: async (p) => {
    const project = store.projects.find((row) => row.id === p.id);
    if (!project) throw new Error("项目不存在");
    return openProject(project);
  },
  showLibrary: async () => {
    return transition(async () => {
      if (!(await confirmWorkspace())) return false;
      showingLibrary = true;
      emit({ type: "showLibrary", ...library() });
      return true;
    });
    return true;
  },
  exportPDF: async () => {
    const ws = requireWorkspace();
    if (!ws.pdfData) throw new Error("请先编译生成 PDF");
    const result = await dialog.showSaveDialog(window, {
      title: "导出 PDF",
      defaultPath: projectPDFName(ws.project),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!result.canceled) await atomicWrite(result.filePath, ws.pdfData);
  },
  closeProject: async () => transition(() => confirmWorkspace()),
  projectAction: async (p) => {
    const project = store.projects.find((row) => row.id === p.id);
    if (!project) throw new Error("项目不存在");
    if (p.action === "pin") project.pinned = !project.pinned;
    else if (p.action === "archive") {
      if (
        workspace?.project.id === project.id &&
        !(await transition(() => confirmWorkspace()))
      )
        return false;
      project.archived = !project.archived;
    } else if (p.action === "rename") {
      try {
        const alias = store.validateAlias(p.name, project.id);
        const conflicts = alias ? [] : store.nameConflicts(path.basename(project.path), project.id);
        if (conflicts.length) {
          const result = await dialog.showMessageBox(window, {
            type: "warning", message: "不同位置存在同名项目",
            detail: "清空别名后将恢复文件夹名称，建议设置别名以区分项目。\n当前位置：" + project.path + "\n已有项目：\n" + conflicts.map((row) => row.path).join("\n"),
            buttons: ["返回设置别名", "仍使用文件夹名称", "取消"], defaultId: 0, cancelId: 2, noLink: true,
          });
          if (result.response === 0) return { editAlias: true };
          if (result.response !== 1) return false;
        }
        await store.setAlias(project.id, alias, conflicts.length > 0);
      } catch (error) {
        await dialog.showMessageBox(window, { type: "warning", message: "别名未保存", detail: error.message, buttons: ["返回修改"], noLink: true });
        return { editAlias: true };
      }
      if (workspace?.project.id === project.id) {
        workspace.project.name = project.name;
        workspace.project.alias = project.alias;
      }
    }
    else if (p.action === "reveal") {
      shell.showItemInFolder(project.path);
      return;
    } else if (p.action === "relink") {
      if (
        workspace?.project.id === project.id &&
        !(await transition(() => confirmWorkspace()))
      )
        return false;
      const folder = await chooseFolder("重新关联项目文件夹");
      if (!folder) return;
      const real = await fs.realpath(folder);
      if (await store.projectAt(real, project.id))
        throw new Error("这个文件夹已在项目库中");
      const conflicts = project.alias ? [] : store.nameConflicts(path.basename(real), project.id);
      if (conflicts.length) {
        const result = await dialog.showMessageBox(window, {
          type: "warning", message: "不同位置存在同名项目",
          detail: "建议先设置项目别名，再重新关联。\n当前位置：" + real + "\n已有项目：\n" + conflicts.map((row) => row.path).join("\n"),
          buttons: ["仍使用文件夹名称", "取消"], defaultId: 1, cancelId: 1, noLink: true,
        });
        if (result.response !== 0) return false;
      }
      await store.relocate(project.id, real, conflicts.length > 0);
    } else if (p.action === "remove") {
      if (
        workspace?.project.id === project.id &&
        !(await transition(() => confirmWorkspace()))
      )
        return false;
      store.projects = store.projects.filter((row) => row !== project);
    } else throw new Error("未知项目操作");
    await store.persist();
    emit({ type: "library", ...library() });
    if (workspace?.project.id === project.id) workspace.publish();
    return true;
  },
  localImagePreview: async (p) => localImagePreview(requireWorkspace(), p),
  referencePreview: async (p) => referencePreview(requireWorkspace(), p),
  openFile: async (p) => {
    const ws = requireWorkspace();
    await flush();
    if (!textExtensions.has(path.extname(p.path).toLowerCase())) {
      await shell.openPath(await resolveInside(ws.project.path, p.path));
      return;
    }
    await ws.open(p.path);
    showDocument(
      ws.document(p.path, {
        line: p.line,
        column: p.column,
        diagnostic: p.diagnostic === true,
        anchor: p.anchor,
        head: p.head,
        scroll: p.scroll,
      }),
    );
    if (Number.isInteger(p.from) && Number.isInteger(p.to))
      ws.emit({ type: "editor", message: { type: "selectMatch", path: p.path, from: p.from, to: p.to, text: p.matchedText } });
    await ws.persistSession();
  },
  edit: async (p) => {
    const ws = requireWorkspace();
    if (p.projectId !== ws.project.id) return;
    ws.edit(p.path, p.text, !!p.composing);
  },
  position: async (p) => {
    const ws = workspace;
    if (ws && p.projectId === ws.project.id && ws.buffers.has(p.path)) {
      ws.positions[p.path] = {
        anchor: p.anchor,
        head: p.head,
        scroll: p.scroll,
      };
      clearTimeout(ws.positionTimer);
      ws.positionTimer = setTimeout(
        () => ws.persistSession().catch(() => {}),
        300,
      );
    }
  },
  citationClipboard: async (p) => {
    const ws = requireWorkspace();
    if (p.projectId !== ws.project.id) throw new Error("项目已切换，请重试");
    if (!/\.tex$/i.test(p.path) || ws.selected !== p.path)
      throw new Error("请先在 TeX 文稿中定位插入位置");
    return citationClipboard(ws, clipboard.readText());
  },
  bibliographyDuplicates: async () => { await flush(); return previewBibliographyDuplicates(requireWorkspace()); },
  applyBibliographyDuplicates: async (p) => { await flush(); return applyBibliographyDuplicates(requireWorkspace(), p); },
  pasteCitation: async (p) => {
    const ws = requireWorkspace();
    if (p.projectId !== ws.project.id) throw new Error("项目已切换，请重试");
    const result = await insertClipboardCitation(ws, p);
    notice(result.file ? "已追加新文献到 " + result.file + " 并插入引用" : "已插入引用，未修改文献文件");
  },
  save: async () => {
    if (showingLibrary) return;
    const ws = requireWorkspace();
    await flush();
    await ws.saveManually();
    notice("所有更改已保存");
  },
  compile: async () => {
    if (showingLibrary) return;
    const ws = requireWorkspace();
    if (ws.running) {
      ws.stop();
      return;
    }
    await flush();
    ws.compile().catch((error) => notice(error.message, true));
  },
  stop: async () => workspace?.stop(),
  undo: async () => {
    const ws = requireWorkspace();
    await flush();
    await ws.undo();
  },
  redo: async () => {
    const ws = requireWorkspace();
    await flush();
    await ws.undo(true);
  },
  requestIndex: async () => {
    const ws = requireWorkspace();
    emit({
      type: "editor",
      message: {
        type: "index",
        symbols: ws.symbols,
        files: ws.files.filter((f) => !f.directory).map((f) => f.path),
      },
    });
  },
  refresh: async () => {
    const ws = requireWorkspace();
    await ws.refreshFiles();
    await ws.refreshIndex();
    ws.publish();
  },
  session: async (p) => {
    const ws = requireWorkspace();
    if (p.projectId && p.projectId !== ws.project.id) return;
    for (const key of ["sidebar", "preview"])
      if (typeof p[key] === "boolean") ws.session[key] = p[key];
    for (const key of ["pdfPage", "pdfZoom"])
      if (Number.isFinite(p[key])) ws.session[key] = p[key];
    if (p.navigation && typeof p.navigation === "object") {
      const navigation = p.navigation;
      const expansion = (value) => Object.fromEntries(
        Object.entries(value && typeof value === "object" ? value : {})
          .filter(([, expanded]) => typeof expanded === "boolean"),
      );
      const scroll = (mode) => Number.isFinite(navigation.scroll?.[mode])
        ? Math.max(0, navigation.scroll[mode]) : 0;
      ws.session.navigation = {
        mode: navigation.mode === "outline" ? "outline" : "files",
        files: expansion(navigation.files),
        outline: expansion(navigation.outline),
        selection: typeof navigation.selection === "string" ? navigation.selection : "",
        scroll: { files: scroll("files"), outline: scroll("outline") },
      };
    }
    await ws.persistSession();
  },
  closeTab: async (p) => {
    const ws = requireWorkspace();
    await flush();
    if (ws.dirty().includes(p.path)) {
      ws.pause();
      try {
        const response = await dialog.showMessageBox(window, {
          type: "question",
          message: "保存 " + p.path + " 的更改吗？",
          buttons: ["保存", "不保存", "取消"],
          defaultId: 0,
          cancelId: 2,
          noLink: true,
        });
        if (response.response === 2) return false;
        if (response.response === 0) await ws.save();
      } finally {
        ws.resume();
      }
    }
    ws.buffers.delete(p.path);
    ws.tabs = ws.tabs.filter((f) => f !== p.path);
    delete ws.positions[p.path];
    emit({ type: "editor", message: { type: "forget", path: p.path } });
    if (ws.selected === p.path) ws.selected = ws.tabs.at(-1) || null;
    showDocument(ws.document() || { type: "empty" });
    await ws.persistSession();
    await ws.persistRecovery();
    return true;
  },
  reloadFile: async (p) => {
    const ws = requireWorkspace();
    await flush();
    const result = await dialog.showMessageBox(window, {
      type: "warning",
      message: "重新载入将放弃此文件的未保存修改",
      buttons: ["重新载入", "取消"],
      cancelId: 1,
      defaultId: 1,
      noLink: true,
    });
    if (result.response) return;
    ws.buffers.set(
      p.path,
      await readSource(await resolveInside(ws.project.path, p.path)),
    );
    ws.history = [];
    ws.future = [];
    ws.revision++;
    ws.pdfStale = true;
    emit({
      type: "editor",
      message: {
        type: "replaceDocument",
        path: p.path,
        text: ws.buffers.get(p.path).text,
      },
    });
    await ws.persistRecovery();
    await ws.refreshIndex();
    ws.publish();
  },
  saveCopy: async (p) => {
    const ws = requireWorkspace();
    await flush();
    const buffer = ws.buffers.get(p.path || ws.selected);
    if (!buffer) throw new Error("未打开文件");
    const result = await dialog.showSaveDialog(window, {
      title: "另存修改内容",
      defaultPath: path.basename(p.path || ws.selected),
    });
    if (!result.canceled) await atomicWrite(result.filePath, buffer.text);
  },
  createItem: async (p) => {
    const ws = requireWorkspace();
    await flush();
    const file = await ws.createItem(p.parent || "", p.name, p.kind);
    if (
      p.kind !== "folder" &&
      textExtensions.has(path.extname(file).toLowerCase())
    ) {
      await ws.open(file);
      showDocument(ws.document());
    }
    return file;
  },
  moveItem: async (p) => {
    const ws = requireWorkspace();
    await flush();
    await ws.move(p.path, p.parent || "", p.name);
    showDocument(ws.document());
  },
  trashItem: async (p) => {
    const ws = requireWorkspace();
    await flush();
    const target = await resolveInside(ws.project.path, p.path);
    if (!p.path) throw new Error("不能删除项目根目录");
    const response = await dialog.showMessageBox(window, {
      type: "warning",
      message: "将 " + p.path + " 移到回收站？",
      detail: "其中未保存的内容将被放弃。",
      buttons: ["移到回收站", "取消"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response.response === 0) {
      await shell.trashItem(target);
      await ws.removeFromView(p.path);
      showDocument(ws.document() || { type: "empty" });
    }
  },
  revealFile: async (p) => {
    shell.showItemInFolder(
      await resolveInside(requireWorkspace().project.path, p.path || ""),
    );
  },
  configure: async (p) => {
    const ws = requireWorkspace();
    await flush();
    await ws.configure(p);
    return ws.config;
  },
  settings: async (p) => {
    await store.updateSettings(p);
    applyTheme();
    workspace?.scheduleSave();
    emit({ type: "settings", settings: store.settings, changed: Object.keys(p) });
    return store.settings;
  },
  chooseBin: async () => {
    const bin = await chooseFolder("选择包含 latexmk 和 LaTeX 引擎的 bin 目录");
    if (bin) {
      store.settings.texBin = bin;
      await store.persist();
      return detect();
    }
  },
  detectTools: async () => detect(),
  search: async (p) => {
    await flush();
    return requireWorkspace().search(p.query, p.replacement);
  },
  replaceProject: async (p) => {
    await flush();
    await requireWorkspace().replace(p.plan);
    return true;
  },
  forwardSync: async (p) => {
    await flush();
    const location = await requireWorkspace().forward(p.line);
    emit({ type: "pdfLocation", location });
  },
  backwardSync: async (p) => {
    await flush();
    const doc = await requireWorkspace().backward(p.page, p.x, p.y);
    showDocument(doc);
  },
  templates: async () => store.templates(),
  importTemplate: async () => {
    const folder = await chooseFolder("导入包含 TeX 的模板文件夹");
    return folder ? store.importTemplate(folder) : store.templates();
  },
  removeTemplate: async (p) => {
    validName(p.name);
    const target = path.join(store.directory, "Templates", p.name);
    await shell.trashItem(target);
    return store.templates();
  },
  cacheCover: async (p) => {
    const ws = requireWorkspace();
    if (
      p.projectId === ws.project.id &&
      typeof p.data === "string" &&
      p.data.startsWith("data:image/png;base64,") &&
      p.data.length < 200000
    ) {
      ws.project.cover = p.data;
      await store.persist();
    }
  },
  importImage: async () => {
    const ws = requireWorkspace();
    await flush();
    const result = await dialog.showOpenDialog(window, {
      title: "插入图片",
      properties: ["openFile"],
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "pdf", "eps", "svg"],
        },
      ],
    });
    if (result.canceled) return;
    let source = await fs.realpath(result.filePaths[0]);
    let relative;
    if (within(ws.project.path, source))
      relative = path
        .relative(ws.project.path, source)
        .split(path.sep)
        .join("/");
    else {
      const name = path.basename(source),
        directory = await resolveInside(ws.project.path, "figures", {
          missing: true,
        });
      await fs.mkdir(directory, { recursive: true });
      let target = path.join(directory, name);
      try {
        await fs.access(target);
        target = path.join(
          directory,
          path.basename(name, path.extname(name)) +
            "-" +
            Date.now() +
            path.extname(name),
        );
      } catch {}
      await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
      relative = path
        .relative(ws.project.path, target)
        .split(path.sep)
        .join("/");
    }
    if (/[{}\n]/.test(relative)) throw new Error("图片路径不能含花括号或换行");
    const from = path.posix.dirname(ws.selected || "main.tex"),
      image = path.posix.relative(from, relative);
    emit({
      type: "editor",
      message: {
        type: "insert",
        text:
          "\\includegraphics[width=\\linewidth]{\\detokenize{" + image + "}}",
      },
    });
    await ws.refreshFiles();
    ws.publish();
    notice("图片需要 graphicx 宏包；SVG 通常需先转换");
  },
  external: async (p) => {
    const links = {
      texlive: "https://tug.org/texlive/windows.html",
      miktex: "https://miktex.org/download",
      github: "https://github.com/JiaQi1996/FolioTex",
    };
    if (!links[p.page]) throw new Error("未知链接");
    await shell.openExternal(links[p.page]);
  },
};
async function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    title: "Compilune",
    backgroundColor: "#f8f8f5",
    icon: path.join(root, "assets/AppIcon.png"),
    titleBarStyle: "hidden",
    ...(process.platform === "win32"
      ? {
          titleBarOverlay: {
            color: "#f8f8f5",
            symbolColor: "#39483c",
            height: 45,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(root, "src/main/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (e) => e.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_web, _permission, callback) => callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.on("close", (event) => {
    if (closing) return;
    event.preventDefault();
    transition(() => confirmWorkspace())
      .then((ok) => {
        if (ok) {
          closing = true;
          window.close();
        }
      })
      .catch((error) => notice(error.message, true));
  });
  const send = (command) => emit({ type: "command", command });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin"
        ? [
            {
              label: "Compilune",
              submenu: [
                {
                  label: "设置",
                  accelerator: "CmdOrCtrl+,",
                  click: () => send("settings"),
                },
                { role: "quit" },
              ],
            },
          ]
        : []),
      {
        label: "文件",
        submenu: [
          {
            label: "新建项目",
            accelerator: "CmdOrCtrl+N",
            click: () => send("newProject"),
          },
          {
            label: "打开项目",
            accelerator: "CmdOrCtrl+O",
            click: () =>
              actions.chooseProject().catch((e) => notice(e.message, true)),
          },
          {
            label: "保存",
            accelerator: "CmdOrCtrl+S",
            click: () => actions.save().catch((e) => notice(e.message, true)),
          },
          {
            label: "项目库",
            accelerator: "CmdOrCtrl+K",
            click: () =>
              actions.showLibrary().catch((e) => notice(e.message, true)),
          },
          {
            label: "新建文件",
            accelerator: "CmdOrCtrl+Shift+N",
            click: () => send("newFile"),
          },
          { type: "separator" },
          {
            label: "设置",
            accelerator: "CmdOrCtrl+,",
            click: () => send("settings"),
          },
          { role: "quit" },
        ],
      },
      {
        label: "编辑",
        submenu: [
          {
            label: "撤销",
            accelerator: "CmdOrCtrl+Z",
            click: () => send("undo"),
          },
          {
            label: "重做",
            accelerator: "CmdOrCtrl+Shift+Z",
            click: () => send("redo"),
          },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
          {
            label: "查找",
            accelerator: "CmdOrCtrl+F",
            click: () => send("find"),
          },
          {
            label: "替换",
            accelerator: "CmdOrCtrl+H",
            click: () => send("replace"),
          },
          {
            label: "项目搜索",
            accelerator: "CmdOrCtrl+Shift+F",
            click: () => send("projectSearch"),
          },
        ],
      },
      {
        label: "编译",
        submenu: [
          {
            label: "编译",
            accelerator: "CmdOrCtrl+R",
            click: () =>
              actions.compile().catch((e) => notice(e.message, true)),
          },
          {
            label: "停止",
            accelerator: "CmdOrCtrl+.",
            click: () => workspace?.stop(),
          },
        ],
      },
      {
        label: "查看",
        submenu: [
          { role: "togglefullscreen" },
          { label: "显示日志", click: () => send("logs") },
          ...(!app.isPackaged ? [{ role: "toggleDevTools" }] : []),
        ],
      },
    ]),
  );
  window.setAutoHideMenuBar(true);
  await window.loadURL("folio://app/index.html");
  applyTheme();
}
app.on("second-instance", () => {
  window?.restore();
  window?.show();
  window?.focus();
});
app.on("window-all-closed", () => app.quit());
app
  .whenReady()
  .then(async () => {
    protocol.handle("folio", async (request) => {
      try {
        const url = new URL(request.url);
        if (url.host !== "app" || request.method !== "GET")
          return new Response("Forbidden", { status: 403 });
        const pathname = decodeURIComponent(url.pathname);
        let base, relative;
        if (pathname.startsWith("/editor/")) {
          base = path.join(root, "build/Resources/Editor");
          relative = pathname.slice(8);
        } else if (pathname.startsWith("/pdf/")) {
          base = path.join(root, "build/pdf");
          relative = pathname.slice(5);
        } else if (pathname.startsWith("/assets/")) {
          base = path.join(root, "assets");
          relative = pathname.slice(8);
        } else {
          base = path.join(root, "build/workbench");
          relative = pathname === "/" ? "index.html" : pathname.slice(1);
        }
        const file = path.resolve(base, relative);
        if (!within(base, file))
          return new Response("Forbidden", { status: 403 });
        return await net.fetch(pathToFileURL(file).toString());
      } catch {
        return new Response("Not found", { status: 404 });
      }
    });
    store = new Store(app.getPath("userData"));
    await store.init();
    ipcMain.handle("folio:request", async (event, action, payload) => {
      if (
        event.sender !== window?.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        new URL(event.senderFrame.url).protocol !== "folio:" ||
        new URL(event.senderFrame.url).host !== "app"
      )
        throw new Error("拒绝外部请求");
      try {
        if (
          typeof action !== "string" ||
          !Object.hasOwn(actions, action) ||
          !payload ||
          typeof payload !== "object"
        )
          throw new Error("未知操作");
        return { ok: true, value: await actions[action](payload) };
      } catch (error) {
        return { ok: false, error: error.message || String(error) };
      }
    });
    await createWindow();
    nativeTheme.on("updated", () => {
      emit({
        type: "appearance",
        dark: nativeTheme.shouldUseDarkColors,
        settings: store.settings,
      });
    });
    detect().catch((error) => notice("工具检测：" + error.message));
  })
  .catch((error) => {
    dialog.showErrorBox("Compilune 无法启动", error.stack || error.message);
    app.quit();
  });

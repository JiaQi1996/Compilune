import fs from "node:fs/promises";
import path from "node:path";
import {
  atomicWrite,
  readJSON,
  readSource,
  serialize,
  scanFiles,
  textExtensions,
  resolveInside,
  within,
  validName,
} from "./files.js";
import { buildDiagnostics } from "./diagnostics.js";
import { scanSymbols } from "./indexer.js";
import { compileProject, cleanArtifacts, syncQuery } from "./compiler.js";

export class Workspace {
  constructor(project, store, emit) {
    this.project = project;
    this.store = store;
    this.emit = emit;
    this.buffers = new Map();
    this.tabs = [];
    this.selected = null;
    this.files = [];
    this.symbols = [];
    this.positions = {};
    this.revision = 0;
    this.pdfStale = true;
    this.pdfData = null;
    this.pdfFile = null;
    this.running = false;
    this.pendingBuild = false;
    this.closed = false;
    this.history = [];
    this.future = [];
    this.queue = Promise.resolve();
    this.composing = false;
    this.paused = false;
    this.session = { sidebar: true, preview: true, pdfPage: 1, pdfZoom: 1 };
    this.config = {
      root: "",
      engine: "pdfLaTeX",
      workingDirectory: "",
      outputDirectory: ".folio/build",
      shellEscape: false,
      rcFile: "",
      bibliographyFile: "",
      autoCompile: false,
    };
    this.directory = path.join(store.directory, "workspaces", project.id);
  }
  async init() {
    this.project.path = await fs.realpath(this.project.path);
    await fs.mkdir(this.directory, { recursive: true });
    const configPath = await resolveInside(
      this.project.path,
      ".folio/project.json",
      { missing: true },
    );
    Object.assign(this.config, await readJSON(configPath, {}));
    this.project.engine = this.config.engine;
    await this.buildPaths(false);
    await this.refreshFiles();
    if (!this.config.root) {
      const candidates = [];
      for (const file of this.files.filter(
        (f) => !f.directory && /\.tex$/i.test(f.path),
      )) {
        if (
          (
            await readSource(await resolveInside(this.project.path, file.path))
          ).text.includes("\\documentclass")
        )
          candidates.push(file.path);
      }
      if (candidates.length === 1) this.config.root = candidates[0];
    }
    const session = await readJSON(
      path.join(this.directory, "session.json"),
      {},
    );
    Object.assign(this.session, session.layout || {});
    this.positions = session.positions || {};
    for (const file of session.tabs || [])
      try {
        await this.open(file);
      } catch {}
    if (session.selected && this.buffers.has(session.selected))
      this.selected = session.selected;
    const recovery = await readJSON(
      path.join(this.directory, "recovery.json"),
      [],
    );
    for (const item of recovery)
      try {
        const buffer = await this.open(item.path);
        if (item.text !== buffer.text) {
          buffer.conflict = item.disk !== buffer.disk;
          buffer.text = item.text;
        }
      } catch {}
    if (!this.tabs.length && this.config.root)
      await this.open(this.config.root);
    try {
      this.pdfData = await fs.readFile(
        path.join(this.directory, "preview.pdf"),
      );
    } catch {}
    await this.refreshIndex();
    this.watch = setInterval(
      () =>
        this.checkExternal().catch((e) =>
          this.emit({ type: "notice", message: e.message }),
        ),
      1500,
    );
    return this;
  }
  dirty() {
    return [...this.buffers]
      .filter(([, b]) => serialize(b).toString("base64") !== b.disk)
      .map(([p]) => p);
  }
  snapshot() {
    return {
      project: this.project,
      config: this.config,
      files: this.files,
      tabs: this.tabs,
      selected: this.selected,
      dirty: this.dirty(),
      conflicts: [...this.buffers]
        .filter(([, b]) => b.conflict)
        .map(([p]) => p),
      running: this.running,
      pdfStale: this.pdfStale,
      hasPDF: !!this.pdfData,
      revision: this.revision,
      session: this.session,
      symbols: this.symbols,
    };
  }
  publish() {
    if (!this.closed)
      this.emit({ type: "workspace", workspace: this.snapshot() });
  }
  async buildPaths(requireMain = true) {
    const root = this.project.path;
    const main = await resolveInside(root, this.config.root || "main.tex", {
      missing: !requireMain,
    });
    const cwd = await resolveInside(
      root,
      this.config.workingDirectory ||
        path.posix.dirname(this.config.root || "main.tex"),
      { missing: !requireMain },
    );
    const relative = path
      .relative(
        root,
        path.resolve(cwd, this.config.outputDirectory || ".folio/build"),
      )
      .split(path.sep)
      .join("/");
    const output = await resolveInside(root, relative, { missing: true });
    if (!relative || within(output, main))
      throw new Error("输出目录必须是项目内独立的生成目录");
    const rc = this.config.rcFile
      ? await resolveInside(root, this.config.rcFile, { missing: !requireMain })
      : null;
    return { main, cwd, output, rc };
  }
  async refreshFiles() {
    const paths = await this.buildPaths(false);
    this.files = await scanFiles(
      this.project.path,
      path.relative(this.project.path, paths.output).split(path.sep).join("/"),
    );
    return this.files;
  }
  async open(file) {
    if (this.buffers.has(file)) {
      this.selected = file;
      return this.buffers.get(file);
    }
    if (!textExtensions.has(path.extname(file).toLowerCase()))
      throw new Error("此文件请在系统默认应用中打开");
    const buffer = await readSource(
      await resolveInside(this.project.path, file),
    );
    this.buffers.set(file, buffer);
    this.tabs.push(file);
    this.selected = file;
    return buffer;
  }
  document(file = this.selected, extra = {}) {
    const buffer = this.buffers.get(file);
    return buffer
      ? {
          type: "open",
          path: file,
          text: buffer.text,
          position: this.positions[file],
          ...extra,
        }
      : null;
  }
  edit(file, text, composing = false) {
    const buffer = this.buffers.get(file);
    if (!buffer || typeof text !== "string" || text.length > 20 * 1024 * 1024)
      throw new Error("无效编辑消息");
    this.composing = composing;
    if (buffer.text === text) {
      if (!composing && this.dirty().length) this.scheduleSave();
      return;
    }
    const before = buffer.text;
    buffer.text = text;
    this.record({ [file]: before }, { [file]: text }, "edit");
    this.revision++;
    this.pdfStale = true;
    this.scheduleRecovery();
    this.scheduleIndex();
    this.scheduleSave();
    this.publish();
  }
  record(before, after, kind) {
    const previous = this.history.at(-1);
    const keys = Object.keys(after);
    if (
      kind === "edit" &&
      previous?.kind === "edit" &&
      Date.now() - previous.time < 650 &&
      keys.length === 1 &&
      Object.keys(previous.after).length === 1 &&
      keys[0] in previous.after
    ) {
      previous.after = after;
      previous.time = Date.now();
    } else {
      this.history.push({ before, after, kind, time: Date.now() });
      if (this.history.length > 200) this.history.shift();
    }
    this.future = [];
  }
  async undo(redo = false) {
    const from = redo ? this.future : this.history,
      to = redo ? this.history : this.future,
      entry = from.at(-1);
    if (!entry) return;
    const expected = redo ? entry.before : entry.after,
      target = redo ? entry.after : entry.before;
    for (const [file, text] of Object.entries(expected))
      if (this.buffers.get(file)?.text !== text)
        throw new Error("文件已变化，无法安全撤销");
    from.pop();
    for (const [file, text] of Object.entries(target)) {
      this.buffers.get(file).text = text;
      this.emit({
        type: "editor",
        message: { type: "replaceDocument", path: file, text },
      });
    }
    to.push(entry);
    this.revision++;
    this.pdfStale = true;
    this.scheduleRecovery();
    this.scheduleIndex();
    this.scheduleSave();
    this.publish();
  }
  async save() {
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        if (this.closed || this.composing)
          throw new Error("请完成输入后再保存");
        this.saving = true;
        try {
          const writes = [];
          for (const file of this.dirty()) {
            const buffer = this.buffers.get(file),
              url = await resolveInside(this.project.path, file);
            let disk;
            try {
              disk = (await fs.readFile(url)).toString("base64");
            } catch {
              throw new Error(file + " 已被删除或无法读取");
            }
            if (disk !== buffer.disk || buffer.conflict) {
              buffer.conflict = true;
              this.publish();
              throw new Error(file + " 已被外部修改，请重新载入或另存修改内容");
            }
            writes.push({ buffer, url, data: serialize(buffer) });
          }
          for (const { buffer, url, data } of writes) {
            await atomicWrite(url, data);
            buffer.disk = data.toString("base64");
            buffer.conflict = false;
          }
          if (writes.length) {
            this.project.edited = Date.now();
            await this.store.persist();
          }
          await this.persistRecovery();
          await this.persistSession();
          this.publish();
        } finally {
          this.saving = false;
        }
      });
    return this.queue;
  }
  scheduleSave() {
    clearTimeout(this.saveTimer);
    const ticket = this.saveTicket = (this.saveTicket || 0) + 1;
    if (
      this.closed ||
      this.paused ||
      this.composing ||
      !this.store.settings.autoSaveEnabled ||
      !this.dirty().length
    )
      return;
    this.saveTimer = setTimeout(async () => {
      try {
        await this.save();
        if (
          ticket === this.saveTicket &&
          !this.paused &&
          this.store.settings.autoSaveEnabled &&
          (this.config.autoCompile || this.store.settings.compileAfterAutoSave)
        )
          await this.compile();
      } catch (error) {
        this.emit({ type: "notice", message: error.message });
      }
    }, this.store.settings.autoSaveDelay * 1000);
  }
  pause() {
    this.paused = true;
    this.saveTicket = (this.saveTicket || 0) + 1;
    clearTimeout(this.saveTimer);
    this.pendingBuild = false;
  }
  resume() {
    this.paused = false;
    this.scheduleSave();
  }
  async saveManually() {
    this.saveTicket = (this.saveTicket || 0) + 1;
    clearTimeout(this.saveTimer);
    await this.save();
    if (this.store.settings.compileAfterManualSave) await this.compile();
  }
  scheduleRecovery() {
    clearTimeout(this.recoveryTimer);
    this.recoveryTimer = setTimeout(
      () =>
        this.persistRecovery().catch((e) =>
          this.emit({ type: "notice", message: e.message }),
        ),
      200,
    );
  }
  persistRecovery() {
    this.recoveryQueue = (this.recoveryQueue || Promise.resolve())
      .catch(() => {})
      .then(() => {
        const items = this.dirty().map((file) => ({
          path: file,
          text: this.buffers.get(file).text,
          disk: this.buffers.get(file).disk,
        }));
        return atomicWrite(
          path.join(this.directory, "recovery.json"),
          JSON.stringify(items),
        );
      });
    return this.recoveryQueue;
  }
  persistSession() {
    this.sessionQueue = (this.sessionQueue || Promise.resolve())
      .catch(() => {})
      .then(() =>
        atomicWrite(
          path.join(this.directory, "session.json"),
          JSON.stringify({
            tabs: this.tabs,
            selected: this.selected,
            positions: this.positions,
            layout: this.session,
          }),
        ),
      );
    return this.sessionQueue;
  }
  scheduleIndex() {
    clearTimeout(this.indexTimer);
    this.indexTimer = setTimeout(
      () =>
        this.refreshIndex()
          .then(() => this.publish())
          .catch(() => {}),
      400,
    );
  }
  async refreshIndex() {
    const generation = this.revision,
      out = [];
    for (const file of this.files.filter(
      (f) => !f.directory && /\.(tex|bib|cls|sty)$/i.test(f.path),
    )) {
      try {
        const text =
          this.buffers.get(file.path)?.text ??
          (await readSource(await resolveInside(this.project.path, file.path)))
            .text;
        out.push(...scanSymbols(text, file.path));
      } catch {}
    }
    if (generation === this.revision) {
      this.symbols = out;
      this.emit({
        type: "editor",
        message: {
          type: "index",
          symbols: out,
          files: this.files.filter((f) => !f.directory).map((f) => f.path),
        },
      });
    }
    return out;
  }
  async checkExternal() {
    if (this.closed || this.checking || this.saving) return;
    this.checking = true;
    try {
      for (const [file, buffer] of this.buffers) {
        let data;
        try {
          data = await fs.readFile(
            await resolveInside(this.project.path, file),
          );
        } catch {
          if (!buffer.conflict) {
            buffer.conflict = true;
            this.emit({ type: "notice", message: file + " 已被删除或移动" });
            this.publish();
          }
          continue;
        }
        if (this.saving) return;
        if (data.toString("base64") === buffer.disk) continue;
        if (this.dirty().includes(file)) {
          if (!buffer.conflict) {
            buffer.conflict = true;
            this.emit({
              type: "notice",
              message: file + " 已被外部修改，已阻止覆盖",
            });
            this.publish();
          }
        } else {
          const fresh = await readSource(
            await resolveInside(this.project.path, file),
          );
          this.buffers.set(file, fresh);
          this.emit({
            type: "editor",
            message: { type: "replaceDocument", path: file, text: fresh.text },
          });
          this.revision++;
          this.pdfStale = true;
          await this.refreshIndex();
          this.publish();
        }
      }
      const old = JSON.stringify(this.files);
      await this.refreshFiles();
      if (JSON.stringify(this.files) !== old) {
        await this.refreshIndex();
        this.publish();
      }
    } finally {
      this.checking = false;
    }
  }
  async configure(changes) {
    const old = { ...this.config };
    for (const key of [
      "root",
      "workingDirectory",
      "outputDirectory",
      "rcFile",
      "bibliographyFile",
    ]) {
      if (key in changes) {
        if (typeof changes[key] !== "string")
          throw new Error("编译路径必须为文本");
        changes[key] = changes[key].replaceAll("\\", "/");
      }
    }
    Object.assign(this.config, changes);
    try {
      if (
        !["pdfLaTeX", "XeLaTeX", "LuaLaTeX"].includes(this.config.engine) ||
        typeof this.config.root !== "string" ||
        typeof this.config.shellEscape !== "boolean" ||
        typeof this.config.autoCompile !== "boolean"
      )
        throw new Error("项目配置无效");
      await this.buildPaths();
      if (this.config.bibliographyFile) {
        if (!/\.bib$/i.test(this.config.bibliographyFile)) throw new Error("默认文献文件必须为 .bib");
        await resolveInside(this.project.path, this.config.bibliographyFile);
      }
      const file = await resolveInside(
        this.project.path,
        ".folio/project.json",
        { missing: true },
      );
      await atomicWrite(file, JSON.stringify(this.config, null, 2));
      this.project.engine = this.config.engine;
      await this.store.persist();
      await this.refreshFiles();
      this.pdfStale = true;
      this.scheduleSave();
      this.publish();
    } catch (error) {
      this.config = old;
      throw error;
    }
  }
  async createItem(parent, name, kind) {
    validName(name);
    const ext = kind === "tex" ? ".tex" : kind === "bib" ? ".bib" : "";
    if (ext && !name.toLowerCase().endsWith(ext)) name += ext;
    const rel = [parent, name].filter(Boolean).join("/");
    const dest = await resolveInside(this.project.path, rel, { missing: true });
    if (kind === "folder") await fs.mkdir(dest, { recursive: false });
    else
      await fs.writeFile(dest, kind === "tex" ? "% New LaTeX source\n" : "", {
        flag: "wx",
      });
    await this.refreshFiles();
    await this.refreshIndex();
    this.publish();
    return rel;
  }
  async move(file, parent, newName) {
    await this.save();
    const source = await resolveInside(this.project.path, file),
      name = validName(newName || path.posix.basename(file)),
      relative = [parent, name].filter(Boolean).join("/"),
      dest = await resolveInside(this.project.path, relative, {
        missing: true,
      });
    if (source === dest) return;
    if (within(source, dest)) throw new Error("不能移动到自身的子目录");
    try {
      await fs.access(dest);
      throw new Error("目标名称已存在，不会覆盖");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.rename(source, dest);
    const map = (f) =>
      f === file || f.startsWith(file + "/")
        ? relative + f.slice(file.length)
        : f;
    this.buffers = new Map([...this.buffers].map(([f, b]) => [map(f), b]));
    this.tabs = this.tabs.map(map);
    if (this.selected) this.selected = map(this.selected);
    this.positions = Object.fromEntries(
      Object.entries(this.positions).map(([f, p]) => [map(f), p]),
    );
    this.config.root = map(this.config.root);
    for (const old of [
      file,
      ...this.files
        .filter((f) => f.path.startsWith(file + "/"))
        .map((f) => f.path),
    ])
      this.emit({
        type: "editor",
        message: { type: "rename", path: old, newPath: map(old) },
      });
    this.history = [];
    this.future = [];
    this.revision++;
    this.pdfStale = true;
    await this.configure({});
    await this.refreshIndex();
    await this.persistRecovery();
    await this.persistSession();
    this.publish();
  }
  async removeFromView(file) {
    for (const key of [...this.buffers.keys()])
      if (key === file || key.startsWith(file + "/")) {
        this.buffers.delete(key);
        this.tabs = this.tabs.filter((f) => f !== key);
        delete this.positions[key];
        this.emit({ type: "editor", message: { type: "forget", path: key } });
      }
    if (!this.buffers.has(this.selected))
      this.selected = this.tabs.at(-1) || null;
    if (this.config.root === file || this.config.root.startsWith(file + "/")) {
      this.config.root = "";
      const cfg = await resolveInside(
        this.project.path,
        ".folio/project.json",
        { missing: true },
      );
      await atomicWrite(cfg, JSON.stringify(this.config, null, 2));
    }
    this.history = [];
    this.future = [];
    this.revision++;
    this.pdfStale = true;
    await this.refreshFiles();
    await this.refreshIndex();
    await this.persistSession();
    await this.persistRecovery();
    this.publish();
  }
  async search(query, replacement) {
    if (typeof query !== "string" || !query || query.length > 1000)
      return { hits: [], plan: [], total: 0, truncated: false };
    const hits = [], plan = [];
    let total = 0;
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
    for (const file of this.files.filter(f => !f.directory && textExtensions.has(path.extname(f.path).toLowerCase()))) {
      let text;
      try { text = this.buffers.get(file.path)?.text ?? (await readSource(await resolveInside(this.project.path, file.path))).text; }
      catch { continue; }
      pattern.lastIndex = 0;
      let line = 1, lineStart = 0, matched = false;
      for (let match; (match = pattern.exec(text));) {
        matched = true; total++;
        if (hits.length >= 2000) continue;
        for (let nl; (nl = text.indexOf("\n", lineStart)) >= 0 && nl < match.index;) { line++; lineStart = nl + 1; }
        const lineEnd = text.indexOf("\n", match.index);
        hits.push({ path: file.path, line, from: match.index, to: match.index + match[0].length, matchedText: match[0], text: text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd).slice(0,500) });
      }
      if (matched && replacement !== undefined) plan.push({ path: file.path, before: text, after: text.replace(pattern, () => replacement) });
    }
    return { hits, plan, total, truncated: total > hits.length };
  }
  async replace(plan) {
    if (!Array.isArray(plan) || plan.length > 15000)
      throw new Error("无效替换预览");
    const before = {},
      after = {};
    for (const entry of plan) {
      const buffer = await this.open(entry.path);
      if (buffer.text !== entry.before)
        throw new Error("预览后文稿已变化，请重新搜索");
      if (
        typeof entry.after !== "string" ||
        entry.after.length > 20 * 1024 * 1024
      )
        throw new Error("替换内容过长");
      before[entry.path] = buffer.text;
      after[entry.path] = entry.after;
    }
    for (const [file, text] of Object.entries(after)) {
      this.buffers.get(file).text = text;
      this.emit({
        type: "editor",
        message: { type: "replaceDocument", path: file, text },
      });
    }
    if (plan.length) {
      this.record(before, after, "replace");
      this.revision++;
      this.pdfStale = true;
      this.scheduleRecovery();
      this.scheduleIndex();
      this.scheduleSave();
    }
    this.publish();
  }
  async compile() {
    this.saveTicket = (this.saveTicket || 0) + 1;
    clearTimeout(this.saveTimer);
    if (this.running || this.startingBuild) {
      this.pendingBuild = true;
      return;
    }
    this.startingBuild = true;
    try {
      await this.save();
    } catch (error) {
      this.startingBuild = false;
      this.pendingBuild = false;
      throw error;
    }
    this.startingBuild = false;
    if (this.closed || this.paused) {
      this.pendingBuild = false;
      return;
    }
    const revision = this.revision;
    this.running = true;
    this.pendingBuild = false;
    this.log = "";
    this.controller = new AbortController();
    this.emit({ type: "buildStart" });
    this.publish();
    const output = (text) => {
      this.log = (this.log + text).slice(-2 * 1024 * 1024);
      this.emit({ type: "buildLog", text });
    };
    try {
      const result = await compileProject(
        this,
        this.store.settings,
        output,
        this.controller.signal,
      );
      this.pdfData = result.data;
      this.pdfFile = result.file;
      this.pdfCopyWarning="";
      try {
        const paths=await this.buildPaths();
        const relative=path.relative(this.project.path,path.join(path.dirname(paths.main),path.basename(paths.main,path.extname(paths.main))+".pdf")).split(path.sep).join("/");
        const destination=await resolveInside(this.project.path,relative,{missing:true});
        if (destination!==result.file) await atomicWrite(destination,result.data);
        output("\nPDF 已同步到主 TeX 文件所在目录："+relative+"\n");
      } catch(error) { this.pdfCopyWarning="PDF 同步失败："+error.message;output("\n"+this.pdfCopyWarning+"（构建目录中的 PDF 已保留）\n"); }
      this.pdfStale = revision !== this.revision;
      await atomicWrite(path.join(this.directory, "preview.pdf"), result.data);
      this.emit({
        type: "pdf",
        data: new Uint8Array(result.data),
        stale: this.pdfStale,
      });
      if (this.store.settings.cleanAfterBuild) {
        try {
          await cleanArtifacts(result.file, (await this.buildPaths()).cwd);
        } catch (error) {
          output("\n清理提示：" + error.message + "\n");
        }
      }
      this.emit({ type: "buildFinished", success: true });
      this.emit({
        type: "notice",
        message: this.pdfCopyWarning ? "编译成功，但"+this.pdfCopyWarning : this.pdfStale ? "编译成功，源码随后已有修改" : "编译成功",
      });
    } catch (error) {
      this.pdfStale = true;
      output("\n" + error.message + "\n");
      this.emit({ type: "buildFinished", success: false, rows: await buildDiagnostics(this).catch(() => []) });
      this.emit({ type: "notice", message: error.message, error: true });
    } finally {
      this.running = false;
      this.publish();
      if (this.pendingBuild && !this.closed && !this.paused) {
        this.pendingBuild = false;
        setTimeout(
          () =>
            this.compile().catch((e) =>
              this.emit({ type: "notice", message: e.message }),
            ),
          100,
        );
      }
    }
  }
  stop() {
    this.pendingBuild = false;
    this.controller?.abort();
  }
  async sync(args) {
    if (this.pdfStale || !this.pdfFile)
      throw new Error("请先成功编译最新源码再定位");
    const paths = await this.buildPaths();
    return syncQuery(this.store.settings.texBin, paths.cwd, args);
  }
  async forward(line) {
    if (!this.selected) throw new Error("请先打开源码");
    const source = await resolveInside(this.project.path, this.selected);
    const v = await this.sync([
      "view",
      "-i",
      `${Math.max(1, Number(line) || 1)}:1:${source}`,
      "-o",
      this.pdfFile,
    ]);
    if (!v.Page) throw new Error("未找到对应的 PDF 位置");
    return {
      page: Number(v.Page),
      x: Number(v.x ?? v.h),
      y: Number(v.y ?? v.v),
    };
  }
  async backward(page, x, y) {
    const v = await this.sync([
      "edit",
      "-o",
      `${page}:${x}:${y}:${this.pdfFile}`,
    ]);
    if (!v.Input || !v.Line) throw new Error("此处没有对应源码");
    const input = path.resolve((await this.buildPaths()).cwd, v.Input),
      relative = path
        .relative(this.project.path, input)
        .split(path.sep)
        .join("/");
    await resolveInside(this.project.path, relative);
    await this.open(relative);
    return this.document(relative, { line: Number(v.Line) });
  }
  async close() {
    this.pause();
    this.closed = true;
    clearInterval(this.watch);
    clearTimeout(this.recoveryTimer);
    clearTimeout(this.indexTimer);
    clearTimeout(this.positionTimer);
    this.stop();
    await this.queue.catch(() => {});
    await this.persistSession();
    await this.persistRecovery();
  }
}

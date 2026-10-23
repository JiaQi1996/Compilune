import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { aliasError, defaultNameConflicts, projectAlias } from "../../build/workbench/project-names.js";
import {
  readJSON,
  atomicWrite,
  scanFiles,
  validName,
  englishTemplate,
  resolveInside,
} from "./files.js";

async function projectPath(folder) {
  // Preserve canonical identity even if the last folder is temporarily missing.
  let candidate = path.resolve(folder);
  const suffix = [];
  while (true) {
    try { return path.join(await fs.realpath(candidate), ...suffix); }
    catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
      const parent = path.dirname(candidate);
      if (parent === candidate) return path.resolve(folder);
      suffix.unshift(path.basename(candidate));
      candidate = parent;
    }
  }
}

export const defaultBindings = [
  ["undo", "撤销", "Mod-z"],
  ["redo", "重做", "Mod-Shift-z"],
  ["bold", "加粗", "Mod-b"],
  ["italic", "斜体", "Mod-i"],
  ["underline", "下划线", "Mod-u"],
  ["find", "查找", "Mod-f"],
  ["replace", "替换", "Mod-h"],
  ["findNext", "下一处", "F3"],
  ["findPrevious", "上一处", "Shift-F3"],
  ["replaceNext", "替换当前", "Mod-Alt-Enter"],
  ["replaceAll", "全部替换", "Mod-Shift-Alt-Enter"],
  ["files", "快速打开", "Mod-p"],
  ["goto", "跳转行列", "Mod-g"],
  ["symbols", "章节跳转", "Mod-Shift-o"],
  ["definition", "跳到定义", "F12"],
  ["back", "返回", "Alt-ArrowLeft"],
  ["forward", "前进", "Alt-ArrowRight"],
  ["completion", "补全", "F5"],
  ["comment", "注释", "Mod-/"],
  ["section", "一级标题", "Mod-Alt-1"],
  ["subsection", "二级标题", "Mod-Alt-2"],
  ["subsubsection", "三级标题", "Mod-Alt-3"],
  ["ordered", "有序列表", "Mod-Shift-7"],
  ["list", "无序列表", "Mod-Shift-8"],
  ["math", "行内公式", "Mod-Shift-m"],
  ["displayMath", "独立公式", "Mod-Alt-Shift-m"],
  ["cite", "文献", "Mod-Shift-c"],
  ["pasteCitation", "插入剪贴板文献", "Mod-Shift-b"],
  ["ref", "交叉引用", "Mod-Shift-r"],
  ["image", "插入图片", "Mod-Shift-i"],
  ["table", "插入表格", "Mod-Alt-Shift-t"],
  ["link", "插入链接", "Mod-l"],
  ["forwardSync", "源码定位 PDF", "Mod-Shift-j"],
  ["palette", "命令面板", "Mod-Shift-p"],
  ["projectSearch", "项目搜索", "Mod-Shift-f"],
  ["fontUp", "增大代码字号", "Mod-="],
  ["fontDown", "减小代码字号", "Mod--"],
  ["fontReset", "重置代码字号", "Mod-0"],
  ["save", "保存", "Mod-s"],
  ["compile", "编译", "Mod-r"],
].map(([id, title, key]) => ({ id, title, key }));
const defaults = {
  theme: "system",
  uiSize: 13,
  codeSize: 13,
  autoSaveEnabled: true,
  autoSaveDelay: 1,
  compileAfterManualSave: false,
  compileAfterAutoSave: false,
  cleanAfterBuild: false,
  texBin: "",
  bindings: defaultBindings,
};
export class Store {
  constructor(directory) {
    this.directory = directory;
    this.projects = [];
    this.settings = structuredClone(defaults);
    this.queue = Promise.resolve();
    this.locationQueue = Promise.resolve();
  }
  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    this.projects = await readJSON(
      path.join(this.directory, "registry.json"),
      [],
    );
    if (!Array.isArray(this.projects)) throw new Error("项目库格式无效");
    for (const project of this.projects)
      if (!Object.hasOwn(project, "alias")) project.alias = projectAlias(project) || null;
    this.settings = {
      ...defaults,
      ...(await readJSON(path.join(this.directory, "settings.json"), {})),
    };
    const savedBindings = new Map((this.settings.bindings || []).map((row) => [row.id, row]));
    this.settings.bindings = defaultBindings.map((command) => ({ ...command, ...savedBindings.get(command.id) }));
    for (const key of ["uiSize", "codeSize"])
      this.settings[key] = Math.max(8, Math.min(30,
        Number(this.settings[key]) || defaults[key]));
    await fs.mkdir(path.join(this.directory, "Templates"), { recursive: true });
  }
  persist() {
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        await atomicWrite(
          path.join(this.directory, "registry.json"),
          JSON.stringify(this.projects, null, 2),
        );
        await atomicWrite(
          path.join(this.directory, "settings.json"),
          JSON.stringify(this.settings, null, 2),
        );
      });
    return this.queue;
  }
  changeLocation(operation) {
    const result = this.locationQueue.catch(() => {}).then(operation);
    this.locationQueue = result.catch(() => {});
    return result;
  }
  validateAlias(value, excluding = null) {
    const error = aliasError(this.projects, value, excluding);
    if (error) throw new Error(error);
    return value.trim();
  }
  nameConflicts(name, excluding = null) {
    return defaultNameConflicts(this.projects, name, excluding);
  }
  async projectAt(folder, excluding = null) {
    const real = await projectPath(folder);
    const target = await fs.stat(real, { bigint: true }).catch(() => null);
    for (const project of this.projects) {
      if (project.id === excluding) continue;
      const candidate = await projectPath(project.path);
      if (candidate === real) return project;
      const stat = await fs.stat(candidate, { bigint: true }).catch(() => null);
      if (target?.isDirectory() && stat?.isDirectory() && target.ino !== 0n && target.ino === stat.ino && target.dev === stat.dev)
        return project;
    }
    return null;
  }
  register(folder) {
    return this.changeLocation(async () => this.registerFolder(await fs.realpath(folder)));
  }
  async registerFolder(real) {
    if (!(await fs.stat(real)).isDirectory()) throw new Error("请选择项目文件夹");
    const existing = await this.projectAt(real);
    if (existing) {
      existing.archived = false;
      existing.opened = Date.now();
      existing.path = real;
      await this.persist();
      return existing;
    }
    const project = {
      id: crypto.randomUUID(),
      path: real,
      name: path.basename(real),
      alias: null,
      pinned: false,
      archived: false,
      opened: Date.now(),
      edited: Date.now(),
    };
    this.projects.unshift(project);
    await this.persist();
    return project;
  }
  create(parent, name, template, alias = "", allowSameName = false) {
    return this.changeLocation(() => this.createFolder(parent, name, template, alias, allowSameName));
  }
  async createFolder(parent, name, template, alias, allowSameName) {
    validName(name);
    alias = this.validateAlias(alias);
    const folder = path.join(parent, name);
    if (await this.projectAt(folder) || await fs.lstat(folder).then(() => true, (error) => { if (error.code === "ENOENT") return false; throw error; }))
      throw new Error(`此位置已有文件夹或项目，不能重复新建，也不会覆盖原文件。\n${folder}\n请打开已有项目，或选择不同名称、保存位置。`);
    if (!alias && !allowSameName && this.nameConflicts(name).length)
      throw new Error("不同位置存在同名项目，建议设置别名；请确认是否仍使用文件夹名称");
    await fs.mkdir(folder, { recursive: false });
    try {
      if (template) {
        validName(template);
        const source = path.join(this.directory, "Templates", template);
        await this.copyTemplate(source, folder);
      } else
        await fs.writeFile(path.join(folder, "main.tex"), englishTemplate, {
          flag: "wx",
        });
      const project = await this.registerFolder(await fs.realpath(folder));
      project.alias = alias || null;
      if (alias) project.name = alias;
      await this.persist();
      return project;
    } catch (error) {
      await fs.rm(folder, { recursive: true, force: true });
      throw error;
    }
  }
  setAlias(id, value, allowSameName = false) {
    return this.changeLocation(async () => {
      const project = this.projects.find((p) => p.id === id);
      if (!project) throw new Error("项目不存在");
      const alias = this.validateAlias(value, id);
      const name = path.basename(project.path);
      if (!alias && !allowSameName && this.nameConflicts(name, id).length)
        throw new Error("不同位置存在同名项目，建议保留或设置别名");
      project.alias = alias || null;
      project.name = alias || name;
      await this.persist();
      return project;
    });
  }
  relocate(id, folder, allowSameName = false) {
    return this.changeLocation(async () => {
      const project = this.projects.find((p) => p.id === id);
      if (!project) throw new Error("项目不存在");
      const real = await fs.realpath(folder);
      if (!(await fs.stat(real)).isDirectory()) throw new Error("请选择项目文件夹");
      if (await this.projectAt(real, id)) throw new Error("这个文件夹已在项目库中，请选择其他位置");
      if (!projectAlias(project)) {
        if (!allowSameName && this.nameConflicts(path.basename(real), id).length)
          throw new Error("不同位置存在同名项目，建议设置别名");
        project.name = path.basename(real);
      }
      project.path = real;
      await this.persist();
      return project;
    });
  }
  async templates() {
    const entries = await fs.readdir(path.join(this.directory, "Templates"), {
      withFileTypes: true,
    });
    return entries
      .filter((e) => e.isDirectory() && !e.isSymbolicLink())
      .map((e) => e.name);
  }
  async copyTemplate(source, target) {
    const real = await fs.realpath(source);
    const files = await scanFiles(real);
    if (!files.some((f) => !f.directory && f.path.endsWith(".tex")))
      throw new Error("模板中没有 TeX 文件");
    for (const file of files) {
      if (/\.(aux|log|toc|fls|fdb_latexmk|synctex\.gz)$/i.test(file.path))
        continue;
      const dest = path.join(target, file.path);
      if (file.directory) await fs.mkdir(dest, { recursive: true });
      else {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(await resolveInside(real, file.path), dest);
      }
    }
  }
  async importTemplate(source) {
    const name = validName(path.basename(source));
    const dest = path.join(this.directory, "Templates", name);
    await fs.mkdir(dest, { recursive: false });
    try {
      await this.copyTemplate(source, dest);
    } catch (error) {
      await fs.rm(dest, { force: true, recursive: true });
      throw error;
    }
    return this.templates();
  }
  async updateSettings(changes) {
    const next = { ...this.settings, ...changes };
    if (!["system", "light", "dark"].includes(next.theme))
      throw new Error("无效的主题");
    for (const [key, min, max] of [
      ["uiSize", 8, 30],
      ["codeSize", 8, 30],
      ["autoSaveDelay", 1, 30],
    ])
      if (!Number.isFinite(next[key]) || next[key] < min || next[key] > max)
        throw new Error("设置数值超出范围");
    if (typeof next.texBin !== "string") throw new Error("无效的工具路径");
    for (const key of [
      "autoSaveEnabled",
      "compileAfterManualSave",
      "compileAfterAutoSave",
      "cleanAfterBuild",
    ])
      if (typeof next[key] !== "boolean") throw new Error("无效的开关设置");
    const used = new Set(),
      base = new Map(defaultBindings.map((c) => [c.id, c]));
    if (!Array.isArray(next.bindings) || next.bindings.length !== base.size)
      throw new Error("快捷键列表不完整");
    next.bindings = next.bindings.map((row) => {
      if (!base.has(row.id) || typeof row.key !== "string")
        throw new Error("未知快捷键");
      const key = row.key.trim();
      if (
        key &&
        !/^(?:(?:Mod|Ctrl|Alt|Shift)-)*(?:[A-Za-z0-9/=.,;\-]|F(?:[1-9]|1[0-2])|Enter|ArrowLeft|ArrowRight)$/.test(
          key,
        )
      )
        throw new Error("快捷键格式无效：" + key);
      const normalized = key
        .toLowerCase()
        .replaceAll("ctrl-", "mod-")
        .split("-")
        .sort()
        .join("-");
      if (key && used.has(normalized)) throw new Error("快捷键重复：" + key);
      if (key) used.add(normalized);
      const command = base.get(row.id);
      base.delete(row.id);
      return { ...command, key };
    });
    this.settings = next;
    await this.persist();
    return next;
  }
}

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  readJSON,
  atomicWrite,
  scanFiles,
  validName,
  englishTemplate,
  resolveInside,
} from "./files.js";

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
  }
  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    this.projects = await readJSON(
      path.join(this.directory, "registry.json"),
      [],
    );
    if (!Array.isArray(this.projects)) throw new Error("项目库格式无效");
    this.settings = {
      ...defaults,
      ...(await readJSON(path.join(this.directory, "settings.json"), {})),
    };
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
  async register(folder) {
    const real = await fs.realpath(folder);
    const existing = this.projects.find((p) =>
      process.platform === "win32"
        ? p.path.toLowerCase() === real.toLowerCase()
        : p.path === real,
    );
    if (existing) {
      existing.archived = false;
      existing.opened = Date.now();
      await this.persist();
      return existing;
    }
    const project = {
      id: crypto.randomUUID(),
      path: real,
      name: path.basename(real),
      pinned: false,
      archived: false,
      opened: Date.now(),
      edited: Date.now(),
    };
    this.projects.unshift(project);
    await this.persist();
    return project;
  }
  async create(parent, name, template) {
    validName(name);
    const folder = path.join(parent, name);
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
      return await this.register(folder);
    } catch (error) {
      await fs.rm(folder, { recursive: true, force: true });
      throw error;
    }
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

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const textExtensions = new Set([
  ".tex",
  ".bib",
  ".cls",
  ".sty",
  ".txt",
  ".md",
  ".json",
  ".bst",
  ".cfg",
  ".def",
  ".ltx",
  ".tikz",
  ".csv",
]);
export const compareNames = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
}).compare;
export function within(root, target) {
  const rel = path.relative(root, target);
  return (
    rel === "" ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
}
export async function resolveInside(root, relative, { missing = false } = {}) {
  if (
    typeof relative !== "string" ||
    relative.includes("\0") ||
    relative.includes("\\") ||
    path.isAbsolute(relative) ||
    /^[a-z]:/i.test(relative) ||
    relative.split("/").includes("..")
  )
    throw new Error("无效的项目路径");
  const target = path.resolve(root, relative);
  if (!within(root, target)) throw new Error("路径必须在当前项目中");
  let check = target;
  while (true) {
    try {
      const real = await fs.realpath(check);
      if (!within(root, real)) throw new Error("符号链接指向项目以外的位置");
      break;
    } catch (error) {
      if (error.code !== "ENOENT" || !missing || check === root) throw error;
      check = path.dirname(check);
    }
  }
  return target;
}
export async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(
    path.dirname(file),
    ".folio-write-" + crypto.randomUUID(),
  );
  try {
    await fs.writeFile(temporary, data, { flag: "wx" });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}
export async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return structuredClone(fallback);
    throw new Error("无法读取 " + path.basename(file) + "：" + error.message);
  }
}
export async function readSource(file) {
  const info = await fs.stat(file);
  if (info.size > 20 * 1024 * 1024)
    throw new Error("文件超过 20 MB，请使用外部编辑器打开");
  const bytes = await fs.readFile(file);
  const bom = bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      bom ? bytes.subarray(3) : bytes,
    );
  } catch {
    throw new Error("文件不是 UTF-8，请先转换编码");
  }
  if (text.includes("\0")) throw new Error("此文件不是可编辑文本");
  return {
    text: text.replaceAll("\r\n", "\n"),
    disk: bytes.toString("base64"),
    crlf: text.includes("\r\n"),
    bom,
  };
}
export function serialize(buffer, text = buffer.text) {
  return Buffer.from(
    (buffer.bom ? "\uFEFF" : "") +
      (buffer.crlf ? text.replaceAll("\n", "\r\n") : text),
    "utf8",
  );
}
export async function scanFiles(root, excluded = "") {
  const result = [];
  async function visit(relative = "") {
    const entries = await fs.readdir(path.join(root, relative), {
      withFileTypes: true,
    });
    entries.sort(
      (a, b) =>
        Number(b.isDirectory()) - Number(a.isDirectory()) ||
        compareNames(a.name, b.name),
    );
    for (const entry of entries) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.isSymbolicLink()
      )
        continue;
      const rel = [relative, entry.name].filter(Boolean).join("/");
      if (excluded && (rel === excluded || rel.startsWith(excluded + "/")))
        continue;
      if (result.length >= 15000)
        throw new Error(
          "项目文件超过 15000 项，请将生成目录移出项目或配置输出目录",
        );
      if (entry.isDirectory()) {
        result.push({ path: rel, name: entry.name, directory: true });
        await visit(rel);
      } else if (entry.isFile())
        result.push({ path: rel, name: entry.name, directory: false });
    }
  }
  await visit();
  return result;
}
export function validName(name) {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name !== name.trim() ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(name) ||
    name.startsWith(".") ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw new Error("文件名无效，不能包含路径或 Windows 保留名称");
  return name;
}
export const englishTemplate = String.raw`\documentclass{article}
\usepackage{amsmath,graphicx,hyperref}
\title{Untitled Document}
\author{Your Name}
\date{\today}
\begin{document}
\maketitle
\section{Introduction}
Write your content here.
\end{document}
`;

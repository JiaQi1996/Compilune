import fs from "node:fs/promises";
import path from "node:path";
import { nativeImage } from "electron";
import { resolveInside } from "./files.js";
import { syncQuery } from "./compiler.js";
export async function referencePreview(ws, request) {
  const symbol = ws.symbols.find(s => s.kind === "ref" && s.path === request.path && s.label === request.label);
  if (!symbol?.preview || !["figure", "table"].includes(symbol.preview.kind)) throw Error("未找到可预览的图片或表格");
  if (ws.pdfStale || !ws.pdfFile) throw Error("源码有未编译修改，请先成功编译以生成准确预览");
  const revision = ws.revision, pdf = ws.pdfFile;
  const source = await resolveInside(ws.project.path, symbol.path), paths = await ws.buildPaths();
  const first = Number(symbol.preview.startLine) || symbol.line, last = Number(symbol.preview.endLine) || symbol.line;
  const sourceText = ws.buffers.get(symbol.path)?.text ?? (await fs.readFile(source, "utf8"));
  const sourceLines = sourceText.split("\n"), eligible = [];
  for (let line = first + 1; line < last; line++) {
    const value = (sourceLines[line - 1] || "").replace(/%.*$/, "").trim();
    if (!value || /^\\(?:centering|label\s*\{[^{}]*\}|begin\s*\{[^{}]*\}(?:\[[^\]]*\])?(?:\{[^{}]*\})?|end\s*\{[^{}]*\})\s*$/.test(value)) continue;
    eligible.push(line);
  }
  if (!eligible.length) eligible.push(symbol.line);
  const lines = new Set([eligible[0], eligible.at(-1)]);
  const step = Math.max(1, Math.ceil(eligible.length / 10));
  for (let i = 0; i < eligible.length; i += step) lines.add(eligible[i]);
  const locations = [];
  for (const line of [...lines].sort((a,b) => a-b).slice(0, 14)) {
    try {
      const result = await syncQuery(ws.store.settings.texBin, paths.cwd, ["view", "-i", `${line}:1:${source}`, "-o", pdf]);
      if (result.Page) locations.push(result);
    } catch {}
  }
  if (ws.closed || ws.revision !== revision || ws.pdfStale || pdf !== ws.pdfFile) throw Error("源码已变化，请重新编译后预览");
  if (!locations.length) throw Error("未找到 PDF 中的对应区域，请确认 SyncTeX 可用并重新编译");
  return { locations, note: "最近一次成功编译的 PDF" + (new Set(locations.map(l=>l.Page)).size > 1 ? " · 跨页内容仅显示首页" : "") };
}

export async function localImagePreview(ws, request) {
  const { file, sourcePath } = request;
  if (sourcePath !== ws.selected || typeof file !== "string" || !file || file.length > 4096) throw Error("图片路径无效");
  const root = ws.project.path, paths = await ws.buildPaths(false);
  const bases = request.label === "exact" ? [root] : [paths.cwd, path.dirname(await resolveInside(root, sourcePath)), root];
  const source = ws.buffers.get(sourcePath)?.text || "";
  for (const m of source.matchAll(/\\graphicspath\s*\{((?:\s*\{[^{}]*\}\s*)+)\}/g))
    for (const dir of m[1].matchAll(/\{([^{}]*)\}/g)) bases.push(path.resolve(paths.cwd, dir[1]));
  const names = path.extname(file) ? [file] : [file + ".pdf", file + ".png", file + ".jpg", file + ".jpeg"];
  for (const base of bases) for (const name of names) {
    try {
      const relative = path.relative(root, path.resolve(base, name)).split(path.sep).join("/");
      if (!ws.files.some(f => !f.directory && f.path === relative)) continue;
      const url = await resolveInside(root, relative), ext = path.extname(url).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".pdf", ".gif", ".webp", ".tiff", ".bmp"].includes(ext)) continue;
      if ((await fs.stat(url)).size > 20 * 1024 * 1024) throw Error("图片超过 20 MB");
      if (ext === ".pdf") return { pdf: new Uint8Array(await fs.readFile(url)), note: "本地 PDF · 第 1 页" };
      const image = nativeImage.createFromPath(url);
      if (image.isEmpty()) continue;
      const size = image.getSize(), scale = Math.min(1, 900 / Math.max(size.width, size.height));
      return { image: image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) }).toDataURL(), note: "本地图片 · 无需编译" };
    } catch {}
  }
  throw Error("未找到项目内可预览的图片（支持 PNG、JPEG、PDF 等，最大 20 MB）");
}

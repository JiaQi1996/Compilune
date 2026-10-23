import { createRequire } from "node:module";
import { readSource, resolveInside } from "./files.js";
const { parseBibTeX, citationPlan } = createRequire(import.meta.url)("../../build/Resources/Bibliography.cjs");

export function citationClipboard(workspace, text) {
  parseBibTeX(text);
  const files = workspace.files.filter((file) => !file.directory && /\.bib$/i.test(file.path)).map((file) => file.path);
  if (!files.length) throw new Error("项目中没有 .bib 文件，请先新建或导入文献文件");
  if (workspace.config.bibliographyFile && !files.includes(workspace.config.bibliographyFile))
    throw new Error("默认文献文件不存在，请在项目配置中重新选择");
  return { text, files, defaultFile: workspace.config.bibliographyFile || "" };
}

export async function insertClipboardCitation(workspace, request) {
  const ws = workspace, source = ws.buffers.get(request.path);
  if (ws.closed || ws.composing || ws.selected !== request.path || !/\.tex$/i.test(request.path) || source?.text !== request.text)
    throw new Error("请先在 TeX 文稿中定位插入位置，并完成当前输入");
  const info = citationClipboard(ws, request.clipboard);
  const target = info.defaultFile || request.bibliographyFile || (info.files.length === 1 ? info.files[0] : "");
  if (!info.files.includes(target)) throw new Error("请选择项目内的 .bib 文献文件");
  const keys = [];
  let bibBuffer, bibBefore;
  for (const file of info.files) {
    const disk = await readSource(await resolveInside(ws.project.path, file));
    const buffer = ws.buffers.get(file);
    if (buffer && buffer.disk !== disk.disk) throw new Error(file + " 已在外部修改，请先重新载入或另存修改内容");
    const current = buffer || disk;
    keys.push(...parseBibTeX(current.text, false).keys);
    if (file === target) { bibBuffer = current; bibBefore = current.text; }
  }
  const { from, to } = request;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > source.text.length)
    throw new Error("插入位置无效，未修改任何内容");
  const plan = citationPlan(request.clipboard, bibBefore, keys);
  if (ws.closed || ws.selected !== request.path || source.text !== request.text || (ws.buffers.has(target) && ws.buffers.get(target).text !== bibBefore))
    throw new Error("文稿已变化，请重新定位后插入，未修改任何内容");
  const before = { [request.path]: source.text, [target]: bibBefore };
  const after = { [request.path]: source.text.slice(0, from) + plan.citation + source.text.slice(to), [target]: plan.text };
  ws.buffers.set(target, bibBuffer);
  if (!ws.tabs.includes(target)) ws.tabs.push(target);
  ws.record(before, after, "pasteCitation");
  for (const [file, text] of Object.entries(after)) {
    ws.buffers.get(file).text = text;
    ws.emit({ type: "editor", message: { type: "replaceDocument", path: file, text } });
  }
  const cursor = from + plan.citation.length;
  ws.positions[request.path] = { anchor: cursor, head: cursor, scroll: request.scroll || 0 };
  ws.emit({ type: "editor", message: { type: "restorePosition", ...ws.positions[request.path], focus: true } });
  ws.revision++;
  ws.pdfStale = true;
  ws.scheduleRecovery(); ws.scheduleIndex(); ws.scheduleSave();
  ws.publish();
  return target;
}

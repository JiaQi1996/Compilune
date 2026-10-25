import { createRequire } from "node:module";
import { readSource, resolveInside } from "./files.js";
const { parseBibTeX, citationInfo, citationPlan } = createRequire(import.meta.url)("../../build/Resources/Bibliography.cjs");

async function bibliographySnapshot(workspace, files) {
  const snapshots = new Map(), keys = [];
  for (const file of files) {
    const disk = await readSource(await resolveInside(workspace.project.path, file));
    const buffer = workspace.buffers.get(file);
    if (buffer && buffer.disk !== disk.disk) throw new Error(file + " 已在外部修改，请先重新载入或另存修改内容");
    const current = buffer || disk;
    snapshots.set(file, { buffer: current, text: current.text, disk: disk.disk });
    keys.push(...parseBibTeX(current.text, false).keys);
  }
  return { snapshots, keys };
}

export async function citationClipboard(workspace, text) {
  parseBibTeX(text);
  const files = workspace.files.filter((file) => !file.directory && /\.bib$/i.test(file.path)).map((file) => file.path);
  if (!files.length) throw new Error("项目中没有 .bib 文件，请先新建或导入文献文件");
  const { keys } = await bibliographySnapshot(workspace, files);
  const info = citationInfo(text, keys);
  if (info.newKeys.length && workspace.config.bibliographyFile && !files.includes(workspace.config.bibliographyFile))
    throw new Error("默认文献文件不存在，请在项目配置中重新选择");
  return { text, files, defaultFile: workspace.config.bibliographyFile || "", ...info };
}

export async function insertClipboardCitation(workspace, request) {
  const ws = workspace, source = ws.buffers.get(request.path);
  if (ws.closed || ws.composing || ws.selected !== request.path || !/\.tex$/i.test(request.path) || source?.text !== request.text)
    throw new Error("请先在 TeX 文稿中定位插入位置，并完成当前输入");
  const info = await citationClipboard(ws, request.clipboard);
  const target = info.defaultFile || request.bibliographyFile || (info.files.length === 1 ? info.files[0] : "");
  const { snapshots, keys } = await bibliographySnapshot(ws, info.files);
  const currentInfo = citationInfo(request.clipboard, keys);
  const appending = currentInfo.newKeys.length > 0;
  if (appending && !info.files.includes(target)) throw new Error("请选择项目内的 .bib 文献文件");
  const bib = snapshots.get(target);
  const { from, to } = request;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > source.text.length)
    throw new Error("插入位置无效，未修改任何内容");
  const plan = citationPlan(request.clipboard, bib?.text || "", keys, request.confirmedExistingKeys || []);
  if (ws.closed || ws.selected !== request.path || ws.buffers.get(request.path)?.text !== request.text ||
      [...snapshots].some(([file, snapshot]) => {
        const buffer = ws.buffers.get(file);
        return buffer && (buffer.text !== snapshot.text || buffer.disk !== snapshot.disk);
      }))
    throw new Error("文稿已变化，请重新定位后插入，未修改任何内容");
  const before = { [request.path]: request.text };
  const after = { [request.path]: request.text.slice(0, from) + plan.citation + request.text.slice(to) };
  if (appending) {
    before[target] = bib.text;
    after[target] = plan.text;
    ws.buffers.set(target, bib.buffer);
    if (!ws.tabs.includes(target)) ws.tabs.push(target);
  }
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
  return { file: appending ? target : null, existingKeys: plan.existingKeys, newKeys: plan.newKeys };
}

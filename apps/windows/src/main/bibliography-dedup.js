import { randomUUID } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { readSource, resolveInside } from "./files.js";
const { bibliographyDuplicates, deduplicateBibliography } = createRequire(import.meta.url)("../../build/Resources/Bibliography.cjs");
const eligible = file => !file.directory && /\.(bib|tex|ltx|sty|cls)$/i.test(file.path);
async function snapshot(ws) {
  await ws.refreshFiles();
  const entries = new Map();
  for (const file of ws.files.filter(eligible).sort((a,b)=>a.path.localeCompare(b.path))) {
    const disk = await readSource(await resolveInside(ws.project.path,file.path));
    const buffer=ws.buffers.get(file.path);
    if (buffer && buffer.disk!==disk.disk) throw Error(file.path+" 已在外部修改，请先处理冲突");
    entries.set(file.path,{buffer:buffer || disk,disk:disk.disk,text:buffer?.text ?? disk.text});
  }
  return entries;
}
export async function previewBibliographyDuplicates(ws) {
  if (ws.composing) throw Error("请先完成当前输入，再检查文献");
  const entries=await snapshot(ws);
  const documents=[...entries].map(([path,entry])=>({path,text:entry.text}));
  const report=bibliographyDuplicates(documents);
  const token=randomUUID();
  ws.bibliographyDedup={token,entries,revision:ws.revision};
  return {token,...report};
}
export async function applyBibliographyDuplicates(ws,request) {
  const preview=ws.bibliographyDedup;
  if (!preview || request.token!==preview.token || ws.closed || ws.composing || ws.revision!==preview.revision)
    throw Error("文稿或文献已变化，请重新检查");
  const current=await snapshot(ws);
  if (current.size!==preview.entries.size || [...preview.entries].some(([path,entry])=>current.get(path)?.text!==entry.text || current.get(path)?.disk!==entry.disk))
    throw Error("预览后项目文件已变化，请重新检查，未修改任何文件");
  const result=deduplicateBibliography([...current].map(([path,entry])=>({path,text:entry.text})),request.choices);
  if (ws.closed || ws.revision!==preview.revision) throw Error("文稿已变化，请重新检查");
  const before={},after={};
  for (const plan of result.plans) {
    before[plan.path]=plan.before;after[plan.path]=plan.after;
    ws.buffers.set(plan.path,current.get(plan.path).buffer);
    if (!ws.tabs.includes(plan.path)) ws.tabs.push(plan.path);
  }
  if (result.plans.length) {
    ws.record(before,after,"deduplicateBibliography");
    for (const [path,text] of Object.entries(after)) {
      ws.buffers.get(path).text=text;
      ws.emit({type:"editor",message:{type:"replaceDocument",path,text}});
    }
    ws.revision++;ws.pdfStale=true;
    ws.scheduleRecovery();ws.scheduleIndex();ws.scheduleSave();ws.publish();
  }
  ws.bibliographyDedup=null;
  return {groups:result.groups,removed:result.removed,files:result.plans.length};
}

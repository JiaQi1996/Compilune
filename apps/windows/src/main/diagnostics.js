import path from "node:path";
import { createRequire } from "node:module";
import { resolveInside } from "./files.js";
const { parseBuildLog } = createRequire(import.meta.url)("../../build/Resources/Bibliography.cjs");
export async function buildDiagnostics(ws) {
  const cwd = (await ws.buildPaths(false)).cwd;
  const rows = parseBuildLog(ws.log).rows;
  for (const row of rows) {
    if (!row.line || row.line < 1) continue;
    const name = row.file || ws.config.root;
    const candidates = [path.relative(ws.project.path, path.resolve(cwd, name)), name];
    const sameNames = ws.files.filter(f => !f.directory && path.basename(f.path) === path.basename(name));
    if (!/[\\/]/.test(name) && sameNames.length === 1) candidates.push(sameNames[0].path);
    for (const candidate of candidates) {
      const normalized = candidate.split(path.sep).join("/");
      if (!ws.files.some(f => !f.directory && f.path === normalized)) continue;
      try { await resolveInside(ws.project.path, normalized); row.path = normalized; break; } catch {}
    }
  }
  return rows;
}

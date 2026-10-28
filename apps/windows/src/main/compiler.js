import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { within } from "./files.js";
import { selectPerl, perlEnvironment, privatePerl } from "./perl-runtime.js";

const windows = process.platform === "win32";
const executable = (name) => name + (windows ? ".exe" : "");
const engines = {
  pdfLaTeX: ["pdflatex", "-pdf"],
  XeLaTeX: ["xelatex", "-xelatex"],
  LuaLaTeX: ["lualatex", "-lualatex"],
};
async function isMiKTeX(bin) {
  if (!windows) return false;
  try { return (await fs.stat(path.join(bin, "miktex.exe"))).isFile(); }
  catch { return false; }
}
async function toolEnvironment(bin) {
  const env = { ...process.env };
  const paths = [bin, env.PATH || env.Path || ""];
  if (windows) {
    // An editor opened before a toolchain installation has an outdated PATH.
    const reg = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "reg.exe");
    for (const key of ["HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", "HKCU\\Environment"]) {
      try {
        const result = await runTool(reg, ["query", key, "/v", "Path"]);
        const value = result.text.match(/\bREG_(?:EXPAND_)?SZ\s+(.+)/i)?.[1];
        if (value) paths.push(value.replace(/%([^%]+)%/g, (original, name) => {
          const found = Object.keys(env).find(k => k.toLowerCase() === name.toLowerCase());
          return found ? env[found] : original;
        }));
      } catch {}
    }
  }
  for (const key of Object.keys(env))
    if (key.toLowerCase() === "path") delete env[key];
  env[windows ? "Path" : "PATH"] = paths.filter(Boolean).join(path.delimiter);
  return env;
}
async function perlDetails(bin, env) {
  const runtime = await selectPerl(bin, env);
  const bundled = await privatePerl();
  try {
    if (!runtime.executable) throw new Error("未找到解释器");
    const result = await runTool(runtime.executable,
      ["-MFile::Path", "-MFile::Temp", "-MCwd", "-MDigest::MD5", "-MUnicode::Normalize", "-MEncode", "-MFile::Glob", "-MList::Util", "-e", "print $^V"],
      { env: perlEnvironment(env, runtime), timeout: 5000 });
    if (result.code !== 0) throw new Error(result.text.trim() || "运行失败");
    return { ...runtime, version: result.text.trim(), available: true, bundledVersion: bundled?.version || null };
  } catch (error) {
    return { ...runtime, available: false, error: error.message, bundledVersion: bundled?.version || null };
  }
}
export function runTool(
  tool,
  args,
  { cwd, env, timeout = 5000, onData = () => {}, signal } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, {
      cwd,
      env,
      windowsHide: true,
      shell: false,
      detached: !windows,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let text = "",
      settled = false,
      timer,
      killTimer,
      aborted = false;
    const terminate = () => {
      aborted = true;
      if (!child.pid) return;
      if (windows) {
        const killer = spawn(
          path.join(
            process.env.SystemRoot || "C:\\Windows",
            "System32",
            "taskkill.exe",
          ),
          ["/PID", String(child.pid), "/T", "/F"],
          { windowsHide: true, shell: false },
        );
        killer.on("error", () => child.kill());
      } else {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {}
        killTimer = setTimeout(() => {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {}
        }, 1000);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", terminate);
    };
    const data = (chunk) => {
      const value = chunk.toString("utf8");
      text = (text + value).slice(-2 * 1024 * 1024);
      onData(value);
    };
    // Decode each stream incrementally so chunk boundaries cannot corrupt
    // Unicode project paths used by diagnostic source links.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", data);
    child.stderr.on("data", data);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (aborted) reject(new Error("编译已停止或运行超时"));
      else resolve({ code, text });
    });
    signal?.addEventListener("abort", terminate, { once: true });
    if (signal?.aborted) terminate();
    timer = setTimeout(terminate, timeout);
  });
}
export async function findToolchain(configured = "") {
  const candidates = [configured];
  if (windows) {
    for (const root of [
      path.join(process.env.SystemDrive || "C:", "texlive"),
      path.join(process.env.USERPROFILE || "", "texlive"),
    ]) {
      try {
        const years = (await fs.readdir(root)).sort((a, b) =>
          b.localeCompare(a, undefined, { numeric: true }),
        );
        for (const year of years) {
          candidates.push(
            path.join(root, year, "bin", "windows"),
            path.join(root, year, "bin", "win32"),
          );
        }
      } catch {}
    }
    const miktexRoots = [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "MiKTeX"),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, "MiKTeX"),
      process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "MiKTeX"),
    ].filter(Boolean);
    for (const root of miktexRoots)
      for (const arch of ["arm64", "x64"])
        candidates.push(path.join(root, "miktex", "bin", arch));
  } else candidates.push("/Library/TeX/texbin", "/usr/local/bin", "/usr/bin");
  candidates.push(
    ...(process.env.PATH || process.env.Path || "").split(path.delimiter),
  );
  const tools = ["latexmk", "pdflatex", "xelatex", "lualatex", "synctex"];
  const results = [];
  for (const folder of [...new Set(candidates.filter(Boolean))]) {
    const found = [];
    for (const name of tools)
      try {
        if ((await fs.stat(path.join(folder, executable(name)))).isFile())
          found.push(name);
      } catch {}
    if (found.some((t) => t.endsWith("latex")))
      results.push({ folder, tools: found, score: found.length });
  }
  results.sort((a, b) => b.score - a.score);
  const selected =
    results.find((r) => r.folder === configured && r.score >= 4) || results[0];
  const versions = {};
  const miktex = selected && await isMiKTeX(selected.folder);
  const baseEnv = await toolEnvironment(selected?.folder || configured);
  const perl = windows ? await perlDetails(selected?.folder || configured, baseEnv) : null;
  const env = perl ? perlEnvironment(baseEnv, perl) : baseEnv;
  if (selected)
    await Promise.all(
      selected.tools.map(async (name) => {
        try {
          const result = await runTool(
            path.join(selected.folder, executable(name)),
            name === "synctex" ? ["help"] : [...(miktex ? ["--miktex-disable-installer"] : []), "--version"],
            { timeout: 3000, env },
          );
          versions[name] = result.code === 0
            ? (name === "latexmk" ? result.text.split(/\r?\n/).find(line => /^Latexmk|Version/i.test(line)) : null) || result.text.split(/\r?\n/).find(Boolean) || "可用"
            : "存在，但尚不可运行；请检查依赖与 MiKTeX 初始化";
        } catch {
          versions[name] = "存在，版本检测失败";
        }
      }),
    );
  return {
    folder: selected?.folder || configured,
    tools: versions,
    locations: results,
    perl,
  };
}
export async function compileProject(workspace, settings, notify, signal) {
  const spec = engines[workspace.config.engine];
  if (!spec) throw new Error("请选择有效的编译引擎");
  if (!workspace.config.root)
    throw new Error("请先在项目配置中选择主 TeX 文件");
  const paths = await workspace.buildPaths();
  await fs.mkdir(paths.output, { recursive: true });
  const bin = settings.texBin;
  const tool = path.join(bin, executable("latexmk"));
  await fs.access(tool);
  await fs.access(path.join(bin, executable(spec[0])));
  const baseEnv = await toolEnvironment(bin);
  const perl = windows ? await perlDetails(bin, baseEnv) : null;
  const env = perl ? perlEnvironment(baseEnv, perl) : baseEnv;
  const miktex = await isMiKTeX(bin);
  if (miktex) {
    if (!perl.available)
      throw new Error("Perl 运行时不可用，请重新安装完整的 Compilune 安装包，或选择可用的 TeX Live 环境。" + (perl.error ? " " + perl.error : "") + " 保留上次成功 PDF。");
    notify(`Perl：${perl.label} ${perl.version}（${perl.architecture}）\n`);
    notify("MiKTeX：首次编译可能需要联网下载缺失宏包，请稍候。\n");
  }
  const args = [
    ...(miktex ? ["--miktex-enable-installer"] : []),
    "-norc",
    spec[1],
    `-${spec[0]}=${spec[0]} ${miktex ? "--miktex-enable-installer " : ""}${workspace.config.shellEscape ? "-shell-escape" : "-no-shell-escape"} %O %S`,
    "-synctex=1",
    "-interaction=nonstopmode",
    "-file-line-error",
    "-halt-on-error",
    "-recorder",
    "-outdir=" + paths.output,
  ];
  if (paths.rc) args.push("-r", paths.rc);
  args.push(paths.main);
  notify(`工作目录：${paths.cwd}\n引擎：${workspace.config.engine}\n`);
  const result = await runTool(tool, args, {
    cwd: paths.cwd,
    env,
    timeout: miktex ? 600000 : 120000,
    onData: notify,
    signal,
  });
  if (result.code !== 0)
    throw new Error("编译失败，请查看日志；保留上次成功 PDF");
  const pdf = path.join(
    paths.output,
    path.basename(paths.main, path.extname(paths.main)) + ".pdf",
  );
  const data = await fs.readFile(pdf);
  if (data.subarray(0, 4).toString() !== "%PDF")
    throw new Error("编译未生成有效 PDF");
  return { file: pdf, data };
}
const aux = [
  "aux",
  "log",
  "toc",
  "out",
  "lof",
  "lot",
  "fls",
  "fdb_latexmk",
  "bcf",
  "bbl",
  "blg",
  "run.xml",
  "nav",
  "snm",
  "vrb",
  "xdv",
  "dvi",
];
export async function cleanArtifacts(pdf, cwd) {
  const output = await fs.realpath(path.dirname(pdf)),
    stem = pdf.slice(0, -4),
    candidates = new Set(aux.map((ext) => stem + "." + ext));
  try {
    const fls = await fs.readFile(stem + ".fls", "utf8");
    for (const line of fls.split(/\r?\n/)) {
      if (!line.startsWith("OUTPUT ")) continue;
      const target = path.resolve(cwd, line.slice(7));
      if (
        within(output, target) &&
        aux.some((ext) => target.endsWith("." + ext))
      )
        candidates.add(target);
    }
  } catch {}
  for (const file of candidates)
    try {
      const info = await fs.lstat(file);
      if (
        !info.isSymbolicLink() &&
        info.isFile() &&
        within(output, await fs.realpath(file))
      )
        await fs.unlink(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
}
export async function syncQuery(bin, cwd, args) {
  const result = await runTool(path.join(bin, executable("synctex")), args, {
    cwd,
    timeout: 5000,
  });
  if (result.code !== 0) throw new Error("SyncTeX 定位失败");
  const values = {};
  for (const line of result.text.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0 && values[line.slice(0, i)] === undefined)
      values[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return values;
}

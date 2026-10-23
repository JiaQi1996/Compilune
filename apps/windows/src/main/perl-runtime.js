import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export async function privatePerl() {
  const roots = [
    process.resourcesPath && path.join(process.resourcesPath, "runtimes/perl"),
    path.join(repository, ".build/runtimes/windows-x64/perl"),
  ].filter(Boolean);
  for (const directory of roots) {
    try {
      const metadata = JSON.parse((await fs.readFile(path.join(directory, "runtime.json"), "utf8")).replace(/^\uFEFF/, ""));
      const executable = path.join(directory, "bin/perl.exe");
      if (metadata.platform === "win32" && metadata.architecture === "x64" && (await fs.stat(executable)).isFile())
        return { executable, directory, version: metadata.version, architecture: metadata.architecture };
    } catch {}
  }
  return null;
}

export async function selectPerl(texBin, env) {
  // TeX Live's wrappers deliberately locate their own Perl outside global PATH.
  const texLive = path.resolve(texBin || ".", "../../tlpkg/tlperl/bin/perl.exe");
  try {
    if ((await fs.stat(texLive)).isFile())
      return { source: "texlive", executable: texLive, label: "TeX Live 自带 Perl", architecture: "由 TeX Live 管理" };
  } catch {}
  const bundled = await privatePerl();
  if (bundled)
    return { ...bundled, source: "private", label: "Compilune 内置 Perl" };
  for (const folder of (env.Path || env.PATH || "").split(path.delimiter).filter(Boolean)) {
    try {
      const executable = path.join(folder, "perl.exe");
      if ((await fs.stat(executable)).isFile())
        return { source: "system", executable, label: "系统 Perl", architecture: "由系统管理" };
    } catch {}
  }
  return { source: "missing", label: "未检测到 Perl", executable: "", architecture: "" };
}

export function perlEnvironment(env, runtime) {
  if (runtime.source !== "private") return env;
  const result = { ...env };
  for (const key of Object.keys(result))
    if (["path", "perl5lib", "perllib", "perl5opt", "perl5shell", "perl_local_lib_root", "perl_mb_opt", "perl_mm_opt"].includes(key.toLowerCase())) delete result[key];
  // Only child processes receive this PATH. Never write registry/system settings.
  result.Path = path.dirname(runtime.executable) + path.delimiter + (env.Path || env.PATH || "");
  return result;
}

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  repo = path.resolve(root, "../..");
const run = (file, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("构建失败：" + code)),
    );
  });
await fs.copyFile(path.join(repo, "assets/AppIcon.png"), path.join(root, "assets/AppIcon.png"));
await run(
  process.execPath,
  [path.join(repo, "packages/design/build.mjs")],
  repo,
);
await fs.cp(
  path.join(repo, "packages/workbench"),
  path.join(root, "build/workbench"),
  { recursive: true, filter: (source) => !source.endsWith(".md") },
);
await fs.mkdir(path.join(root, "build/Resources"), { recursive: true });
await run(
  process.execPath,
  [
    path.join(repo, "packages/editor/build.mjs"),
    "--outdir",
    path.join(root, "build/Resources"),
  ],
  repo,
);
const pdf = path.join(root, "node_modules/pdfjs-dist");
for (const folder of [
  "build",
  "web",
  "cmaps",
  "standard_fonts",
  "wasm",
  "iccs",
])
  await fs.cp(path.join(pdf, folder), path.join(root, "build/pdf", folder), {
    recursive: true,
    filter: (source) => !source.endsWith(".map"),
  });
const licenses = path.join(root, "build/Resources/Licenses");
await fs.copyFile(
  path.join(repo, "LICENSE"),
  path.join(licenses, "Compilune-MIT.txt"),
);
await fs.copyFile(
  path.join(pdf, "LICENSE"),
  path.join(licenses, "PDFjs-Apache-2.0.txt"),
);
// The builder consumes a plain license file for its installer page.
await fs.mkdir(path.join(root, "build/Licenses"), { recursive: true });
await fs.copyFile(
  path.join(repo, "LICENSE"),
  path.join(root, "build/Licenses/Compilune-MIT.txt"),
);
await fs.appendFile(path.join(licenses, "NOTICE.md"), "\n\nPrivate Perl 5.42.3 and its native libraries retain their original licenses. Runtime notices and source/provenance are in resources/runtimes/perl/Licenses and runtime.json. See docs/PERL_RUNTIME.md.\n");
console.log(
  "Windows resources ready. Runtime tools remain local; no CDN is used.",
);

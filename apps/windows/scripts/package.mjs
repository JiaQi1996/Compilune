import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distribution = path.resolve(root, "../../dist");
const requested = process.argv[2] || "all";
if (!["all", "arm64", "x64"].includes(requested))
  throw new Error("Architecture must be arm64, x64, or all");
const pkg = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const releaseVersion = (
  await fs.readFile(path.resolve(root, "../../VERSION"), "utf8")
).trim();
if (pkg.version !== releaseVersion)
  throw new Error(
    `Version mismatch: Windows package is ${pkg.version}, VERSION is ${releaseVersion}. Update both before packaging.`,
  );
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: "false",
        // The legacy NSIS decoder cannot extract newer ARM64 PE filters.
        // Pin a reversible filter supported by that decoder for both targets.
        ELECTRON_BUILDER_7Z_FILTER: "BCJ",
      },
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("Packaging failed: " + code)),
    );
  });
execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.resolve(root, "../../scripts/prepare-perl-windows.ps1")], { stdio: "inherit", windowsHide: true });
await run([path.join(root, "scripts/build.mjs")]);
await fs.mkdir(distribution, { recursive: true });
for (const arch of requested === "all" ? ["arm64", "x64"] : [requested]) {
  const output = path.join(root, ".build", "package-" + arch);
  await run([
    path.join(root, "node_modules/electron-builder/cli.js"),
    "--win",
    "nsis",
    "--" + arch,
    "--publish",
    "never",
    "--config.directories.output=" + output,
    ...(process.env.FOLIO_ELECTRON_DIST
      ? ["--config.electronDist=" + path.resolve(process.env.FOLIO_ELECTRON_DIST)]
      : []),
  ]);
  const name = `Compilune-${pkg.version}-windows-${arch}-setup.exe`,
    installer = path.join(distribution, name);
  await fs.copyFile(path.join(output, name), installer);
  const hash = crypto
    .createHash("sha256")
    .update(await fs.readFile(installer))
    .digest("hex");
  await fs.writeFile(
    installer.replace(/\.exe$/, ".sha256"),
    hash + "  " + name + "\n",
  );
  console.log("Packaged " + installer);
}

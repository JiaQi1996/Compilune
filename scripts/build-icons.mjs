import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "assets/AppIcon.svg");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "compilune-icons-"));
try {
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const images = new Map();
  for (const size of sizes) {
    const output = path.join(temporary, `${size}.png`);
    execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", output, source]);
    images.set(size, await fs.readFile(output));
  }
  await fs.writeFile(path.join(root, "assets/AppIcon.png"), images.get(1024));
  await fs.writeFile(path.join(root, "apps/windows/assets/AppIcon.png"), images.get(1024));
  const entries = sizes.filter(size => size <= 256);
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach((size, index) => {
    const start = 6 + index * 16;
    header[start] = header[start + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, start + 4);
    header.writeUInt16LE(32, start + 6);
    header.writeUInt32LE(images.get(size).length, start + 8);
    header.writeUInt32LE(offset, start + 12);
    offset += images.get(size).length;
  });
  await fs.writeFile(path.join(root, "apps/windows/assets/AppIcon.ico"), Buffer.concat([header, ...entries.map(size => images.get(size))]));
  const chunks = [["icp4",16],["icp5",32],["icp6",64],["ic07",128],["ic08",256],["ic09",512],["ic10",1024],["ic11",32],["ic12",64],["ic13",256],["ic14",512]].map(([type,size]) => {
    const data = images.get(size), header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });
  const icns = Buffer.alloc(8);
  icns.write("icns");
  icns.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  await fs.writeFile(path.join(root, "apps/macos/Sources/Compilune/Resources/AppIcon.icns"), Buffer.concat([icns, ...chunks]));
  console.log("Compilune icons generated from assets/AppIcon.svg");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

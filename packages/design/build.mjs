import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const directory = path.dirname(fileURLToPath(import.meta.url)),
  repo = path.resolve(directory, "../..");
const tokens = JSON.parse(
  await fs.readFile(path.join(directory, "tokens.json"), "utf8"),
);
const vars = (theme) =>
  Object.entries(theme)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");
const css = `/* Generated from packages/design/tokens.json. */
:root {
  color-scheme: light;
${vars(tokens.light)}
  --shadow: 0 14px 44px #253a2912;
  --ui-size: 13px;
  --sidebar-width: ${tokens.layout.fileSidebar}px;
  --library-sidebar-width: ${tokens.layout.librarySidebar}px;
  --preview-width: 44%;
  --tree-indent: ${tokens.layout.treeIndent}px;
  --row-height: ${tokens.layout.rowHeight}px;
  --control-radius: ${tokens.layout.controlRadius}px;
  --dialog-radius: ${tokens.layout.dialogRadius}px;
}
:root[data-theme="dark"] {
  color-scheme: dark;
${vars(tokens.dark)}
  --shadow: 0 16px 48px #0003;
}
`;
await fs.writeFile(path.join(repo, "packages/workbench/design.css"), css);
const swiftRoot = path.join(repo, "apps/macos/Sources/Compilune");
try {
  await fs.access(swiftRoot);
  const color = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return `NSColor(srgbRed: ${((n >> 16) & 255) / 255}, green: ${((n >> 8) & 255) / 255}, blue: ${(n & 255) / 255}, alpha: 1)`;
  };
  const swift = `// Generated from packages/design/tokens.json.\nimport AppKit\nimport SwiftUI\n\nenum CompiluneDesign {\n    static let accent = Color(nsColor: NSColor(name: nil) { appearance in\n        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua\n            ? ${color(tokens.dark.accent)}\n            : ${color(tokens.light.accent)}\n    })\n}\n`;
  await fs.writeFile(path.join(swiftRoot, "CompiluneDesign.swift"), swift);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
console.log("Shared design tokens generated.");

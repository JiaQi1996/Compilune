# Shared design / 公共设计

`tokens.json` is the source for light/dark semantic colors and common layout dimensions. Generate the web CSS and native macOS accent with:

```sh
node packages/design/build.mjs
```

The generated files are `packages/workbench/design.css` and `apps/macos/Sources/Compilune/CompiluneDesign.swift`. Windows resource builds run this automatically. Commit generated changes alongside the tokens.

macOS retains its native SwiftUI shell; currently only the accent consumes this generated Swift adapter. The other native surfaces still use their existing system colors. Sharing tokens does not mean every native view has already been migrated or that platforms render pixel identically. Follow the [interface contract](../../docs/INTERFACE.md) when changing either implementation.

`tokens.json` 统一维护浅色/深色语义色、侧栏宽度、树缩进和圆角。运行上面的命令生成网页 CSS 与 macOS 原生强调色。macOS 继续使用原生界面，目前仅强调色接入生成器，其余原生表面保留现有系统颜色；后续变更需遵守[界面交互规范](../../docs/INTERFACE.md)。

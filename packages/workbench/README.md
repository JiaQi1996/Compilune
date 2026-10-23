# Shared workbench / 公共工作区

This package owns the web project library, workbench layout, settings, file/outline trees, tabs, dialogs, PDF controls and icons. Windows consumes it today. Linux may reuse it through an appropriate host adapter; Linux and HarmonyOS applications are not implemented.

- `index.html`, `styles.css`, `app.js`: interface and interaction.
- `design.css`: generated from `packages/design/tokens.json`.
- `pdf.js`: local PDF.js viewer and source-mapping coordinates.
- `icons.js`: SVG UI icons and escaping helpers.

The host must expose `window.folioHost.request(action, payload)` and `onEvent(callback)`. Replies use `{ok, value}` or `{ok:false, error}`. See `apps/windows/src/main/main.js` and `preload.cjs` for the implemented contract. File/process access stays in the host; the renderer has no Node.js access. Editor documents live in a local iframe with a narrow parent-message transport.

Windows builds copy this directory into ignored `apps/windows/build/workbench/`; edit this source rather than its generated copy. The existing macOS SwiftUI shell follows the same [interface contract](../../docs/INTERFACE.md), while sharing the editor and design adapter.

这里维护公共项目库、工作区、设置、文件树/大纲、选项卡、对话框及 PDF 控件。目前 Windows 已使用，Linux/HarmonyOS 尚未实现。文件和进程操作由宿主提供；网页端不直接访问 Node.js。macOS 保留原生外壳，共用编辑器和设计参数，按同一份交互规范演进。

# Interface contract / 跨平台界面与交互规范

The existing macOS application is the product baseline. Keep the information hierarchy, action placement, defaults and outcomes consistent across ports. Use platform conventions for system windows, dialogs, keyboard modifiers and fonts. Native rendering can differ slightly; a platform port must not silently invent a different workflow.

## Shared structure

| Area | Required behavior |
| --- | --- |
| Startup | Open the project library. Left navigation: all, recent, pinned, archived. Application icon at top left; project search, create/open, sorting and grid/list controls. PDF cover cards include a pin action. |
| Library/project switching | Show one project or the library at a time. Opening a project closes the library. Returning to the library closes the project after flushing edits and offering Save/Discard/Cancel when dirty; Cancel retains the current project. Switching projects follows the same rule. |
| Workspace | Full-width top toolbar: return to library, project/status, configuration/engine, compile/stop, panel controls and PDF export. File navigation on the left, editor in the center, PDF on the right, status below. |
| File navigation | Left-aligned Files/Outline labels; no extra Navigation heading. Folder-first sorting, clear hierarchy indentation, root selection on blank area. Create folder/file/TeX/Bib and project-local drag moves. |
| Outline | Only `.tex` sections; nested tree, expanded by default. Clicking a heading opens the file and locates its line. `.cls`/`.sty` may inform completion but do not appear here. |
| Tabs | Active background encloses title and close button. Dirty marker, close action and tooltip. Preserve per-file selection/scroll positions during a session. |
| Editing | Shared CodeMirror 6, English built-in snippets, mirrored environment names and Enter to the body. Search, replace/all, quick open, line/definition navigation and command palette support shortcuts. |
| Optional controls | Formatting toolbar and PDF find bar start hidden. Formatting toggle has a button appearance. PDF double-click locates source through SyncTeX. |
| Settings | Appearance, separate interface/code sizes with 8–30 sliders, toolchain, saving, shortcuts and custom templates. Follow system appearance live. Disabled controls remain clearly distinguishable in both themes. |
| Saving | Autosave and manual-save/auto-save compilation are separate settings. Successful disk writes precede compilation. Closing a project/application offers Save/Discard/Cancel for remaining dirty buffers. |
| Compilation | Explicit compile changes to stop while running; retain the last successful PDF on failure. Stale PDF mapping requires rebuilding. Optional cleanup preserves PDF, SyncTeX and source. |
| Feedback | Every icon action has a tooltip and accessible name. Use consistent wording for operations, errors and empty states. English default document content on every platform. |

## Shared implementation

- `packages/editor/` owns editor behavior and static assets.
- `packages/design/tokens.json` owns web semantic colors and layout dimensions, and the native macOS accent adapter.
- `packages/workbench/` owns the reusable web interface, currently consumed by Windows. Future compatible desktop hosts should reuse it rather than copy it.
- `apps/<platform>/` owns files, native menus/dialogs, processes, permissions, system appearance and packaging.

Keep new actions in the same location on each platform. Match the current macOS product before making broader redesigns. Update this document when an intentional interaction difference is introduced.

## Platform differences and current scope

| Detail | macOS | Windows |
| --- | --- | --- |
| Shell / PDF | SwiftUI, AppKit, WKWebView / PDFKit | Electron, local web workbench / PDF.js |
| Primary modifier | Command (`⌘`) | Ctrl; never expose internal `Mod` notation in settings |
| Common actions | `⌘S`, `⌘R`, `⌘F` | `Ctrl+S`, `Ctrl+R`, `Ctrl+F` |
| Replace / definition | Existing Mac bindings | `Ctrl+H` / F12; editable editor bindings |
| Undo/redo | Native application history | Native application history; Ctrl+Z / Ctrl+Shift+Z fixed menu bindings |
| Tool installation | TeX Live/MacTeX download flow plus MiKTeX link | TeX Live/MiKTeX detection, official downloads and full/on-demand comparison; no in-app distribution installer yet |
| Windows/projects | Library and one native project window are mutually exclusive | One active project per instance; return to library or switch projects confirms dirty changes and closes the old workspace |

Consistency means the same product structure and outcomes. Current implementations are not pixel-identical and have not reached complete feature parity. Windows has no draggable native PDFKit viewer, and system dialogs/window buttons remain platform-specific. Validate light/dark themes, scaling, keyboard navigation, input methods and source/PDF mapping on actual target systems before release.

## 中文约定

以现有 macOS 版为基准，尽可能统一项目库、工作区、侧栏、选项卡、设置和保存/编译流程；新增功能应放在相同位置，并使用一致文案。公共界面与参数放在 `packages/`，平台目录负责系统能力。

允许的平台适配包括：macOS 用 ⌘、Windows 用 Ctrl；系统窗口按钮、文件选择框、字体和工具链安装方式按平台处理。不能因为移植就另外设计一套项目入口或保存流程。

当前 macOS 保留原生界面，Windows 使用公共网页工作区，因此尚非像素完全相同。两端统一为项目库与单个项目界面互斥：打开项目关闭项目库，返回项目库先确认未保存内容并关闭项目，取消则保留项目。Windows 提供 TeX Live 与 MiKTeX 的下载及特点说明，暂未实现应用内 TeX 发行版下载安装；不能宣称已经完全对齐。

## Imported templates / 已导入模板

Import copies the template into persistent application data rather than keeping a reference to the original folder. Deleting the original after a successful import does not break the stored template. Creating a project makes another independent copy; editing that project does not change the template. Keep required images, PDF figures, class/style and bibliography files inside the template folder. External references and symlinks are not imported.

Mac storage: `~/Library/Application Support/Compilune/Templates/`. Windows storage: `%APPDATA%/Compilune/Templates/`. Existing installations automatically retain their legacy application-data location. Application updates retain these folders; manually removing application data can remove templates.

## Toolchain choices / 工具链选择

Both platforms offer two choices with consistent explanations. TeX Live's recommended full scheme has a larger initial download and storage footprint; installed components work offline. TeX Live also supports smaller custom schemes. MiKTeX's basic installation starts smaller and can install missing packages on demand; downloading missing packages requires a connection, while already installed packages work offline. macOS uses MacTeX for the TeX Live full distribution. No fixed size is shown because release contents change.

See the official [TeX Live guide](https://www.tug.org/texlive/doc/texlive-en/texlive-en.pdf), [MiKTeX Windows installation](https://miktex.org/howto/install-miktex), and [MiKTeX package installation](https://miktex.org/kb/just-enough-tex).

两端展示完整安装与按需安装的区别，不写会随版本变化的固定体积；提示 MiKTeX 补充缺失宏包时需联网，已安装内容可离线使用。macOS 的 TeX Live 完整版入口对应 MacTeX。

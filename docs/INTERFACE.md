# Interface contract / 跨平台界面与交互规范

The existing macOS application is the product baseline. Keep the information hierarchy, action placement, defaults and outcomes consistent across ports. Use platform conventions for system windows, dialogs, keyboard modifiers and fonts. Native rendering can differ slightly; a platform port must not silently invent a different workflow.

## Shared structure

| Area | Required behavior |
| --- | --- |
| Startup | Open the project library. Left navigation: all, recent, pinned, archived. Application icon at top left; project search, create/open, sorting and grid/list controls. PDF cover cards include a pin action. |
| Library/project switching | Show one project or the library at a time. Opening a project closes the library. Returning to the library closes the project after flushing edits and offering Save/Discard/Cancel when dirty; Cancel retains the current project. Switching projects follows the same rule. |
| Workspace | Full-width top toolbar: return to library, project/status, configuration/engine, compile/stop, panel controls and PDF export. File navigation on the left, editor in the center, PDF on the right, status below. |
| File navigation | Left-aligned Files/Outline labels; no extra Navigation heading. The file tree starts fully collapsed. Folder-first sorting, clear hierarchy indentation, root selection on blank area. Create folder/file/TeX/Bib and project-local drag moves. |
| Outline | Only `.tex` content; initially expand file nodes, with deeper branches collapsed. Both trees retain independent expansion and scroll positions when switching; expansion and the selected tree are saved per project. Clicking a heading opens its source line. `.cls`/`.sty` may inform completion but do not appear here. |
| Project aliases | Optional during project creation and editable from a project card or the workspace project title context menu. Empty aliases display the folder name. Aliases never rename folders. |
| Clipboard bibliography | Provide an always-visible action and configurable Command/Ctrl+Shift+B shortcut. Validate BibTeX and citation-key uniqueness before changing either buffer. Append to an existing project `.bib` and insert `\cite{key}` at the captured selection in one undo group. Project configuration chooses a default `.bib` or asks when multiple files exist. Invalid input and cancellation change nothing. |
| Tabs | Active background encloses title and close button. Dirty marker, close action and tooltip. Preserve per-file selection/scroll positions during a session. |
| Editing | Shared CodeMirror 6, English built-in snippets, mirrored environment names, chained argument completion, Enter to accept a completion and Tab to advance snippet fields. Search, replace/all, quick open, line/definition navigation and command palette support shortcuts. |
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

Library grid cards have a fixed width of 243 pt/px (10% wider than the preceding 221 pt/px layout), a 220 pt/px PDF area and uniform heights at each interface font size. Window width changes the column count; list rows fill the available width. PDF thumbnails are centered at 80% of the card width, with a 12 pt/px top inset. Clip the entire card to its rounded boundary. The sidebar brand and navigation start higher, without the previous extra top gap. Names and aliases stay on one line with a trailing ellipsis and a tooltip containing the complete name. Folder paths wrap to two lines and have a complete-path tooltip. Cards show the display name, folder path and edited time; the compilation engine is omitted. The information area grows with interface font size to prevent text clipping.

Project identity comes from the actual folder, including canonical paths and filesystem identifiers; display names are never identifiers. Reopening the same location reuses its record and restores archived entries. New projects cannot overwrite an existing folder or reuse a registered location, including unavailable locations. Explicit aliases are stored separately and cannot duplicate another project's display name (case and Unicode width/normalization differences are ignored); existing records retain their names during migration. Different folders may share a default folder name, but create/open, clearing an alias and relinking must warn and recommend an alias. Create and alias-edit validation retain entered values when correction is needed. Relinking to another registered location is rejected.

Hover tooltips use a 1.5-second initial delay. The app-scoped AppKit preference covers native controls; the workbench and embedded editor share timed tooltips with cancellation on pointer exit, clicking, keyboard input, scrolling and loss of focus. Browser-native title tips are suppressed while hovering to avoid duplicate popups.

## 中文约定

项目卡片固定宽度 243 pt/px，在上一版 221 的基础上增加约 10%；PDF 区域高 220 pt/px，PDF 封面居中显示，宽度为卡片的 80%（左右各留约 10%），顶部留 12 pt/px。整张卡片按圆角裁切，避免绿色底色溢出。启动页左侧品牌和分类入口上移。窗口宽度决定列数，同字号下卡片高度一致；列表模式占满行宽。项目名称和别名单行省略，文件夹路径最多换行两行，两者悬浮均显示完整内容，等待 1.5 秒。卡片只显示项目名称、文件夹路径和编辑时间，不显示编译引擎；信息区域高度随界面字号调整。

项目按实际文件夹识别，不按显示名称识别。同一位置重复打开复用记录并取消归档；同位置新建（包括项目库中已记录但暂时不存在的位置）或覆盖现有文件夹时提醒并阻止。别名单独保存，创建和修改时不能与其他项目的显示名称重复，比较时忽略大小写及 Unicode 兼容形式差异；旧项目迁移保留原显示名称。不同位置的原始文件夹名可以相同，但新建、打开、清空别名和重新定位时弹窗建议设置别名，用户明确确认后可保留默认名称。校验失败时保留已填写内容；重新定位到另一个已登记的位置会被拒绝。

悬浮提示等待 1.5 秒后显示。Mac 原生控件只修改应用内的提示延迟；公共工作区和编辑器统一计时，移开鼠标、点击、键盘操作、滚动或失去焦点时取消提示，避免与浏览器默认提示重复显示。

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

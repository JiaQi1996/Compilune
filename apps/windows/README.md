# Compilune for Windows / Windows 版

**Status: preview implemented; ARM64 native/x64 emulation UI, installation, MiKTeX compilation, PDF preview and bidirectional SyncTeX verified on Windows 11 ARM64.** ARM64 and x64 are separate targets; x64 means Intel/AMD 64-bit, not 32-bit x86.

## Develop

Use Windows 11 with Node.js 22+ and npm. From repository root:

```sh
npm --prefix packages/editor ci
npm --prefix apps/windows ci
npm --prefix apps/windows start
```

The first install downloads Electron for the development host. The resource build generates shared design CSS, copies the workbench, bundles CodeMirror and includes PDF.js fonts/CMaps/WASM locally. End users need neither Node.js nor a CDN connection.

Install TeX Live (recommended) or MiKTeX separately, including `latexmk`, your selected engine and `synctex`. Settings detect either environment and allow manual directory selection. The application architecture and toolchain architecture are independent, but each combination needs verification. Settings link to both official download pages and explain the tradeoff: a full TeX Live installation has a larger initial download/storage footprint; MiKTeX starts smaller and can fetch missing packages on demand, requiring a connection for those downloads. Installed packages work offline. TeX Live also supports customized smaller schemes. Compilune bundles private Perl 5.42.3 for MiKTeX; end users do not need a separate Perl installation. Windows ARM64 uses the bundled x64 interpreter through Windows 11 emulation. TeX Live keeps its own Perl environment. Runtime preparation is part of packaging; see [runtime design](../../docs/PERL_RUNTIME.md). Compilune enables missing-package installation for each MiKTeX build without opening hidden installation prompts. The first build may download packages; its timeout is ten minutes and Stop remains available. Environment detection never installs packages. Windows PATH is refreshed from the registry, so newly installed tools can be found without restarting the editor. Check for updates in MiKTeX Console after installation. Automatic in-app distribution installation is not implemented.

## Package

Run on Windows after installing dependencies:

```sh
npm --prefix apps/windows run package:arm64
npm --prefix apps/windows run package:x64
# Or both:
npm --prefix apps/windows run package
```

Output goes to the ignored repository-root `dist/`, shared with the macOS release packages:

```text
Compilune-0.2.10-windows-arm64-setup.exe
Compilune-0.2.10-windows-arm64-setup.sha256
Compilune-0.2.10-windows-x64-setup.exe
Compilune-0.2.10-windows-x64-setup.sha256
```

NSIS intermediates stay in ignored `.build/` folders. Root `dist/` contains only the macOS DMGs, Windows EXE installers, and their matching checksums. Installers are unsigned; publishing/signing is a separate release step. Compare each EXE's PowerShell `Get-FileHash -Algorithm SHA256` result with its matching checksum file.

For offline packaging, the [packaging script](scripts/package.mjs) supports an override pointing to a local directory containing the official architecture-specific Electron ZIPs. Verify their SHA-256 against the pinned Electron package before using it. The default uses the normal builder download flow.

## Structure and behavior

- `src/main/`: isolated Electron host, registry, guarded UTF-8 saves/recovery, file tree, index, compiler and SyncTeX.
- `scripts/`: offline resource build and ARM64/x64 packaging.
- `../../packages/workbench/`: shared library, workspace, settings and PDF.js controls.
- `../../packages/editor/`: shared CodeMirror and parent-message transport.
- `../../packages/design/`: common colors and layout parameters.

The renderer has no Node integration. A narrow preload bridge serves only the local application origin; its exact compatibility identifiers are defined in [the host](src/main/main.js). Project file paths are bounded to their root. Compiler execution uses argument arrays without shell interpolation. Shell escape and implicit latexmk rc files are disabled by default; project configuration can opt in explicitly.

Windows has one active project per instance. Returning to the library closes it after Save/Discard/Cancel confirmation when dirty; opening another project or quitting uses the same safeguards. Cancel retains the project. Autosave defaults on; both compile-after-save options default off. PDF find and formatting controls start hidden. Follow the [interface contract](../../docs/INTERFACE.md).

Registry, settings, sessions and recovery live in Electron's user-data directory, normally `%APPDATA%/Compilune/`; existing installations automatically retain the legacy data directory. Project configuration and build-output locations remain compatible with existing projects; see [local storage](../../docs/ARCHITECTURE.md) for their exact paths. Recovery snapshots are private user data.

Project cards share the latest library layout: centered PDF covers at 80% of card width, two-line folder paths, edited times and 1.5-second tooltips. Project aliases are checked for display-name conflicts, duplicate locations cannot be created, and matching folder names at different locations prompt an alias suggestion. Clipboard BibTeX insertion uses `Ctrl+Shift+B`; chained completion uses Enter to accept a candidate and Tab to advance snippet fields. See the [main README](../../README.md) for the complete workflow.

## Verification status

Local workflow checks passed on the macOS Electron development host: project opening, editor flush/save, real latexmk compilation, PDF rendering/search, bidirectional SyncTeX, create/move, grouped replacement undo/redo, autosave/compile and close confirmation. Windows 11 ARM64 VM checks passed for native ARM64 and x64 under emulation, including Ctrl+S, themes, 8–30 size sliders and live UI scaling, files, cached PDF/search, history, autosave, close choices, template persistence after source deletion and both official download routes. Both ASAR applications and installed applications launch, and installer executable architectures were checked. Real MiKTeX pdfLaTeX compilation, PDF rendering/search, bidirectional SyncTeX, build-file cleanup and refreshed PATH passed in both architectures. TeX Live and physical x64 hardware are unverified. Verification scripts/dependencies stay outside Git.

## 中文说明

源码预览版已实现项目库、编辑器、本地编译、文件操作、设置、PDF 查找与双向定位。使用 Windows 11、Node.js 22+，在仓库根目录执行上面的安装/启动命令。终端用户无需 Node.js，但需要单独安装 TeX 环境。

ARM64 与 Intel/AMD x64 分别打包。`package` 输出两个 EXE 和两份 SHA-256 到仓库根目录 `dist/`，与 macOS 的 DMG 和校验文件统一存放；中间产物保留在已忽略的 `.build/` 中。Windows 代码签名尚未配置。

界面以 macOS 为基准，共用工作区、设计参数和 CodeMirror，快捷键显示 Ctrl。项目库与单个项目界面互斥，返回项目库先处理未保存内容。Windows 默认推荐 TeX Live，另提供 MiKTeX 的按需安装入口，说明初始体积、联网补包与安装后离线使用的区别；尚未实现应用内自动下载安装。ARM 虚拟机内的 ARM64 原生与 x64 仿真界面、安装与启动已验证；MiKTeX 的 pdfLaTeX 真实编译、PDF 渲染/搜索、双向 SyncTeX、辅助文件清理及工具安装后的 PATH 刷新均已在两个架构验证。TeX Live 及 x64 实机仍未验证。验证代码不提交 GitHub。

项目卡片同步采用 PDF 宽度占 80%、路径两行换行、编辑时间和 1.5 秒悬浮提示。重复别名和同位置重复新建会被阻止；不同位置同名时建议设置别名。使用 `Ctrl+Shift+B` 插入剪贴板 BibTeX 并引用，连续补全中 Enter 确认候选、Tab 切换占位符。完整使用说明见[中文 README](../../README.zh-CN.md)。

Templates are copied to the persistent local template library during import. Deleting the original folder does not affect a successfully imported template; PDF images, class/style and bibliography files within that folder are retained. Creating a project makes a separate copy. 应用更新时保留本地模板库；删除原模板文件夹不影响已导入副本。

# Platforms / 平台结构

[English README](../README.md) · [中文说明](../README.zh-CN.md) · [Interface contract / 界面规范](INTERFACE.md)

| Directory | Responsibility | Status |
| --- | --- | --- |
| `apps/macos/` | SwiftUI/AppKit, local files/compiler, PDFKit, SyncTeX | Implemented; arm64/x86_64 packages |
| `apps/windows/` | Electron host, local files/compiler, PDF.js, SyncTeX, NSIS | Preview implemented; ARM64 native/x64 emulation UI verified |
| `apps/linux/` | Future Linux host | Planned |
| `apps/harmonyos/` | Future HarmonyOS host | Planned |
| `packages/editor/` | CodeMirror, completion, formatting, search/navigation | Used by macOS and Windows with distinct transports |
| `packages/workbench/` | Reusable web library, workspace, settings and PDF controls | Used by Windows; aligned with existing macOS structure |
| `packages/design/` | Semantic light/dark colors and geometry, generated adapters | Shared; macOS native adoption currently limited to accent |
| `assets/`, `docs/` | Branding, architecture and interface rules | Shared |

## Host adapters

| Capability | macOS | Windows |
| --- | --- | --- |
| Windows/menu/theme | SwiftUI + AppKit | Electron native window/menu/theme |
| Editor | Local WKWebView | Local iframe + narrow preload IPC |
| Files | Foundation, JSON, application support | Node filesystem, JSON, Electron userData |
| Compilation | Darwin process groups, latexmk | Spawn, Windows process-tree cancellation, latexmk |
| PDF | PDFKit | Bundled PDF.js with search/zoom/page controls |
| Source mapping | Local synctex | Local synctex with PDF.js coordinate conversion |
| Packaging | Separate arm64/x86_64 DMGs | Separate ARM64/x64 NSIS targets |

macOS retains its native shell. Future compatible desktop ports should reuse `packages/workbench/` instead of copying it. All ports follow the [interface contract](INTERFACE.md); system windows/dialogs, modifier keys and tool installation are platform adapters. Shared source does not imply a shared executable or complete feature parity.

## Distribution and validation

Root `dist/` is the shared release directory for all platforms: two macOS DMGs, two Windows EXE installers, and a matching checksum for each. Only installers and checksums belong there; platform-specific build intermediates stay in ignored `.build/` folders. Verification code/dependencies remain outside the public repository.

macOS arm64 is runtime-verified; Intel Mac builds are cross-compiled, not verified on Intel hardware. Windows core compilation/SyncTeX workflows passed on the macOS Electron host. Windows 11 ARM64 native and x64 emulation UI workflows passed, and both ASAR apps and installed applications launch; real Windows MiKTeX compilation/PDF/SyncTeX passed in both application architectures. TeX Live remains unverified. Packaging targets are not verified hardware claims. See [Windows details](../apps/windows/README.md).

Linux needs filesystem/system integration, compiler discovery/cancellation and packaging. HarmonyOS first needs validation of the target device, compatible web host and viable local TeX toolchain. No HarmonyOS compiler/process adapter or remote-compilation alternative is implemented.

## 中文

一个仓库、各平台独立目录，公共编辑器、工作区和设计参数放在 `packages/`。macOS 原生版已完成，Windows 源码预览版已实现，ARM64 原生/x64 仿真界面已验证，安装与启动已验证，Windows MiKTeX 真实编译/PDF/双向定位已在两个应用架构验证，TeX Live 仍未验证；Linux/HarmonyOS 尚未实现。

统一信息结构、组件位置及操作结果，按系统适配窗口、文件对话框和 ⌘/Ctrl。macOS 目前仅强调色接入公共参数，其他原生视图仍用现有系统颜色；公共源码、打包目标不等于完全一致的渲染和已经验证的实机支持。

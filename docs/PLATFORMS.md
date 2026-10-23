# Platform plan / 平台移植计划

[English README](../README.md) · [中文说明](../README.zh-CN.md)

## Repository boundaries

| Directory | Responsibility | Current status |
| --- | --- | --- |
| `apps/macos/` | Native macOS shell, files, toolchain/builds, PDFKit, SyncTeX | Implemented |
| `apps/windows/` | Windows application and host adapters | Reserved; no code yet |
| `apps/linux/` | Linux application and host adapters | Reserved; no code yet |
| `apps/harmonyos/` | HarmonyOS application and host adapters | Reserved; no code yet |
| `packages/editor/` | CodeMirror behavior, source formatting, completions, static web assets | Extracted shared source; current host transport is WKWebView |
| `assets/`, `docs/` | Branding and common documentation | Shared |
| `scripts/` | Convenient root commands forwarding to macOS scripts | macOS only today |

This layout prepares future ports; it does not make the current Swift app compile on other systems. Framework choices, minimum versions, packaging, supported devices and test matrices for the planned ports remain undecided.

## Reuse versus platform adapters

The editor's JavaScript, snippets, UI assets, command concepts and message payloads can be reused where a compatible web host is chosen. The current outbound `post(...)` implementation calls WKWebView's message handler; introduce an explicit host transport for each port and test its behavior, including input methods and save/close flush acknowledgment.

Each native shell needs these capabilities:

| Capability | Existing macOS implementation | Future port work |
| --- | --- | --- |
| Window/menu/preferences | SwiftUI + AppKit + UserDefaults | Use native equivalents or the selected application framework |
| Editor host | Local WKWebView | Host the editor and implement both message directions |
| File/project storage | Foundation, local folders, JSON, recovery snapshots | Directory selection, permissions, atomic writes, external changes and recovery |
| Compiler execution | Darwin process groups + latexmk | Tool discovery, argument handling, cancellation, timeouts and logs |
| PDF | PDFKit | Rendering, text search, coordinates, selection and zoom |
| Source/PDF mapping | Local `synctex` process | Tool availability and coordinate mapping integration |
| Packaging | macOS app bundle, DMG and checksum | Platform-specific signing/distribution/installation |

Do not reuse a macOS binary on another platform. Shared source is distinct from a shared executable.

## Suggested implementation sequence

1. Choose the next platform and prove a minimal local compiler + PDF rendering workflow before building the full UI.
2. Implement the editor transport, file operations and acknowledged save/close behavior.
3. Add tool detection, build cancellation, diagnostics and preview retention.
4. Add PDF/source mapping, settings, project sessions and platform keyboard conventions.
5. Document actual minimum versions and verified hardware before advertising support.

For HarmonyOS specifically, validate target device/system constraints and a viable local TeX toolchain first. The repository currently provides no HarmonyOS compiler distribution, process adapter or PDF implementation. If fully local compilation is unavailable for a chosen target, any alternative architecture needs a separate product decision; remote compilation is not currently implemented.

## 中文说明

一个 GitHub 仓库内，各平台应用独立放在 `apps/` 中；公共编辑器位于 `packages/editor/`。目前只有 macOS 应用完成，其他目录只是移植入口和状态说明。

CodeMirror 源码、补全片段、编辑交互和图标可作为公共基础；消息传输仍使用 WKWebView，需要为新平台实现适配。SwiftUI、AppKit、PDFKit、Darwin 进程调用不能直接用于其他平台。

移植时先验证本地 TeX 编译与 PDF 渲染，再接文件、保存确认、编译取消和定位。Windows/Linux/HarmonyOS 的框架、最低系统、打包与实机范围均待实际开发确定；HarmonyOS 尤其需要先验证目标设备上的本地 TeX 工具链可行性，当前没有实现远程编译作为替代。

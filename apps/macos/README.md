# Compilune for macOS

Implemented with SwiftUI, AppKit, WKWebView and PDFKit. Requires macOS 14+.

From the **repository root**, run `./scripts/build-app.sh` or `./scripts/package.sh --arch x86_64`. Open this directory's `Package.swift` when working in Xcode.

The shared editor lives in [`packages/editor/`](../../packages/editor/README.md); bundled resources here allow native builds without npm. See the [English README](../../README.md), [中文说明](../../README.zh-CN.md).

The current library includes project aliases, location/name conflict checks, two-line folder paths and centered PDF covers at 80% of card width. Tooltip delay is 1.5 seconds. Clipboard BibTeX insertion uses `⌘⇧B`; chained completion uses Enter to confirm a candidate and Tab to advance snippet fields.

本目录为现有 macOS 实现；在仓库根目录运行构建脚本，或在 Xcode 中打开本目录的 `Package.swift`。

当前项目库支持别名与重名/位置冲突检查，卡片路径可换行，PDF 封面宽度占 80%，悬浮提示等待 1.5 秒。使用 `⌘⇧B` 插入剪贴板文献并引用；连续补全中 Enter 确认候选、Tab 切换占位符。

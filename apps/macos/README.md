# Folio TeX for macOS

Implemented with SwiftUI, AppKit, WKWebView and PDFKit. Requires macOS 14+.

From the **repository root**, run `./scripts/build-app.sh` or `./scripts/package.sh --arch x86_64`. Open this directory's `Package.swift` when working in Xcode.

The shared editor lives in `packages/editor/`; bundled resources here allow native builds without npm. See the [English README](../../README.md), [中文说明](../../README.zh-CN.md).

本目录为现有 macOS 实现；在仓库根目录运行构建脚本，或在 Xcode 中打开本目录的 `Package.swift`。

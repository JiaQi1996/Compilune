<p align="center"><img src="assets/AppIcon.png" width="112" alt="Folio TeX icon"></p>

# Folio TeX · 墨页

**A local LaTeX writing workspace for macOS.**

English · [简体中文](README.zh-CN.md)

Folio TeX opens to a project library and brings a CodeMirror 6 source editor, local compilation, and a PDF preview into one native macOS workspace. It was built for personal writing and is shared under the MIT license.

Current version: **0.2.8**. The application interface is currently primarily **Simplified Chinese**; built-in completion descriptions and the default document template are English.

## Features

- **Project library:** local folders, pinned projects, sorting, PDF cover previews, archiving, and folder relinking.
- **Source editing:** CodeMirror 6 highlighting, command/environment completion, project macros, citations, labels, and file paths. Environment snippets mirror `begin`/`end` names and move to the body with Enter.
- **Writing tools:** optional formatting and insertion toolbar, configurable shortcuts, command palette, file search, line/column jumps, and definition navigation. Formatting tools insert LaTeX source; the editor is not a rendered WYSIWYG document view.
- **Find and replace:** regular expressions within a file; project-wide plain-text search and replacement preview with grouped undo.
- **File navigation:** folders first, nested indentation, new folders/TeX/Bib files, project-local drag moves, and a clickable, expanded `.tex` outline.
- **Local builds:** latexmk with pdfLaTeX, XeLaTeX, or LuaLaTeX; configurable main file, working/output directories, explicit rc file, and shell escape.
- **PDF preview:** search, zoom, page navigation, last-successful-preview caching, and bidirectional SyncTeX. Double-click a PDF location to jump to source; use `⌘⇧J` in source to locate the PDF.
- **Saving:** optional autosave with a 1–30 second delay, separate compile-after-manual-save and compile-after-autosave settings, unsaved-change confirmation, and recovery snapshots.
- **Personalization:** live system appearance, explicit light/dark modes, independent interface/code font sizes, local custom templates, and optional build-file cleanup.
- **Toolchain setup:** automatic TeX discovery and an optional MacTeX download flow that opens the macOS installer.

Editing and compilation run locally. The editor bundle, icons, and dependencies are included; normal use does not need Node.js or an internet connection. Downloading MacTeX requires a network connection.

## Platform status

One repository contains separate platform applications and a shared editor package.

| Platform | Directory | Status |
| --- | --- | --- |
| macOS | [`apps/macos/`](apps/macos/README.md) | Implemented; Apple Silicon and Intel builds |
| Windows | [`apps/windows/`](apps/windows/README.md) | Planned; no runnable application yet |
| Linux | [`apps/linux/`](apps/linux/README.md) | Planned; no runnable application yet |
| HarmonyOS | [`apps/harmonyos/`](apps/harmonyos/README.md) | Planned; no runnable application yet |

The shared editor lives in [`packages/editor/`](packages/editor/README.md). Native host APIs, PDF rendering and compiler execution still need platform adapters. The SwiftUI/AppKit/PDFKit app is macOS-specific. See the [platform plan](docs/PLATFORMS.md).

## macOS requirements and architecture

| Item | Requirement / status |
| --- | --- |
| Operating system | macOS 14 or later |
| Apple Silicon | `arm64`; built and integration-tested on Apple Silicon |
| Intel | `x86_64`; cross-compiled and packaged, not runtime-tested on Intel hardware |
| LaTeX | A local TeX distribution with `latexmk`, the chosen engine, and `synctex` |
| Building the app | Xcode or Swift Command Line Tools with Swift 5.9+; tested with Swift 6.4 |
| Editing the web editor | Node.js 18+ and npm |

The scripts build one architecture at a time. These are separate builds, not a Universal binary. Intel runtime compatibility needs testing on an Intel Mac.

## Get started

1. Build the app below, or use an architecture-matching package if one is provided with the repository's releases.
2. Open the app. Choose **打开本地项目** to select a project folder, or **新建项目** for the bundled English `article` template.
3. Install MacTeX or another suitable TeX distribution. In **设置 → 工具链**, detect tools or set the executable directory (MacTeX normally uses `/Library/TeX/texbin`).
4. Open project **配置**, select the main `.tex` file and engine, then press `⌘R` to compile.

Locally packaged apps use an **ad-hoc signature** and are not Developer ID signed or notarized. macOS may require explicit approval to open a downloaded build.

### Save and compile behavior

Autosave defaults to on with a one-second delay. Both global compile-after-save options default to off. Manual-save compilation is independent of autosave; automatic-save compilation requires autosave. Project-level automatic compilation also requires autosave. A successful save triggers compilation when the corresponding option is enabled; an active build queues at most one subsequent build.

Closing a project or quitting asks about remaining unsaved edits. Discarding does not revert edits that were already saved by autosave. Manual compilation, file moves, and closing a file tab can save buffers even when timed autosave is off.

### PDF synchronization and cleanup

SyncTeX needs a successful build of the latest source. Stale or cached PDFs must be rebuilt before source mapping. Mapping is typically accurate to a source line and may be approximate for whitespace or macro expansions.

Optional cleanup removes recognized auxiliary files after a successful build while retaining PDF, SyncTeX, and source files. Failed builds retain diagnostic files. Cleanup can make the next build slower.

## Build from source

Run commands from the repository root. The Swift package itself is in `apps/macos/`; open that folder in Xcode. Install Apple's developer tools if needed:

```sh
xcode-select --install
./scripts/build-app.sh
```

Built apps stay in the ignored local build folders: `apps/macos/.build-arm64/artifacts/Folio TeX-arm64.app` or `apps/macos/.build-x86_64/artifacts/Folio TeX-x86_64.app`.

The checked-in editor bundle allows the native app to build without npm. After changing `packages/editor/src.js`, rebuild it before building the app:

```sh
npm --prefix packages/editor ci
npm --prefix packages/editor run build
./scripts/build-app.sh
```

This also refreshes the bundled editor license notices. Commit both the edited source and regenerated bundle/notices.

### Intel builds and release packages

```sh
# Cross-compile the Intel app with an SDK that supports x86_64.
./scripts/build-app.sh --arch x86_64

# Build, sign, and create DMG + SHA-256 checksum for the current machine architecture.
./scripts/package.sh

# Create the Intel DMG and checksum explicitly.
./scripts/package.sh --arch x86_64
```

`dist/` contains only the `arm64` and `x86_64` DMGs and a `.sha256` checksum file for each. Each checksum file covers its corresponding DMG; verify it inside `dist/` with `shasum -a 256 -c FolioTeX-0.2.8-arm64.sha256` (or the Intel filename). The packager verifies the app signature and DMG and writes SHA-256 checksums. `VERSION` holds the release version; `FOLIO_BUILD_NUMBER` optionally overrides the bundle build number.

The scripts use SwiftPM's `native` backend for the tested Command Line Tools environment. Newer Swift tools report this backend as deprecated; it currently builds successfully here. Explicit property-wrapper aliases avoid a missing SwiftUI macro plugin in that environment.

## Contribution

Please include steps to reproduce and relevant logs in bug reports. Keep generated editor resources in sync with shared source changes. This publication includes application source, build scripts, and documentation; local verification code is maintained outside the repository.

## Source map

```text
apps/
  macos/                Implemented native app: Package.swift, Sources, scripts
  windows/              Planned port; no implementation yet
  linux/                Planned port; no implementation yet
  harmonyos/            Planned port; no implementation yet
packages/
  editor/               Shared CodeMirror source, static assets, and bundle builder
scripts/                Root entry points for the macOS build/package
docs/                   Architecture, platform plan, shortcuts
assets/                 Shared app icon source and attribution
```

See [Architecture and local storage](docs/ARCHITECTURE.md), [Shortcuts](docs/SHORTCUTS.md), and [Changelog](CHANGELOG.md).

## Current limits

- Project search is case-insensitive plain text; regex is limited to the current file. Project results are capped at 2,000 matching lines.
- Text files use UTF-8 with basic CRLF preservation. Other encodings need conversion; mixed line endings are not preserved individually.
- The indexer is lightweight and does not interpret arbitrary TeX macro expansion or the complete BibTeX grammar. `.cls`/`.sty` inform completions but are excluded from the sidebar outline.
- Moving or renaming files does not rewrite `\input`, image, or bibliography paths in source.
- File change monitoring polls approximately once a second. Recovery stores text snapshots rather than full undo history.
- Large LuaLaTeX/Biber projects, all CJK font/package combinations, rotated-page SyncTeX, and full accessibility behavior have not been comprehensively validated.
- The multi-gigabyte MacTeX download and system installation flow has not been tested end to end.

## License and acknowledgments

Folio TeX's original code is released under the [MIT License](LICENSE), copyright © 2026 JiaQi.

[CodeMirror 6](https://codemirror.net/) and its runtime dependencies retain their MIT licenses. [Lucide](https://lucide.dev/) icons retain their ISC/Feather notices. See [Third-party notices](docs/THIRD_PARTY.md) and the license files in `apps/macos/Sources/FolioTeX/Resources/`.

MacTeX and TeX tools are installed separately and are not included in this repository. Folio TeX is an independent project and is not affiliated with Texifier.

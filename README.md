<p align="center"><img src="assets/AppIcon.png" width="112" alt="Compilune icon"></p>

# Compilune

**A local LaTeX workspace for macOS, with a Windows preview under development.**

English · [简体中文](README.zh-CN.md)

Compilune opens to a project library and brings a CodeMirror 6 source editor, local compilation, and a PDF preview into one native macOS workspace. It was built for personal writing and is shared under the MIT license.

Current version: **0.2.18** on both macOS and Windows. All four installers use the same release version. The application interface is currently primarily **Simplified Chinese**; built-in completion descriptions and the default document template are English.

## New in 0.2.18

- Fold nested TeX blocks with triangles beside line numbers; switching tabs preserves folds and navigation reveals hidden targets.
- Find duplicate papers by title and authors, review duplicate Bib keys and citation locations, then choose a retained record. Confirmation merges missing metadata and updates citations as one undoable edit.
- Projects compile on open by default. Successful builds also save `main.pdf` beside `main.tex`, including when the main file is in a subfolder.
- The file-tree show/hide button is now at the left of the workspace toolbar on both platforms.

See the [changelog](CHANGELOG.md) and [folding and bibliography guide](docs/FOLDING_AND_BIB_DEDUP.md).

## Download

**[Download installers from GitHub Releases](https://github.com/JiaQi1996/Compilune/releases)**

Choose an installer matching your platform and processor:

| Platform | Processor | Installer filename ending |
| --- | --- | --- |
| macOS | Apple Silicon (M series) | `-arm64.dmg` |
| macOS | Intel | `-x86_64.dmg` |
| Windows preview | ARM64 | `-windows-arm64-setup.exe` |
| Windows preview | Intel / AMD 64-bit | `-windows-x64-setup.exe` |

Available versions and platforms depend on the assets attached to each release. The local `dist/` contains four version **0.2.18** installers: macOS ARM64/Intel and Windows ARM64/x64, each with a matching `.sha256` file. On macOS, open the DMG and drag Compilune into Applications; on Windows, run the matching EXE installer. A TeX distribution must be installed separately.

## macOS screenshots

Actual macOS application windows, using demonstration projects. The current interface is primarily Simplified Chinese.

**Source editor and PDF preview** — local compilation, a folder tree, and side-by-side writing and reading.

![Compilune on macOS: LaTeX source editor and compiled PDF preview](docs/screenshots/macos-workspace.png)

**Project library** — project aliases, wrapped folder paths, pinned projects, and larger centered PDF covers.

![Compilune on macOS: project library with pinned projects and PDF covers](docs/screenshots/macos-library.png)

<details>
<summary>Dark appearance</summary>

![Compilune on macOS: source editor and PDF preview in dark appearance](docs/screenshots/macos-workspace-dark.png)

</details>

<details>
<summary>Appearance, font sizes, autosave, and compilation settings</summary>

<img src="docs/screenshots/macos-settings.png" width="720" alt="Compilune on macOS: appearance, independent font sliders, autosave and compile settings">

</details>

## Features

- **Project management:** local folders, optional aliases, pinned projects, sorting, archiving, and folder relinking. Duplicate aliases and creation at occupied or registered locations are blocked; matching folder names at different locations prompt an alias suggestion.
- **Library cards:** fixed-size cards with centered PDF covers at 80% of card width. Cards show the project name, a folder path that wraps to two lines, and the edited time. Hover to read complete names and paths; tooltips appear after 1.5 seconds.
- **Source editing:** CodeMirror 6 highlighting, command/environment completion, project macros, citations, labels, and file paths. Command completion continues into citation keys, labels, paths, and environment names. Completion selection responds to Up/Down, and wheel/scrollbar browsing keeps its position. Enter accepts the highlighted completion; Tab advances snippet fields or moves into an environment body. `begin`/`end` names remain linked.
- **Completion previews:** `\cite{}` cards show the paper title, first author, year, and journal/conference. Figure and table `\ref{}` candidates preview the corresponding region of the latest successful PDF. `\includegraphics{}` path completion and hover preview local project images without compilation, including the first page of PDF images. Display math has offline hover and live KaTeX previews. Cards prefer the left of the candidate list and stack when space is limited. [Preview details](docs/EDITOR_PREVIEWS.md).
- **Find counts and build diagnostics:** file, project, and PDF find show current/total occurrences. Project search counts repeated matches on the same line separately and navigates to the exact range. Failed builds open the log with recognized project-local error lines as source links, including wrapped paths; successful builds close the log.
- **Code folding:** triangles beside line numbers collapse tables, figures, math, lists and other environments, including nested blocks and multiline groups. Tabs retain folds, and navigation reveals folded targets. Folding does not change the source. Fold/unfold-all commands and configurable shortcuts are included.
- **Smart bibliography deduplication:** compare normalized titles and authors across project Bib files, preview duplicate records and citation file/line locations, choose a retained entry, then confirm metadata merging and citation-key updates. The complete operation can be undone. Conflicting years, DOIs or full author names require review. [Details](docs/FOLDING_AND_BIB_DEDUP.md).
- **Open-time compilation and PDF output:** opening a project compiles it by default, with a setting to disable this. Every successful build also writes its PDF beside the main TeX file while retaining build-directory data for logs and SyncTeX.
- **Writing tools:** optional formatting and insertion toolbar, configurable shortcuts, command palette, file search, line/column jumps, and definition navigation. Formatting tools insert LaTeX source; the editor is not a rendered WYSIWYG document view.
- **Find and replace:** regular expressions within a file; project-wide plain-text search and replacement preview with grouped undo.
- **Editor tabs:** each file restores its last reading position independently of the caret, including rapid tab switches and renamed files. Outline, search and SyncTeX jumps still navigate to the requested destination.
- **File navigation:** folders first, nested indentation, new folders/TeX/Bib files, project-local drag moves, and a clickable `.tex` outline. The file tree starts fully collapsed; the outline initially expands only its top level. Both retain independent expansion and scroll positions when switching. Show or hide the sidebar with the leftmost toolbar button.
- **Local builds:** latexmk with pdfLaTeX (default), XeLaTeX, or LuaLaTeX; configurable main file, working/output directories, explicit rc file, and shell escape.
- **PDF preview:** fit-width-relative zoom percentage (Fit Width = 100%) and current/total page readouts in the preview toolbar, search, zoom, page navigation, last-successful-preview caching, and bidirectional SyncTeX. Double-click a PDF location to jump to source; use `⌘⇧J` on macOS or `Ctrl+Shift+J` on Windows to locate the PDF from source.
- **Clipboard bibliography:** validate copied BibTeX, append it to a project `.bib`, and insert `\cite{key}` at the original cursor with `⌘⇧B` (Windows: `Ctrl+Shift+B`). Choose a default bibliography in project configuration or ask on each insertion when multiple files exist. Invalid input makes no changes. Existing citation keys prompt for confirmation: reuse them without changing the bibliography, or append only new entries from a mixed clipboard. One undo reverses the insertion. After insertion, the caret stays after the citation and the reading position is retained.
- **Saving:** optional autosave with a 1–30 second delay, separate compile-after-manual-save and compile-after-autosave settings, unsaved-change confirmation, and recovery snapshots.
- **Personalization:** live system appearance, explicit light/dark modes, independent interface/code font sizes with 8–30 sliders, local custom templates, and optional build-file cleanup.
- **Toolchain setup:** automatic TeX discovery, distribution download options, and a bundled private Perl runtime for `latexmk`. TeX itself is installed separately.

Editing and compilation run locally. The editor bundle, icons, and private Perl runtime are included; installed applications do not need Node.js. With the required TeX packages and fonts installed, writing and compilation work offline. Distribution downloads, updates, and MiKTeX on-demand package installation require a network connection.

## Platform status

One repository contains separate platform applications and shared editor, workbench, and design packages.

| Platform | Directory | Status |
| --- | --- | --- |
| macOS | [`apps/macos/`](apps/macos/README.md) | Implemented; Apple Silicon and Intel builds |
| Windows | [`apps/windows/`](apps/windows/README.md) | Preview; ARM64 native and x64 emulation verified on Windows 11 ARM64 |
| Linux | [`apps/linux/`](apps/linux/README.md) | Planned; no runnable application yet |
| HarmonyOS | [`apps/harmonyos/`](apps/harmonyos/README.md) | Planned; no runnable application yet |

The shared editor lives in [`packages/editor/`](packages/editor/README.md). Windows implements its own host APIs, PDF.js viewer and compiler adapter. The SwiftUI/AppKit/PDFKit app is macOS-specific. See the [platform plan](docs/PLATFORMS.md).

## macOS requirements and architecture

| Item | Requirement / status |
| --- | --- |
| Operating system | macOS 14 or later |
| Apple Silicon | `arm64`; built and integration-tested on Apple Silicon |
| Intel | `x86_64`; cross-compiled; bundled Perl and compilation checked under Rosetta; Intel hardware not yet verified |
| LaTeX | A local TeX distribution with `latexmk`, the chosen engine, and `synctex` |
| Building the app | Xcode or Swift Command Line Tools with Swift 5.9+; tested with Swift 6.4 |
| Editing the web editor | Node.js 18+ and npm |

The scripts build one architecture at a time. These are separate builds, not a Universal binary. Intel runtime compatibility needs testing on an Intel Mac.

## Get started

1. Choose the matching macOS DMG from [Releases](https://github.com/JiaQi1996/Compilune/releases), or build from source below. Use `arm64` for Apple Silicon and `x86_64` for Intel, then drag Compilune into Applications.
2. Open the app. Choose **打开本地项目** to select a project folder, or **新建项目** for the bundled English `article` template.
3. Install MacTeX or another suitable TeX distribution. In **设置 → 工具链**, detect tools or set the executable directory (MacTeX normally uses `/Library/TeX/texbin`).
4. Open project **配置**, select the main `.tex` file and engine, then press `⌘R` to compile.

Locally packaged apps use an **ad-hoc signature** and are not Developer ID signed or notarized. macOS may require explicit approval to open a downloaded build.

### Project names, aliases, and locations

Set an optional alias when creating a project, or choose **设置项目别名…** from a project card or workspace-title context menu. An alias changes the displayed name while retaining the folder name and location.

| Action | Behavior |
| --- | --- |
| Open the same folder again | Reuse its existing project record and retain its alias. |
| Create at an occupied or registered location | Show a warning and block creation, preserving existing files. |
| Create or edit an alias | Reject names matching another project's display name, including archived projects. Comparisons ignore case and Unicode compatibility-form differences. |
| Use the same folder name at another location | Keep separate projects and suggest an alias in a dialog; explicitly choosing the folder name is also supported. |
| Clear an alias | Restore the folder name, with a warning if another project has a matching name. |
| Relink to another registered project's folder | Reject the conflicting location. |

Aliases and locations are stored separately. Existing names are retained during upgrades; a rejected alias edit preserves the current project and entered text for correction.

### Save and compile behavior

Autosave defaults to on with a one-second delay. Both global compile-after-save options default to off. Manual-save compilation is independent of autosave; automatic-save compilation requires autosave. Project-level automatic compilation also requires autosave. A successful save triggers compilation when the corresponding option is enabled; an active build queues at most one subsequent build.

Compile on open is a separate setting, enabled by default. Configure the main TeX file and a working TeX toolchain first; reopening the project then starts compilation automatically. Disable this in the save/compile settings when desired.

The library and project are mutually exclusive. Opening a project closes the library; returning to the library closes the project after Save/Discard/Cancel when dirty. Cancel retains the current project. Closing a project or quitting also checks unsaved edits. Discarding does not revert edits that were already saved by autosave. Manual compilation, file moves, and closing a file tab can save buffers even when timed autosave is off.

### PDF synchronization and cleanup

SyncTeX needs a successful build of the latest source. Stale or cached PDFs must be rebuilt before source mapping. Mapping is typically accurate to a source line and may be approximate for whitespace or macro expansions.

Optional cleanup removes recognized auxiliary files after a successful build while retaining PDF, SyncTeX, and source files. Failed builds retain diagnostic files. Cleanup can make the next build slower.

PDF export defaults to the project alias, or the project folder name when no alias is set. Characters unavailable in filenames are replaced automatically.

Automatic PDF output uses the main TeX filename instead: `paper/main.tex` produces `paper/main.pdf` after a successful build. This overwrites the previous PDF at that destination. Failed builds retain the last successful PDF; internal build artifacts remain available for previews, SyncTeX, and diagnostics.

### Smart bibliography deduplication

Use the toolbar's **智能文献去重** button or `⌘⌥⇧B` on macOS / `Ctrl+Alt+Shift+B` on Windows. Review each duplicate group, its Bib keys, and clickable citation locations, then select the record to retain and confirm. Existing fields in that record are kept; missing resolvable fields are merged, duplicate entries are removed, and supported citation keys are updated together. One undo restores the entire edit; saving follows your autosave settings.

Conflicting years, DOIs, or full author names require review. For cross-file merges, ensure the document loads the retained record's Bib file. Unresolved metadata and custom citation macros have limits described in the [guide](docs/FOLDING_AND_BIB_DEDUP.md).

### Clipboard bibliography

1. Create or import a project `.bib` file and load it in your document as usual.
2. In project configuration, select a default bibliography or ask on each insertion when multiple files exist.
3. Copy one or more BibTeX entries, place the cursor in a `.tex` document, and use the insertion button or `⌘⇧B` / `Ctrl+Shift+B`.
4. Compilune validates the entries and previews their titles, first authors, years, and venues for confirmation, then appends them to the bibliography, and inserts `\cite{key}` at the captured selection. Empty input, invalid entries, and cancellation leave both files unchanged. Existing keys prompt for confirmation; citation-only reuse leaves every `.bib` unchanged, while a mixed clipboard appends only new entries. One undo reverses the insertion; saving follows the current autosave policy.

## TeX distributions and private Perl

Compilune includes **Perl 5.42.3** to run `latexmk` when needed, so Windows MiKTeX users do not need a separate Perl installation. **A TeX distribution is still required.**

| Platform | TeX choices | Perl behavior |
| --- | --- | --- |
| macOS | MacTeX, or a compatible MiKTeX installation | Uses a working MacTeX/system interpreter; native private Perl is available as a fallback and preferred for MiKTeX |
| Windows | TeX Live (recommended full installation), or MiKTeX (smaller initial download, packages installed on demand) | Keeps TeX Live's own environment; MiKTeX uses the bundled private Perl |

The private runtime affects only compilation child processes and does not modify the global `PATH`. macOS packages include a matching native runtime for each architecture. Windows ARM64 packages use x64 Perl through Windows 11 emulation. Runtime details are shown in **设置 → 工具链**. See [runtime preparation, licenses, and limitations](docs/PERL_RUNTIME.md).

### Custom templates

Import copies a template into persistent application data. Deleting the original folder after a successful import does not break the stored template. New projects are independent copies. Keep required images, PDF figures, class/style and bibliography files inside the template folder; application updates retain the local template library.

## Build from source

Run commands from the repository root. The Swift package itself is in `apps/macos/`; open that folder in Xcode. Install Apple's developer tools if needed:

```sh
xcode-select --install
./scripts/build-app.sh
```

Built apps stay in the ignored local build folders: `apps/macos/.build-arm64/artifacts/Compilune-arm64.app` or `apps/macos/.build-x86_64/artifacts/Compilune-x86_64.app`.

The checked-in editor bundle allows the native app to build without npm. Release builds also prepare a pinned private Perl runtime; the first build needs a verified source download and additional build time. See [private Perl runtime](docs/PERL_RUNTIME.md). After changing the shared editor, bibliography parser, or `packages/workbench/tooltips.js`, regenerate the bundled resources before building the native app:

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

The repository-root `dist/` is shared by macOS and Windows and contains only four installers and their four matching checksums. Each `.sha256` file covers its corresponding DMG or EXE. For example, run `shasum -a 256 -c Compilune-0.2.18-arm64.sha256` inside `dist/` on macOS, or compare `Get-FileHash -Algorithm SHA256` with the matching file on Windows. The macOS packager also verifies the app signature and DMG. `VERSION` holds the release version; `COMPILUNE_BUILD_NUMBER` optionally overrides the bundle build number. Builds use ad-hoc signing by default; a distribution signing identity can be supplied with `COMPILUNE_SIGN_IDENTITY`. Developer ID signing and notarization are not included in the published local-build verification.

The scripts use SwiftPM's `native` backend for the tested Command Line Tools environment. Newer Swift tools report this backend as deprecated; it currently builds successfully here. Explicit property-wrapper aliases avoid a missing SwiftUI macro plugin in that environment.

## Windows preview and interface consistency

Ports follow the [interface contract](docs/INTERFACE.md), with the existing macOS app as baseline. Windows shares the web workbench, design tokens and CodeMirror; macOS retains its native shell. System dialogs, windows and Command/Ctrl conventions remain platform-specific. Windows file/compiler/PDF.js adapters are implemented; Linux and HarmonyOS remain planned.

See [Windows development and packaging](apps/windows/README.md). From repository root:

```sh
npm --prefix packages/editor ci
npm --prefix apps/windows ci
npm --prefix apps/windows start
# Package ARM64 and x64 on Windows:
npm --prefix apps/windows run package
```

x64 means Intel/AMD 64-bit, not 32-bit x86. Windows ARM64 native and x64 emulation UI workflows passed. Installation and launch passed. Real MiKTeX compilation, PDF preview and bidirectional SyncTeX are verified on Windows 11 ARM64; TeX Live compilation is not yet verified. Two EXEs and their checksums go to the repository-root `dist/`, alongside the macOS DMGs and checksums. Only installers and matching checksums belong in this directory; build intermediates remain in ignored `.build/` folders. Install Windows TeX Live (recommended) or MiKTeX separately.

## Contribution

Please include steps to reproduce and relevant logs in bug reports. Keep generated editor resources in sync with shared source changes. This publication includes application source, build scripts, and documentation; local verification code is maintained outside the repository.

## Source map

```text
apps/
  macos/                Implemented native app: Package.swift, Sources, scripts
  windows/              Electron host, compiler, PDF.js and ARM64/x64 packager
  linux/                Planned port; no implementation yet
  harmonyos/            Planned port; no implementation yet
packages/
  editor/               Shared CodeMirror source, static assets, and bundle builder
  workbench/            Shared web UI, settings, tooltips and project-name validation
  design/               Semantic colors, layout tokens and generated adapters
scripts/                Build/package entry points, icon export, private Perl preparation
docs/                   Architecture, platform plan, shortcuts, runtime notes, screenshots
assets/                 Shared app icon source and attribution
third_party/            Private Perl source pins and redistribution license notices
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

Compilune's original code is released under the [MIT License](LICENSE), copyright © 2026 JiaQi.

[CodeMirror 6](https://codemirror.net/) and its runtime dependencies retain their MIT licenses. [Lucide](https://lucide.dev/) icons retain their ISC/Feather notices. See [Third-party notices](docs/THIRD_PARTY.md) and the license files in `apps/macos/Sources/Compilune/Resources/`.

Offline math previews use bundled [KaTeX](https://katex.org/), including its fonts and MIT license. Windows PDF rendering uses PDF.js under Apache-2.0.

Bundled Perl and its components retain their original licenses; runtime packages include the corresponding notices. See [Perl third-party information](third_party/perl/README.md). MacTeX and other TeX distributions are installed separately and are not bundled with the app. Compilune is an independent project and is not affiliated with Texifier.

## Name and upgrade compatibility

The application uses the English name **Compilune** on every platform. Existing installations retain their previous application-data directory automatically, along with project libraries, settings, recovery files and imported templates. Existing project configuration and installer identifiers remain compatible; actual storage locations and compatibility details are documented in [Architecture and local storage](docs/ARCHITECTURE.md).

The original icon source is `assets/AppIcon.svg`. To regenerate PNG, ICO and ICNS assets, install `rsvg-convert` (librsvg) and run `node scripts/build-icons.mjs`. Generated assets are committed, so normal application builds do not require that tool.

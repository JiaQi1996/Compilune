# Architecture and local data

[English README](../README.md) · [中文说明](../README.zh-CN.md)

The implemented macOS app in `apps/macos/` is a Swift Package executable targeting macOS 14+. SwiftUI renders the library, workspace, and settings; AppKit owns windows, menus, dialogs, and application lifecycle. A local WKWebView hosts CodeMirror 6. PDFKit renders compiler output.

The shared editor source and canonical assets live in `packages/editor/`. The Windows Electron host lives in `apps/windows/`, consumes `packages/workbench/`, and uses PDF.js. `packages/design/` generates common CSS and the native macOS accent. Linux and HarmonyOS remain planned; see [Platforms](PLATFORMS.md) and the [interface contract](INTERFACE.md). Root scripts continue to forward to macOS scripts.

## Main components

| Source | Responsibility |
| --- | --- |
| `App.swift` | Entry point, app delegate, windows, menus, project library and workspace views |
| `Models.swift` | Projects, preferences, library registry, buffers, workspace state and build coordination |
| `WorkspaceServices.swift` | Save scheduling, session/recovery, unified history, polling, indexing, file moves |
| `CloseConfirmation.swift` | Unsaved-change choices and pausing/resuming autosave while closing |
| `EditorView.swift` | WKWebView message bridge and native PDFKit integration |
| `EditorCommands.swift`, `ShortcutNotation.swift` | Command registry, shortcut validation and macOS notation |
| `packages/editor/src.js` | CodeMirror setup, completions, snippets, dialogs, local formatting and navigation |
| `NavigationTree.swift`, `FileTreeView.swift`, `FileActions.swift` | Sorted hierarchy, outline, creation, drag moves |
| `TeXIndex.swift` | Lightweight TeX/Bib symbol scanning |
| `BuildRunner.swift` | latexmk arguments, process groups, output, timeout and cancellation |
| `BuildArtifacts.swift`, `SyncService.swift` | Auxiliary-file cleanup and bidirectional SyncTeX |
| `ToolchainSetup.swift` | Tool discovery, version detection, optional MacTeX download |
| `ProjectTemplates.swift`, `LibraryServices.swift` | Built-in template, imported templates, project operations and PDF covers |
| `EnhancedViews.swift`, `DocumentTab.swift`, `BrandViews.swift`, `ReadableSwitchStyle.swift` | Settings, PDF controls and reusable UI |

The current source is deliberately a small app rather than a reusable framework. Models are coordinated on the main actor; process execution and indexing use background work where appropriate.

## Editor bridge

The editor loads `Resources/Editor/index.html` and a bundled `editor.js`; there is no runtime CDN. JavaScript posts messages through `window.webkit.messageHandlers.folio`. Native messages are delivered to `window.folio.receive`.

The bridge synchronizes document text, selection/scroll positions, options, command bindings, and project symbols. Before operations such as saving, compiling or closing, native code asks the editor to flush its latest content and waits for the matching token. Composition state prevents saving partial input-method text.

Native workspace history groups cross-file operations. CodeMirror delegates undo/redo when this shared history is enabled. Completion snippets use multiple selections to keep environment names synchronized.

## Compile and preview

1. Confirm current editor content and save changed buffers; disk conflicts block overwriting.
2. Validate project-relative main, working/output, and explicit rc paths.
3. Launch latexmk with an argument array in an independent process group, with SyncTeX enabled.
4. On success, load/cache PDF data and optionally clean recognized auxiliary outputs.
5. On failure, retain the previous successful PDF and surface build diagnostics.

Builds have a 120-second timeout. Stop terminates the process group. Shell escape is off by default; latexmk uses `-norc` unless the user explicitly supplies an rc file. TeX tools execute locally with the user's permissions.

SyncTeX mapping is disabled for stale previews. A successful fresh build enables forward mapping from a source line and reverse mapping from PDF double-click/Command-click coordinates.

## macOS local storage

| Location | Content |
| --- | --- |
| `~/Library/Application Support/Compilune/registry.json` | Known projects and library metadata |
| `~/Library/Application Support/Compilune/workspace-state/<UUID>/` | Tabs, selection/scroll, recovery snapshots, last successful PDF |
| `~/Library/Application Support/Compilune/Templates/` | Imported template folders |
| UserDefaults for the app bundle | Fonts, theme, shortcuts, autosave and compile preferences |
| `<project>/.folio/project.json` | Main file, engine and project build options |
| `<working-directory>/.folio/build/` | Default compiler output directory |
| `~/Downloads/Compilune/` | Optional downloaded MacTeX installer |

The project UUID associates workspace state with a library entry. Removing an entry does not delete its project folder. Imported templates are copied to create independent projects.


Application data paths above describe fresh Compilune installations. Upgrades automatically retain the legacy data folder if it exists. Bundle/installer identifiers, IPC channels and `.folio` metadata remain stable to preserve preferences and project compatibility.

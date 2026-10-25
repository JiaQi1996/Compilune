# Changelog

## 0.2.13

- Editor tabs retain each file's last reading viewport independently of its caret. CodeMirror scroll snapshots restore the visible text and its screen position after line-height measurement, including rapid switches, renames and edits to inactive files.
- New files start at the top; explicit outline, search and SyncTeX destinations take priority over tab viewport restoration.
- macOS and Windows installers are synchronized at 0.2.13: macOS ARM64/Intel DMGs and Windows ARM64/x64 EXEs, with one SHA256 checksum per installer. macOS bundle build is 14. Windows packages include the completion, citation and export fixes introduced in 0.2.12.

## 0.2.12

- macOS installers updated to 0.2.12. Windows source includes the fixes below; Windows installers remain at 0.2.11 pending a later packaging run.
- Stabilized completion selection and scrolling by comparing native JSON dictionaries independently of property order and removing the completion/index feedback loop.
- Preserved the editor viewport before mouse hit testing when WKWebView refocuses a scrolled document, fixing clicks landing at an old cursor location. Native document updates now apply minimal changes without rebuilding the editor; citation insertion keeps the cursor after the citation and retains the reading position.
- Existing BibTeX keys now prompt to reuse references without appending duplicate entries. Mixed clipboards append only new entries, retain string definitions and support one-step undo.
- PDF export now defaults to the project alias, falling back to the project folder name, with portable filename sanitization on both platforms.

## 0.2.11

- Synchronized macOS and Windows application versions, installer names and documentation; macOS bundle build number is now 12.
- Default pdfLaTeX engine; independent file/outline expansion and scroll state, with files initially collapsed and outlines expanded one level.
- Clipboard BibTeX insertion with citation shortcuts, validation and a default bibliography choice; chained citation, reference, path and mirrored environment completion. Enter accepts a completion and Tab moves between snippet fields.
- Project aliases, duplicate-name guidance and project-location checks when creating or reopening projects.
- Refined project cards with larger PDF previews, folder paths, truncated titles and 1.5-second hover hints; corrected macOS formatting button text.

## 0.2.10

- Bundled private Perl 5.42.3 on macOS arm64/x86_64 and Windows x64, including Windows ARM64 through x64 emulation.
- Runtime source/version reporting, isolated child-process environment, TeX Live environment preservation and MiKTeX fallback without a separate Perl installation.
- Pinned archive checksums, relocatable macOS builds, Windows administrative extraction without system installation, runtime licenses and nested macOS code signing.

## 0.2.9 — Compilune / Windows preview

- Windows Electron host, local files/compiler, PDF.js and bidirectional SyncTeX.
- ARM64/x64 NSIS targets; UI, installation and launch verified on Windows 11 ARM64 (x64 under emulation). Windows TeX Live compilation remains unverified.
- Shared CodeMirror transport, web workbench, design tokens and cross-platform interface contract.
- Renamed the application to Compilune across macOS, Windows, documentation and installers; added an original crescent C icon. Existing settings, project libraries, recovery data and templates remain compatible.
- Windows MiKTeX: explicit noninteractive package installation, actionable missing-Perl guidance, refreshed Windows PATH after tool installation and a longer first-build timeout. Real pdfLaTeX builds, PDF search, double-click reverse SyncTeX and auxiliary cleanup passed in both app architectures.
- Mutually exclusive library/project screens, with acknowledged editor flush and Save/Discard/Cancel on return or project switch.
- Both interface/code sizes use 8–30 sliders, with scalable Windows interface text and standard Lucide settings icons.
- Toolchain settings offer TeX Live/MacTeX and MiKTeX downloads with full-install versus on-demand/network guidance. Imported templates remain independent local copies, including PDF figure assets.

## 0.2.8

- Independent compile-after-manual-save option, alongside compile-after-autosave.
- Clearer on/off/unavailable switches in light and dark appearance.
- Cancel pending save/compile timers after manual saves to avoid duplicate builds.
- Open-source source layout, consistent formatting, bilingual README, MIT license and reproducible packaging scripts.
- Architecture-specific build and package options for Apple Silicon and Intel; release output is limited to DMGs and SHA-256 checksums.
- Platform directories for macOS and future Windows/Linux/HarmonyOS ports, with shared CodeMirror source in `packages/editor/`.

## 0.2.7

- Global autosave toggle, 1–30 second delay, and compile-after-autosave.
- Cancel pending timed work immediately when autosave is disabled.

## 0.2.6

- Direct project pin buttons and application icon in the library.
- Automatic TeX discovery and optional MacTeX download/installer entry.
- Unsaved-change confirmation on project close and app quit.
- Restyled completion popup, English built-in snippets and default project.
- Mirrored environment-name fields and Enter to move into the body.

## 0.2.5

- New folder/file/TeX/Bib actions, blank-area root selection, and project-local drag moves.
- Explicit hierarchy indentation and folder-first sorting.

## 0.2.4

- PDF search and formatting toolbar hidden by default.
- Expanded `.tex` outline; `.cls`/`.sty` still inform completion indexing.

## 0.2.3

- macOS shortcut symbols and editable shortcut aliases.

## 0.2.2

- Full-width active tab styling including close button.
- Tooltips and shortcut hints across native/editor actions.

## 0.2.1

- Hierarchical file/outline navigation and live system appearance updates.

## 0.2.0

- Local editing and builds, PDF preview and SyncTeX, project library, navigation, search/replacement, recovery, sessions, and custom templates.

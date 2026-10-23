# Changelog

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

# Third-party notices

Folio TeX's original source is covered by the repository's [MIT License](../LICENSE). Third-party works retain their own copyright and license terms.

| Component | Use | License / notices |
| --- | --- | --- |
| CodeMirror 6 and bundled dependencies | Source editor | MIT; full package texts and generated version list in [Resources/Licenses](../apps/macos/Sources/FolioTeX/Resources/Licenses/NOTICE.md) |
| Lucide / Feather-derived icons | SVG editor icon assets | ISC with retained Feather/MIT attribution; [license text](../apps/macos/Sources/FolioTeX/Resources/Editor/LUCIDE-LICENSE.txt) |
| esbuild | Editor build tool only | MIT; installed from the npm lockfile, not bundled as a runtime |
| Apple system frameworks and SF Symbols | Native UI, WKWebView, PDFKit | Provided by macOS, not vendored in this repository |

`packages/editor/build.mjs` gathers license files for packages actually included by esbuild and refreshes the notice list each time the editor is built. Full third-party runtime license texts are copied into the app. The app build also includes Folio TeX's own MIT license.

The app icon is an original project asset; see [icon attribution](../assets/图标来源说明.md). MacTeX and its TeX tools are downloaded/installed separately under their respective terms and are not redistributed here.

中文：MIT 仅覆盖本项目原创部分；CodeMirror、Lucide 等依赖继续保留自己的许可与版权声明。构建工具、独立安装的 TeX 环境不包含在应用运行 bundle 中。

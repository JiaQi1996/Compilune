# Third-party notices

Compilune's original source is covered by the repository's [MIT License](../LICENSE). Third-party works retain their own copyright and license terms.

| Component | Use | License / notices |
| --- | --- | --- |
| CodeMirror 6 and bundled dependencies | Source editor | MIT; full package texts and generated version list in [Resources/Licenses](../apps/macos/Sources/Compilune/Resources/Licenses/NOTICE.md) |
| Lucide / Feather-derived icons | SVG editor icon assets | ISC with retained Feather/MIT attribution; [license text](../apps/macos/Sources/Compilune/Resources/Editor/LUCIDE-LICENSE.txt) |
| Electron / Chromium | Windows runtime | Electron MIT, bundled Chromium and third-party notices |
| PDF.js | Windows PDF rendering/search | Apache-2.0; full text copied into Windows resources |
| Private Perl 5.42.3 | latexmk interpreter / fallback | Artistic-1.0-Perl OR GPL-1.0-or-later; module and native-library notices retained. See [runtime notices](../third_party/perl/README.md) and [runtime design](PERL_RUNTIME.md) |
| electron-builder / NSIS | Windows installer build tools | Respective build-tool licenses and installer notices |
| esbuild | Editor build tool only | MIT; installed from the npm lockfile, not bundled as a runtime |
| Apple system frameworks and SF Symbols | Native UI, WKWebView, PDFKit | Provided by macOS, not vendored in this repository |

`packages/editor/build.mjs` gathers license files for packages actually included by esbuild and refreshes the notice list each time the editor is built. Full third-party runtime license texts are copied into the app. The app build also includes Compilune's own MIT license.

The app icon is an original project asset; see [icon attribution](../assets/图标来源说明.md). MacTeX and its TeX tools are downloaded/installed separately under their respective terms and are not redistributed here.

中文：MIT 仅覆盖本项目原创部分；CodeMirror、Lucide 等依赖继续保留自己的许可与版权声明。构建工具、独立安装的 TeX 环境不包含在应用运行 bundle 中。

Windows bundles retain Electron `LICENSE` and `LICENSES.chromium.html`, PDF.js Apache-2.0 and the shared editor/icon notices. Windows TeX Live/MiKTeX are installed separately. Project MIT does not relicense these dependencies.

# Shared CodeMirror editor

Platform-neutral editor source and static assets, with a native host bridge. The editor supports macOS WKWebView and the Windows parent-message transport; Linux and HarmonyOS apps are not implemented.

```sh
# From repository root; default output refreshes the macOS bundled resources.
npm --prefix packages/editor ci
npm --prefix packages/editor run build

# Or generate Editor/ and Licenses/ in a custom resource directory.
npm --prefix packages/editor run build -- --outdir /absolute/path/to/resources
```

`src.js` contains CodeMirror behavior. `static/Editor/` contains canonical HTML and SVG assets. `build.mjs` bundles JavaScript, copies static assets and gathers runtime licenses. macOS includes a generated copy in its Resources for offline native builds; edit the shared sources here and regenerate.

The host sends messages through `window.folio.receive(...)`; replies use WKWebView when present, otherwise parent postMessage with `channel: "folio-editor"`. Hosts validate the sender and flush edits before save/close. Windows sends `platform: "win32"` to select Ctrl bindings, labels and fonts.

公共编辑器源码和资源位于此目录。默认构建刷新 macOS 离线资源，也可使用 `--outdir` 输出到其他宿主的资源目录。支持 macOS WKWebView 与 Windows 父窗口桥接。新平台仍需宿主适配和保存/关闭前的编辑刷新确认；Linux/HarmonyOS 尚未实现。

# Shared CodeMirror editor

Platform-neutral editor source and static assets, with a native host bridge. The existing bridge targets macOS WKWebView; Windows, Linux and HarmonyOS hosts still require their own transport adapters.

```sh
# From repository root; default output refreshes the macOS bundled resources.
npm --prefix packages/editor ci
npm --prefix packages/editor run build

# Or generate Editor/ and Licenses/ in a custom resource directory.
npm --prefix packages/editor run build -- --outdir /absolute/path/to/resources
```

`src.js` contains CodeMirror behavior. `static/Editor/` contains canonical HTML and SVG assets. `build.mjs` bundles JavaScript, copies static assets and gathers runtime licenses. macOS includes a generated copy in its Resources for offline native builds; edit the shared sources here and regenerate.

The host sends messages through `window.folio.receive(...)`; the current `post(...)` transport sends replies through WKWebView. Before treating this as a cross-platform ready component, implement and test an equivalent host transport for the new platform.

公共编辑器源码和资源位于此目录。默认构建刷新 macOS 离线资源，也可使用 `--outdir` 输出到其他宿主的资源目录。当前消息传输仍使用 WKWebView；其他平台需要自己的桥接适配，并不代表已经完成跨平台应用。

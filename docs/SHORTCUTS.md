# 默认快捷键 / Default shortcuts

[English README](../README.md) · [中文说明](../README.zh-CN.md)

下表为 macOS 默认值；Windows 差异见文末。The table below lists macOS defaults; Windows differences follow it.

⌘ Command · ⌥ Option · ⇧ Shift · ⌃ Control · ↩ Return

编辑器快捷键可在设置中查看、筛选、改绑、禁用与恢复默认。Settings allow filtering, rebinding, disabling, and restoring editor shortcuts.

| 操作 | 快捷键 |
| --- | --- |
| 新建 / 打开项目 | `⌘N` / `⌘O` |
| 新建文件 / 保存 | `⌘⇧N` / `⌘S` |
| 编译 / 停止 | `⌘R` / `⌘.` |
| 项目库 / 设置 | `⌘K` / `⌘,` |
| 撤销 / 重做 | `⌘Z` / `⌘⇧Z` |
| 加粗 / 斜体 / 下划线 | `⌘B` / `⌘I` / `⌘U` |
| 查找 / 下一处 / 上一处 | `⌘F` / `⌘G` / `⌘⇧G` |
| 替换面板 / 当前 / 全部 | `⌘⌥F` / `⌘⌥↩` / `⌘⌥⇧↩` |
| 项目搜索 / 项目替换 | `⌘⇧F` / `⌘⇧H` |
| 快速打开 / 行:列 / 章节 | `⌘P` / `⌃G` / `⌘⇧O` |
| 光标处定义 / 返回 / 前进 | `⌘⌥G` / `⌃-` / `⌃⇧-` |
| 命令面板 / 手动补全 | `⌘⇧P` / `F5` |
| 注释 / 有序 / 无序列表 | `⌘/` / `⌘⇧7` / `⌘⇧8` |
| 一级 / 二级 / 三级标题 | `⌘⌥1` / `⌘⌥2` / `⌘⌥3` |
| 行内 / 独立公式 | `⌘⇧M` / `⌘⌥⇧M` |
| 文献 / 交叉引用 / 图片 | `⌘⇧C` / `⌘⇧R` / `⌘⇧I` |
| 表格 / 链接 | `⌘⌥⇧T` / `⌘L` |
| 代码字号增 / 减 / 重置 | `⌘=` / `⌘-` / `⌘0` |
| 界面字号增 / 减 / 重置 | `⌘⌥=` / `⌘⌥-` / `⌘⌥0` |
| 源码定位 PDF | `⌘⇧J` |

PDF 获得焦点时，查找与缩放命令操作 PDF；界面字号、代码字号和 PDF 缩放独立。

When the PDF has focus, find and zoom target the PDF. Interface size, code size, and PDF zoom are independent.

## Windows

Most Command shortcuts use Ctrl, and Option uses Alt. The Windows settings show readable `Ctrl+…` labels rather than internal `Mod` notation. Editor bindings can be changed; undo, redo, save and compile remain fixed native-menu shortcuts in this preview.

| Action / 操作 | Windows default |
| --- | --- |
| Save / compile-stop / library / settings | `Ctrl+S` / `Ctrl+R` / `Ctrl+K` / `Ctrl+,` |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Find / next / previous | `Ctrl+F` / `F3` / `Shift+F3` |
| Replace / replace one / replace all | `Ctrl+H` / `Ctrl+Alt+Enter` / `Ctrl+Alt+Shift+Enter` |
| Quick open / line-column / sections | `Ctrl+P` / `Ctrl+G` / `Ctrl+Shift+O` |
| Definition / back / forward | `F12` / `Alt+Left` / `Alt+Right` |
| Project search and replacement preview | `Ctrl+Shift+F` |
| Source to PDF | `Ctrl+Shift+J` |
| Command palette / completion | `Ctrl+Shift+P` / `F5` |

Windows uses the same editor actions and formatting commands; the full current registry lives in `apps/windows/src/main/store.js`. The project search dialog includes replacement preview and apply-all. macOS-specific font/menu shortcuts are not all mirrored by the Windows shell yet; sizes remain adjustable in settings.

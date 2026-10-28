# Editor previews / 编辑器预览

## English

Both platforms use the same CodeMirror completion and math preview components, with light and dark themes. Image preview cards contain only the image, without extra headings, captions, paths or build notes. Bibliography cards retain their metadata. A preview appears to the left of the completion list when space permits; narrow layouts stack it above or below the list. Arrow keys and Enter continue to select completion candidates.

- **Bibliography:** completing a key in `\cite{}` reads the current project BibTeX, including unsaved buffers. The card contains the title, first author, publication year, and journal or conference. `journal` / `journaltitle` take priority over `booktitle` / `eventtitle`; `date` supplies the year when `year` is absent. Missing values say “未提供”. This does not download papers or covers. Braced/quoted fields, concatenations, and earlier `@string` definitions are supported; an incomplete bibliography retains ordinary key completion while metadata may be unavailable.
- **Figures and tables:** completing a figure/table label in `\ref{}` shows an image cropped from the last successful PDF using the corresponding source content lines and SyncTeX. Recompile after source changes. A multi-page float previews its first mapped page. Placement may be approximate for macros, nested inputs, or complex floats; the full PDF remains available.
- **Local images:** `\includegraphics{}` path completion and hover preview project-local PNG/JPEG/PDF images and other formats supported by the host image decoder. PDF previews show page 1. No full-document compile is needed. Extensionless PDF/PNG/JPEG paths and simple `\graphicspath` declarations in the current source are recognized. Dynamic TeX path macros are not expanded. Images must be inside the project and at most 20 MB.
- **Math:** hover over `$$…$$`, `\[…\]`, or display environments such as `equation`, `align`, `alignat`, `gather`, and `multline`. Moving the caret into a formula and typing updates an offline KaTeX preview after a short debounce. Incomplete or unsupported expressions show a message. This lightweight preview does not load arbitrary project packages or execute TeX macros; custom document definitions and package-specific layouts may require the actual PDF. KaTeX, its fonts, and its MIT license are bundled locally.

Smart bibliography insertion also shows these metadata cards before confirmation. Multiple clipboard entries are listed individually; duplicate keys retain the reuse notice. Canceling does not change the source or bibliography.

Find counters show **current / total occurrences**. A query without a selected match shows `0 / total`; no results show `0 / 0`. Project find counts every occurrence, including several on a single line. Only the first 2,000 project results are listed; the full total and truncation are disclosed, and navigation stays within listed results. File find continues to support regex, case-sensitive, whole-word, replace, and replace-all actions.

A failed build opens its log. Clicking a source link reveals the exact line (and column when available) with a visible line marker, taking priority over saved reading positions. Recognized project-local file/line errors become links, including optional columns, long paths wrapped by TeX, and common `!` followed by `l.N` messages. Unresolvable diagnostics remain readable plain text. A successful build automatically closes the log; the toolbar can reopen it.

## 简体中文

两个平台共用 CodeMirror 补全、预览样式和公式渲染，支持浅色与深色模式。图片类预览卡片只保留图片，去掉额外标题、说明、路径和构建提示；文献卡片继续保留元数据。预览卡片优先放在候选列表左侧；窄窗口自动上下排列。上下键和 Enter 继续用于选择补全项。

- **文献：** 在 `\cite{}` 中补全文献键时，从项目 BibTeX（包括未保存内容）读取标题、第一作者、发表年份、期刊 / 会议。优先使用 `journal` / `journaltitle`，其次 `booktitle` / `eventtitle`；无 `year` 时从 `date` 提取年份。缺失字段显示「未提供」。无需下载论文或封面；支持花括号、引号、字段拼接和此前定义的 `@string`。Bib 尚未写完整时保留文献键补全，信息卡片可能暂缺字段。
- **图片与表格引用：** 在 `\ref{}` 中补全相应标签时，用 SyncTeX 根据实际内容行裁剪最近成功编译的 PDF。修改源码后需要重新编译；跨页内容预览第一个定位页。复杂宏、嵌套输入或复杂浮动体可能定位近似，完整内容可在 PDF 区查看。
- **本地图片：** `\includegraphics{}` 路径补全和鼠标悬浮可直接预览项目图片，支持 PNG/JPEG/PDF 及系统解码器支持的其他格式。PDF 图片显示第一页，无需编译整份文档。支持省略 PDF/PNG/JPEG 扩展名和当前源文件中简单的 `\graphicspath`；不展开动态路径宏。图片需位于项目内，最大 20 MB。
- **公式：** `$$…$$`、`\[…\]`、`equation`、`align`、`alignat`、`gather`、`multline` 等显示公式支持悬浮预览；光标位于公式中时，输入后短暂防抖并实时更新本地 KaTeX 预览。未完成或不支持的语法会提示。轻量预览不载入项目的任意宏包或执行 TeX 宏，自定义定义及特殊排版请以实际编译的 PDF 为准。KaTeX、字体和 MIT 许可随软件内置。

智能插入文献时也会先展示这些信息卡片，确认后才修改文稿。多篇逐篇列出；已有键仍提示复用。取消后不修改源码或文献文件。

查找计数为 **当前匹配 / 全部匹配**。尚未选中匹配时显示 `0 / 总数`，无结果显示 `0 / 0`。项目搜索按每次出现计数，同一行多次出现分别计算；列表最多展示前 2,000 项，并明确显示完整总数和截断提示，导航范围为已展示项。文件查找继续支持正则、大小写、整词、替换、全部替换。

编译失败时打开日志；点击错误链接后，指定行（以及可用的列号）优先于已保存的浏览位置，并标记对应代码行；能识别且位于项目内的文件 / 行号会变成可点击链接，支持可选列号、TeX 长路径折行、常见 `!` 与 `l.N` 错误。无法可靠定位的日志保留原文。编译成功后自动收起日志，可从工具栏重新打开。

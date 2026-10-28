# Folding and bibliography deduplication / 代码折叠与文献去重

## 简体中文

代码区域的行号旁会显示小三角。点击折叠，再次点击或点击 `… N 行` 展开。支持表格、图片、公式、列表、其他成对环境和多行花括号，并支持嵌套折叠。注释、verbatim、minted、lstlisting 和行内代码中的伪环境不会当作正文环境匹配。折叠只影响显示，不改变文件或编译内容；切换选项卡保留状态。查找、大纲、错误定位等跳到折叠区域内时会自动展开目标。重新打开软件时默认展开。

| 操作 | macOS 默认快捷键 | Windows 默认快捷键 |
| --- | --- | --- |
| 折叠当前块 | `⌘⌥[` | `Ctrl+Shift+[` |
| 展开当前块 | `⌘⌥]` | `Ctrl+Shift+]` |
| 折叠全部 | `⌘⌥⇧[` | `Ctrl+Alt+[` |
| 展开全部 | `⌘⌥⇧]` | `Ctrl+Alt+]` |
| 智能文献去重 | `⌘⌥⇧B` | `Ctrl+Alt+Shift+B` |

可在设置中修改快捷键，也可从命令面板执行。文件树显示 / 隐藏按钮位于顶部工具栏左侧。

点击工具栏“智能文献去重”或使用快捷键，会扫描项目 Bib 及 TeX 源码，包括尚未保存的缓冲区。题目比较忽略大小写、保护性花括号、常见格式、标点和空白；作者支持 `姓, 名` / `名 姓`、首字母形式以及作者列表顺序差异。题目或作者缺失、身份无法可靠解析的记录不会自动分组。

预览列出每组条目、引用键、文件 / 行号和正文引用位置。默认优先保留正文明确加载的 Bib 中字段较完整的记录，可以改选。不同年份、不同 DOI 或不同作者全名会提示核对，并默认不勾选。同一键指向不同文献、组内 Bib 继承等歧义暂不自动合并。跨文件合并时需确认正文加载了保留条目所在的 Bib。

确认后，保留所选条目的已有字段，补入其他条目中缺失且可解析的字段；删除重复记录，并把 `cite`、`citep`、`citet`、`autocite`、`parencite`、`cites`、`nocite` 等常见命令中的旧键替换为保留键。支持多键、可选参数和 Bib 内的 `crossref` / `xref` / `xdata` / `related` / `entryset` 引用。注释、verbatim、行内代码、`\string` 和 `\detokenize` 示例保留原文。无法解析的字符串宏会阻止不可靠的合并。

整个修改作为一次编辑事务，可以整体撤销；保存遵循当前自动保存设置。取消不修改文件。预览后若源码、Bib 或磁盘内容变化，需重新检查。自定义且名称不含 `cite` 的引用宏未纳入自动替换范围。

“打开项目后自动编译”默认开启，可在设置的保存与编译页面关闭。每次成功编译会将 PDF 原子写入主 TeX 文件所在目录，名称使用主 TeX 文件的基本名，例如 `paper/main.tex` 对应 `paper/main.pdf`。失败保留上次成功版本；内部构建目录仍用于预览、SyncTeX 与日志。同步失败会提示，构建目录中的成功 PDF 仍保留。

## English

Triangles beside line numbers fold paired environments, display math and multiline groups. Click the triangle or `… N 行` placeholder to unfold. Nested folds and per-tab state are supported; source navigation reveals folded targets. Folding changes only the editor display. The file-tree toggle is now on the left of the workspace toolbar. Shortcuts are configurable; the table above lists the defaults.

Smart bibliography deduplication scans project Bib and TeX buffers, including unsaved edits. It compares normalized titles and author identities across different entry keys, handling surname/given-name order and initials. Missing metadata is not guessed. A preview lists duplicate records, keys, source file/line locations and citation uses, with a choice of retained record. Explicitly loaded Bib files are preferred. Conflicting publication years, DOIs or full names require review; ambiguous key collisions and intra-group inheritance are blocked. For cross-file merges, ensure the document loads the retained entry's Bib file.

Confirmation preserves the selected record's existing fields, fills missing resolvable fields, removes duplicate records and updates common cite-family commands plus Bib cross-references. Multi-key and optional-argument citations are supported. Comments and literal code examples remain unchanged. Unresolved string macros prevent unsafe metadata moves. Custom citation macros whose names do not contain `cite` are not rewritten automatically.

Changes form one undo transaction and follow the current autosave policy. Canceling leaves all files unchanged. If buffers or disk contents change after preview, rescan before applying.

Compile on open is enabled by default and can be disabled in settings. Every successful build atomically synchronizes a PDF beside the main TeX file, using its basename. The internal build PDF and SyncTeX/log files retain their usual location. Failed builds preserve the last successful PDF; synchronization failures are reported while retaining the successful build artifact.

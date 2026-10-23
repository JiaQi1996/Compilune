<p align="center"><img src="assets/AppIcon.png" width="112" alt="Folio TeX 应用图标"></p>

# Folio TeX · 墨页

**在 macOS 上本地编写、编译和预览 LaTeX。**

[English](README.md) · 简体中文

Folio TeX 从项目库开始，将 CodeMirror 6 源码编辑器、本地编译和 PDF 预览整合到原生 macOS 工作区。项目最初为个人写作开发，现以 MIT 协议分享。

当前版本：**0.2.8**。应用界面目前以**简体中文**为主，内置补全说明和默认文稿模板使用英文。

## 功能

- **项目库**：打开本地文件夹、置顶、排序、PDF 封面预览、归档、重新关联移动后的文件夹。
- **源码编辑**：CodeMirror 6 语法高亮，命令、环境、自定义宏、文献、标签和文件路径补全。环境片段同步编辑 `begin` / `end` 名称，按 Enter 跳到正文。
- **写作工具**：可展开的格式与插入工具栏、可自定义的快捷键、命令面板、快速打开、行列跳转和定义跳转。格式操作生成 LaTeX 源码，编辑区不是渲染后的所见即所得文稿。
- **查找替换**：文件内支持正则；项目内普通文本搜索、替换预览，以及跨文件替换的整体撤销。
- **文件导航**：文件夹优先、分级缩进、新建文件夹/TeX/Bib、项目内拖动移动文件，以及默认展开、点击跳转的 `.tex` 大纲。
- **本地编译**：latexmk 配合 pdfLaTeX、XeLaTeX 或 LuaLaTeX；可设置主文件、工作/输出目录、指定 rc 文件与 shell escape。
- **PDF 预览**：查找、缩放、页码、上次成功预览缓存和双向 SyncTeX。双击 PDF 跳转源码，源码中按 `⌘⇧J` 定位 PDF。
- **保存策略**：可选自动保存及 1–30 秒等待时间；手动保存后编译、自动保存后编译分别设置；未保存确认与恢复快照。
- **个性设置**：实时跟随系统外观、独立浅色/深色主题、界面与代码字号、本地自定义模板，以及可选的编译过程文件清理。
- **工具链**：自动检测 TeX 环境；可下载 MacTeX 并打开 macOS 安装器。

编辑和编译均在本地执行。编辑器 bundle、图标和运行依赖随应用打包，日常使用不需要 Node.js 或联网；下载 MacTeX 时需要网络。

## 平台状态

采用一个仓库、各平台独立目录的结构，公共编辑器放在共享包中。

| 平台 | 目录 | 当前状态 |
| --- | --- | --- |
| macOS | [`apps/macos/`](apps/macos/README.md) | 已实现，提供 Apple 芯片与 Intel 构建 |
| Windows | [`apps/windows/`](apps/windows/README.md) | 计划移植，暂无可运行应用 |
| Linux | [`apps/linux/`](apps/linux/README.md) | 计划移植，暂无可运行应用 |
| HarmonyOS | [`apps/harmonyos/`](apps/harmonyos/README.md) | 计划移植，暂无可运行应用 |

[`packages/editor/`](packages/editor/README.md) 存放公共编辑器。窗口、文件访问、编译进程和 PDF 需要各平台适配，现有 SwiftUI/AppKit/PDFKit 代码属于 macOS。详细边界见[平台移植计划](docs/PLATFORMS.md)。

## macOS 系统与芯片支持

| 项目 | 要求 / 状态 |
| --- | --- |
| 系统 | macOS 14 及以上 |
| Apple 芯片 | `arm64`，已在 Apple Silicon 上构建并验证核心与集成功能 |
| Intel 芯片 | `x86_64`，已交叉编译并打包，尚未在 Intel Mac 实机运行验证 |
| LaTeX | 本地 TeX 发行版，包含 `latexmk`、所选引擎和 `synctex` |
| 构建应用 | Xcode 或 Swift Command Line Tools，Swift 5.9+；本项目使用 Swift 6.4 验证 |
| 修改网页编辑器 | Node.js 18+ 与 npm |

脚本分别生成各芯片版本，目前不是 Universal 二合一应用。Intel 的运行兼容性仍需 Intel Mac 实测。

## 开始使用

1. 按下方说明构建，或在仓库 Releases 提供安装包时选择匹配芯片的版本。
2. 启动后进入项目库，选择「打开本地项目」，或用「新建项目」创建内置英文 `article` 文稿。
3. 安装 MacTeX 或其他适用的 TeX 发行版。在「设置 → 工具链」检测环境或指定可执行目录，MacTeX 通常为 `/Library/TeX/texbin`。
4. 在项目「配置」中选择主 `.tex` 文件与引擎，按 `⌘R` 编译。

本地打包使用 **ad-hoc 签名**，尚未进行 Developer ID 分发签名与公证。从网络下载的版本可能需要在 macOS 中明确允许打开。

### 保存与自动编译

自动保存默认开启，等待 1 秒；两个全局保存后编译选项默认关闭。「保存后自动编译」对应手动保存，与自动保存开关独立；「自动保存后自动编译」及项目级自动编译均需要开启自动保存。只有写盘成功后才触发相应编译，正在构建时最多排队一次后续构建。

关闭项目或退出时，对仍未保存的内容提供确认。「不保存」不会回滚已经自动保存到磁盘的修改。关闭定时自动保存后，手动编译、移动文件和关闭文件选项卡等操作仍可能先保存缓冲。

### PDF 定位与清理

双向定位依赖最新源码成功编译生成的 SyncTeX。旧缓存或修改前的 PDF 需要先重新编译；定位通常精确到源码行，空白、公式或宏展开位置可能存在偏差。

开启清理后，只在编译成功时移除已识别的辅助文件，保留 PDF、SyncTeX 与源文件；失败时保留诊断文件。清理会减少增量缓存，下次编译可能变慢。

## 从源码构建

以下命令在仓库根目录执行；Swift Package 位于 `apps/macos/`，用 Xcode 开发时打开该目录。尚未安装 Apple 开发工具时先运行：

```sh
xcode-select --install
./scripts/build-app.sh
```

构建的 App 保存在已忽略的本地目录：`apps/macos/.build-arm64/artifacts/Folio TeX-arm64.app` 或 `apps/macos/.build-x86_64/artifacts/Folio TeX-x86_64.app`。

仓库已包含离线编辑器 bundle，仅构建原生应用无需安装 npm 依赖。修改 `packages/editor/src.js` 后，先重新生成：

```sh
npm --prefix packages/editor ci
npm --prefix packages/editor run build
./scripts/build-app.sh
```

编辑器构建也会更新依赖许可证清单；提交时请同时包含源码、重新生成的 bundle 和许可证变更。

### Intel 构建与安装包

```sh
# 使用支持 x86_64 的 macOS SDK 交叉编译 Intel 应用。
./scripts/build-app.sh --arch x86_64

# 为当前机器芯片构建并生成 DMG 与 SHA-256 校验文件。
./scripts/package.sh

# 明确生成 Intel DMG 与校验文件。
./scripts/package.sh --arch x86_64
```

`dist/` 只保留 `arm64`、`x86_64` 两个 DMG 及各自的 `.sha256` 校验文件。每份校验文件仅包含对应 DMG；可在 `dist/` 内运行 `shasum -a 256 -c FolioTeX-0.2.8-arm64.sha256` 校验，Intel 版替换相应文件名。打包脚本检查应用签名与 DMG 完整性，并生成 SHA-256 校验文件。版本号位于 `VERSION`，可通过 `FOLIO_BUILD_NUMBER` 指定应用构建号。

脚本使用经本机 Command Line Tools 验证的 SwiftPM `native` 后端；新版 Swift 会提示该后端已弃用，本机当前仍可成功构建。代码中的显式 property-wrapper 别名用于绕过该环境缺少 SwiftUI macro 插件的问题。

## 参与开发

提交问题时请附上复现步骤及相关日志，修改公共编辑器后请同步生成资源。此仓库仅包含应用源码、构建脚本和文档，本地验证资料在仓库外单独保留。

## 目录

```text
apps/
  macos/                已实现的原生应用：Package.swift、Sources、scripts
  windows/              Windows 移植预留，尚未实现
  linux/                Linux 移植预留，尚未实现
  harmonyos/            HarmonyOS 移植预留，尚未实现
packages/
  editor/               公共 CodeMirror 源码、静态资源、bundle 构建
scripts/                macOS 构建、打包的根目录入口
docs/                   架构、平台计划、快捷键说明
assets/                 共享软件图标源文件及来源说明
```

更多信息：[架构与本地数据](docs/ARCHITECTURE.md)、[快捷键](docs/SHORTCUTS.md)、[更新记录](CHANGELOG.md)。

## 当前限制

- 项目级搜索是忽略大小写的普通文本搜索，正则仅限文件内；项目结果最多 2,000 个匹配行。
- 使用 UTF-8，支持基本 CRLF 保留；其他编码需先转换，混合换行未逐段保留。
- 索引为轻量解析，不解释任意 TeX 宏展开或完整 BibTeX 语法；`.cls` / `.sty` 参与补全，但不显示在侧栏大纲。
- 重命名或移动文件后，不会自动改写正文中的 `\input`、图片或文献路径。
- 外部文件监视约每秒轮询一次；恢复快照保存文本，不保存完整撤销历史。
- 大型 LuaLaTeX/Biber 项目、全部中文字体/宏包组合、旋转页定位及完整辅助功能尚未全面验收。
- 数 GB 的 MacTeX 下载与系统安装流程尚未端到端实测。

## 许可证与致谢

项目原创代码采用 [MIT License](LICENSE)，版权所有 © 2026 JiaQi。

[CodeMirror 6](https://codemirror.net/) 及其运行依赖保留 MIT 许可；[Lucide](https://lucide.dev/) 图标保留 ISC / Feather 声明。完整说明见[第三方依赖](docs/THIRD_PARTY.md)和 `apps/macos/Sources/FolioTeX/Resources/` 中的许可文件。

MacTeX 与 TeX 工具需单独安装，不随仓库分发。Folio TeX 是独立项目，与 Texifier 没有关联。

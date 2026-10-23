import AppKit
import PDFKit
import SwiftUI

typealias ViewFocus<Value: Hashable> = SwiftUI.FocusState<Value>

struct DocumentOutlineBranch: View {
    @ObservedObject var workspace: Workspace
    let node: OutlineNode
    var depth = 0
    @ViewState private var expanded = true
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                if node.children != nil {
                    Button {
                        expanded.toggle()
                    } label: {
                        Image(systemName: expanded ? "chevron.down" : "chevron.right").font(
                            .system(size: 9, weight: .semibold)
                        ).frame(width: 14, height: 24)
                    }
                    .buttonStyle(.plain).help(expanded ? "收起此级大纲" : "展开此级大纲")
                } else {
                    Color.clear.frame(width: 14, height: 24)
                }
                Button {
                    workspace.openOutline(node)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: node.icon).foregroundStyle(sage)
                        Text(node.label).lineLimit(2)
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 5).contentShape(Rectangle())
                }.buttonStyle(.plain).help("打开 \(node.path)，定位到第 \(node.line) 行")
            }.padding(.leading, CGFloat(depth) * 18).frame(maxWidth: .infinity, alignment: .leading)
            if expanded, let children = node.children {
                ForEach(children) { child in
                    DocumentOutlineBranch(workspace: workspace, node: child, depth: depth + 1)
                }
            }
        }
    }
}

struct ProjectConfigurationView: View {
    @ObservedObject var workspace: Workspace
    @ObservedObject var prefs = Preferences.shared
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("项目编译配置").font(.title2)
            Form {
                Picker("主文件", selection: $workspace.project.root) {
                    Text("请选择").tag("")
                    ForEach(workspace.files.filter { $0.pathExtension == "tex" }, id: \.path) { url in
                        Text(relative(url, to: workspace.project.url)).tag(
                            relative(url, to: workspace.project.url))
                    }
                }
                Picker("引擎", selection: $workspace.project.engine) {
                    ForEach(["XeLaTeX", "pdfLaTeX", "LuaLaTeX"], id: \.self) { Text($0) }
                }.help("选择当前项目使用的本地 TeX 编译引擎")
                Toggle("本项目自动保存后自动编译", isOn: $workspace.autoCompile).disabled(!prefs.autoSaveEnabled).help(
                    "自动保存成功后编译本项目；全局自动编译开启时，所有项目都会自动编译")
                TextField("工作目录（项目相对路径；留空使用主文件目录）", text: $workspace.workingDirectory)
                TextField("输出目录（相对工作目录）", text: $workspace.outputDirectory)
                Toggle("允许 shell escape（仅用于可信项目）", isOn: $workspace.shellEscape).help("允许 TeX 编译时执行文稿指定的外部命令")
                TextField("latexmk rc 配置（项目相对路径；留空不加载）", text: $workspace.rcFile)
                Text("rc 是可执行的 Perl 配置。默认不加载系统或用户 rc；只加载这里指定的一份。").font(.caption).foregroundStyle(.secondary)
            }.formStyle(.grouped)
            HStack {
                Spacer()
                Button("保存配置") {
                    if let message = workspace.validateBuildPaths() {
                        workspace.error = message
                        return
                    }
                    workspace.configure()
                    workspace.showConfig = false
                }.help("保存当前项目的编译选项").disabled(workspace.project.root.isEmpty)
            }
        }.padding(24).frame(width: 600, height: 510)
    }
}
struct PDFToolbar: View {
    @ObservedObject var workspace: Workspace
    @ObservedObject var prefs = Preferences.shared
    @ViewFocus var searching: Bool
    var body: some View {
        VStack(spacing: 5) {
            HStack {
                Text("PDF").bold()
                Button("−") { workspace.pdfZoom -= 1 }.help("缩小 PDF，代码与界面字号保持不变")
                Button("+") { workspace.pdfZoom += 1 }.help("放大 PDF，代码与界面字号保持不变")
                Button("适宽") { workspace.pdfZoom = 0 }.help("让 PDF 自动适应预览区域宽度")
                Spacer()
                TextField("页", value: $workspace.pdfPage, format: .number).frame(width: 40)
                Text("页").foregroundStyle(.secondary)
                Button {
                    workspace.pdfSearchVisible.toggle()
                    searching = workspace.pdfSearchVisible
                    if !workspace.pdfSearchVisible { workspace.pdfQuery = "" }
                } label: {
                    Image(systemName: "magnifyingglass")
                }
                .help(workspace.pdfSearchVisible ? "收起 PDF 查找栏" : "展开 PDF 查找栏")
                Button("定位") { workspace.send?(["type": "command", "name": "forwardSync"]) }.help(
                    prefs.commandHint("forwardSync", "把源码光标所在行定位到 PDF"))
            }
            if workspace.pdfSearchVisible {
                HStack {
                    TextField("查找 PDF", text: $workspace.pdfQuery).textFieldStyle(.roundedBorder).focused(
                        $searching
                    ).onSubmit { workspace.pdfSearchStep += 1 }
                    Button("↑") { workspace.pdfSearchStep -= 1 }.help(
                        prefs.commandHint("findPrevious", "跳到 PDF 上一处匹配"))
                    Button("↓") { workspace.pdfSearchStep += 1 }.help(
                        prefs.commandHint("findNext", "跳到 PDF 下一处匹配"))
                    Text(
                        "\(workspace.pdfMatches == 0 ? 0 : workspace.pdfMatchIndex+1)/\(workspace.pdfMatches)"
                    ).font(.caption).monospacedDigit()
                    Button {
                        workspace.pdfSearchVisible = false
                        workspace.pdfQuery = ""
                        searching = false
                    } label: {
                        Image(systemName: "xmark")
                    }.help("关闭 PDF 查找栏并清除匹配").accessibilityLabel("关闭 PDF 查找")
                }
            }
            HStack {
                Text(workspace.pdfStale ? "预览为上次成功结果，编译后启用定位" : "双击 PDF 跳转源码 · ⌘ 单击亦可").font(.caption)
                    .foregroundStyle(workspace.pdfStale ? .orange : .secondary)
                Spacer()
            }
        }.padding(8).onChange(of: searching) { _, value in workspace.pdfSearchFocused = value }.onDisappear {
            workspace.pdfSearchFocused = false
        }.onChange(of: workspace.pdfFindRequest) { _, _ in
            workspace.pdfSearchVisible = true
            DispatchQueue.main.async { searching = true }
        }.onChange(of: workspace.pdfPage) { _, _ in workspace.persistSessionSoon() }.onChange(
            of: workspace.pdfZoom
        ) { _, _ in workspace.persistSessionSoon() }
    }
}
struct ProjectCover: View {
    let project: Project
    var body: some View {
        ZStack {
            sage.opacity(0.09)
            if let image = ThumbnailStore.shared.thumbnail(project) {
                Image(nsImage: image).resizable().scaledToFit().padding(.top, 14).padding(.horizontal, 35)
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "doc.text").font(.system(size: 35)).foregroundStyle(sage)
                    Text("尚未生成预览").font(.caption).foregroundStyle(.secondary)
                }.padding(25).background(.background, in: RoundedRectangle(cornerRadius: 4)).padding(.top, 14)
            }
        }.frame(height: 155).clipped()
    }
}
struct SplitAutosave: NSViewRepresentable {
    let id: String
    func makeNSView(context: Context) -> NSView {
        let v = NSView()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            guard let content = v.window?.contentView else { return }
            func visit(_ node: NSView, _ depth: Int) {
                if let split = node as? NSSplitView {
                    split.autosaveName = NSSplitView.AutosaveName("Folio." + id + ".\(depth)")
                }
                for (i, child) in node.subviews.enumerated() { visit(child, depth * 10 + i + 1) }
            }
            visit(content, 0)
        }
        return v
    }
    func updateNSView(_ nsView: NSView, context: Context) {}
}
struct SettingsView: View {
    @ObservedObject var prefs = Preferences.shared
    @ObservedObject var templates = TemplateStore.shared
    @ViewState var keys: [String: String] = [:]
    @ViewState var query = ""
    @ViewState var keyError = ""
    var body: some View {
        TabView {
            Form {
                Section("外观") {
                    Picker("主题", selection: $prefs.theme) {
                        ForEach(["系统", "浅色", "深色"], id: \.self) { Text($0) }
                    }.help("选择固定浅色、固定深色或实时跟随系统外观")
                    HStack {
                        Text("界面 \(Int(prefs.uiSize)) pt")
                        Slider(value: $prefs.uiSize, in: 11...18, step: 1)
                        Button("重置") { prefs.uiSize = 13 }.help("恢复界面字号为 13 pt")
                    }
                }
                Section("CodeMirror 6") {
                    HStack {
                        Text("代码 \(Int(prefs.codeSize)) px")
                        Slider(value: $prefs.codeSize, in: 10...28, step: 1)
                        Button("重置") { prefs.codeSize = 13 }.help("恢复代码字号为 13 px")
                    }
                    Text("代码字号、界面字号和 PDF 缩放独立。").font(.caption)
                }
                Section("保存") {
                    Toggle("自动保存", isOn: $prefs.autoSaveEnabled).help("停止编辑后自动保存；关闭后使用 ⌘S 手动保存")
                    HStack {
                        Text("停止编辑 \(Int(prefs.autoSaveDelay)) 秒后保存")
                        Spacer()
                        Stepper("保存等待时间", value: $prefs.autoSaveDelay, in: 1...30, step: 1).labelsHidden()
                            .disabled(!prefs.autoSaveEnabled).help("设置自动保存等待时间，范围为 1 至 30 秒")
                    }
                    Toggle("保存后自动编译", isOn: $prefs.compileAfterManualSave).help(
                        "使用 ⌘S 或菜单保存成功后自动编译，不依赖自动保存开关")
                    Toggle("自动保存后自动编译", isOn: $prefs.compileAfterAutoSave).disabled(!prefs.autoSaveEnabled)
                        .help("所有项目在自动保存成功后编译；保存失败时不会编译")
                    if !prefs.autoSaveEnabled {
                        Text("自动保存后自动编译不可用：需先开启自动保存。").font(.caption).foregroundStyle(.primary)
                    }
                    Text("关闭自动保存后保留未保存提示与恢复快照。手动编译、移动文件等操作仍会先保存；项目中单独启用的自动编译也需要开启自动保存。").font(.caption)
                        .foregroundStyle(.secondary)
                }.toggleStyle(ReadableSwitchStyle())
                Section("编译") {
                    Toggle("成功编译后清除编译过程文件", isOn: $prefs.cleanAfterBuild).help(
                        "成功后清理已知辅助文件，保留 PDF 和 SyncTeX；失败时保留日志")
                    Text("清理本次主文件及编译记录列出的已知辅助文件；保留 PDF 和 SyncTeX，不清理输出目录以外的文件。失败时保留日志。下次编译可能需要完整重建。").font(
                        .caption
                    ).foregroundStyle(.secondary)
                    Text("自动编译、输出目录、shell escape 和 rc 在各项目编译配置中设置。").font(.caption)
                }
            }.formStyle(.grouped).tabItem { Label("外观与编译", systemImage: "slider.horizontal.3") }
            VStack(alignment: .leading, spacing: 12) {
                TextField("筛选编辑命令…", text: $query).textFieldStyle(.roundedBorder)
                Text("⌘ Command　⌥ Option　⇧ Shift　⌃ Control").font(.caption).foregroundStyle(.secondary)
                Text("例如 ⌘⇧F、Command-Shift-F 或 F5；留空禁用。基础应用快捷键保留。").font(.caption).foregroundStyle(.secondary)
                List(
                    EditorCommand.all.filter {
                        query.isEmpty || $0.title.localizedCaseInsensitiveContains(query)
                    }
                ) { c in
                    HStack {
                        Text(c.title)
                        Spacer()
                        TextField(
                            ShortcutNotation.display(c.key),
                            text: Binding(
                                get: { keys[c.id] ?? ShortcutNotation.display(c.key) },
                                set: { keys[c.id] = $0 })
                        ).textFieldStyle(.roundedBorder).font(
                            .system(size: prefs.uiSize, design: .monospaced)
                        ).frame(width: 185).help("输入 Mac 键位符号（如 ⌘⇧F）或 Command-Shift-F；留空禁用")
                    }
                }
                if !keyError.isEmpty { Text(keyError).foregroundStyle(.red).font(.caption) }
                HStack {
                    Button("恢复默认") { keys = [:] }.help("将键位编辑恢复为默认值；点击保存快捷键后生效")
                    Spacer()
                    Button("保存快捷键") {
                        let canonical = keys.mapValues { ShortcutNotation.canonical($0) }
                        if let message = EditorCommand.validate(canonical) {
                            keyError = message
                        } else {
                            prefs.shortcuts = canonical
                            keys = canonical.mapValues { ShortcutNotation.display($0) }
                            keyError = ""
                            AppDelegate.shared.installEditorMenus()
                        }
                    }.help("检查冲突并保存键位，立即同步到菜单和编辑器")
                }
            }.padding(18).onAppear { keys = prefs.shortcuts.mapValues { ShortcutNotation.display($0) } }
                .tabItem { Label("快捷键", systemImage: "keyboard") }
            ToolchainSettingsView().tabItem { Label("工具链", systemImage: "terminal") }
            VStack(alignment: .leading, spacing: 14) {
                Text("自定义模板").font(.title2)
                Text("导入含 .tex 主文件的本地文件夹。新建项目时可选择模板；文件会复制到新项目，模板本身保持不变。").foregroundStyle(.secondary)
                List(templates.templates, id: \.self) { name in
                    HStack {
                        Text(name)
                        Spacer()
                        Button("移除") {
                            do {
                                try FileManager.default.trashItem(
                                    at: templates.directory.appendingPathComponent(name),
                                    resultingItemURL: nil)
                                templates.reload()
                            } catch { keyError = error.localizedDescription }
                        }.help("将此模板移到废纸篓，已有项目不受影响")
                    }
                }
                HStack {
                    Button("导入模板文件夹…") {
                        do { try templates.importTemplate() } catch { keyError = error.localizedDescription }
                    }.help("导入含有 .tex 文件的本地文件夹，供新建项目使用")
                    Button("打开模板目录") { NSWorkspace.shared.open(templates.directory) }.help(
                        "在 Finder 中打开已导入模板的存储目录")
                }
                if !keyError.isEmpty { Text(keyError).foregroundStyle(.red) }
            }.padding(20).tabItem { Label("自定义模板", systemImage: "doc.on.doc") }
        }.padding(12).font(.system(size: prefs.uiSize)).tint(sage).preferredColorScheme(prefs.scheme)
    }
}

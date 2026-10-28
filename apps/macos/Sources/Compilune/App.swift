import AppKit
import PDFKit
import SwiftUI
import WebKit

// Explicit property-wrapper alias avoids SDK 27 State macro plugin dependency in CLT-only builds.
typealias ViewState<Value> = SwiftUI.State<Value>

let sage = CompiluneDesign.accent
@main struct CompiluneApp {
    @MainActor static func main() {
        // App-scoped AppKit tooltip delay, in milliseconds; leave system preferences untouched.
        UserDefaults.standard.set(1500, forKey: "NSInitialToolTipDelay")
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
        _ = delegate
    }
}
@MainActor final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    static var shared: AppDelegate!
    var libraryWindow: NSWindow!
    var windows: [UUID: NSWindow] = [:]
    var models: [UUID: Workspace] = [:]
    var settingsWindow: NSWindow?
    var terminating = false
    var changingWindows = false
    var active: Workspace? { windows.first(where: { $0.value.isKeyWindow }).flatMap { models[$0.key] } }
    func applicationDidFinishLaunching(_ notification: Notification) {
        Self.shared = self
        menu()
        showLibrary()
        ToolchainStore.shared.detect(versions: false)
        NSApp.activate(ignoringOtherApps: true)
    }
    func makeWindow<V: View>(_ title: String, view: V, width: CGFloat = 1360, height: CGFloat = 862)
        -> NSWindow
    {
        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: width, height: height),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        w.title = title
        w.titlebarAppearsTransparent = true
        w.appearance = Preferences.shared.windowAppearance
        w.isReleasedWhenClosed = false
        w.contentView = NSHostingView(rootView: view)
        w.standardWindowButton(.closeButton)?.toolTip = "关闭窗口"
        w.standardWindowButton(.miniaturizeButton)?.toolTip = "最小化窗口"
        w.standardWindowButton(.zoomButton)?.toolTip = "缩放窗口"
        w.center()
        return w
    }
    @objc func showLibrary() {
        performWindowTransition {
            guard await self.closeProjectWindows(Array(self.models.keys)) else { return }
            self.presentLibrary()
        }
    }
    func presentLibrary() {
        if libraryWindow == nil { libraryWindow = makeWindow("Compilune · 项目库", view: LibraryView()) }
        libraryWindow.makeKeyAndOrderFront(nil)
    }
    func closeLibrary() {
        libraryWindow?.close()
        libraryWindow = nil
    }
    func performWindowTransition(_ action: @escaping @MainActor () async -> Void) {
        guard !changingWindows, !terminating else { return }
        changingWindows = true
        Task {
            defer { changingWindows = false }
            await action()
        }
    }
    func closeProjectWindows(_ ids: [UUID]) async -> Bool {
        let closing = ids.compactMap { models[$0] }
        var discarded: [Workspace] = []
        for model in closing { model.pauseAutosaveForClose() }
        var confirmed = false
        defer {
            if !confirmed {
                for model in closing { model.resumeAfterCancelledClose() }
            }
        }
        for model in closing {
            guard await model.flushForClose() else { return false }
            switch model.closeDecision() {
            case .cancel: return false
            case .discard: discarded.append(model)
            case .save:
                guard model.saveAll() else { return false }
            }
        }
        for model in discarded { model.discardForClose() }
        for id in ids {
            models[id]?.persistSession()
            models[id]?.stopBackgroundWork()
            let window = windows.removeValue(forKey: id)
            models.removeValue(forKey: id)
            window?.delegate = nil
            window?.close()
        }
        confirmed = true
        return true
    }
    func open(_ project: Project) {
        guard FileManager.default.fileExists(atPath: project.path) else {
            Library.shared.error = "项目文件夹已移动。请通过打开本地项目重新选择文件夹。"
            return
        }
        performWindowTransition {
            let others = self.models.keys.filter { $0 != project.id }
            guard await self.closeProjectWindows(Array(others)) else { return }
            if let window = self.windows[project.id] {
                self.closeLibrary()
                window.makeKeyAndOrderFront(nil)
                return
            }
            var p = project
            p.opened = Date()
            Library.shared.update(p)
            let model = Workspace(p)
            let window = self.makeWindow(p.name, view: WorkspaceView(workspace: model))
            window.minSize = NSSize(width: 1000, height: 700)
            window.delegate = self
            self.windows[p.id] = window
            self.models[p.id] = model
            self.closeLibrary()
            window.makeKeyAndOrderFront(nil)
        }
    }
    @objc func openFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let selected = panel.url {
            let url = selected.resolvingSymlinksInPath().standardizedFileURL
            if Library.shared.project(at: url) == nil {
                let response = Library.shared.confirmDefaultName(url.lastPathComponent, path: url.path)
                guard response == .alertFirstButtonReturn || response == .alertSecondButtonReturn else {
                    return
                }
                let project = Library.shared.register(url)
                if response == .alertFirstButtonReturn { Library.shared.rename(project) }
                open(Library.shared.projects.first(where: { $0.id == project.id }) ?? project)
            } else {
                open(Library.shared.register(url))
            }
        }
    }
    @objc func newProject() {
        let chooser = NSAlert()
        chooser.messageText = "选择模板"
        chooser.informativeText = "可以在设置中导入自己的模板文件夹。"
        let popup = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 300, height: 28))
        popup.addItems(withTitles: ["基础英文文稿"] + TemplateStore.shared.templates)
        chooser.accessoryView = popup
        chooser.addButton(withTitle: "继续").toolTip = "确认当前选择，进入下一步"
        chooser.addButton(withTitle: "取消").toolTip = "取消操作，保留原内容"
        guard chooser.runModal() == .alertFirstButtonReturn else { return }
        let chosenTemplate = popup.indexOfSelectedItem == 0 ? nil : popup.titleOfSelectedItem

        let alert = NSAlert()
        alert.messageText = "创建项目"
        alert.informativeText = "创建 UTF-8 英文文稿，默认使用 pdfLaTeX。"
        let field = NSTextField(string: "Untitled")
        let aliasField = NSTextField(string: "")
        aliasField.placeholderString = "留空使用文件夹名称"
        let fields = NSStackView(views: [
            NSTextField(labelWithString: "文件夹名称"), field,
            NSTextField(labelWithString: "项目别名（可选）"), aliasField,
        ])
        fields.orientation = .vertical
        fields.alignment = .leading
        fields.spacing = 6
        fields.frame = NSRect(x: 0, y: 0, width: 340, height: 110)
        field.widthAnchor.constraint(equalToConstant: 340).isActive = true
        aliasField.widthAnchor.constraint(equalToConstant: 340).isActive = true
        alert.accessoryView = fields
        alert.addButton(withTitle: "选择保存位置").toolTip = "选择新项目的存储文件夹"
        alert.addButton(withTitle: "取消").toolTip = "取消操作，保留原内容"
        var selectedParent: URL?
        while alert.runModal() == .alertFirstButtonReturn {
            let name = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            do {
                let alias = try Library.shared.validateAlias(aliasField.stringValue)
                guard !name.isEmpty, !name.contains("/"), name != ".", name != "..",
                    !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) })
                else { throw BuildError(message: "请填写有效的文件夹名称") }
                if selectedParent == nil {
                    let panel = NSOpenPanel()
                    panel.canChooseDirectories = true
                    panel.canChooseFiles = false
                    panel.prompt = "在此创建"
                    guard panel.runModal() == .OK, let parent = panel.url else { return }
                    selectedParent = parent
                }
                let dir = selectedParent!.appendingPathComponent(name)
                if Library.shared.project(at: dir) != nil || FileManager.default.fileExists(atPath: dir.path)
                {
                    selectedParent = nil
                    throw BuildError(
                        message: "此位置已有文件夹或项目，不能重复新建，也不会覆盖原文件。\n\(dir.path)\n请打开已有项目，或选择不同名称、保存位置。")
                }
                if alias.isEmpty {
                    let response = Library.shared.confirmDefaultName(name, path: dir.path)
                    if response == .alertFirstButtonReturn {
                        alert.window.initialFirstResponder = aliasField
                        continue
                    }
                    if response != .alertSecondButtonReturn { return }
                }
                if let chosenTemplate {
                    try TemplateStore.shared.copyTemplate(
                        TemplateStore.shared.directory.appendingPathComponent(chosenTemplate), to: dir)
                } else {
                    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: false)
                    try ProjectTemplates.englishSource.write(
                        to: dir.appendingPathComponent("main.tex"), atomically: true, encoding: .utf8)
                }
                var project = Library.shared.register(dir)
                project.alias = alias.isEmpty ? nil : alias
                if !alias.isEmpty { project.name = alias }
                Library.shared.update(project)
                open(project)
                return
            } catch { Library.shared.notice(error.localizedDescription) }
        }
    }
    @objc func newFile() { active?.promptNewItem(.file) }
    @objc func settings() {
        if settingsWindow == nil {
            settingsWindow = makeWindow("设置", view: SettingsView(), width: 650, height: 600)
        }
        settingsWindow?.makeKeyAndOrderFront(nil)
    }
    @objc func save() { active?.saveManually() }
    @objc func compile() { active?.compile() }
    @objc func stop() { active?.runner?.cancel() }
    @objc func searchProject() { active?.showSearch = true }
    @objc func undoProject() { active?.undoReplace() }
    @objc func find() {
        var node = NSApp.keyWindow?.firstResponder as? NSView
        while let n = node {
            if n is PDFView {
                active?.pdfFindRequest = UUID()
                return
            }
            node = n.superview
        }
        active?.send?(["type": "command", "name": "find"])
    }
    @objc func replace() { active?.send?(["type": "command", "name": "replace"]) }
    @objc func fileJump() { active?.send?(["type": "command", "name": "files"]) }
    @objc func uiUp() { Preferences.shared.uiSize = min(30, Preferences.shared.uiSize + 1) }
    @objc func uiDown() { Preferences.shared.uiSize = max(8, Preferences.shared.uiSize - 1) }
    @objc func uiReset() { Preferences.shared.uiSize = 13 }
    func menu() {
        let main = NSMenu()
        NSApp.mainMenu = main
        func section(_ name: String) -> NSMenu {
            let item = NSMenuItem(title: name, action: nil, keyEquivalent: "")
            main.addItem(item)
            let menu = NSMenu(title: name)
            item.submenu = menu
            return menu
        }
        func add(
            _ menu: NSMenu, _ title: String, _ action: Selector, _ key: String = "",
            _ flags: NSEvent.ModifierFlags = [.command]
        ) {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
            item.keyEquivalentModifierMask = flags
            item.target = self
            item.toolTip = title
            menu.addItem(item)
        }
        let app = section("Compilune")
        add(app, "设置…", #selector(settings), ",")
        app.addItem(.separator())
        add(app, "退出 Compilune", #selector(NSApplication.terminate(_:)), "q")
        app.items.last?.target = NSApp
        let file = section("文件")
        add(file, "新建项目…", #selector(newProject), "n")
        add(file, "打开项目…", #selector(openFolder), "o")
        add(file, "新建文件…", #selector(newFile), "n", [.command, .shift])
        add(file, "保存", #selector(save), "s")
        add(file, "快速打开文件", #selector(fileJump), "p")
        let edit = section("编辑")
        for (title, action, key) in [
            ("撤销", Selector(("undo:")), "z"), ("剪切", #selector(NSText.cut(_:)), "x"),
            ("复制", #selector(NSText.copy(_:)), "c"), ("粘贴", #selector(NSText.paste(_:)), "v"),
            ("全选", #selector(NSText.selectAll(_:)), "a"),
        ] {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
            edit.addItem(i)
        }
        add(edit, "查找", #selector(find), "f")
        add(edit, "查找与替换", #selector(replace), "f", [.command, .option])
        add(edit, "项目搜索 / 替换", #selector(searchProject), "f", [.command, .shift])
        add(edit, "项目替换预览", #selector(searchProject), "h", [.command, .shift])
        add(edit, "撤销项目全部替换", #selector(undoProject))
        let build = section("编译")
        add(build, "编译 / 停止", #selector(compile), "r")
        add(build, "停止", #selector(stop), ".")
        let view = section("视图")
        add(view, "项目库", #selector(showLibrary), "k")
        add(view, "增大界面字号", #selector(uiUp), "=", [.command, .option])
        add(view, "减小界面字号", #selector(uiDown), "-", [.command, .option])
        add(view, "恢复界面字号", #selector(uiReset), "0", [.command, .option])
        let window = section("窗口")
        NSApp.windowsMenu = window
        let close = NSMenuItem(
            title: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        window.addItem(close)
        installEditorMenus()
    }
    func installEditorMenus() {
        guard let main = NSApp.mainMenu else { return }
        if let old = main.items.first(where: { $0.title == "编辑器命令" }) { main.removeItem(old) }
        // The registry is the sole owner of editor shortcuts, including native menus.
        for top in main.items {
            for item in top.submenu?.items ?? [] {
                if ["查找", "查找与替换", "项目搜索 / 替换", "项目替换预览", "快速打开文件", "撤销"].contains(item.title) {
                    item.keyEquivalent = ""
                }
            }
        }
        let top = NSMenuItem(title: "编辑器命令", action: nil, keyEquivalent: "")
        let menu = NSMenu(title: "编辑器命令")
        top.submenu = menu
        main.insertItem(top, at: min(3, main.items.count))
        for c in EditorCommand.all {
            let key = Preferences.shared.shortcuts[c.id] ?? c.key
            let item = NSMenuItem(title: c.title, action: #selector(editorAction(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = c.id
            item.toolTip = c.title
            var flags: NSEvent.ModifierFlags = []
            if key.contains("Mod-") { flags.insert(.command) }
            if key.contains("Ctrl-") { flags.insert(.control) }
            if key.contains("Alt-") { flags.insert(.option) }
            if key.contains("Shift-") { flags.insert(.shift) }
            let tail = key.hasSuffix("--") ? "-" : (key.split(separator: "-").last.map(String.init) ?? "")
            if tail == "Enter" {
                item.keyEquivalent = "\r"
            } else if tail == "Space" {
                item.keyEquivalent = " "
            } else if tail.hasPrefix("F"), let n = Int(tail.dropFirst()), (1...12).contains(n),
                let scalar = UnicodeScalar(Int(NSF1FunctionKey) + n - 1)
            {
                item.keyEquivalent = String(scalar)
            } else {
                item.keyEquivalent = tail.lowercased()
            }
            item.keyEquivalentModifierMask = flags
            menu.addItem(item)
        }
    }
    @objc func editorAction(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String else { return }
        if active?.pdfSearchFocused == true {
            if id == "findNext" {
                active?.pdfSearchStep += 1
                return
            }
            if id == "findPrevious" {
                active?.pdfSearchStep -= 1
                return
            }
        }
        if let text = NSApp.keyWindow?.firstResponder as? NSTextView {
            if id == "undo" { text.undoManager?.undo() }
            if id == "redo" { text.undoManager?.redo() }
            return
        }
        if id == "find" {
            find()
            return
        }
        var pdfNode = NSApp.keyWindow?.firstResponder as? NSView
        while let n = pdfNode {
            if let pdf = n as? PDFView {
                if id == "findNext" {
                    active?.pdfSearchStep += 1
                    return
                }
                if id == "findPrevious" {
                    active?.pdfSearchStep -= 1
                    return
                }
                if id == "fontUp" {
                    pdf.zoomIn(nil)
                    return
                }
                if id == "fontDown" {
                    pdf.zoomOut(nil)
                    return
                }
                if id == "fontReset" {
                    pdf.autoScales = true
                    return
                }
                break
            }
            pdfNode = n.superview
        }

        if id == "undo" {
            active?.undoEdit()
            return
        }
        if id == "redo" {
            active?.redoEdit()
            return
        }
        active?.send?(["type": "command", "name": id])
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard let item = windows.first(where: { $0.value === sender }) else {
            return true
        }
        performWindowTransition {
            guard await self.closeProjectWindows([item.key]) else { return }
            if self.models.isEmpty { self.presentLibrary() }
        }
        return false
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !models.isEmpty else { return .terminateNow }
        guard !changingWindows else { return .terminateCancel }
        guard !terminating else { return .terminateLater }
        terminating = true
        Task {
            var discarded: [Workspace] = []
            for model in models.values { model.pauseAutosaveForClose() }
            for model in Array(models.values) {
                if model.send != nil {
                    var acknowledged = false
                    let token = UUID().uuidString
                    model.expectedFlushToken = token
                    model.flushed = { acknowledged = true }
                    model.send?(["type": "flush", "token": token])
                    for _ in 0..<40 {
                        if acknowledged { break }
                        try? await Task.sleep(nanoseconds: 100_000_000)
                    }
                    guard acknowledged else {
                        model.flushed = nil
                        model.error = "退出前编辑器尚未确认保存，请完成输入后重试。"
                        for m in models.values { m.resumeAfterCancelledClose() }
                        terminating = false
                        sender.reply(toApplicationShouldTerminate: false)
                        return
                    }
                }
                switch model.closeDecision() {
                case .cancel:
                    for m in models.values { m.resumeAfterCancelledClose() }
                    terminating = false
                    sender.reply(toApplicationShouldTerminate: false)
                    return
                case .discard: discarded.append(model)
                case .save:
                    guard model.saveAll() else {
                        for m in models.values { m.resumeAfterCancelledClose() }
                        terminating = false
                        sender.reply(toApplicationShouldTerminate: false)
                        return
                    }
                }
                model.persistSession()
            }
            for model in discarded { model.discardForClose() }
            for model in models.values { model.stopBackgroundWork() }
            sender.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if let window = windows.values.first {
            window.deminiaturize(nil)
            window.makeKeyAndOrderFront(nil)
        } else {
            showLibrary()
        }
        return true
    }
    func applicationDidBecomeActive(_ notification: Notification) {
        ToolchainStore.shared.detect(versions: false)
    }
}

struct LibraryView: View {
    @ObservedObject var library = Library.shared
    @ObservedObject var prefs = Preferences.shared
    @ViewState var filter = "全部项目"
    @ViewState var query = ""
    @ViewState var grid = true
    @ViewState var sort = "最近编辑"
    var visible: [Project] {
        library.projects.filter { p in
            (filter == "已归档" ? p.archived : !p.archived) && (filter != "已置顶" || p.pinned)
                && (query.isEmpty || p.name.localizedCaseInsensitiveContains(query)
                    || p.path.localizedCaseInsensitiveContains(query))
        }.sorted { a, b in
            if a.pinned != b.pinned { return a.pinned }
            if filter == "最近打开" || sort == "最近打开" { return a.opened > b.opened }
            return sort == "名称"
                ? a.name.localizedStandardCompare(b.name) == .orderedAscending : a.edited > b.edited
        }
    }
    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(nsImage: AppBrand.icon).resizable().scaledToFit().frame(width: 46, height: 46)
                        .accessibilityLabel("Compilune 应用图标")
                    VStack(alignment: .leading) {
                        Text("Compilune").font(.title3.bold())
                        Text("你的本地写作空间").foregroundStyle(.secondary).font(.caption)
                    }
                }.padding(.top, 8).padding(.bottom, 20)
                ForEach(
                    [("全部项目", "books.vertical"), ("最近打开", "clock"), ("已置顶", "pin"), ("已归档", "archivebox")],
                    id: \.0
                ) { pair in
                    Button {
                        filter = pair.0
                    } label: {
                        Label(pair.0, systemImage: pair.1).frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10).background(
                                filter == pair.0 ? sage.opacity(0.15) : .clear,
                                in: RoundedRectangle(cornerRadius: 7))
                    }.buttonStyle(.plain).help("显示" + pair.0)
                }
                Spacer()
                Text("本地文件 · 本地编译").font(.caption).foregroundStyle(.secondary)
                Button("设置…", systemImage: "slider.horizontal.3") { AppDelegate.shared.settings() }.help(
                    "设置主题、字体、快捷键、编译清理与自定义模板（⌘,）")
            }.padding(20).frame(width: 212).background(sage.opacity(0.07))
            Divider()
            VStack(alignment: .leading, spacing: 22) {
                HStack {
                    Text("项目库").foregroundStyle(.secondary)
                    Spacer()
                    Button("打开本地项目", systemImage: "folder") { AppDelegate.shared.openFolder() }.help(
                        "选择本地文件夹并加入项目库（⌘O）")
                    Button("新建项目", systemImage: "plus") { AppDelegate.shared.newProject() }.help(
                        "从基础文稿或自定义模板创建项目（⌘N）"
                    ).tint(sage).buttonStyle(.borderedProminent)
                }
                Divider()
                Text(filter + ".").font(.system(size: prefs.uiSize + 19, weight: .medium))
                Text("让思绪落在纸上，其他的交给Compilune。").foregroundStyle(.secondary)
                HStack {
                    Text("\(visible.count) 个项目").bold()
                    Spacer()
                    Picker("排序", selection: $sort) {
                        Text("最近编辑").tag("最近编辑")
                        Text("最近打开").tag("最近打开")
                        Text("名称").tag("名称")
                    }.help("按最近编辑、最近打开或名称排列项目").frame(width: 150).disabled(filter == "最近打开")
                    TextField("搜索项目…", text: $query).textFieldStyle(.roundedBorder).frame(width: 240)
                    Button {
                        grid.toggle()
                    } label: {
                        Image(systemName: grid ? "list.bullet" : "square.grid.2x2")
                    }.help(grid ? "切换为项目列表" : "切换为项目卡片")
                }
                if filter == "全部项目", query.isEmpty,
                    let recent = library.projects.filter({ !$0.archived }).sorted(by: {
                        $0.opened > $1.opened
                    }).first
                {
                    HStack(spacing: 22) {
                        ProjectCover(project: recent, height: 155).frame(width: 190)
                        VStack(alignment: .leading, spacing: 12) {
                            Text("继续上次的写作").font(.caption).foregroundStyle(.secondary)
                            Text(recent.name).font(.title3).lineLimit(1).truncationMode(.tail)
                                .help(recent.name)
                            Text(recent.path).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            Button("继续写作 ↗") { AppDelegate.shared.open(recent) }.help("打开最近项目：" + recent.name)
                                .buttonStyle(.borderedProminent).tint(sage)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                        Spacer()
                    }.background(.background, in: RoundedRectangle(cornerRadius: 9))
                        .clipShape(RoundedRectangle(cornerRadius: 9))
                }
                ScrollView {
                    LazyVGrid(
                        columns: grid
                            ? [GridItem(.adaptive(minimum: 243, maximum: 243), spacing: 16)]
                            : [GridItem(.flexible())],
                        alignment: .leading, spacing: 16
                    ) {
                        ForEach(visible) { project in
                            VStack(alignment: .leading, spacing: 0) {
                                if grid { ProjectCover(project: project) }
                                HStack {
                                    VStack(alignment: .leading, spacing: 7) {
                                        Text(project.name).fontWeight(.medium).lineLimit(1)
                                            .truncationMode(.tail).help(project.name)
                                        Text(project.path).font(.caption).foregroundStyle(.secondary)
                                            .lineLimit(2).truncationMode(.middle).help(project.path)
                                        Text(
                                            project.edited.formatted(date: .abbreviated, time: .shortened)
                                        ).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                            .truncationMode(.tail)
                                    }.frame(maxWidth: .infinity, alignment: .leading)
                                    ProjectPinButton(project: project)
                                }.padding(15).frame(height: max(116, prefs.uiSize * 2.7 + 66))
                            }.frame(maxWidth: .infinity, alignment: .leading)
                                .background(.background, in: RoundedRectangle(cornerRadius: 9))
                                .clipShape(RoundedRectangle(cornerRadius: 9)).overlay(
                                    RoundedRectangle(cornerRadius: 9).stroke(sage.opacity(0.16))
                                ).onTapGesture(count: 2) { AppDelegate.shared.open(project) }.contextMenu {
                                    Button("打开") { AppDelegate.shared.open(project) }.help(
                                        "打开项目：" + project.name)
                                    Button(project.pinned ? "取消置顶" : "置顶") {
                                        var p = project
                                        p.pinned.toggle()
                                        library.update(p)
                                    }.help(project.pinned ? "取消项目置顶" : "将项目置顶，方便查找")
                                    Button(project.archived ? "取消归档" : "归档") {
                                        var p = project
                                        p.archived.toggle()
                                        library.update(p)
                                    }.help(project.archived ? "将项目移回全部项目" : "归档项目，保留本地源文件")
                                    Button("在 Finder 显示") {
                                        NSWorkspace.shared.selectFile(
                                            nil, inFileViewerRootedAtPath: project.path)
                                    }.help("在 Finder 中打开项目文件夹")
                                    Button("设置项目别名…") { library.rename(project) }.help("修改显示别名，留空使用文件夹名称")
                                    Button("重新定位…") { library.relocate(project) }.help("项目文件夹移动后重新选择其位置")
                                    Button("从项目库移除", role: .destructive) { library.remove(project) }.help(
                                        "移除项目库记录，保留本地文件")
                                }.help("双击打开项目：" + project.name).accessibilityAction {
                                    AppDelegate.shared.open(project)
                                }
                        }
                    }
                    if visible.isEmpty {
                        VStack(spacing: 16) {
                            Image(systemName: "folder.badge.plus").font(.system(size: 46)).foregroundStyle(
                                sage)
                            Text("从一份文稿开始。").font(.title2)
                            Button("打开已有文件夹") { AppDelegate.shared.openFolder() }.help("选择本地文件夹并加入项目库（⌘O）")
                        }.padding(70)
                    }
                }
                Spacer(minLength: 0)
            }.padding(32)
        }.font(.system(size: prefs.uiSize)).tint(sage).preferredColorScheme(prefs.scheme).alert(
            "项目提示",
            isPresented: Binding(get: { library.error != nil }, set: { if !$0 { library.error = nil } })
        ) {
            Button("好") { library.error = nil }.help("关闭项目提示")
        } message: {
            Text(library.error ?? "")
        }
    }
}

struct WorkspaceView: View {
    @ObservedObject var workspace: Workspace
    @ObservedObject var prefs = Preferences.shared
    var sidebar: Bool { workspace.sidebarVisible }
    var preview: Bool { workspace.previewVisible }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    workspace.sidebarVisible.toggle()
                    workspace.persistSessionSoon()
                } label: {
                    Image(systemName: "sidebar.left")
                }.help(workspace.sidebarVisible ? "隐藏文件与大纲侧边栏" : "显示文件与大纲侧边栏")
                Button {
                    AppDelegate.shared.showLibrary()
                } label: {
                    Image(systemName: "books.vertical")
                }.help("返回项目库（⌘K）")
                VStack(alignment: .leading) {
                    Text(workspace.project.name).bold()
                    Text(workspace.status).font(.caption).foregroundStyle(.secondary)
                }.contextMenu {
                    Button("设置项目别名…") { Library.shared.rename(workspace.project) }
                        .help("修改项目显示名称，留空恢复文件夹名称")
                }
                Spacer()
                Button(workspace.project.engine) { workspace.showConfig = true }.help("选择主文件、编译引擎、自动编译与输出目录")
                Button {
                    workspace.send?(["type": "command", "name": "pasteCitation"])
                } label: {
                    Image(systemName: "quote.bubble")
                }.help(prefs.commandHint("pasteCitation", "智能插入剪贴板中的 BibTeX 文献并引用"))
                .accessibilityLabel("智能插入文献")
                Button { workspace.send?(["type": "command", "name": "deduplicateBibliography"]) } label: { Image(systemName: "checkmark.rectangle.stack") }
                    .help(prefs.commandHint("deduplicateBibliography", "按题目和作者检查重复文献，预览后合并并修正引用"))
                    .accessibilityLabel("智能文献去重")
                Button(
                    workspace.running ? "停止" : "编译 ⌘R",
                    systemImage: workspace.running ? "stop.fill" : "play.fill"
                ) { workspace.compile() }.help(workspace.running ? "停止当前编译（⌘.）" : "保存源码并使用本地 TeX 编译（⌘R）")
                    .buttonStyle(.borderedProminent).tint(sage)
                Button {
                    workspace.previewVisible.toggle()
                    workspace.persistSessionSoon()
                } label: {
                    Image(systemName: "rectangle.split.2x1")
                }.help(workspace.previewVisible ? "隐藏 PDF 预览" : "显示 PDF 预览")
                Button {
                    workspace.showSearch.toggle()
                } label: {
                    Image(systemName: "magnifyingglass")
                }.help(prefs.commandHint("projectSearch", "显示或隐藏项目搜索与替换"))
                Button {
                    workspace.showLog.toggle()
                } label: {
                    Image(systemName: "terminal")
                }.help("显示或隐藏编译日志与错误诊断")
                Button("导出 PDF") { exportPDF() }.help("将上次成功编译的 PDF 另存到指定位置")
            }.padding(12)
            Divider()
            HSplitView {
                if sidebar {
                    VStack(alignment: .leading) {
                        HStack {
                            Text(workspace.showSearch ? "项目搜索与替换" : "文件").bold()
                            Spacer()
                            Menu {
                                NewItemActions(workspace: workspace, parent: workspace.insertionDirectory)
                            } label: {
                                Image(systemName: "plus")
                            }.help("在当前选中目录新建文件或文件夹")
                            Button {
                                workspace.promptNewItem(.folder)
                            } label: {
                                Image(systemName: "folder.badge.plus")
                            }.help("在当前选中目录新建文件夹")
                            Button {
                                workspace.refreshFiles()
                                workspace.refreshIndex()
                            } label: {
                                Image(systemName: "arrow.clockwise")
                            }.help("重新扫描项目文件和大纲")
                        }.padding(10)
                        if workspace.showSearch { searchPanel } else { FileTreeView(workspace: workspace) }
                    }.frame(minWidth: 180, idealWidth: 215, maxWidth: 350)
                }
                VStack(spacing: 0) {
                    HStack(spacing: 4) {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 3) {
                                ForEach(workspace.tabs, id: \.self) { path in
                                    DocumentTab(workspace: workspace, path: path)
                                }
                            }.padding(.horizontal, 6).padding(.top, 4)
                        }
                        Button {
                            workspace.showFormattingToolbar.toggle()
                        } label: {
                            Text("格式")
                        }
                        .buttonStyle(.bordered).tint(workspace.showFormattingToolbar ? sage : .secondary)
                        .help(workspace.showFormattingToolbar ? "收起编辑工具栏；快捷键仍可使用" : "展开编辑工具栏：格式、插入与导航")
                        .padding(.trailing, 6)
                    }
                    Divider()
                    EditorHost(workspace: workspace)
                }.frame(minWidth: 360)
                if preview {
                    VStack(spacing: 0) {
                        PDFToolbar(workspace: workspace)
                        Divider()
                        if let data = workspace.pdfData {
                            PDFHost(
                                data: data, location: workspace.pdfLocation, query: workspace.pdfQuery,
                                zoomStep: workspace.pdfZoom, fitRequest: workspace.pdfFitRequest,
                                requestedPage: workspace.pdfPage,
                                searchStep: workspace.pdfSearchStep,
                                onSearchUpdate: { count, index in
                                    if workspace.pdfMatches != count { workspace.pdfMatches = count }
                                    if workspace.pdfMatchIndex != index { workspace.pdfMatchIndex = index }
                                },
                                onPageChanged: { page in
                                    if workspace.pdfPage != page { workspace.pdfPage = page }
                                },
                                onMetricsChanged: { count, percent in
                                    guard workspace.pdfData == data else { return }
                                    if workspace.pdfPageCount != count { workspace.pdfPageCount = count }
                                    if workspace.pdfScalePercent != percent { workspace.pdfScalePercent = percent }
                                },
                                onCommandClick: { page, x, y in workspace.backwardSync(page: page, x: x, y: y)
                                })
                        } else {
                            VStack(spacing: 18) {
                                Image(systemName: "doc.richtext").font(.system(size: 50))
                                Text("编译后在这里查看 PDF")
                                Button("开始编译") { workspace.compile() }.help("保存并编译当前项目，生成 PDF 预览（⌘R）")
                            }.foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                    }.frame(minWidth: 300, idealWidth: 520)
                }
            }
            if workspace.showLog {
                Divider()
                HStack {
                    Text("编译日志").bold()
                    Spacer()
                    Button("关闭") { workspace.showLog = false }.help("隐藏编译日志")
                }.padding(8)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(workspace.diagnosticRows.enumerated()), id: \.offset) { _, row in
                            if let path = row["path"] as? String, let line = row["line"] as? Int {
                                Button("\(path):\(line) · \(row["message"] as? String ?? "编译错误")") {
                                    workspace.open(path, line: line, column: row["column"] as? Int, diagnostic: true)
                                }
                                    .buttonStyle(.link).help("跳转到 \(path):\(line)")
                            } else {
                                Text((row["text"] as? String).flatMap { $0.isEmpty ? " " : $0 } ?? " ").textSelection(.enabled)
                            }
                        }
                        if workspace.log.isEmpty { Text("暂无构建日志") }
                    }.font(.system(size: 11, design: .monospaced)).frame(maxWidth: .infinity, alignment: .leading).padding(10)
                }.frame(height: 170)
            }
            Divider()
            HStack {
                Circle().fill(workspace.running ? Color.orange : sage).frame(width: 6, height: 6)
                Text(workspace.status)
                Spacer()
                Text("主文件 \(workspace.project.root)")
                Text("UTF-8 · 本地编译").foregroundStyle(.secondary)
            }.font(.caption).padding(8)
        }.font(.system(size: prefs.uiSize)).tint(sage).preferredColorScheme(prefs.scheme)
            .background(SplitAutosave(id: workspace.project.id.uuidString))
            .sheet(isPresented: $workspace.showConfig) { config }
            .sheet(isPresented: $workspace.showBibliographyDedup) { BibliographyDedupView(workspace: workspace) }
            .sheet(isPresented: $workspace.showReplacePreview) { replacementPreview }
            .alert(
                "文档提示",
                isPresented: Binding(
                    get: { workspace.error != nil }, set: { if !$0 { workspace.error = nil } })
            ) {
                Button("保留并关闭提示") { workspace.error = nil }.help("保留编辑器内容并关闭提示")
                Button("另存当前文档") {
                    workspace.saveCopy()
                    workspace.error = nil
                }.help("把当前编辑内容另存为副本")
                Button("载入磁盘版本", role: .destructive) {
                    workspace.reload()
                    workspace.error = nil
                }.help("放弃当前缓冲中的编辑，重新读取磁盘文件")
            } message: {
                Text(workspace.error ?? "")
            }
    }
    var config: some View { ProjectConfigurationView(workspace: workspace) }
    var searchPanel: some View {
        VStack {
            TextField("搜索文本", text: $workspace.search).textFieldStyle(.roundedBorder).onSubmit {
                workspace.projectSearch()
            }
            TextField("替换为", text: $workspace.replacement).textFieldStyle(.roundedBorder)
            Text("项目模式：普通文本，不区分大小写").font(.caption2).foregroundStyle(.secondary)
            HStack {
                Button("搜索") { workspace.projectSearch() }.help("搜索项目源文件，包含尚未保存的编辑")
                Button("预览全部替换") { workspace.previewReplace() }.help("先查看每个文件的替换结果，确认后再应用").disabled(
                    workspace.search.isEmpty)
            }
            if workspace.busySearch { ProgressView() }
            HStack {
                Text("\(workspace.searchCurrent.map { $0 + 1 } ?? 0) / \(workspace.searchTotal)").monospacedDigit()
                Spacer()
                Button { workspace.stepSearch(-1) } label: { Image(systemName: "chevron.up") }.help("上一个匹配").disabled(workspace.results.isEmpty || workspace.busySearch)
                Button { workspace.stepSearch(1) } label: { Image(systemName: "chevron.down") }.help("下一个匹配").disabled(workspace.results.isEmpty || workspace.busySearch)
            }.font(.caption)
            if workspace.searchTotal > workspace.results.count {
                Text("共 \(workspace.searchTotal) 个匹配，仅展示前 2000 个；请缩小搜索范围").font(.caption2).foregroundStyle(.secondary)
            }
            List(workspace.results) { hit in
                Button {
                    if let index = workspace.results.firstIndex(where: { $0.id == hit.id }) { workspace.selectSearchResult(index) }
                } label: {
                    VStack(alignment: .leading) {
                        Text("\(hit.path):\(hit.line)").font(.caption).foregroundStyle(sage)
                        Text(hit.text).lineLimit(2)
                    }
                }.buttonStyle(.plain).help("打开匹配位置：\(hit.path):\(hit.line)")
            }
            Button("撤销项目替换") { workspace.undoReplace() }.help("撤销最近一次编辑事务；若替换后继续编辑，需先撤销后续编辑").disabled(
                workspace.undoPlans.isEmpty)
        }.padding(8)
    }
    var replacementPreview: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("项目全部替换预览").font(.title2)
            Text("\(workspace.plan?.after.count ?? 0) 个文件。应用后修改缓冲区；保存才写入磁盘。").foregroundStyle(.secondary)
            ScrollView {
                ForEach((workspace.plan?.after.keys.sorted()) ?? [], id: \.self) { path in
                    VStack(alignment: .leading) {
                        Text(path).bold()
                        Text("原文").foregroundStyle(.secondary)
                        Text(String((workspace.plan?.before[path] ?? "").prefix(2000))).textSelection(
                            .enabled)
                        Text("替换后").foregroundStyle(sage)
                        Text(String((workspace.plan?.after[path] ?? "").prefix(2000))).textSelection(.enabled)
                        Divider()
                    }
                }
            }
            HStack {
                Button("取消") { workspace.showReplacePreview = false }.help("关闭预览，保留原文")
                Spacer()
                Button("应用替换") { workspace.applyReplace() }.help("将预览中的替换作为一次可撤销事务应用，并自动保存").disabled(
                    workspace.plan?.after.isEmpty != false)
            }
        }.padding(25).frame(width: 650, height: 600)
    }
    func exportPDF() {
        guard let data = workspace.pdfData else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = workspace.project.pdfExportName
        panel.allowedContentTypes = [.pdf]
        if panel.runModal() == .OK, let url = panel.url {
            do { try data.write(to: url, options: .atomic) } catch {
                workspace.error = error.localizedDescription
            }
        }
    }
}

import AppKit
import Foundation
import SwiftUI

enum AppStorage {
    // Preserve the previous library, templates and recovery state on upgrade.
    static let supportDirectory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let legacy = base.appendingPathComponent("FolioTeX")
        if FileManager.default.fileExists(atPath: legacy.path) { return legacy }
        return base.appendingPathComponent("Compilune")
    }()
}

struct Project: Codable, Identifiable, Equatable {
    var id = UUID()
    var name: String
    var path: String
    var alias: String?
    var pinned = false
    var archived = false
    var opened = Date()
    var edited = Date()
    var root = "main.tex"
    var engine = "pdfLaTeX"
    init(name: String, path: String) {
        self.name = name
        self.path = URL(fileURLWithPath: path).resolvingSymlinksInPath().standardizedFileURL.path
    }
    var url: URL { URL(fileURLWithPath: path) }
}
struct ProjectConfig: Codable {
    var root: String
    var engine: String
    var autoCompile: Bool?
    var shellEscape: Bool?
    var rcFile: String?
    var workingDirectory: String?
    var outputDirectory: String?
    var bibliographyFile: String?
}
@MainActor final class Preferences: ObservableObject {
    static let shared = Preferences()
    @Published var uiSize: Double = min(
        30, max(8, UserDefaults.standard.object(forKey: "uiSize") as? Double ?? 13))
    {
        didSet { UserDefaults.standard.set(uiSize, forKey: "uiSize") }
    }
    @Published var codeSize: Double = min(
        30, max(8, UserDefaults.standard.object(forKey: "codeSize") as? Double ?? 13))
    {
        didSet { UserDefaults.standard.set(codeSize, forKey: "codeSize") }
    }
    @Published var theme: String = UserDefaults.standard.string(forKey: "theme") ?? "系统" {
        didSet {
            UserDefaults.standard.set(theme, forKey: "theme")
            applyWindowAppearance()
        }
    }
    @Published private(set) var systemDark =
        NSApplication.shared.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
    private var appearanceObservation: NSKeyValueObservation?
    private var themeNotification: NSObjectProtocol?
    @Published var texBin: String = UserDefaults.standard.string(forKey: "texBin") ?? "/Library/TeX/texbin" {
        didSet { UserDefaults.standard.set(texBin, forKey: "texBin") }
    }
    @Published var cleanAfterBuild = UserDefaults.standard.bool(forKey: "cleanAfterBuild") {
        didSet { UserDefaults.standard.set(cleanAfterBuild, forKey: "cleanAfterBuild") }
    }
    @Published var autoSaveEnabled = UserDefaults.standard.object(forKey: "autoSaveEnabled") as? Bool ?? true
    {
        didSet {
            UserDefaults.standard.set(autoSaveEnabled, forKey: "autoSaveEnabled")
            updateSavePolicy()
        }
    }
    @Published var autoSaveDelay = UserDefaults.standard.object(forKey: "autoSaveDelay") as? Double ?? 1 {
        didSet {
            UserDefaults.standard.set(autoSaveDelay, forKey: "autoSaveDelay")
            updateSavePolicy()
        }
    }
    @Published var compileAfterAutoSave = UserDefaults.standard.bool(forKey: "compileAfterAutoSave") {
        didSet {
            UserDefaults.standard.set(compileAfterAutoSave, forKey: "compileAfterAutoSave")
            updateSavePolicy()
        }
    }
    @Published var compileAfterManualSave = UserDefaults.standard.bool(forKey: "compileAfterManualSave") {
        didSet { UserDefaults.standard.set(compileAfterManualSave, forKey: "compileAfterManualSave") }
    }
    func updateSavePolicy() {
        for model in AppDelegate.shared?.models.values ?? [UUID: Workspace]().values {
            model.saveTask?.cancel()
            model.autoTask?.cancel()
            model.pendingBuild = false
            if model.buffers.values.contains(where: { $0.dirty }) { model.scheduleEditedBuffers() }
        }
    }
    @Published var shortcuts: [String: String] =
        UserDefaults.standard.dictionary(forKey: "shortcuts") as? [String: String] ?? [:]
    { didSet { UserDefaults.standard.set(shortcuts, forKey: "shortcuts") } }
    var commandBindings: [[String: String]] {
        EditorCommand.all.map { ["id": $0.id, "title": $0.title, "key": shortcuts[$0.id] ?? $0.key] }
    }
    func commandHint(_ id: String, _ text: String) -> String {
        let key = shortcuts[id] ?? EditorCommand.all.first(where: { $0.id == id })?.key ?? ""
        guard !key.isEmpty else { return text }
        let label = ShortcutNotation.display(key)
        return text + "（" + label + "）"
    }
    var scheme: ColorScheme? { theme == "深色" ? .dark : theme == "浅色" ? .light : systemDark ? .dark : .light }
    var windowAppearance: NSAppearance? {
        theme == "系统" ? nil : NSAppearance(named: theme == "深色" ? .darkAqua : .aqua)
    }
    init() {
        appearanceObservation = NSApplication.shared.observe(
            \.effectiveAppearance, options: [.initial, .new]
        ) { [weak self] _, _ in
            Task { @MainActor in self?.refreshSystemAppearance() }
        }
        themeNotification = DistributedNotificationCenter.default().addObserver(
            forName: Notification.Name("AppleInterfaceThemeChangedNotification"), object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.refreshSystemAppearance() }
        }
    }
    func refreshSystemAppearance() {
        let dark = NSApplication.shared.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        if systemDark != dark { systemDark = dark }
        applyWindowAppearance()
    }
    func applyWindowAppearance() {
        for window in NSApplication.shared.windows { window.appearance = windowAppearance }
    }
}
@MainActor final class Library: ObservableObject {
    static let shared = Library()
    @Published var projects: [Project] = []
    @Published var error: String?
    let registry: URL
    private var registryReadOnly = false
    init() {
        let support = AppStorage.supportDirectory
        registry = support.appendingPathComponent("registry.json")
        do {
            try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: registry.path) {
                projects = try JSONDecoder().decode([Project].self, from: Data(contentsOf: registry))
                for index in projects.indices
                where projects[index].alias == nil
                    && projects[index].name != projects[index].url.lastPathComponent
                {
                    projects[index].alias = projects[index].name
                }
            }
        } catch {
            registryReadOnly = true
            self.error = "无法读取项目库：\(error.localizedDescription)。原文件未覆盖。"
        }
    }
    func persist() {
        guard !registryReadOnly else { return }
        do { try JSONEncoder().encode(projects).write(to: registry, options: .atomic) } catch {
            self.error = error.localizedDescription
        }
    }
    func update(_ project: Project) {
        if let i = projects.firstIndex(where: { $0.id == project.id }) {
            projects[i] = project
            persist()
        }
    }
    func register(_ url: URL) -> Project {
        let folder = url.resolvingSymlinksInPath().standardizedFileURL
        if var p = project(at: folder) {
            p.opened = Date()
            p.archived = false
            p.path = folder.path
            update(p)
            return p
        }
        var p = Project(name: folder.lastPathComponent, path: folder.path)
        if let data = try? Data(contentsOf: folder.appendingPathComponent(".folio/project.json")),
            let cfg = try? JSONDecoder().decode(ProjectConfig.self, from: data)
        {
            p.root = cfg.root
            p.engine = cfg.engine
        } else {
            let candidates = projectFiles(folder).filter {
                $0.pathExtension == "tex"
                    && ((try? String(contentsOf: $0, encoding: .utf8))?.contains("\\documentclass") == true)
            }
            if candidates.count == 1 { p.root = relative(candidates[0], to: folder) } else { p.root = "" }
        }
        projects.insert(p, at: 0)
        persist()
        return p
    }
}
struct SourceBuffer {
    var text: String
    var diskText: String
    var revision = 0
    var dirty = false
    var usesCRLF: Bool
    init(text: String, diskText: String) {
        self.text = text.replacingOccurrences(of: "\r\n", with: "\n")
        self.diskText = diskText
        usesCRLF = diskText.contains("\r\n")
    }
    var serialized: String { usesCRLF ? text.replacingOccurrences(of: "\n", with: "\r\n") : text }
}
struct SearchHit: Identifiable {
    let id = UUID()
    let path: String
    let line: Int
    let text: String
}
struct ReplacementPlan {
    let id = UUID()
    let before: [String: String]
    let after: [String: String]
    let query: String
}

@MainActor final class Workspace: ObservableObject {
    @Published var project: Project
    @Published var files: [URL] = []
    @Published var selected: String?
    @Published var tabs: [String] = []
    @Published var buffers: [String: SourceBuffer] = [:]
    @Published var status = "打开文件开始写作"
    @Published var error: String?
    @Published var log = ""
    @Published var showLog = false
    @Published var pdfData: Data?
    @Published var pdfStale = true
    @Published var pdfLocation: PDFLocation?
    @Published var pdfQuery = ""
    @Published var pdfSearchVisible = false
    @Published var showFormattingToolbar = false
    @Published var pdfZoom = 0
    @Published var pdfPage = 1
    var pdfSearchFocused = false
    @Published var running = false
    @Published var showSearch = false
    @Published var showConfig = false
    @Published var editorReady = false
    @Published var search = ""
    @Published var replacement = ""
    @Published var results: [SearchHit] = []
    @Published var plan: ReplacementPlan?
    @Published var showReplacePreview = false
    @Published var busySearch = false
    var revision = 0
    var composing = false
    var closingForNavigation = false
    var saveTask: Task<Void, Never>?
    var scanTask: Task<Void, Never>?
    var runner: BuildRunner?
    var send: (([String: Any]) -> Void)?
    var flushed: (() -> Void)?
    var expectedFlushToken: String?
    var undoPlans: [ReplacementPlan] = []
    var successfulPDF: URL?
    @Published var sidebarVisible = true
    @Published var previewVisible = true
    @Published var pdfMatches = 0
    @Published var pdfMatchIndex = 0
    @Published var pdfSearchStep = 0
    @Published var pdfFindRequest = UUID()
    @Published var autoCompile = false
    @Published var shellEscape = false
    @Published var rcFile = ""
    @Published var bibliographyFile = ""
    @Published var workingDirectory = ""
    @Published var outputDirectory = ".folio/build"
    @Published var symbolList: [SourceSymbol] = []
    @Published var showOutline = false
    @Published var fileTreeExpansion: [String: Bool] = [:]
    @Published var outlineTreeExpansion: [String: Bool] = [:]
    @Published var fileTreeSelection: String?
    @Published var conflictPaths: Set<String> = []
    var positions: [String: DocumentPosition] = [:]
    var history: [EditTransaction] = []
    var future: [EditTransaction] = []
    var changingHistory = false
    var sessionTask: Task<Void, Never>?
    var autoTask: Task<Void, Never>?
    var watchTimer: Timer?
    var indexTask: Task<Void, Never>?
    var indexGeneration = 0
    var pendingBuild = false
    var stoppedByUser = false
    var cachePDFRevision: Int?
    var sessionDirectory: URL {
        AppStorage.supportDirectory
            .appendingPathComponent("workspace-state/" + project.id.uuidString)
    }

    init(_ p: Project) {
        project = p
        restoreConfiguration()
        refreshFiles()
        restoreSession()
        if tabs.isEmpty && !project.root.isEmpty { open(project.root) }
        if project.root.isEmpty { showConfig = true }
        startWatching()
    }
    deinit {
        watchTimer?.invalidate()
        autoTask?.cancel()
        indexTask?.cancel()
    }
    func refreshFiles() {
        files = projectFiles(project.url).filter {
            $0.path != buildOutput.path && !$0.path.hasPrefix(buildOutput.path + "/")
        }
    }
    func contents(_ path: String) throws -> String {
        if let b = buffers[path] { return b.text }
        return try String(contentsOf: project.url.appendingPathComponent(path), encoding: .utf8)
    }
    func open(_ path: String, line: Int? = nil) {
        let target = project.url.appendingPathComponent(path).standardizedFileURL
        guard target.path.hasPrefix(project.path + "/") else {
            error = "文件不在当前项目内"
            return
        }
        guard ["tex", "bib", "sty", "cls", "txt", "md"].contains(target.pathExtension.lowercased()) else {
            NSWorkspace.shared.open(target)
            return
        }
        do {
            if let b = buffers[path], !b.dirty, let disk = try? String(contentsOf: target, encoding: .utf8),
                disk != b.diskText
            {
                buffers[path] = SourceBuffer(text: disk, diskText: disk)
                send?(["type": "replaceDocument", "path": path, "text": buffers[path]!.text])
            }
            if buffers[path] == nil {
                let s = try contents(path)
                buffers[path] = SourceBuffer(text: s, diskText: s)
            }
            if !tabs.contains(path) { tabs.append(path) }
            selected = path
            send?([
                "type": "open", "path": path, "text": buffers[path]!.text, "line": line as Any? ?? NSNull(),
                "position": positionDictionary(path),
            ])
            persistSessionSoon()
        } catch { self.error = "无法以 UTF-8 打开：\(error.localizedDescription)" }
    }
    func changed(_ path: String, _ text: String, composition: Bool, event: String = "input") {
        guard var b = buffers[path] else { return }
        let wasComposing = composing
        composing = composition
        guard b.text != text || (wasComposing && !composition) else { return }
        if b.text != text {
            recordEdit(before: [path: b.text], after: [path: text], name: event)
            b.text = text
            b.dirty = b.serialized != b.diskText
            b.revision += 1
            buffers[path] = b
            revision += 1
            pdfStale = true
        }
        scheduleEditedBuffers()
    }
    @discardableResult func saveAll() -> Bool {
        guard !composing else {
            status = "请先完成输入法输入"
            return false
        }
        for (path, var b) in buffers where b.dirty {
            let url = project.url.appendingPathComponent(path)
            do {
                let disk = try String(contentsOf: url, encoding: .utf8)
                guard disk == b.diskText else {
                    error = "\(path) 已在外部修改。请先另存当前文本或重新载入，未覆盖磁盘内容。"
                    return false
                }
                try b.serialized.write(to: url, atomically: true, encoding: .utf8)
                b.diskText = b.serialized
                b.dirty = false
                buffers[path] = b
            } catch {
                self.error = "保存 \(path) 失败：\(error.localizedDescription)"
                return false
            }
        }
        status = "所有更改已保存"
        project.edited = Date()
        Library.shared.update(project)
        writeRecovery()
        persistSessionSoon()
        return true
    }
    func saveCopy() {
        guard let path = selected, let text = buffers[path]?.text else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = URL(fileURLWithPath: path).lastPathComponent
        if panel.runModal() == .OK, let url = panel.url {
            do { try text.write(to: url, atomically: true, encoding: .utf8) } catch {
                self.error = error.localizedDescription
            }
        }
    }
    func reload() {
        guard let path = selected else { return }
        do {
            let text = try String(contentsOf: project.url.appendingPathComponent(path), encoding: .utf8)
            buffers[path] = SourceBuffer(text: text, diskText: text)
            conflictPaths.remove(path)
            send?(["type": "replaceDocument", "path": path, "text": text])
            pdfStale = true
            writeRecovery()
            refreshIndexSoon()
        } catch { self.error = error.localizedDescription }
    }
    func configure() {
        do {
            let dir = project.url.appendingPathComponent(".folio")
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let cfg = ProjectConfig(
                root: project.root, engine: project.engine, autoCompile: autoCompile,
                shellEscape: shellEscape, rcFile: rcFile, workingDirectory: workingDirectory,
                outputDirectory: outputDirectory, bibliographyFile: bibliographyFile)
            try JSONEncoder().encode(cfg).write(
                to: dir.appendingPathComponent("project.json"), options: .atomic)
            Library.shared.update(project)
        } catch { self.error = error.localizedDescription }
    }
    func symbols() -> [[String: Any]] { symbolList.map(\.dictionary) }
    func refreshIndex() { refreshIndexSoon(immediate: true) }
    func projectSearch() {
        scanTask?.cancel()
        busySearch = true
        let q = search
        let root = project.url
        let snapshots = buffers.mapValues { $0.text }
        let paths = files.filter { ["tex", "bib", "sty", "cls", "txt", "md"].contains($0.pathExtension) }.map
        { relative($0, to: root) }
        scanTask = Task {
            let hits = await Task.detached { () -> [SearchHit] in
                guard !q.isEmpty else { return [] }
                var list: [SearchHit] = []
                for path in paths {
                    if Task.isCancelled { break }
                    let text =
                        snapshots[path]
                        ?? (try? String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)) ?? ""
                    for (i, line) in text.components(separatedBy: "\n").enumerated()
                    where line.localizedCaseInsensitiveContains(q) {
                        list.append(SearchHit(path: path, line: i + 1, text: line))
                        if list.count >= 2000 { return list }
                    }
                }
                return list
            }.value
            guard !Task.isCancelled else { return }
            results = hits
            busySearch = false
        }
    }
    func previewReplace() {
        guard !search.isEmpty else { return }
        var before: [String: String] = [:]
        var after: [String: String] = [:]
        for file in files where ["tex", "bib", "sty", "cls", "txt", "md"].contains(file.pathExtension) {
            let path = relative(file, to: project.url)
            guard let text = try? contents(path) else { continue }
            let changed = text.replacingOccurrences(
                of: search, with: replacement, options: [.caseInsensitive])
            if text != changed {
                before[path] = text
                after[path] = changed
            }
        }
        plan = ReplacementPlan(before: before, after: after, query: search)
        showReplacePreview = true
    }
    func applyReplace() {
        guard let p = plan else { return }
        for (path, text) in p.before {
            guard (try? contents(path)) == text else {
                error = "\(path) 在预览后已更改，请重新生成预览。"
                return
            }
        }
        for (path, text) in p.after {
            var b = buffers[path] ?? SourceBuffer(text: p.before[path]!, diskText: p.before[path]!)
            b.text = text
            b.dirty = b.serialized != b.diskText
            b.revision += 1
            buffers[path] = b
            send?(["type": "replaceDocument", "path": path, "text": text])
        }
        recordEdit(before: p.before, after: p.after, name: "项目全部替换")
        undoPlans.append(p)
        revision += 1
        pdfStale = true
        plan = nil
        showReplacePreview = false
        status = "已替换 \(p.after.count) 个文件，待保存；可撤销项目替换"
        scheduleEditedBuffers()
        projectSearch()
    }
    func undoReplace() { undoEdit() }
    var diagnostics: [(path: String, line: Int, message: String)] {
        let cwd = project.url.appendingPathComponent(project.root).deletingLastPathComponent()
        let pattern = #"^(.+\.(?:tex|sty|cls)):(\d+):\s*(.+)$"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        return log.components(separatedBy: "\n").compactMap { text in
            guard let m = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
                let p = Range(m.range(at: 1), in: text), let l = Range(m.range(at: 2), in: text),
                let msg = Range(m.range(at: 3), in: text), let line = Int(text[l])
            else { return nil }
            let url = URL(fileURLWithPath: String(text[p]), relativeTo: cwd).standardizedFileURL
            guard url.path.hasPrefix(project.path + "/") else { return nil }
            return (relative(url, to: project.url), line, String(text[msg]))
        }
    }
    func compile() {
        if running {
            stoppedByUser = true
            pendingBuild = false
            autoTask?.cancel()
            runner?.cancel()
            return
        }
        guard !project.root.isEmpty else {
            showConfig = true
            return
        }
        let token = UUID().uuidString
        expectedFlushToken = token
        flushed = { [weak self] in self?.beginBuild() }
        send?(["type": "flush", "token": token])
        if send == nil {
            flushed = nil
            beginBuild()
        } else {
            Task {
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                if expectedFlushToken == token {
                    expectedFlushToken = nil
                    flushed = nil
                    error = "编辑器仍在输入或未响应，请完成输入后重试。"
                }
            }
        }
    }
    func beginBuild() {
        if let message = validateBuildPaths() {
            error = message
            return
        }
        guard saveAll() else { return }
        configure()
        stoppedByUser = false
        running = true
        log = ""
        status = "正在本地编译…"
        let currentRevision = revision
        let request = BuildRunner(
            root: project.url.appendingPathComponent(project.root), engine: project.engine,
            bin: Preferences.shared.texBin, workingDirectory: buildCWD, outputDirectory: buildOutput,
            shellEscape: shellEscape,
            rcFile: rcFile.isEmpty ? nil : project.url.appendingPathComponent(rcFile))
        runner = request
        request.start { [weak self] message in
            Task { @MainActor in self?.log += message }
        } completion: { [weak self] result in
            Task { @MainActor in
                guard let self else { return }
                self.running = false
                switch result {
                case .success(let url):
                    do {
                        self.pdfData = try Data(contentsOf: url)
                        self.successfulPDF = url
                        self.pdfStale = self.revision != currentRevision
                        self.status = self.pdfStale ? "编译成功 · 有未编译更改" : "编译成功"
                        self.cacheSuccessfulBuild(url)
                        if Preferences.shared.cleanAfterBuild {
                            do { try BuildArtifacts.clean(pdf: url) } catch {
                                self.status += " · 清理失败：" + error.localizedDescription
                            }
                        }
                    } catch { self.error = error.localizedDescription }
                case .failure(let error):
                    self.status = error.localizedDescription
                    self.pdfStale = true
                    self.showLog = true
                }
                if self.pendingBuild && !self.stoppedByUser {
                    self.pendingBuild = false
                    self.compile()
                }
            }
        }
    }
}

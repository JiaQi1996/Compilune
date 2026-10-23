import AppKit
import Foundation
import PDFKit

@MainActor extension Workspace {
    func saveManually() {
        let finish = { [weak self] in
            guard let self, self.saveAll() else { return }
            self.saveTask?.cancel()
            self.autoTask?.cancel()
            if Preferences.shared.compileAfterManualSave {
                if self.running { self.pendingBuild = true } else { self.compile() }
            }
        }
        guard send != nil else {
            finish()
            return
        }
        let token = UUID().uuidString
        expectedFlushToken = token
        flushed = finish
        send?(["type": "flush", "token": token])
        Task {
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if expectedFlushToken == token {
                expectedFlushToken = nil
                flushed = nil
                error = "编辑器尚未确认最新内容，请完成输入后重新保存。"
            }
        }
    }
    func openOutline(_ node: OutlineNode) { open(node.path, line: node.line) }
    func stopBackgroundWork() {
        stoppedByUser = true
        pendingBuild = false
        autoTask?.cancel()
        saveTask?.cancel()
        sessionTask?.cancel()
        indexTask?.cancel()
        scanTask?.cancel()
        watchTimer?.invalidate()
        runner?.cancel()
    }
    func scheduleEditedBuffers() {
        writeRecovery()
        refreshIndexSoon()
        autoTask?.cancel()
        saveTask?.cancel()
        guard !composing, Preferences.shared.autoSaveEnabled else { return }
        let delay = min(30, max(1, Preferences.shared.autoSaveDelay))
        saveTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled, Preferences.shared.autoSaveEnabled, saveAll() else { return }
            if autoCompile || Preferences.shared.compileAfterAutoSave {
                autoTask = Task {
                    try? await Task.sleep(nanoseconds: 200_000_000)
                    guard !Task.isCancelled, Preferences.shared.autoSaveEnabled,
                        autoCompile || Preferences.shared.compileAfterAutoSave
                    else { return }
                    if running { pendingBuild = true } else { compile() }
                }
            }
        }
    }
    var buildCWD: URL {
        (workingDirectory.isEmpty
            ? project.url.appendingPathComponent(project.root).deletingLastPathComponent()
            : project.url.appendingPathComponent(workingDirectory)).resolvingSymlinksInPath()
            .standardizedFileURL
    }
    var buildOutput: URL {
        buildCWD.appendingPathComponent(outputDirectory.isEmpty ? ".folio/build" : outputDirectory)
            .resolvingSymlinksInPath().standardizedFileURL
    }
    func validateBuildPaths() -> String? {
        let folder = project.url.resolvingSymlinksInPath().path
        let source = project.url.appendingPathComponent(project.root).resolvingSymlinksInPath()
            .standardizedFileURL.path
        guard source.hasPrefix(folder + "/"),
            buildCWD.path == folder || buildCWD.path.hasPrefix(folder + "/"),
            buildOutput.path.hasPrefix(folder + "/")
        else { return "主文件、工作和输出目录必须在项目中" }
        guard !source.hasPrefix(buildOutput.path + "/") else { return "输出目录不能包含主源文件，请使用独立的构建子目录" }
        if !rcFile.isEmpty
            && !project.url.appendingPathComponent(rcFile).resolvingSymlinksInPath().standardizedFileURL.path
                .hasPrefix(folder + "/")
        {
            return "rc 配置必须位于项目中"
        }
        return nil
    }
    func restoreConfiguration() {
        guard let data = try? Data(contentsOf: project.url.appendingPathComponent(".folio/project.json")),
            let c = try? JSONDecoder().decode(ProjectConfig.self, from: data)
        else { return }
        project.root = c.root
        project.engine = c.engine
        autoCompile = c.autoCompile ?? false
        shellEscape = c.shellEscape ?? false
        rcFile = c.rcFile ?? ""
        workingDirectory = c.workingDirectory ?? ""
        outputDirectory = c.outputDirectory ?? ".folio/build"
    }
    func positionDictionary(_ path: String) -> [String: Any] {
        let p = positions[path] ?? DocumentPosition()
        return ["anchor": p.anchor, "head": p.head, "scroll": p.scroll]
    }
    func persistSessionSoon() {
        sessionTask?.cancel()
        sessionTask = Task {
            try? await Task.sleep(nanoseconds: 200_000_000)
            if !Task.isCancelled { persistSession() }
        }
    }
    func persistSession() {
        do {
            try FileManager.default.createDirectory(at: sessionDirectory, withIntermediateDirectories: true)
            let s = WorkspaceSession(
                tabs: tabs, selected: selected, positions: positions, sidebar: sidebarVisible,
                preview: previewVisible, pdfPage: pdfPage, pdfZoom: pdfZoom)
            try JSONEncoder().encode(s).write(
                to: sessionDirectory.appendingPathComponent("session.json"), options: .atomic)
        } catch { status = "无法保存阅读位置：" + error.localizedDescription }
    }
    func restoreSession() {
        if let data = try? Data(contentsOf: sessionDirectory.appendingPathComponent("session.json")),
            let s = try? JSONDecoder().decode(WorkspaceSession.self, from: data)
        {
            positions = s.positions
            sidebarVisible = s.sidebar
            previewVisible = s.preview
            pdfPage = s.pdfPage
            pdfZoom = s.pdfZoom
            for path in s.tabs
            where FileManager.default.fileExists(atPath: project.url.appendingPathComponent(path).path) {
                open(path)
            }
            if let path = s.selected, tabs.contains(path) { open(path) }
        }
        let cached = sessionDirectory.appendingPathComponent("preview.pdf")
        if let bytes = try? Data(contentsOf: cached), PDFDocument(data: bytes) != nil {
            pdfData = bytes
            pdfStale = true
            status = "已恢复上次成功 PDF；重新编译后启用定位"
        }
        if let data = try? Data(contentsOf: sessionDirectory.appendingPathComponent("recovery.json")),
            let recovered = try? JSONDecoder().decode([String: String].self, from: data), !recovered.isEmpty
        {
            for (path, text) in recovered {
                let url = project.url.appendingPathComponent(path).standardizedFileURL
                guard url.path.hasPrefix(project.path + "/"),
                    let disk = try? String(contentsOf: url, encoding: .utf8)
                else { continue }
                var b = SourceBuffer(text: text, diskText: disk)
                b.dirty = b.serialized != disk
                buffers[path] = b
                if !tabs.contains(path) { tabs.append(path) }
            }
            status = "已恢复未保存快照，请检查后保存"
            if let first = tabs.first, selected == nil { selected = first }
        }
    }
    func writeRecovery() {
        do {
            try FileManager.default.createDirectory(at: sessionDirectory, withIntermediateDirectories: true)
            try JSONEncoder().encode(buffers.filter { $0.value.dirty }.mapValues { $0.text }).write(
                to: sessionDirectory.appendingPathComponent("recovery.json"), options: .atomic)
        } catch { status = "恢复快照保存失败：" + error.localizedDescription }
    }
    func cacheSuccessfulBuild(_ pdf: URL) {
        do {
            try FileManager.default.createDirectory(at: sessionDirectory, withIntermediateDirectories: true)
            try pdfData?.write(to: sessionDirectory.appendingPathComponent("preview.pdf"), options: .atomic)
            persistSession()
        } catch { status += " · 预览缓存失败" }
    }
    func recordEdit(before: [String: String], after: [String: String], name: String) {
        guard !changingHistory else { return }
        if name == "input.type", before.count == 1, var last = history.last, last.name == name,
            Date().timeIntervalSince(last.time) < 0.7, Set(last.after.keys) == Set(before.keys),
            last.after == before
        {
            last.after = after
            last.time = Date()
            history[history.count - 1] = last
        } else {
            history.append(EditTransaction(before: before, after: after, name: name))
        }
        if history.count > 1000 { history.removeFirst() }
        future.removeAll()
    }
    func applyHistory(_ values: [String: String]) {
        changingHistory = true
        defer { changingHistory = false }
        for (path, text) in values {
            guard var b = buffers[path] else { continue }
            b.text = text
            b.dirty = b.serialized != b.diskText
            b.revision += 1
            buffers[path] = b
            send?(["type": "replaceDocument", "path": path, "text": text])
        }
        revision += 1
        pdfStale = true
        scheduleEditedBuffers()
        persistSessionSoon()
    }
    func undoEdit() {
        guard let edit = history.last else { return }
        guard edit.after.allSatisfy({ buffers[$0.key]?.text == $0.value }) else {
            error = "文档已在外部变化，不能覆盖新版本。"
            return
        }
        history.removeLast()
        future.append(edit)
        applyHistory(edit.before)
        status = "已撤销：" + edit.name
    }
    func redoEdit() {
        guard let edit = future.last else { return }
        guard edit.before.allSatisfy({ buffers[$0.key]?.text == $0.value }) else {
            error = "文档版本变化，不能重做。"
            return
        }
        future.removeLast()
        history.append(edit)
        applyHistory(edit.after)
        status = "已重做：" + edit.name
    }
    func closeTab(_ path: String) {
        guard saveAll() else { return }
        tabs.removeAll { $0 == path }
        send?(["type": "forget", "path": path])
        if selected == path {
            selected = nil
            if let next = tabs.last { open(next) } else { send?(["type": "empty"]) }
        }
        persistSessionSoon()
    }
    func startWatching() {
        watchTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkExternalChanges() }
        }
    }
    func checkExternalChanges() {
        guard !composing else { return }
        let newFiles = projectFiles(project.url).filter {
            $0.path != buildOutput.path && !$0.path.hasPrefix(buildOutput.path + "/")
        }
        if newFiles != files {
            files = newFiles
            refreshIndexSoon()
        }
        for (path, b) in buffers {
            guard
                let disk = try? String(contentsOf: project.url.appendingPathComponent(path), encoding: .utf8),
                disk != b.diskText
            else { continue }
            if b.dirty {
                if !conflictPaths.contains(path) {
                    conflictPaths.insert(path)
                    error = "\(path) 在外部被修改。你的编辑仍保留，可另存或载入磁盘版本。"
                }
            } else {
                let fresh = SourceBuffer(text: disk, diskText: disk)
                buffers[path] = fresh
                send?(["type": "replaceDocument", "path": path, "text": fresh.text])
                pdfStale = true
                refreshIndexSoon()
                status = "已载入外部更新：" + path
            }
        }
    }
    func refreshIndexSoon(immediate: Bool = false) {
        indexTask?.cancel()
        indexGeneration += 1
        let generation = indexGeneration
        indexTask = Task {
            if !immediate { try? await Task.sleep(nanoseconds: 250_000_000) }
            guard !Task.isCancelled else { return }
            let root = project.url
            let snapshots = buffers.mapValues { $0.text }
            let sources = files.filter { ["tex", "bib", "sty", "cls"].contains($0.pathExtension) }
            let result = await Task.detached {
                sources.flatMap { url -> [SourceSymbol] in
                    let path = relative(url, to: root)
                    guard let text = snapshots[path] ?? (try? String(contentsOf: url, encoding: .utf8)) else {
                        return []
                    }
                    return TeXIndex.scan(text, path: path)
                }
            }.value
            guard !Task.isCancelled, generation == indexGeneration else { return }
            symbolList = result
            send?([
                "type": "index", "symbols": result.map(\.dictionary),
                "files": files.map { relative($0, to: project.url) },
            ])
        }
    }
    func renameFile(_ path: String) {
        guard saveAll() else { return }
        let alert = NSAlert()
        alert.messageText = "重命名 / 移动"
        alert.informativeText = "输入项目相对路径。LaTeX 中的引用不会自动改写。"
        let field = NSTextField(string: path)
        field.frame = NSRect(x: 0, y: 0, width: 350, height: 26)
        alert.accessoryView = field
        alert.addButton(withTitle: "应用").toolTip = "应用当前修改"
        alert.addButton(withTitle: "取消").toolTip = "取消操作，保留原内容"
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        moveFile(path, to: field.stringValue)
    }
    @discardableResult func moveFile(_ path: String, to newPath: String) -> Bool {
        guard saveAll() else { return false }
        let old = project.url.appendingPathComponent(path).resolvingSymlinksInPath().standardizedFileURL
        let new = project.url.appendingPathComponent(newPath).resolvingSymlinksInPath().standardizedFileURL
        guard old.path.hasPrefix(project.path + "/"), new.path.hasPrefix(project.path + "/"),
            !FileManager.default.fileExists(atPath: new.path), !new.path.hasPrefix(old.path + "/")
        else {
            error = "目标路径无效或已存在"
            return false
        }
        let newPath = relative(new, to: project.url)
        do {
            try FileManager.default.createDirectory(
                at: new.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileManager.default.moveItem(at: old, to: new)
            let affected = buffers.keys.filter { $0 == path || $0.hasPrefix(path + "/") }
            for key in affected {
                let target = newPath + key.dropFirst(path.count)
                buffers[target] = buffers.removeValue(forKey: key)
                positions[target] = positions.removeValue(forKey: key)
                send?(["type": "rename", "path": key, "newPath": target])
                tabs = tabs.map { $0 == key ? target : $0 }
                if selected == key { selected = target }
            }
            if project.root == path || project.root.hasPrefix(path + "/") {
                project.root = newPath + project.root.dropFirst(path.count)
                configure()
            }
            if let selection = fileTreeSelection, selection == path || selection.hasPrefix(path + "/") {
                fileTreeSelection = newPath + selection.dropFirst(path.count)
            }
            history.removeAll()
            future.removeAll()
            revision += 1
            pdfStale = true
            refreshFiles()
            refreshIndexSoon()
            persistSession()
            writeRecovery()
            status = "已移动文件，请检查文稿引用路径并重新编译"
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }
    func trashFile(_ path: String) {
        guard saveAll() else { return }
        let alert = NSAlert()
        alert.messageText = "移到废纸篓？"
        alert.informativeText = path
        alert.addButton(withTitle: "移到废纸篓").toolTip = "将选中文件或文件夹移到系统废纸篓"
        alert.addButton(withTitle: "取消").toolTip = "取消操作，保留原内容"
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        do {
            let url = project.url.appendingPathComponent(path).standardizedFileURL
            guard url.path.hasPrefix(project.path + "/") else { return }
            try FileManager.default.trashItem(at: url, resultingItemURL: nil)
            for key in buffers.keys.filter({ $0 == path || $0.hasPrefix(path + "/") }) {
                buffers.removeValue(forKey: key)
                tabs.removeAll { $0 == key }
                send?(["type": "forget", "path": key])
                if selected == key { selected = nil }
            }
            if let next = tabs.last { open(next) }
            refreshFiles()
            refreshIndexSoon()
            persistSession()
            writeRecovery()
        } catch { self.error = error.localizedDescription }
    }
}

@MainActor extension Workspace {
    func insertImage() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.message = "选择图片。项目外的图片将复制到 figures 文件夹。需要 graphicx 宏包。"
        guard panel.runModal() == .OK, let image = panel.url else { return }
        do {
            var target = image
            if !image.standardizedFileURL.path.hasPrefix(project.path + "/") {
                let figures = project.url.appendingPathComponent("figures")
                try FileManager.default.createDirectory(at: figures, withIntermediateDirectories: true)
                target = figures.appendingPathComponent(image.lastPathComponent)
                if FileManager.default.fileExists(atPath: target.path) {
                    target = figures.appendingPathComponent(
                        UUID().uuidString.prefix(8) + "-" + image.lastPathComponent)
                }
                try FileManager.default.copyItem(at: image, to: target)
            }
            guard target.path.hasPrefix(buildCWD.path + "/") else {
                error = "图片需要位于编译工作目录内"
                return
            }
            let path = relative(target, to: buildCWD)
            send?([
                "type": "insert", "text": "\\includegraphics[width=\\linewidth]{\\detokenize{" + path + "}}",
            ])
            refreshFiles()
            refreshIndexSoon()
        } catch { self.error = error.localizedDescription }
    }
}

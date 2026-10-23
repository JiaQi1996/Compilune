import AppKit
import Foundation
import PDFKit

@MainActor extension Library {
    func project(at url: URL, excluding: UUID? = nil) -> Project? {
        let folder = url.resolvingSymlinksInPath().standardizedFileURL
        return projects.first { project in
            guard project.id != excluding else { return false }
            let candidate = project.url.resolvingSymlinksInPath().standardizedFileURL
            if candidate.path == folder.path { return true }
            guard let a = try? FileManager.default.attributesOfItem(atPath: candidate.path),
                let b = try? FileManager.default.attributesOfItem(atPath: folder.path),
                let inodeA = a[.systemFileNumber] as? NSNumber,
                let inodeB = b[.systemFileNumber] as? NSNumber,
                let volumeA = a[.systemNumber] as? NSNumber,
                let volumeB = b[.systemNumber] as? NSNumber
            else { return false }
            return inodeA == inodeB && volumeA == volumeB
        }
    }
    func nameKey(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).precomposedStringWithCompatibilityMapping
            .lowercased(with: Locale(identifier: "en_US_POSIX"))
    }
    func validateAlias(_ value: String, excluding: UUID? = nil) throws -> String {
        let alias = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard alias.count <= 120,
            !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) })
        else { throw BuildError(message: "项目别名无效，最多 120 个字符，不能包含换行或控制字符") }
        if !alias.isEmpty,
            let conflict = projects.first(where: { $0.id != excluding && nameKey($0.name) == nameKey(alias) })
        {
            throw BuildError(message: "别名“\(alias)”已被其他项目使用，请设置不同别名。\n已有项目位置：\(conflict.path)")
        }
        return alias
    }
    func defaultNameConflicts(_ name: String, excluding: UUID? = nil) -> [Project] {
        projects.filter {
            $0.id != excluding
                && (nameKey($0.url.lastPathComponent) == nameKey(name) || nameKey($0.name) == nameKey(name))
        }
    }
    func notice(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "项目提示"
        alert.informativeText = message
        alert.addButton(withTitle: "好").toolTip = "返回并修改项目设置"
        alert.runModal()
    }
    // First button edits the alias, second explicitly keeps the folder name.
    func confirmDefaultName(_ name: String, path: String, excluding: UUID? = nil)
        -> NSApplication.ModalResponse
    {
        let conflicts = defaultNameConflicts(name, excluding: excluding)
        if conflicts.isEmpty { return .alertSecondButtonReturn }
        let alert = NSAlert()
        alert.messageText = "不同位置存在同名项目"
        alert.informativeText =
            "建议设置项目别名，方便区分。\n当前位置：\(path)\n已有项目：\n" + conflicts.map { $0.path }.joined(separator: "\n")
        alert.addButton(withTitle: "设置别名").toolTip = "返回填写一个不同的项目别名"
        alert.addButton(withTitle: "仍使用文件夹名称").toolTip = "保留同名项目，通过文件夹位置区分"
        alert.addButton(withTitle: "取消").toolTip = "取消当前操作"
        return alert.runModal()
    }
    func rename(_ p: Project) {
        let alert = NSAlert()
        alert.messageText = "设置项目别名"
        alert.informativeText = "仅更改显示名称，不重命名文件夹；留空恢复文件夹名称。"
        let folderName = p.url.lastPathComponent
        let field = NSTextField(string: p.alias ?? (p.name == folderName ? "" : p.name))
        field.placeholderString = folderName
        field.frame = NSRect(x: 0, y: 0, width: 300, height: 26)
        alert.accessoryView = field
        alert.addButton(withTitle: "保存").toolTip = "保存当前修改"
        alert.addButton(withTitle: "取消").toolTip = "取消操作，保留原内容"
        while alert.runModal() == .alertFirstButtonReturn {
            do {
                let alias = try validateAlias(field.stringValue, excluding: p.id)
                if alias.isEmpty {
                    let response = confirmDefaultName(folderName, path: p.path, excluding: p.id)
                    if response == .alertFirstButtonReturn { continue }
                    if response != .alertSecondButtonReturn { return }
                }
                var copy = p
                copy.alias = alias.isEmpty ? nil : alias
                copy.name = alias.isEmpty ? folderName : alias
                update(copy)
                AppDelegate.shared.models[p.id]?.project.name = copy.name
                AppDelegate.shared.models[p.id]?.project.alias = copy.alias
                AppDelegate.shared.windows[p.id]?.title = copy.name
                return
            } catch { notice(error.localizedDescription) }
        }
    }
    func relocate(_ p: Project) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.prompt = "重新关联"
        if panel.runModal() == .OK, let url = panel.url {
            let resolved = url.resolvingSymlinksInPath().standardizedFileURL
            if project(at: resolved, excluding: p.id) != nil {
                error = "该目录已在项目库中"
                return
            }
            var copy = p
            if copy.alias == nil {
                if confirmDefaultName(resolved.lastPathComponent, path: resolved.path, excluding: p.id)
                    != .alertSecondButtonReturn
                {
                    return
                }
                copy.name = resolved.lastPathComponent
            }
            copy.path = resolved.path
            update(copy)
        }
    }
    func remove(_ p: Project) {
        if AppDelegate.shared.models[p.id] != nil {
            error = "请先关闭项目窗口再移除记录"
            return
        }
        projects.removeAll { $0.id == p.id }
        persist()
    }
}
@MainActor final class ThumbnailStore {
    static let shared = ThumbnailStore()
    var cache: [String: NSImage] = [:]
    func thumbnail(_ p: Project) -> NSImage? {
        let state = AppStorage.supportDirectory
            .appendingPathComponent("workspace-state/" + p.id.uuidString + "/preview.pdf")
        let pdf =
            FileManager.default.fileExists(atPath: state.path)
            ? state
            : p.url.appendingPathComponent(p.root).deletingLastPathComponent().appendingPathComponent(
                ".folio/build/" + URL(fileURLWithPath: p.root).deletingPathExtension().lastPathComponent
                    + ".pdf")
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: pdf.path),
            let modified = attrs[.modificationDate] as? Date
        else { return nil }
        let key = pdf.path + modified.description
        if let image = cache[key] { return image }
        guard let document = PDFDocument(url: pdf), let page = document.page(at: 0) else { return nil }
        let image = withExtendedLifetime(document) {
            page.thumbnail(of: NSSize(width: 440, height: 600), for: .cropBox)
        }
        cache[key] = image
        return image
    }
}
@MainActor final class TemplateStore: ObservableObject {
    static let shared = TemplateStore()
    @Published var templates: [String] = []
    var directory: URL {
        AppStorage.supportDirectory.appendingPathComponent("Templates")
    }
    init() { reload() }
    func reload() {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        templates =
            ((try? FileManager.default.contentsOfDirectory(
                at: directory, includingPropertiesForKeys: [.isDirectoryKey], options: .skipsHiddenFiles))
            ?? []).filter { (try? $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true }.map(
                \.lastPathComponent
            ).sorted()
    }
    func importTemplate() throws {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.message = "选择含有主 .tex 文件的模板文件夹"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        try importFolder(url)
    }
    func importFolder(_ url: URL) throws {
        guard projectFiles(url).contains(where: { $0.pathExtension == "tex" }) else {
            throw BuildError(message: "模板中没有 .tex 文件")
        }
        let target = directory.appendingPathComponent(url.lastPathComponent)
        guard !FileManager.default.fileExists(atPath: target.path) else {
            throw BuildError(message: "模板名称已存在，请先重命名模板文件夹")
        }
        try copyTemplate(url, to: target)
        reload()
    }
    func copyTemplate(_ from: URL, to: URL) throws {
        let sourcePath = from.resolvingSymlinksInPath().standardizedFileURL.path
        let destinationPath = to.resolvingSymlinksInPath().standardizedFileURL.path
        guard destinationPath != sourcePath, !destinationPath.hasPrefix(sourcePath + "/") else {
            throw BuildError(message: "新项目不能建在模板目录内部")
        }
        try FileManager.default.createDirectory(at: to, withIntermediateDirectories: false)
        guard
            let e = FileManager.default.enumerator(
                at: from, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey],
                options: .skipsHiddenFiles)
        else { return }
        for case let file as URL in e {
            let values = try file.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            if values.isSymbolicLink == true {
                e.skipDescendants()
                continue
            }
            if ["aux", "log", "fls", "fdb_latexmk", "synctex", "gz"].contains(file.pathExtension) {
                continue
            }
            let target = to.appendingPathComponent(relative(file, to: from))
            if values.isDirectory == true {
                try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
            } else {
                try FileManager.default.copyItem(at: file, to: target)
            }
        }
    }
}

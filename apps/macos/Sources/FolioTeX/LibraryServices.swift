import AppKit
import Foundation
import PDFKit

@MainActor extension Library {
    func rename(_ p: Project) {
        let alert = NSAlert()
        alert.messageText = "项目显示名称"
        let field = NSTextField(string: p.name)
        field.frame = NSRect(x: 0, y: 0, width: 300, height: 26)
        alert.accessoryView = field
        alert.addButton(withTitle: "保存").toolTip = "保存当前修改"
        alert.addButton(withTitle: "取消").toolTip = "取消操作，保留原内容"
        if alert.runModal() == .alertFirstButtonReturn, !field.stringValue.isEmpty {
            var copy = p
            copy.name = field.stringValue
            update(copy)
        }
    }
    func relocate(_ p: Project) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.prompt = "重新关联"
        if panel.runModal() == .OK, let url = panel.url {
            let resolved = url.resolvingSymlinksInPath()
            if projects.contains(where: { $0.id != p.id && $0.path == resolved.path }) {
                error = "该目录已在项目库中"
                return
            }
            var copy = p
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
        let state = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("FolioTeX/workspace-state/" + p.id.uuidString + "/preview.pdf")
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
        guard let page = PDFDocument(url: pdf)?.page(at: 0) else { return nil }
        let image = page.thumbnail(of: NSSize(width: 220, height: 300), for: .cropBox)
        cache[key] = image
        return image
    }
}
@MainActor final class TemplateStore: ObservableObject {
    static let shared = TemplateStore()
    @Published var templates: [String] = []
    var directory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("FolioTeX/Templates")
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

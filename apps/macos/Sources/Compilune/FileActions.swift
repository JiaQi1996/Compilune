import AppKit
import Foundation

enum NewProjectItem: String, CaseIterable {
    case folder = "新建文件夹"
    case file = "新建文件"
    case tex = "新建 TeX"
    case bib = "新建 Bib"
    var initialName: String {
        switch self {
        case .folder: return "新建文件夹"
        case .file: return "untitled.txt"
        case .tex: return "untitled.tex"
        case .bib: return "references.bib"
        }
    }
}
@MainActor extension Workspace {
    var insertionDirectory: String { directoryForItem(fileTreeSelection) }
    func directoryForItem(_ path: String?) -> String {
        guard let path else { return "" }
        var directory: ObjCBool = false
        if FileManager.default.fileExists(
            atPath: project.url.appendingPathComponent(path).path, isDirectory: &directory),
            directory.boolValue
        {
            return path
        }
        let parent = (path as NSString).deletingLastPathComponent
        return parent == "." ? "" : parent
    }
    func promptNewItem(_ kind: NewProjectItem, parent: String? = nil) {
        let directory = parent ?? insertionDirectory
        let alert = NSAlert()
        alert.messageText = kind.rawValue
        alert.informativeText = "创建位置：" + (directory.isEmpty ? "项目根目录" : directory)
        let field = NSTextField(string: kind.initialName)
        field.frame = NSRect(x: 0, y: 0, width: 320, height: 26)
        alert.accessoryView = field
        alert.addButton(withTitle: "创建").toolTip = "在所选目录创建，不覆盖已有文件"
        alert.addButton(withTitle: "取消").toolTip = "取消新建"
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        do { try createItem(kind, name: field.stringValue, parent: directory) } catch {
            self.error = error.localizedDescription
        }
    }
    func createItem(_ kind: NewProjectItem, name: String, parent: String) throws {
        var name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name != ".", name != "..", !name.contains("/"), !name.contains(":"),
            !name.hasPrefix(".")
        else { throw BuildError(message: "请输入有效名称，不含路径分隔符") }
        if kind == .tex && !name.lowercased().hasSuffix(".tex") { name += ".tex" }
        if kind == .bib && !name.lowercased().hasSuffix(".bib") { name += ".bib" }
        let folder = project.url.appendingPathComponent(parent).resolvingSymlinksInPath().standardizedFileURL
        guard folder.path == project.path || folder.path.hasPrefix(project.path + "/") else {
            throw BuildError(message: "创建位置必须位于项目内")
        }
        let target = folder.appendingPathComponent(name)
        guard !FileManager.default.fileExists(atPath: target.path) else {
            throw BuildError(message: "同名文件或文件夹已存在")
        }
        if kind == .folder {
            try FileManager.default.createDirectory(at: target, withIntermediateDirectories: false)
        } else {
            try Data().write(to: target, options: .withoutOverwriting)
        }
        let path = relative(target, to: project.url)
        fileTreeSelection = path
        refreshFiles()
        refreshIndex()
        if kind != .folder
            && ["tex", "bib", "txt", "md", "sty", "cls"].contains(target.pathExtension.lowercased())
        {
            open(path)
        }
    }
    func moveDropped(_ items: [String], to directory: String) -> Bool {
        guard items.count == 1 else { return false }
        let parts = items[0].split(separator: "|", maxSplits: 1).map(String.init)
        guard parts.count == 2, parts[0] == project.id.uuidString else { return false }
        let path = parts[1]
        let name = URL(fileURLWithPath: path).lastPathComponent
        let destination = directory.isEmpty ? name : directory + "/" + name
        guard destination != path else { return false }
        return moveFile(path, to: destination)
    }
}

import AppKit
import Foundation
import JavaScriptCore

final class BibliographyParser {
    private let context: JSContext
    init() throws {
        let packaged = Bundle.main.resourceURL?.appendingPathComponent("Bibliography.cjs")
        let resource =
            packaged.flatMap { FileManager.default.fileExists(atPath: $0.path) ? $0 : nil }
            ?? Bundle.module.url(forResource: "Bibliography", withExtension: "cjs", subdirectory: "Resources")
        guard let context = JSContext(), let url = resource,
            let script = try? String(contentsOf: url, encoding: .utf8)
        else { throw BuildError(message: "文献校验组件不可用，请重新构建应用") }
        self.context = context
        context.evaluateScript("var module = {exports:{}}; var exports = module.exports;")
        context.evaluateScript(script)
        if context.exception != nil { throw BuildError(message: "文献校验组件加载失败") }
    }
    func call(_ name: String, _ arguments: [Any]) throws -> [String: Any] {
        context.exception = nil
        let result = context.evaluateScript("module.exports.\(name)")?.call(withArguments: arguments)
        if let exception = context.exception {
            throw BuildError(message: exception.forProperty("message")?.toString() ?? "BibTeX 格式无效")
        }
        guard let value = result?.toDictionary() as? [String: Any] else {
            throw BuildError(message: "无法校验 BibTeX 内容")
        }
        return value
    }
}

@MainActor extension Workspace {
    func insertClipboardCitation(_ request: [String: Any]) {
        insertCitation(request, clipboard: NSPasteboard.general.string(forType: .string) ?? "")
    }
    func insertCitation(_ request: [String: Any], clipboard: String) {
        do {
            guard let path = request["path"] as? String, path == selected,
                path.lowercased().hasSuffix(".tex"), let source = buffers[path],
                source.text == request["text"] as? String, !composing
            else { throw BuildError(message: "请先在 TeX 文稿中定位插入位置，并完成当前输入") }
            let parser = try BibliographyParser()
            _ = try parser.call("parseBibTeX", [clipboard, true])
            let bibs = files.filter { !$0.hasDirectoryPath && $0.pathExtension.lowercased() == "bib" }
                .map { relative($0, to: project.url) }.sorted()
            guard !bibs.isEmpty else { throw BuildError(message: "项目中没有 .bib 文件，请先新建或导入文献文件") }
            let target: String
            if !bibliographyFile.isEmpty {
                guard bibs.contains(bibliographyFile) else {
                    throw BuildError(message: "默认文献文件不存在，请在项目配置中重新选择")
                }
                target = bibliographyFile
            } else if bibs.count == 1 {
                target = bibs[0]
            } else {
                let alert = NSAlert()
                alert.messageText = "选择文献文件"
                alert.informativeText = "文献将追加到所选 .bib 的底部。可在项目配置中设置默认文件。"
                let popup = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 340, height: 28))
                popup.addItems(withTitles: bibs)
                alert.accessoryView = popup
                alert.addButton(withTitle: "插入").toolTip = "追加文献并在原光标处插入引用"
                alert.addButton(withTitle: "取消").toolTip = "取消，不修改任何文稿或文献"
                guard alert.runModal() == .alertFirstButtonReturn else { return }
                target = bibs[popup.indexOfSelectedItem]
            }
            var keys: [String] = []
            var targetBuffer: SourceBuffer?
            for bib in bibs {
                let url = project.url.appendingPathComponent(bib).resolvingSymlinksInPath()
                guard url.path.hasPrefix(project.path + "/") else { throw BuildError(message: "文献文件必须位于项目内") }
                let disk = try String(contentsOf: url, encoding: .utf8)
                if let existing = buffers[bib], existing.diskText != disk {
                    throw BuildError(message: "\(bib) 已在外部修改，请先重新载入或另存修改内容")
                }
                let buffer = buffers[bib] ?? SourceBuffer(text: disk, diskText: disk)
                let parsed = try parser.call("parseBibTeX", [buffer.text, false])
                keys += parsed["keys"] as? [String] ?? []
                if bib == target { targetBuffer = buffer }
            }
            guard let bibBuffer = targetBuffer, selected == path, buffers[path]?.text == source.text,
                let from = request["from"] as? Int, let to = request["to"] as? Int,
                from >= 0, to >= from, to <= (source.text as NSString).length
            else { throw BuildError(message: "文稿已变化，请重新定位后插入，未修改任何内容") }
            let plan = try parser.call("citationPlan", [clipboard, bibBuffer.text, keys])
            guard let bibText = plan["text"] as? String, let citation = plan["citation"] as? String else {
                throw BuildError(message: "无法生成文献引用")
            }
            let sourceText = (source.text as NSString).replacingCharacters(
                in: NSRange(location: from, length: to - from), with: citation)
            buffers[target] = bibBuffer
            if !tabs.contains(target) { tabs.append(target) }
            recordEdit(
                before: [path: source.text, target: bibBuffer.text],
                after: [path: sourceText, target: bibText], name: "插入剪贴板文献")
            applyHistory([path: sourceText, target: bibText])
            let cursor = from + (citation as NSString).length
            let scroll = request["scroll"] as? Double ?? 0
            positions[path] = DocumentPosition(anchor: cursor, head: cursor, scroll: scroll)
            send?([
                "type": "restorePosition", "anchor": cursor, "head": cursor, "scroll": scroll, "focus": true,
            ])
            status = "已追加文献到 \(target) 并插入引用"
        } catch { self.error = error.localizedDescription }
    }
}

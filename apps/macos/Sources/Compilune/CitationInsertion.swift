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

final class CitationPreviewStack: NSStackView {
    override var isFlipped: Bool { true }
}

@MainActor extension Workspace {
    static func citationPreviewAccessory(_ entries: [[String: Any]], existing: Set<String>) -> NSView {
        let width: CGFloat = 380
        let stack = CitationPreviewStack()
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 12
        for entry in entries {
            let content = NSStackView()
            content.orientation = .vertical; content.alignment = .leading; content.spacing = 7
            let key = entry["key"] as? String ?? ""
            var items: [(String, Bool)] = []
            items.append((key + (existing.contains(key) ? " · 已存在，将复用" : ""), false))
            let title = entry["title"] as? String ?? ""
            items.append((title.isEmpty ? "标题未提供" : title, true))
            let fields = [("第一作者", "author"), ("发表年份", "year"), ("期刊 / 会议", "venue")]
            for (label, name) in fields {
                let value = entry[name] as? String ?? ""
                items.append((label + "：" + (value.isEmpty ? "未提供" : value), false))
            }
            for (text, title) in items {
                let field = NSTextField(wrappingLabelWithString: text)
                field.font = title ? NSFont.boldSystemFont(ofSize: Preferences.shared.uiSize) : NSFont.systemFont(ofSize: max(10, Preferences.shared.uiSize - 1))
                field.isSelectable = true
                field.translatesAutoresizingMaskIntoConstraints = false
                field.widthAnchor.constraint(equalToConstant: width - 28).isActive = true
                content.addArrangedSubview(field)
            }
            let box = NSBox()
            box.boxType = .custom; box.titlePosition = .noTitle; box.cornerRadius = 10
            box.fillColor = .controlBackgroundColor; box.borderColor = .separatorColor; box.borderWidth = 1
            box.contentView = content
            content.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                box.widthAnchor.constraint(equalToConstant: width),
                content.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 14),
                content.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -14),
                content.topAnchor.constraint(equalTo: box.topAnchor, constant: 12),
                content.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -12),
            ])
            stack.addArrangedSubview(box)
        }
        stack.frame = NSRect(x: 0, y: 0, width: width, height: max(60, stack.fittingSize.height))
        let scroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: width + 16, height: min(360, stack.frame.height)))
        scroll.hasVerticalScroller = true; scroll.drawsBackground = false; scroll.documentView = stack
        return scroll
    }
    func insertClipboardCitation(_ request: [String: Any]) {
        insertCitation(request, clipboard: NSPasteboard.general.string(forType: .string) ?? "")
    }
    func insertCitation(_ request: [String: Any], clipboard: String, confirmedExistingKeys: [String] = [], previewConfirmed: Bool = false) {
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
            var keys: [String] = []
            var snapshots: [String: SourceBuffer] = [:]
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
                snapshots[bib] = buffer
            }
            let info = try parser.call("citationInfo", [clipboard, keys])
            let existingKeys = info["existingKeys"] as? [String] ?? []
            let newKeys = info["newKeys"] as? [String] ?? []
            if !previewConfirmed || !Set(existingKeys).isSubset(of: Set(confirmedExistingKeys)) {
                let alert = NSAlert()
                alert.messageText = existingKeys.isEmpty ? "智能插入文献" : "文献已存在"
                alert.informativeText = existingKeys.isEmpty ? "确认文献信息后，追加到文献文件并在原光标处插入引用。" :
                    "项目中已存在以下文献键：" + existingKeys.joined(separator: ", ") + "。" +
                    (newKeys.isEmpty ? "确认后仅插入引用，不修改 .bib。" : "已有文献不再追加；新文献追加到所选 .bib。")
                alert.accessoryView = Self.citationPreviewAccessory(info["entries"] as? [[String: Any]] ?? [], existing: Set(existingKeys))
                alert.addButton(withTitle: newKeys.isEmpty ? "仅插入引用" : existingKeys.isEmpty ? "插入文献" : "复用已有文献并插入")
                    .toolTip = "保留已有文献条目，不重复追加或覆盖"
                alert.addButton(withTitle: "取消").toolTip = "取消，不修改任何文稿或文献"
                guard alert.runModal() == .alertFirstButtonReturn else { return }
                // A modal can process other events. Re-read the source and all
                // bibliographies before applying the confirmed operation.
                insertCitation(request, clipboard: clipboard, confirmedExistingKeys: existingKeys, previewConfirmed: true)
                return
            }
            let target: String
            if newKeys.isEmpty {
                target = ""
            } else if !bibliographyFile.isEmpty {
                guard bibs.contains(bibliographyFile) else {
                    throw BuildError(message: "默认文献文件不存在，请在项目配置中重新选择")
                }
                target = bibliographyFile
            } else if bibs.count == 1 {
                target = bibs[0]
            } else {
                let alert = NSAlert()
                alert.messageText = "选择文献文件"
                alert.informativeText = "新文献将追加到所选 .bib 的底部。可在项目配置中设置默认文件。"
                let popup = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 340, height: 28))
                popup.addItems(withTitles: bibs)
                alert.accessoryView = popup
                alert.addButton(withTitle: "插入").toolTip = "追加新文献并在原光标处插入引用"
                alert.addButton(withTitle: "取消").toolTip = "取消，不修改任何文稿或文献"
                guard alert.runModal() == .alertFirstButtonReturn else { return }
                target = bibs[popup.indexOfSelectedItem]
            }
            guard selected == path, buffers[path]?.text == source.text, !composing,
                let from = request["from"] as? Int, let to = request["to"] as? Int,
                from >= 0, to >= from, to <= (source.text as NSString).length
            else { throw BuildError(message: "文稿已变化，请重新定位后插入，未修改任何内容") }
            for (bib, snapshot) in snapshots {
                let disk = try String(contentsOf: project.url.appendingPathComponent(bib), encoding: .utf8)
                guard disk == snapshot.diskText,
                    buffers[bib].map({ $0.text == snapshot.text && $0.diskText == snapshot.diskText }) ?? true
                else { throw BuildError(message: "文献文件已变化，请重新插入，未修改任何内容") }
            }
            let bibBuffer = snapshots[target]
            let plan = try parser.call("citationPlan", [clipboard, bibBuffer?.text ?? "", keys, confirmedExistingKeys])
            guard let bibText = plan["text"] as? String, let citation = plan["citation"] as? String else {
                throw BuildError(message: "无法生成文献引用")
            }
            let sourceText = (source.text as NSString).replacingCharacters(
                in: NSRange(location: from, length: to - from), with: citation)
            var before = [path: source.text]
            var after = [path: sourceText]
            if let bibBuffer, !newKeys.isEmpty {
                before[target] = bibBuffer.text
                after[target] = bibText
                buffers[target] = bibBuffer
                if !tabs.contains(target) { tabs.append(target) }
            }
            recordEdit(before: before, after: after, name: "插入剪贴板文献")
            applyHistory(after)
            let cursor = from + (citation as NSString).length
            let scroll = request["scroll"] as? Double ?? 0
            positions[path] = DocumentPosition(anchor: cursor, head: cursor, scroll: scroll)
            send?([
                "type": "restorePosition", "anchor": cursor, "head": cursor, "scroll": scroll, "focus": true,
            ])
            status = newKeys.isEmpty ? "已插入引用，未修改文献文件" : "已追加新文献到 \(target) 并插入引用"
        } catch { self.error = error.localizedDescription }
    }
}

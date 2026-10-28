import Foundation
import SwiftUI

struct BibliographyDuplicateEntry: Decodable, Identifiable {
    let id, key, path: String
    let line: Int
    let title, author, year, venue, raw: String
    let fieldCount: Int
}
struct BibliographyDuplicateReference: Decodable {
    let path: String
    let line: Int
    let command: String
    let keys: [String]
    let text: String
}
struct BibliographyDuplicateGroup: Decodable, Identifiable {
    let id, title, author, keep, blocked: String
    let entries: [BibliographyDuplicateEntry]
    let references: [BibliographyDuplicateReference]
    let warnings: [String]
}
struct BibliographyDuplicateReport: Decodable {
    let groups: [BibliographyDuplicateGroup]
    let entryCount: Int
}
struct BibliographyDedupSession {
    let documents: [[String: String]]
    let buffers: [String: SourceBuffer]
    let revision: Int
}
@MainActor extension Workspace {
    func bibliographyDedupSnapshot() throws -> BibliographyDedupSession {
        refreshFiles()
        var documents: [[String: String]] = [], snapshots: [String: SourceBuffer] = [:]
        for url in files.filter({ ["bib", "tex", "ltx", "sty", "cls"].contains($0.pathExtension.lowercased()) }).sorted(by: { $0.path < $1.path }) {
            let resolved = url.resolvingSymlinksInPath()
            guard resolved.path.hasPrefix(project.url.resolvingSymlinksInPath().path + "/") else { throw BuildError(message: "文献和源码必须位于项目内") }
            let path = relative(url, to: project.url), disk = try String(contentsOf: url, encoding: .utf8)
            if let buffer = buffers[path], buffer.diskText != disk { throw BuildError(message: "\(path) 已在外部修改，请先处理冲突") }
            let buffer = buffers[path] ?? SourceBuffer(text: disk, diskText: disk)
            snapshots[path] = buffer
            documents.append(["path": path, "text": buffer.text])
        }
        return BibliographyDedupSession(documents: documents, buffers: snapshots, revision: revision)
    }
    func prepareBibliographyDedup() {
        do {
            guard !composing else { throw BuildError(message: "请先完成当前输入") }
            let snapshot = try bibliographyDedupSnapshot()
            let result = try BibliographyParser().call("bibliographyDuplicates", [snapshot.documents])
            let report = try JSONDecoder().decode(BibliographyDuplicateReport.self, from: JSONSerialization.data(withJSONObject: result))
            bibliographyDedupSession = snapshot
            bibliographyDuplicateReport = report
            showBibliographyDedup = true
        } catch { self.error = error.localizedDescription }
    }
    func applyBibliographyDedup(_ choices: [[String: String]]) throws -> Int {
        guard let previous = bibliographyDedupSession, previous.revision == revision, !composing else { throw BuildError(message: "文稿已变化，请重新检查") }
        let current = try bibliographyDedupSnapshot()
        guard current.buffers.count == previous.buffers.count,
            previous.buffers.allSatisfy({ key, value in current.buffers[key]?.text == value.text && current.buffers[key]?.diskText == value.diskText }) else {
            throw BuildError(message: "预览后项目文件已变化，请重新检查，未修改任何文件")
        }
        let result = try BibliographyParser().call("deduplicateBibliography", [current.documents, choices])
        guard let plans = result["plans"] as? [[String: String]] else { throw BuildError(message: "无法生成去重结果") }
        var before: [String: String] = [:], after: [String: String] = [:]
        for plan in plans {
            guard let path = plan["path"], let original = plan["before"], let text = plan["after"], let buffer = current.buffers[path], buffer.text == original else { throw BuildError(message: "去重结果已变化，请重新检查") }
            before[path] = original; after[path] = text
        }
        for path in after.keys {
            buffers[path] = current.buffers[path]
            if !tabs.contains(path) { tabs.append(path) }
        }
        if !after.isEmpty {
            recordEdit(before: before, after: after, name: "智能文献去重")
            applyHistory(after)
        }
        bibliographyDedupSession = nil
        let removed = result["removed"] as? Int ?? 0
        status = "已去重 \(removed) 条文献并更新引用，可整体撤销"
        return removed
    }
}

struct BibliographyDedupView: View {
    @ObservedObject var workspace: Workspace
    @ObservedObject var prefs = Preferences.shared
    @ViewState private var selected = Set<String>()
    @ViewState private var keep: [String: String] = [:]
    @ViewState private var error = ""
    @ViewState private var referenceExpansion = Set<String>()
    var groups: [BibliographyDuplicateGroup] { workspace.bibliographyDuplicateReport?.groups ?? [] }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("智能文献去重").font(.title2).bold()
            Text("按题目与作者检查。选择保留条目后，合并缺失字段并更新正文引用；一次撤销可还原全部修改。").foregroundStyle(.secondary)
            if groups.isEmpty {
                Text("检查了 \(workspace.bibliographyDuplicateReport?.entryCount ?? 0) 条文献，未发现题目与作者相同的重复条目。").frame(maxWidth: .infinity, minHeight: 160)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(groups) { group in
                            VStack(alignment: .leading, spacing: 10) {
                                Toggle(group.title, isOn: Binding(get: { selected.contains(group.id) }, set: { if $0 { selected.insert(group.id) } else { selected.remove(group.id) } })).bold().disabled(!group.blocked.isEmpty).help("选择这一组重复文献进行合并")
                                Text(group.author).font(.caption).foregroundStyle(.secondary)
                                ForEach(group.entries) { entry in
                                    HStack { Text(entry.key).font(.system(size: prefs.uiSize - 1, design: .monospaced)); Text("\(entry.path):\(entry.line)").foregroundStyle(.secondary) }.font(.caption)
                                }
                                ForEach(group.warnings, id: \.self) { Text($0).foregroundStyle(.orange) }
                                if !group.blocked.isEmpty { Text(group.blocked).foregroundStyle(.red) }
                                Picker("保留条目", selection: Binding(get: { keep[group.id] ?? group.keep }, set: { keep[group.id] = $0 })) {
                                    ForEach(group.entries) { entry in Text("\(entry.key) — \(entry.path):\(entry.line)（\(entry.fieldCount) 个字段）").tag(entry.id) }
                                }.help("选择保留的引用键和 Bib 文件；其余条目的缺失字段会合并到这一条")
                                if Set(group.entries.map(\.path)).count > 1 { Text("请确认正文已加载所选条目所在的 Bib 文件。").font(.caption).foregroundStyle(.secondary) }
                                DisclosureGroup("引用位置（\(group.references.count) 处）", isExpanded: Binding(get: { referenceExpansion.contains(group.id) }, set: { if $0 { referenceExpansion.insert(group.id) } else { referenceExpansion.remove(group.id) } })) {
                                    ForEach(Array(group.references.enumerated()), id: \.offset) { _, reference in
                                        Button("\(reference.path):\(reference.line)  \\(reference.command){\(reference.keys.joined(separator: ","))}") { workspace.open(reference.path, line: reference.line) }.buttonStyle(.link).help("定位这处引用")
                                    }
                                }
                                DisclosureGroup("查看原始条目") {
                                    ForEach(group.entries) { entry in Text(entry.raw).font(.system(size: max(10, prefs.uiSize - 2), design: .monospaced)).textSelection(.enabled) }
                                }
                            }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(sage.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
            }
            if !error.isEmpty { Text(error).foregroundStyle(.red).textSelection(.enabled) }
            HStack {
                Button("取消") { workspace.showBibliographyDedup = false }.keyboardShortcut(.cancelAction).help("关闭预览，不修改任何文件")
                Spacer()
                Button("确认去重（\(selected.count) 组）") {
                    do {
                        _ = try workspace.applyBibliographyDedup(groups.filter { selected.contains($0.id) }.map { ["id": $0.id, "keep": keep[$0.id] ?? $0.keep] })
                        workspace.showBibliographyDedup = false
                    } catch { self.error = error.localizedDescription }
                }.buttonStyle(.borderedProminent).disabled(selected.isEmpty).help("合并所选重复文献并同步修改正文引用")
            }
        }.padding(24).frame(width: 740, height: groups.isEmpty ? 340 : 650).font(.system(size: prefs.uiSize)).tint(sage).preferredColorScheme(prefs.scheme)
            .onAppear { selected = Set(groups.filter { $0.blocked.isEmpty && $0.warnings.isEmpty }.map(\.id)); keep = Dictionary(uniqueKeysWithValues: groups.map { ($0.id, $0.keep) }); referenceExpansion = Set(groups.filter { $0.references.count <= 8 }.map(\.id)) }
    }
}

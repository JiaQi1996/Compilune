import AppKit
import Foundation
import SwiftUI

struct EditorCommand: Identifiable {
    let id: String
    let title: String
    let key: String
    var scope = "editor"
    static let all: [EditorCommand] = [
        .init(id: "undo", title: "撤销", key: "Mod-z"), .init(id: "redo", title: "重做", key: "Mod-Shift-z"),
        .init(id: "bold", title: "加粗 / 取消加粗", key: "Mod-b"),
        .init(id: "italic", title: "斜体 / 取消斜体", key: "Mod-i"),
        .init(id: "underline", title: "下划线", key: "Mod-u"),
        .init(id: "find", title: "查找", key: "Mod-f"), .init(id: "replace", title: "替换", key: "Mod-Alt-f"),
        .init(id: "findNext", title: "下一处", key: "Mod-g"),
        .init(id: "findPrevious", title: "上一处", key: "Mod-Shift-g"),
        .init(id: "replaceNext", title: "替换当前", key: "Mod-Alt-Enter"),
        .init(id: "replaceAll", title: "全部替换", key: "Mod-Shift-Alt-Enter"),
        .init(id: "projectSearch", title: "项目搜索", key: "Mod-Shift-f"),
        .init(id: "projectReplace", title: "项目替换", key: "Mod-Shift-h"),
        .init(id: "files", title: "快速打开文件", key: "Mod-p"), .init(id: "goto", title: "跳转行 / 列", key: "Ctrl-g"),
        .init(id: "symbols", title: "跳转章节", key: "Mod-Shift-o"),
        .init(id: "definition", title: "跳到光标处定义", key: "Mod-Alt-g"),
        .init(id: "back", title: "返回上一位置", key: "Ctrl--"),
        .init(id: "forward", title: "前进", key: "Ctrl-Shift--"),
        .init(id: "completion", title: "显示补全", key: "F5"), .init(id: "comment", title: "注释", key: "Mod-/"),
        .init(id: "section", title: "一级标题", key: "Mod-Alt-1"),
        .init(id: "subsection", title: "二级标题", key: "Mod-Alt-2"),
        .init(id: "subsubsection", title: "三级标题", key: "Mod-Alt-3"),
        .init(id: "ordered", title: "有序列表", key: "Mod-Shift-7"),
        .init(id: "list", title: "无序列表", key: "Mod-Shift-8"),
        .init(id: "math", title: "行内公式", key: "Mod-Shift-m"),
        .init(id: "displayMath", title: "独立公式", key: "Mod-Shift-Alt-m"),
        .init(id: "cite", title: "插入文献引用", key: "Mod-Shift-c"),
        .init(id: "pasteCitation", title: "插入剪贴板文献", key: "Mod-Shift-b"),
        .init(id: "ref", title: "插入交叉引用", key: "Mod-Shift-r"),
        .init(id: "image", title: "选择图片", key: "Mod-Shift-i"),
        .init(id: "table", title: "插入表格", key: "Mod-Shift-Alt-t"),
        .init(id: "link", title: "插入链接", key: "Mod-l"),
        .init(id: "forwardSync", title: "源码定位 PDF", key: "Mod-Shift-j"),
        .init(id: "palette", title: "命令面板", key: "Mod-Shift-p"),
        .init(id: "fontUp", title: "增大代码字号", key: "Mod-="),
        .init(id: "fontDown", title: "减小代码字号", key: "Mod--"),
        .init(id: "fontReset", title: "恢复代码字号", key: "Mod-0"),
    ]
    static let reserved = [
        "Mod-n", "Mod-o", "Mod-Shift-n", "Mod-s", "Mod-r", "Mod-.", "Mod-k", "Mod-,", "Mod-q", "Mod-w",
        "Mod-c", "Mod-v", "Mod-x", "Mod-a", "Mod-Alt-=", "Mod-Alt--", "Mod-Alt-0",
    ]
    static func normalized(_ key: String) -> String {
        let parts = key.split(separator: "-", omittingEmptySubsequences: false).map(String.init)
        let mods = parts.dropLast().sorted()
        return (mods + [parts.last?.lowercased() ?? ""]).joined(separator: "-")
    }
    static func validate(_ keys: [String: String]) -> String? {
        var seen: [String: String] = [:]
        for c in all {
            let key = ShortcutNotation.canonical(keys[c.id] ?? c.key)
            if key.isEmpty { continue }
            let parts =
                key.hasSuffix("--")
                ? String(key.dropLast(2)).split(separator: "-", omittingEmptySubsequences: false).map(
                    String.init) + ["-"]
                : key.split(separator: "-", omittingEmptySubsequences: false).map(String.init)
            let tail = parts.last ?? ""
            let mods = Array(parts.dropLast())
            let function = tail.hasPrefix("F") && Int(tail.dropFirst()).map { (1...12).contains($0) } == true
            guard Set(mods).count == mods.count,
                mods.allSatisfy({ ["Mod", "Ctrl", "Alt", "Shift"].contains($0) }),
                (tail.count == 1 && !tail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    || ["Enter", "Space"].contains(tail) || function,
                !mods.isEmpty || function
            else { return "\(c.title)：使用 ⌘ Command、⌃ Control、⌥ Option、⇧ Shift 加按键，或 F1–F12" }
            let n = normalized(key)
            if reserved.contains(where: { normalized($0) == n }) {
                return "\(c.title) 与系统/应用基础快捷键冲突：\(ShortcutNotation.display(key))"
            }
            if let old = seen[n] { return "\(old) 与 \(c.title) 使用相同快捷键" }
            seen[n] = c.title
        }
        return nil
    }
}
struct EditTransaction {
    let before: [String: String]
    var after: [String: String]
    var name: String
    var time = Date()
}
struct DocumentPosition: Codable {
    var anchor = 0
    var head = 0
    var scroll = 0.0
}
struct WorkspaceSession: Codable {
    var tabs: [String] = []
    var selected: String?
    var positions: [String: DocumentPosition] = [:]
    var sidebar = true
    var preview = true
    var pdfPage = 1
    var pdfZoom = 0
    var showOutline: Bool?
    var fileTreeExpansion: [String: Bool]?
    var outlineTreeExpansion: [String: Bool]?
    var fileTreeSelection: String?
}

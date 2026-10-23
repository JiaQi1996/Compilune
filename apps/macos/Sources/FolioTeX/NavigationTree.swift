import Foundation

struct SourceNode: Identifiable {
    var path: String
    var children: [SourceNode]?
    var id: String { path }
    static func tree(_ files: [URL], root: URL) -> [SourceNode] {
        let paths = files.map { relative($0, to: root) }
        func nodes(_ prefix: String) -> [SourceNode] {
            let descendants = paths.filter { prefix.isEmpty || $0.hasPrefix(prefix + "/") }
            let names = Set(
                descendants.compactMap { path -> String? in
                    let rest = prefix.isEmpty ? path : String(path.dropFirst(prefix.count + 1))
                    return rest.split(separator: "/").first.map(String.init)
                })
            return names.map { name in
                let path = prefix.isEmpty ? name : prefix + "/" + name
                let directory =
                    descendants.contains { $0.hasPrefix(path + "/") }
                    || files.contains { $0.hasDirectoryPath && relative($0, to: root) == path }
                return SourceNode(path: path, children: directory ? nodes(path) : nil)
            }.sorted {
                if ($0.children != nil) != ($1.children != nil) { return $0.children != nil }
                return $0.path.localizedStandardCompare($1.path) == .orderedAscending
            }
        }
        return nodes("")
    }
}

struct OutlineNode: Identifiable {
    var id: String
    var label: String
    var path: String
    var line: Int
    var kind: String
    var detail: String = ""
    var children: [OutlineNode]?
    var icon: String {
        switch kind {
        case "file": return path.lowercased().hasSuffix(".cls") ? "doc.badge.gearshape" : "doc.text"
        case "section": return "text.alignleft"
        case "command": return "function"
        case "environment": return "curlybraces"
        case "class": return "doc.badge.gearshape"
        case "dependency": return "shippingbox"
        case "option": return "slider.horizontal.3"
        default: return "number"
        }
    }
    static let sectionLevels = [
        "part": 0, "chapter": 1, "section": 2, "subsection": 3, "subsubsection": 4, "paragraph": 5,
        "subparagraph": 6,
    ]
    private final class Branch {
        var node: OutlineNode
        var descendants: [Branch] = []
        init(_ node: OutlineNode) { self.node = node }
        func value() -> OutlineNode {
            var result = node
            result.children = descendants.isEmpty ? nil : descendants.map { $0.value() }
            return result
        }
    }
    static func tree(_ symbols: [SourceSymbol], files: [URL], root: URL, main: String) -> [OutlineNode] {
        let eligible: Set<String> = ["tex"]
        let paths = Set(
            files.filter { !$0.hasDirectoryPath && eligible.contains($0.pathExtension.lowercased()) }.map {
                relative($0, to: root)
            })
        let grouped = Dictionary(grouping: symbols, by: { $0.path })
        return paths.sorted {
            if ($0 == main) != ($1 == main) { return $0 == main }
            return $0.localizedStandardCompare($1) == .orderedAscending
        }.map { path in
            let file = Branch(
                OutlineNode(
                    id: "file:" + path, label: URL(fileURLWithPath: path).lastPathComponent, path: path,
                    line: 1, kind: "file"))
            var stack: [(Int, Branch)] = []
            for symbol in (grouped[path] ?? []).sorted(by: { $0.offset < $1.offset }) {
                guard
                    ["section", "command", "environment", "class", "dependency", "option"].contains(
                        symbol.kind)
                else { continue }
                let branch = Branch(
                    OutlineNode(
                        id: "symbol:\(path):\(symbol.offset):\(symbol.kind)", label: symbol.label, path: path,
                        line: symbol.line, kind: symbol.kind, detail: symbol.detail))
                if symbol.kind == "section" {
                    let level = sectionLevels[symbol.detail] ?? 2
                    while let last = stack.last, last.0 >= level { stack.removeLast() }
                    (stack.last?.1 ?? file).descendants.append(branch)
                    stack.append((level, branch))
                } else {
                    (stack.last?.1 ?? file).descendants.append(branch)
                }
            }
            return file.value()
        }
    }
}

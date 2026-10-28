import Foundation

struct SourceSymbol: Codable {
    var label: String
    var path: String
    var line: Int
    var kind: String
    var offset: Int
    var detail: String = ""
    var arguments: Int = 0
    var preview: [String: String] = [:]
    var dictionary: [String: Any] {
        [
            "label": label, "path": path, "line": line, "kind": kind, "offset": offset, "detail": detail,
            "arguments": arguments, "preview": preview,
        ]
    }
}
enum TeXIndex {
    // Replace comments/verbatim with spaces, retaining UTF-16 positions and line numbers.
    static func masked(_ source: String) -> String {
        var units = Array(source.utf16)
        var i = 0
        while i < units.count {
            if units[i] == 37 {
                var n = 0
                var j = i
                while j > 0 && units[j - 1] == 92 {
                    n += 1
                    j -= 1
                }
                if n % 2 == 0 {
                    while i < units.count && units[i] != 10 {
                        units[i] = 32
                        i += 1
                    }
                    continue
                }
            }
            i += 1
        }
        let text = String(decoding: units, as: UTF16.self) as NSString
        if let re = try? NSRegularExpression(
            pattern:
                #"\\begin\{(verbatim\*?|lstlisting|minted)\}[\s\S]*?\\end\{\1\}|\\verb\*?([^\w\s])[\s\S]*?\2"#
        ) {
            for m in re.matches(in: text as String, range: NSRange(location: 0, length: text.length)) {
                for n in m.range.location..<NSMaxRange(m.range) where units[n] != 10 { units[n] = 32 }
            }
        }
        return String(decoding: units, as: UTF16.self)
    }
    static func scan(_ source: String, path: String) -> [SourceSymbol] {
        let text = masked(source) as NSString
        let bib = path.lowercased().hasSuffix(".bib")
        let pattern =
            bib
            ? #"@(?!(?:comment|string|preamble)\b)\w+\s*[\{(]\s*([^,\s]+)"#
            : #"\\(section|subsection|subsubsection|chapter|part|paragraph|subparagraph|label|newcommand|renewcommand|providecommand|DeclareMathOperator|newenvironment|renewenvironment|NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand|DeclareDocumentCommand|NewDocumentEnvironment|RenewDocumentEnvironment|ProvidesClass|ProvidesExplClass|LoadClassWithOptions|LoadClass|RequirePackageWithOptions|RequirePackage|DeclareOption|def|gdef|edef|xdef|let)(?![A-Za-z@])\*?\s*"#
        guard let re = try? NSRegularExpression(pattern: pattern, options: bib ? .caseInsensitive : []) else {
            return []
        }
        func escaped(_ p: Int) -> Bool {
            var i = p
            var count = 0
            while i > 0 && text.character(at: i - 1) == 92 {
                count += 1
                i -= 1
            }
            return count % 2 == 1
        }
        func space(_ p: inout Int) {
            while p < text.length,
                UnicodeScalar(text.character(at: p)).map({ CharacterSet.whitespacesAndNewlines.contains($0) })
                    == true
            { p += 1 }
        }
        func group(_ p: inout Int, _ left: unichar = 123, _ right: unichar = 125) -> String? {
            space(&p)
            guard p < text.length, text.character(at: p) == left else { return nil }
            p += 1
            let start = p
            var depth = 1
            var braces = 0
            while p < text.length {
                let c = text.character(at: p)
                if !escaped(p) {
                    if left == 91 {
                        if c == 123 { braces += 1 }
                        if c == 125 { braces = max(0, braces - 1) }
                    }
                    if braces == 0 {
                        if c == left { depth += 1 }
                        if c == right { depth -= 1 }
                    }
                }
                if depth == 0 {
                    let value = text.substring(with: NSRange(location: start, length: p - start))
                    p += 1
                    return value
                }
                p += 1
            }
            return nil
        }
        func control(_ p: inout Int) -> String? {
            space(&p)
            guard p < text.length, text.character(at: p) == 92 else { return nil }
            let start = p
            p += 1
            while p < text.length {
                let c = text.character(at: p)
                guard (65...90).contains(c) || (97...122).contains(c) || c == 64 else { break }
                p += 1
            }
            if p == start + 1 && p < text.length { p += 1 }
            return text.substring(with: NSRange(location: start, length: p - start))
        }
        let macros: Set<String> = [
            "newcommand", "renewcommand", "providecommand", "DeclareMathOperator", "def", "gdef", "edef",
            "xdef", "let", "NewDocumentCommand", "RenewDocumentCommand", "ProvideDocumentCommand",
            "DeclareDocumentCommand",
        ]
        let environments: Set<String> = [
            "newenvironment", "renewenvironment", "NewDocumentEnvironment", "RenewDocumentEnvironment",
        ]
        let dependencies: Set<String> = [
            "LoadClass", "LoadClassWithOptions", "RequirePackage", "RequirePackageWithOptions",
        ]
        var out: [SourceSymbol] = []
        var consumedUntil = 0
        for m in re.matches(in: text as String, range: NSRange(location: 0, length: text.length)) {
            guard m.range.location >= consumedUntil, !escaped(m.range.location) else { continue }
            let line = text.substring(to: m.range.location).reduce(1) { $1 == "\n" ? $0 + 1 : $0 }
            if bib {
                out.append(
                    SourceSymbol(
                        label: text.substring(with: m.range(at: 1)), path: path, line: line, kind: "cite",
                        offset: m.range.location))
                continue
            }
            let command = text.substring(with: m.range(at: 1))
            var p = NSMaxRange(m.range)
            if OutlineNode.sectionLevels[command] != nil || dependencies.contains(command) {
                _ = group(&p, 91, 93)
            }
            let starredOption = command == "DeclareOption" && text.substring(with: m.range).contains("*")
            let name = starredOption ? "*" : group(&p) ?? (macros.contains(command) ? control(&p) : nil)
            guard let rawName = name else { continue }
            let value = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { continue }
            let kind =
                command == "label"
                ? "ref"
                : macros.contains(command)
                    ? "command"
                    : environments.contains(command)
                        ? "environment"
                        : dependencies.contains(command)
                            ? "dependency"
                            : command == "DeclareOption"
                                ? "option"
                                : ["ProvidesClass", "ProvidesExplClass"].contains(command)
                                    ? "class" : "section"
            var symbol = SourceSymbol(
                label: value, path: path, line: line, kind: kind, offset: m.range.location, detail: command)
            if macros.contains(command) || environments.contains(command) || command == "DeclareOption" {
                if command == "let" {
                    _ = control(&p)
                } else {
                    if ["def", "gdef", "edef", "xdef"].contains(command) {
                        let start = p
                        while p < text.length && text.character(at: p) != 123 { p += 1 }
                        let parameters = text.substring(with: NSRange(location: start, length: p - start))
                        symbol.arguments = (1...9).filter { parameters.contains("#\($0)") }.max() ?? 0
                    } else if command.contains("Document") {
                        _ = group(&p)
                    }  // xparse argument specification
                    else {
                        if let count = group(&p, 91, 93) { symbol.arguments = Int(count) ?? 0 }
                        _ = group(&p, 91, 93)
                    }
                    _ = group(&p)
                    if environments.contains(command) { _ = group(&p) }
                }
                // Definitions may contain section/label tokens; they are not document headings.
                consumedUntil = p
            }
            out.append(symbol)
        }
        return out
    }
}

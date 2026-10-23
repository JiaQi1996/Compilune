import Foundation

enum ShortcutNotation {
    // Keep CodeMirror's key syntax internal; accept native Mac notation in settings.
    static func canonical(_ input: String) -> String {
        var rest = input.trimmingCharacters(in: .whitespacesAndNewlines)
        var modifiers: [String] = []
        let glyphs: [Character: String] = ["⌘": "Mod", "⌃": "Ctrl", "⌥": "Alt", "⇧": "Shift"]
        let names = [
            "command": "Mod", "cmd": "Mod", "mod": "Mod", "control": "Ctrl", "ctrl": "Ctrl", "option": "Alt",
            "opt": "Alt", "alt": "Alt", "shift": "Shift",
        ]
        let prefix = try! NSRegularExpression(
            pattern: #"^(Command|Cmd|Mod|Control|Ctrl|Option|Opt|Alt|Shift)\s*[-+]\s*"#,
            options: .caseInsensitive)
        while !rest.isEmpty {
            if let first = rest.first, let modifier = glyphs[first] {
                modifiers.append(modifier)
                rest = String(rest.dropFirst()).trimmingCharacters(in: .whitespacesAndNewlines)
                if rest.count > 1, rest.first == "-" || rest.first == "+" {
                    rest = String(rest.dropFirst()).trimmingCharacters(in: .whitespacesAndNewlines)
                }
            } else if let match = prefix.firstMatch(in: rest, range: NSRange(rest.startIndex..., in: rest)) {
                let text = rest as NSString
                modifiers.append(names[text.substring(with: match.range(at: 1)).lowercased()]!)
                rest = text.substring(from: NSMaxRange(match.range))
            } else {
                break
            }
        }
        let specials = [
            "↩": "Enter", "⏎": "Enter", "enter": "Enter", "return": "Enter", "space": "Space", "空格": "Space",
            "␣": "Space",
        ]
        let key =
            specials[rest.lowercased()]
            ?? (rest.count == 1
                ? rest.lowercased() : rest.uppercased().hasPrefix("F") ? rest.uppercased() : rest)
        return modifiers.isEmpty ? key : modifiers.joined(separator: "-") + "-" + key
    }
    static func display(_ key: String) -> String {
        canonical(key).replacingOccurrences(of: "Mod-", with: "⌘")
            .replacingOccurrences(of: "Ctrl-", with: "⌃").replacingOccurrences(of: "Alt-", with: "⌥")
            .replacingOccurrences(of: "Shift-", with: "⇧").replacingOccurrences(of: "Enter", with: "↩")
            .replacingOccurrences(of: "Space", with: "空格").uppercased()
    }
}

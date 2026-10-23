import Foundation

struct PerlRuntime {
    let executable: URL
    let label: String
    let isPrivate: Bool

    static var bundled: URL? {
        let root = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/Perl")
        let executable = root.appendingPathComponent("bin/perl")
        guard FileManager.default.isExecutableFile(atPath: executable.path),
            FileManager.default.fileExists(atPath: root.appendingPathComponent("runtime.json").path)
        else { return nil }
        return executable
    }

    static func select(texBin: String) -> PerlRuntime? {
        let fm = FileManager.default
        let miktex = fm.isExecutableFile(atPath: URL(fileURLWithPath: texBin).appendingPathComponent("miktex").path)
        if miktex, let executable = bundled {
            return PerlRuntime(executable: executable, label: "Compilune 内置 Perl", isPrivate: true)
        }
        // Keep a working TeX Live/MacTeX environment on its existing interpreter.
        if fm.isExecutableFile(atPath: "/usr/bin/perl") {
            let system = PerlRuntime(executable: URL(fileURLWithPath: "/usr/bin/perl"), label: "系统 Perl", isPrivate: false)
            if system.version().hasPrefix("v") { return system }
        }
        if let executable = bundled {
            return PerlRuntime(executable: executable, label: "Compilune 内置 Perl", isPrivate: true)
        }
        return nil
    }

    func launch(latexmk: URL) -> (URL, [String]) {
        let header = (try? Data(contentsOf: latexmk).prefix(256)) ?? Data.SubSequence()
        let line = String(decoding: header, as: UTF8.self).components(separatedBy: "\n")[0]
        // MiKTeX may supply a native wrapper; do not feed that binary to Perl.
        if line.hasPrefix("#!"), line.contains("perl") { return (executable, [latexmk.path]) }
        return (latexmk, [])
    }

    func environment(texBin: String) -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        let original = env["PATH"] ?? ""
        if isPrivate {
            for key in ["PERL5LIB", "PERLLIB", "PERL5OPT", "PERL5SHELL", "PERL_LOCAL_LIB_ROOT", "PERL_MB_OPT", "PERL_MM_OPT"] {
                env.removeValue(forKey: key)
            }
        }
        env["PATH"] = (isPrivate ? executable.deletingLastPathComponent().path + ":" : "")
            + texBin + ":/usr/bin:/bin:/usr/sbin:/sbin:" + original
        return env
    }

    func version() -> String {
        let task = Process(), pipe = Pipe()
        task.executableURL = executable
        task.arguments = ["-MFile::Path", "-MFile::Temp", "-MCwd", "-MDigest::MD5", "-MUnicode::Normalize", "-MEncode", "-MFile::Glob", "-MList::Util", "-e", "print $^V"]
        task.environment = environment(texBin: "")
        task.standardOutput = pipe
        task.standardError = pipe
        do {
            try task.run()
            DispatchQueue.global().asyncAfter(deadline: .now() + 3) { if task.isRunning { task.terminate() } }
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            task.waitUntilExit()
            return task.terminationStatus == 0
                ? String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
                : "检测失败"
        } catch { return "不可用：" + error.localizedDescription }
    }

    static func report(texBin: String) -> String {
        guard let selected = select(texBin: texBin) else { return "未检测到 Perl；请重新安装完整 Compilune 安装包。" }
        let bundledStatus: String
        if let executable = bundled {
            bundledStatus = "内置备用：" + PerlRuntime(executable: executable, label: "", isPrivate: true).version()
        } else { bundledStatus = "内置备用：未随当前构建提供" }
        return "当前来源：\(selected.label) · \(selected.version())\n\(selected.executable.path)\n\(bundledStatus)\n仅影响应用启动的编译进程，不修改系统 PATH。"
    }
}

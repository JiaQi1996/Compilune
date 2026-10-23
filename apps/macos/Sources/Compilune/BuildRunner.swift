import Darwin
import Foundation

struct BuildError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}
final class BuildRunner: @unchecked Sendable {
    let root: URL
    let engine: String
    let bin: String
    var workingDirectory: URL?
    var outputDirectory: URL?
    var shellEscape: Bool
    var rcFile: URL?
    private let lock = NSLock()
    private var pid: pid_t = 0
    private var cancelled = false
    init(
        root: URL, engine: String, bin: String, workingDirectory: URL? = nil, outputDirectory: URL? = nil,
        shellEscape: Bool = false, rcFile: URL? = nil
    ) {
        self.root = root
        self.engine = engine
        self.bin = bin
        self.workingDirectory = workingDirectory
        self.outputDirectory = outputDirectory
        self.shellEscape = shellEscape
        self.rcFile = rcFile
    }
    func cancel() {
        lock.lock()
        cancelled = true
        let p = pid
        lock.unlock()
        if p > 0 {
            kill(-p, SIGTERM)
            DispatchQueue.global().asyncAfter(deadline: .now() + 1) {
                self.lock.lock()
                let active = self.pid == p
                self.lock.unlock()
                if active { kill(-p, SIGKILL) }
            }
        }
    }
    func start(output: @escaping (String) -> Void, completion: @escaping (Result<URL, Error>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            do {
                let cwd = workingDirectory ?? root.deletingLastPathComponent()
                let outputDir = outputDirectory ?? cwd.appendingPathComponent(".folio/build")
                let tool = URL(fileURLWithPath: bin).appendingPathComponent("latexmk")
                let names = ["XeLaTeX": "xelatex", "pdfLaTeX": "pdflatex", "LuaLaTeX": "lualatex"]
                guard let name = names[engine] else { throw BuildError(message: "不支持的引擎") }
                for file in [tool.path, URL(fileURLWithPath: bin).appendingPathComponent(name).path]
                where !FileManager.default.isExecutableFile(atPath: file) {
                    throw BuildError(message: "找不到可执行工具：\(file)")
                }
                try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
                let mode = name == "pdflatex" ? "-pdf" : "-\(name)"
                guard let perl = PerlRuntime.select(texBin: bin) else {
                    throw BuildError(message: "Perl 不可用，请重新安装完整的 Compilune 安装包")
                }
                let launch = perl.launch(latexmk: tool)
                let miktex = FileManager.default.isExecutableFile(atPath: URL(fileURLWithPath: bin).appendingPathComponent("miktex").path)
                // Explicit interpreter invocation also supports scripts with a fixed shebang.
                var args = [
                    launch.0.path,
                ] + launch.1 + (miktex ? ["--miktex-enable-installer"] : []) + [
                    "-norc", mode,
                    "-\(name)=\(name) \(miktex ? "--miktex-enable-installer " : "")\(shellEscape ? "-shell-escape" : "-no-shell-escape") %O %S",
                    "-synctex=1", "-interaction=nonstopmode", "-file-line-error", "-halt-on-error",
                    "-recorder", "-outdir=" + outputDir.path,
                ]
                if let rcFile { args += ["-r", rcFile.path] }
                args.append(root.path)
                output("工作目录：\(cwd.path)\n引擎：\(engine)\nPerl：\(perl.label)\n")
                var attr: posix_spawnattr_t?
                var actions: posix_spawn_file_actions_t?
                posix_spawnattr_init(&attr)
                posix_spawn_file_actions_init(&actions)
                defer {
                    posix_spawnattr_destroy(&attr)
                    posix_spawn_file_actions_destroy(&actions)
                }
                posix_spawnattr_setflags(&attr, Int16(POSIX_SPAWN_SETPGROUP))
                posix_spawnattr_setpgroup(&attr, 0)
                let pipe = Pipe()
                let read = pipe.fileHandleForReading
                let write = pipe.fileHandleForWriting
                posix_spawn_file_actions_adddup2(&actions, write.fileDescriptor, STDOUT_FILENO)
                posix_spawn_file_actions_adddup2(&actions, write.fileDescriptor, STDERR_FILENO)
                posix_spawn_file_actions_addopen(&actions, STDIN_FILENO, "/dev/null", O_RDONLY, 0)
                posix_spawn_file_actions_addclose(&actions, read.fileDescriptor)
                posix_spawn_file_actions_addclose(&actions, write.fileDescriptor)
                posix_spawn_file_actions_addchdir_np(&actions, cwd.path)
                let env = perl.environment(texBin: bin)
                var argv = args.map { strdup($0) } + [nil]
                var envp = env.map { strdup("\($0.key)=\($0.value)") } + [nil]
                defer {
                    for p in argv { free(p) }
                    for p in envp { free(p) }
                }
                var child: pid_t = 0
                lock.lock()
                if cancelled {
                    lock.unlock()
                    throw BuildError(message: "编译已停止")
                }
                let spawn = posix_spawn(&child, launch.0.path, &actions, &attr, &argv, &envp)
                if spawn == 0 { pid = child }
                lock.unlock()
                try write.close()
                guard spawn == 0 else {
                    throw BuildError(message: "无法启动编译：\(String(cString: strerror(spawn)))")
                }
                DispatchQueue.global().asyncAfter(deadline: .now() + 120) {
                    self.lock.lock()
                    let active = self.pid == child
                    self.lock.unlock()
                    if active { self.cancel() }
                }
                while true {
                    let data = read.availableData
                    if data.isEmpty { break }
                    output(String(decoding: data, as: UTF8.self))
                }
                var status: Int32 = 0
                while waitpid(child, &status, 0) < 0 && errno == EINTR {}
                lock.lock()
                pid = 0
                let stopped = cancelled
                lock.unlock()
                if stopped { throw BuildError(message: "编译已停止或超过 120 秒") }
                guard status == 0 else { throw BuildError(message: "编译失败 · 请查看日志；保留上次成功 PDF") }
                let pdf = outputDir.appendingPathComponent(
                    root.deletingPathExtension().lastPathComponent + ".pdf")
                guard FileManager.default.fileExists(atPath: pdf.path) else {
                    throw BuildError(message: "编译未生成 PDF")
                }
                completion(.success(pdf))
            } catch { completion(.failure(error)) }
        }
    }
}

import AppKit
import SwiftUI

enum TeXEnvironment {
    static let tools = [
        "latexmk", "xelatex", "pdflatex", "lualatex", "biber", "bibtex", "synctex", "kpsewhich",
    ]
    static func score(_ path: String) -> Int {
        tools.filter {
            FileManager.default.isExecutableFile(
                atPath: URL(fileURLWithPath: path).appendingPathComponent($0).path)
        }.count
    }
    static func locations(_ configured: String) -> [String] {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser.path
        var paths = [
            configured, "/Library/TeX/texbin", home + "/Library/TinyTeX/bin/universal-darwin",
            home + "/Library/TinyTeX/bin/aarch64-darwin", home + "/Library/TinyTeX/bin/x86_64-darwin",
            "/opt/homebrew/bin", "/usr/local/bin",
        ]
        paths += (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map(String.init)
        for base in ["/usr/local/texlive", home + "/texlive"] {
            for version in (try? fm.contentsOfDirectory(atPath: base)) ?? [] {
                for arch in ["universal-darwin", "aarch64-darwin", "x86_64-darwin"] {
                    paths.append(base + "/" + version + "/bin/" + arch)
                }
            }
        }
        var seen = Set<String>()
        return paths.filter { path in
            !path.isEmpty && seen.insert(path).inserted
                && ["xelatex", "pdflatex", "lualatex"].contains(where: { name in
                    fm.isExecutableFile(atPath: URL(fileURLWithPath: path).appendingPathComponent(name).path)
                })
        }
    }
    static func report(_ bin: String, versions: Bool) -> String {
        tools.map { name in
            let url = URL(fileURLWithPath: bin).appendingPathComponent(name)
            guard FileManager.default.isExecutableFile(atPath: url.path) else { return "缺失  \(name)" }
            guard versions else { return "✓ \(name)" }
            let p = Process()
            let pipe = Pipe()
            p.executableURL = url
            p.arguments = name == "synctex" ? ["help"] : ["--version"]
            p.standardOutput = pipe
            p.standardError = pipe
            do {
                try p.run()
                DispatchQueue.global().asyncAfter(deadline: .now() + 3) { if p.isRunning { p.terminate() } }
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                p.waitUntilExit()
                return "\(p.terminationStatus == 0 ? "✓" : "检测异常") \(name) · "
                    + String(decoding: data, as: UTF8.self).components(separatedBy: "\n").prefix(2).joined(
                        separator: " ")
            } catch { return "\(name)：\(error.localizedDescription)" }
        }.joined(separator: "\n\n")
    }
}
@MainActor final class ToolchainStore: ObservableObject {
    static let shared = ToolchainStore()
    @Published var detecting = false
    @Published var report = "正在自动查找本地 LaTeX 环境…"
    @Published var locations: [String] = []
    func detect(versions: Bool = true) {
        guard !detecting else { return }
        detecting = true
        let configured = Preferences.shared.texBin
        Task {
            let result = await Task.detached { () -> ([String], String, String) in
                let found = TeXEnvironment.locations(configured)
                let selected =
                    found.sorted { TeXEnvironment.score($0) > TeXEnvironment.score($1) }.first ?? configured
                let chosen =
                    found.contains(configured)
                        && TeXEnvironment.score(configured) >= TeXEnvironment.score(selected)
                    ? configured : selected
                return (found, chosen, TeXEnvironment.report(chosen, versions: versions))
            }.value
            locations = result.0
            if Preferences.shared.texBin == configured, !locations.isEmpty {
                Preferences.shared.texBin = result.1
            }
            report =
                (locations.isEmpty
                    ? "未找到 LaTeX 环境，可下载 MacTeX 安装。\n\n" : "已检测到 \(locations.count) 个可用工具目录。\n\n") + result.2
            detecting = false
        }
    }
}

@MainActor final class TeXInstallerDownload: NSObject, ObservableObject, URLSessionDownloadDelegate {
    static let shared = TeXInstallerDownload()
    static let packageURL = URL(string: "https://mirrors.ctan.org/systems/mac/mactex/MacTeX.pkg")!
    @Published var running = false
    @Published var progress: Double?
    @Published var status = ""
    @Published var package: URL?
    private var active: URLSessionDownloadTask?
    private lazy var session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 90
        c.timeoutIntervalForResource = 28_800
        return URLSession(configuration: c, delegate: self, delegateQueue: nil)
    }()
    func start() {
        guard !running else { return }
        running = true
        progress = nil
        package = nil
        status = "连接 CTAN 镜像，下载完整 MacTeX 安装包…"
        let task = session.downloadTask(with: Self.packageURL)
        active = task
        task.resume()
    }
    func cancel() {
        active?.cancel()
        active = nil
        running = false
        status = "下载已取消，可重新下载"
    }
    nonisolated func urlSession(
        _ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64
    ) {
        Task { @MainActor in
            guard self.active === downloadTask else { return }
            let fraction =
                totalBytesExpectedToWrite > 0
                ? Double(totalBytesWritten) / Double(totalBytesExpectedToWrite) : nil
            if fraction == nil || self.progress == nil || abs((fraction ?? 0) - (self.progress ?? 0)) >= 0.005
            {
                self.progress = fraction
                self.status =
                    "已下载 " + ByteCountFormatter.string(fromByteCount: totalBytesWritten, countStyle: .file)
                    + (totalBytesExpectedToWrite > 0
                        ? " / "
                            + ByteCountFormatter.string(
                                fromByteCount: totalBytesExpectedToWrite, countStyle: .file) : "")
            }
        }
    }
    nonisolated func urlSession(
        _ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL
    ) {
        let staged = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".pkg")
        do {
            guard (downloadTask.response as? HTTPURLResponse)?.statusCode == 200 else {
                throw BuildError(message: "镜像未返回有效安装包，请重试或打开官方下载页")
            }
            let file = try FileHandle(forReadingFrom: location)
            defer { try? file.close() }
            guard try file.read(upToCount: 4) == Data("xar!".utf8) else {
                throw BuildError(message: "下载结果不是有效的 macOS 安装包")
            }
            try FileManager.default.moveItem(at: location, to: staged)
            Task { @MainActor in
                guard self.active === downloadTask else {
                    try? FileManager.default.removeItem(at: staged)
                    return
                }
                do {
                    let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
                        .appendingPathComponent("FolioTeX")
                    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                    let target = dir.appendingPathComponent("MacTeX-" + UUID().uuidString.prefix(8) + ".pkg")
                    try FileManager.default.moveItem(at: staged, to: target)
                    self.package = target
                    self.progress = 1
                    self.status = "下载完成。点击“打开安装器”安装，完成后返回应用会自动检测。"
                    self.running = false
                    self.active = nil
                } catch {
                    try? FileManager.default.removeItem(at: staged)
                    self.fail(error, task: downloadTask)
                }
            }
        } catch { Task { @MainActor in self.fail(error, task: downloadTask) } }
    }
    nonisolated func urlSession(
        _ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?
    ) { if let error { Task { @MainActor in self.fail(error, task: task) } } }
    private func fail(_ error: Error, task: URLSessionTask) {
        guard active === task else { return }
        running = false
        active = nil
        status = "下载失败：" + error.localizedDescription
    }
}

struct ToolchainSettingsView: View {
    @ObservedObject var prefs = Preferences.shared
    @ObservedObject var tools = ToolchainStore.shared
    @ObservedObject var download = TeXInstallerDownload.shared
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("TeX 工具目录", text: $prefs.texBin).textFieldStyle(.roundedBorder)
            HStack {
                Button(tools.detecting ? "检测中…" : "自动检测 LaTeX 环境") { tools.detect() }.disabled(
                    tools.detecting
                ).help("查找 MacTeX、TeX Live、TinyTeX 和 PATH 中的工具，并自动选择可用环境")
                Button("一键下载 MacTeX") { download.start() }.disabled(download.running).help(
                    "从 CTAN 镜像下载完整 MacTeX 安装包到下载文件夹")
                Link("官方下载页", destination: URL(string: "https://tug.org/mactex/mactex-download.html")!).help(
                    "在浏览器查看 MacTeX 官方下载说明")
            }
            Text("完整环境体积较大。下载后由 macOS 安装器完成安装；安装完成后返回应用会重新检测。").font(.caption).foregroundStyle(.secondary)
            if download.running {
                HStack {
                    if let p = download.progress {
                        ProgressView(value: p)
                    } else {
                        ProgressView().controlSize(.small)
                    }
                    Button("取消下载") { download.cancel() }.help("取消当前下载，可稍后重新开始")
                }
            }
            if !download.status.isEmpty { Text(download.status).font(.caption).textSelection(.enabled) }
            if let package = download.package {
                HStack {
                    Button("打开安装器") { NSWorkspace.shared.open(package) }.help("打开已下载的 MacTeX 安装包，由系统确认安装")
                    Button("在 Finder 显示") { NSWorkspace.shared.activateFileViewerSelecting([package]) }.help(
                        "查看下载的安装包")
                }
            }
            ScrollView {
                Text(tools.report).font(.system(size: 12, design: .monospaced)).textSelection(.enabled).frame(
                    maxWidth: .infinity, alignment: .leading)
            }
        }.padding(20).onAppear { tools.detect() }.onReceive(
            NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)
        ) { _ in tools.detect() }
    }
}

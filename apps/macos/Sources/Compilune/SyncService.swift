import Foundation

struct PDFLocation: Equatable {
    let id = UUID()
    let page: Int
    let x: Double
    let y: Double
}
enum SyncService {
    static func query(
        bin: String, cwd: URL, arguments: [String],
        completion: @escaping (Result<[String: String], Error>) -> Void
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            let p = Process()
            p.executableURL = URL(fileURLWithPath: bin).appendingPathComponent("synctex")
            p.arguments = arguments
            p.currentDirectoryURL = cwd
            let pipe = Pipe()
            p.standardOutput = pipe
            p.standardError = pipe
            do {
                try p.run()
                DispatchQueue.global().asyncAfter(deadline: .now() + 5) { if p.isRunning { p.terminate() } }
                let text = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                p.waitUntilExit()
                guard p.terminationStatus == 0 else { throw BuildError(message: "SyncTeX 定位失败") }
                var fields: [String: String] = [:]
                for line in text.components(separatedBy: "\n") {
                    let parts = line.split(separator: ":", maxSplits: 1).map(String.init)
                    if parts.count == 2, fields[parts[0]] == nil {
                        fields[parts[0]] = parts[1].trimmingCharacters(in: .whitespaces)
                    }
                }
                completion(.success(fields))
            } catch { completion(.failure(error)) }
        }
    }
}
@MainActor extension Workspace {
    func forwardSync(line: Int) {
        guard !pdfStale, let pdf = successfulPDF, let source = selected else {
            status = "请先成功编译最新源码再定位"
            return
        }
        SyncService.query(
            bin: Preferences.shared.texBin, cwd: buildCWD,
            arguments: [
                "view", "-i", "\(line):1:\(project.url.appendingPathComponent(source).path)", "-o", pdf.path,
            ]
        ) { [weak self] result in
            Task { @MainActor in
                switch result {
                case .success(let f):
                    if let page = f["Page"].flatMap(Int.init),
                        let x = (f["x"] ?? f["h"]).flatMap(Double.init),
                        let y = (f["y"] ?? f["v"]).flatMap(Double.init)
                    {
                        self?.pdfLocation = PDFLocation(page: page, x: x, y: y)
                    } else {
                        self?.status = "未找到可定位的 PDF 内容"
                    }
                case .failure(let e): self?.status = e.localizedDescription
                }
            }
        }
    }
    func backwardSync(page: Int, x: Double, y: Double) {
        guard !pdfStale, let pdf = successfulPDF else {
            status = "当前 PDF 已过期，请重新编译后定位"
            return
        }
        let cwd = buildCWD
        SyncService.query(
            bin: Preferences.shared.texBin, cwd: cwd,
            arguments: ["edit", "-o", "\(page):\(x):\(y):\(pdf.path)"]
        ) { [weak self] result in
            Task { @MainActor in
                guard let self else { return }
                switch result {
                case .success(let f):
                    if let input = f["Input"], let line = f["Line"].flatMap(Int.init) {
                        let url = URL(fileURLWithPath: input, relativeTo: cwd).resolvingSymlinksInPath()
                            .standardizedFileURL
                        guard url.path.hasPrefix(self.project.url.resolvingSymlinksInPath().path + "/") else {
                            self.status = "定位目标不在项目内"
                            return
                        }
                        self.open(relative(url, to: self.project.url), line: line)
                    } else {
                        self.status = "此处没有源码映射"
                    }
                case .failure(let e): self.status = e.localizedDescription
                }
            }
        }
    }
}

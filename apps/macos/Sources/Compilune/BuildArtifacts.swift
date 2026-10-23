import Foundation

enum BuildArtifacts {
    // Clean known companions plus auxiliary OUTPUT files recorded by this build.
    // Keep PDF, SyncTeX, sources, unrecorded files and anything outside output.
    static let auxiliary = [
        "aux", "toc", "lof", "lot", "out", "fls", "fdb_latexmk", "bcf", "run.xml", "xdv", "nav", "snm", "vrb",
        "log", "blg", "bbl",
    ]
    static func clean(pdf: URL) throws {
        let stem = pdf.deletingPathExtension()
        let parent = pdf.deletingLastPathComponent().resolvingSymlinksInPath()
        var candidates = auxiliary.map { stem.appendingPathExtension($0) }
        if let recorder = try? String(contentsOf: stem.appendingPathExtension("fls"), encoding: .utf8) {
            let lines = recorder.components(separatedBy: "\n")
            let cwd =
                lines.first(where: { $0.hasPrefix("PWD ") }).map {
                    URL(fileURLWithPath: String($0.dropFirst(4)), isDirectory: true)
                } ?? parent
            candidates += lines.filter { $0.hasPrefix("OUTPUT ") }.map {
                URL(fileURLWithPath: String($0.dropFirst(7)), relativeTo: cwd).standardizedFileURL
            }
        }
        for url in Set(candidates) {
            guard auxiliary.contains(where: { url.lastPathComponent.hasSuffix("." + $0) }),
                url.resolvingSymlinksInPath().path.hasPrefix(parent.path + "/")
            else { continue }
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isRegularFile == true, values.isSymbolicLink != true else { continue }
            try FileManager.default.removeItem(at: url)
        }
    }
}

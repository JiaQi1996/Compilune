import Foundation

func relative(_ url: URL, to root: URL) -> String {
    let base = root.resolvingSymlinksInPath().standardizedFileURL.path
    let path = url.resolvingSymlinksInPath().standardizedFileURL.path
    guard path.hasPrefix(base + "/") else { return url.lastPathComponent }
    return String(path.dropFirst(base.count + 1))
}
func projectFiles(_ root: URL) -> [URL] {
    guard
        let enumerator = FileManager.default.enumerator(
            at: root, includingPropertiesForKeys: [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey],
            options: [.skipsHiddenFiles, .skipsPackageDescendants])
    else { return [] }
    var files: [URL] = []
    for case let url as URL in enumerator {
        let info = try? url.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .isDirectoryKey])
        if info?.isSymbolicLink == true {
            enumerator.skipDescendants()
            continue
        }
        if info?.isRegularFile == true || info?.isDirectory == true { files.append(url) }
    }
    return files.sorted { $0.path.localizedStandardCompare($1.path) == .orderedAscending }
}

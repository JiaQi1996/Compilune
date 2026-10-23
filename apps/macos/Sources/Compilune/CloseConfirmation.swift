import AppKit

enum CloseDecision { case save, discard, cancel }
@MainActor extension Workspace {
    func pauseAutosaveForClose() {
        closingForNavigation = true
        pendingBuild = false
        saveTask?.cancel()
        autoTask?.cancel()
    }
    func resumeAfterCancelledClose() {
        closingForNavigation = false
        if buffers.values.contains(where: { $0.dirty }) { scheduleEditedBuffers() }
    }
    func flushForClose() async -> Bool {
        guard send != nil else { return true }
        var acknowledged = false
        let token = UUID().uuidString
        expectedFlushToken = token
        flushed = { acknowledged = true }
        send?(["type": "flush", "token": token])
        for _ in 0..<40 {
            if acknowledged { return true }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        if acknowledged { return true }
        if expectedFlushToken == token {
            expectedFlushToken = nil
            flushed = nil
        }
        error = "切换窗口前编辑器尚未确认最新内容，请完成输入后重试。"
        return false
    }
    func closeDecision(present: ((NSAlert) -> NSApplication.ModalResponse)? = nil) -> CloseDecision {
        pauseAutosaveForClose()
        let dirty = buffers.filter { $0.value.dirty }.keys.sorted()
        guard !dirty.isEmpty else { return .save }
        let alert = NSAlert()
        alert.messageText = "保存对“\(project.name)”的更改？"
        alert.informativeText =
            "以下文件尚未保存：\n" + dirty.prefix(8).joined(separator: "\n")
            + (dirty.count > 8 ? "\n及其他 \(dirty.count-8) 个文件" : "")
        alert.addButton(withTitle: "保存并关闭").toolTip = "保存所有未保存的文件后关闭"
        alert.addButton(withTitle: "不保存").toolTip = "放弃尚未保存的更改并关闭"
        alert.addButton(withTitle: "取消").toolTip = "继续编辑，保留所有更改"
        switch present?(alert) ?? alert.runModal() {
        case .alertFirstButtonReturn: return .save
        case .alertSecondButtonReturn: return .discard
        default: return .cancel
        }
    }
    func discardForClose() {
        pauseAutosaveForClose()
        for (path, buffer) in buffers where buffer.dirty {
            let disk =
                (try? String(contentsOf: project.url.appendingPathComponent(path), encoding: .utf8))
                ?? buffer.diskText
            buffers[path] = SourceBuffer(text: disk, diskText: disk)
            send?(["type": "replaceDocument", "path": path, "text": buffers[path]!.text])
        }
        history.removeAll()
        future.removeAll()
        writeRecovery()
    }
    func confirmClose() -> Bool {
        switch closeDecision() {
        case .save:
            if saveAll() { return true }
            resumeAfterCancelledClose()
            return false
        case .discard:
            discardForClose()
            return true
        case .cancel:
            resumeAfterCancelledClose()
            return false
        }
    }
}

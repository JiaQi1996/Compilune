import PDFKit
import SwiftUI
import WebKit

struct EditorHost: NSViewRepresentable {
    @ObservedObject var workspace: Workspace
    @ObservedObject var prefs = Preferences.shared
    func makeCoordinator() -> Coordinator { Coordinator(workspace) }
    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "folio")
        let view = WKWebView(frame: .zero, configuration: config)
        context.coordinator.web = view
        view.navigationDelegate = context.coordinator
        view.setValue(false, forKey: "drawsBackground")
        let packaged = Bundle.main.resourceURL?.appendingPathComponent("Editor/index.html")
        let url =
            packaged.flatMap { FileManager.default.fileExists(atPath: $0.path) ? $0 : nil }
            ?? Bundle.module.url(
                forResource: "index", withExtension: "html", subdirectory: "Resources/Editor")
        if let url { view.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent()) }
        return view
    }
    func updateNSView(_ view: WKWebView, context: Context) {
        let c = context.coordinator
        c.options = [
            "type": "options", "size": prefs.codeSize, "uiSize": prefs.uiSize,
            "bindings": prefs.commandBindings,
            "globalHistory": true, "dark": prefs.scheme == .dark,
            "toolbarVisible": workspace.showFormattingToolbar,
        ]
        if c.ready { c.send(c.options) }
    }
    static func dismantleNSView(_ view: WKWebView, coordinator: Coordinator) {
        coordinator.workspace.send = nil
        view.configuration.userContentController.removeScriptMessageHandler(forName: "folio")
    }
    @MainActor final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let workspace: Workspace
        weak var web: WKWebView?
        var ready = false
        var options: [String: Any] = [:]
        init(_ workspace: Workspace) { self.workspace = workspace }
        func send(_ value: [String: Any]) {
            guard let data = try? JSONSerialization.data(withJSONObject: value),
                let str = String(data: data, encoding: .utf8)
            else { return }
            web?.evaluateJavaScript("window.folio.receive(\(str))", completionHandler: nil)
        }
        func userContentController(
            _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
        ) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
                return
            }
            switch type {
            case "ready":
                ready = true
                workspace.editorReady = true
                workspace.send = { [weak self] in self?.send($0) }
                send(options)
                if let path = workspace.selected { workspace.open(path) }
                workspace.refreshIndex()
                if !workspace.didCompileOnOpen {
                    workspace.didCompileOnOpen = true
                    if Preferences.shared.compileOnOpen && !workspace.project.root.isEmpty {
                        Task { @MainActor [weak workspace] in
                            guard let workspace, workspace.editorReady, !workspace.closingForNavigation else { return }
                            workspace.compile()
                        }
                    }
                }
            case "change":
                if let path = body["path"] as? String, let text = body["text"] as? String {
                    workspace.changed(
                        path, text, composition: body["composing"] as? Bool ?? false,
                        event: body["event"] as? String ?? "input")
                }
            case "flush":
                if body["token"] as? String == workspace.expectedFlushToken {
                    let f = workspace.flushed
                    workspace.flushed = nil
                    workspace.expectedFlushToken = nil
                    f?()
                }
            case "position":
                if let path = body["path"] as? String {
                    workspace.positions[path] = DocumentPosition(
                        anchor: body["anchor"] as? Int ?? 0, head: body["head"] as? Int ?? 0,
                        scroll: body["scroll"] as? Double ?? 0)
                    workspace.persistSessionSoon()
                }
            case "undo": workspace.undoEdit()
            case "redo": workspace.redoEdit()
            case "insertImage": workspace.insertImage()
            case "deduplicateBibliography": workspace.prepareBibliographyDedup()
            case "pasteCitation": workspace.insertClipboardCitation(body)
            case "notice": workspace.status = body["message"] as? String ?? ""
            case "save":
                workspace.saveManually()
                workspace.refreshIndex()
            case "requestIndex": workspace.refreshIndex()
            case "localImagePreview": workspace.localImagePreview(body)
            case "referencePreview": workspace.referencePreview(body)
            case "compile": workspace.compile()
            case "projectSearch": workspace.showSearch = true
            case "forwardSync": workspace.forwardSync(line: body["line"] as? Int ?? 1)
            case "navigate":
                if let path = body["path"] as? String {
                    workspace.open(path, line: body["line"] as? Int)
                    if let anchor = body["anchor"] as? Int {
                        workspace.send?([
                            "type": "restorePosition", "anchor": anchor,
                            "head": body["head"] as? Int ?? anchor, "scroll": body["scroll"] as? Double ?? 0,
                        ])
                    }
                }
            case "font": Preferences.shared.codeSize = min(30, max(8, body["size"] as? Double ?? 13))
            default: break
            }
        }
        func webView(
            _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) { decisionHandler(navigationAction.request.url?.isFileURL == true ? .allow : .cancel) }
    }
}
final class CompilunePDFView: PDFView {
    var onCommandClick: ((Int, Double, Double) -> Void)?
    override func mouseDown(with event: NSEvent) {
        if event.modifierFlags.contains(.command) || event.clickCount == 2, let doc = document {
            let local = convert(event.locationInWindow, from: nil)
            if let page = page(for: local, nearest: true) {
                let point = convert(local, to: page)
                let box = page.pageRef?.getBoxRect(.mediaBox) ?? page.bounds(for: .mediaBox)
                onCommandClick?(doc.index(for: page) + 1, point.x, box.maxY - point.y)
                return
            }
        }
        super.mouseDown(with: event)
    }
}
struct PDFHost: NSViewRepresentable {
    let data: Data
    var location: PDFLocation?
    var query: String
    var zoomStep: Int
    var fitRequest: UUID
    var requestedPage: Int
    var searchStep: Int
    var onSearchUpdate: (Int, Int) -> Void
    var onPageChanged: (Int) -> Void
    var onMetricsChanged: (Int, Int) -> Void
    var onCommandClick: (Int, Double, Double) -> Void
    func makeNSView(context: Context) -> CompilunePDFView {
        let v = CompilunePDFView()
        v.autoScales = true
        v.displayMode = .singlePageContinuous
        v.backgroundColor = NSColor.windowBackgroundColor
        v.postsFrameChangedNotifications = true
        context.coordinator.attach(v)
        return v
    }
    func updateNSView(_ view: CompilunePDFView, context: Context) {
        let c = context.coordinator
        view.onCommandClick = onCommandClick
        c.pageChanged = onPageChanged
        c.metricsChanged = onMetricsChanged
        if c.data != data {
            let page = view.currentPage.flatMap { view.document?.index(for: $0) }
            let scale = view.scaleFactor
            let wasAutoScaled = view.autoScales
            c.data = data
            view.document = PDFDocument(data: data)
            c.query = "\0"
            c.reportedPage = nil
            if let document = view.document, document.pageCount > 0,
                let target = document.page(at: min(max(0, page ?? requestedPage - 1), document.pageCount - 1))
            {
                view.go(to: target)
                if !wasAutoScaled { view.scaleFactor = scale }
            }
        }
        let fitRequested = c.fitRequest != fitRequest
        c.fitRequest = fitRequest
        if c.zoomStep != zoomStep || (fitRequested && zoomStep == 0) {
            if zoomStep == 0 {
                view.autoScales = false
                view.autoScales = true
            } else if zoomStep > c.zoomStep {
                for _ in 0..<min(30, zoomStep - c.zoomStep) { view.zoomIn(nil) }
            } else {
                for _ in 0..<min(30, c.zoomStep - zoomStep) { view.zoomOut(nil) }
            }
            c.zoomStep = zoomStep
        }
        if c.requestedPage != requestedPage {
            c.requestedPage = requestedPage
            if let p = view.document?.page(at: max(0, requestedPage - 1)) { view.go(to: p) }
        }
        if c.query != query {
            c.query = query
            c.matches =
                query.isEmpty ? [] : view.document?.findString(query, withOptions: .caseInsensitive) ?? []
            c.matchIndex = 0
        }
        if c.searchStep != searchStep {
            let delta = searchStep - c.searchStep
            c.searchStep = searchStep
            if !c.matches.isEmpty {
                c.matchIndex = (c.matchIndex + delta % c.matches.count + c.matches.count) % c.matches.count
            }
        }
        if !c.matches.isEmpty {
            let match = c.matches[c.matchIndex]
            if c.lastSelection !== match {
                c.lastSelection = match
                view.setCurrentSelection(match, animate: true)
                view.scrollSelectionToVisible(nil)
            }
        } else {
            c.lastSelection = nil
            view.clearSelection()
        }
        let count = c.matches.count
        let index = c.matchIndex
        DispatchQueue.main.async { onSearchUpdate(count, index) }
        if let location, c.location != location.id, let page = view.document?.page(at: location.page - 1) {
            c.location = location.id
            let bounds = page.pageRef?.getBoxRect(.mediaBox) ?? page.bounds(for: .mediaBox)
            view.go(to: PDFDestination(page: page, at: NSPoint(x: location.x, y: bounds.maxY - location.y)))
        }
        c.publishMetrics(view)
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    class Coordinator {
        var data: Data?
        var location: UUID?
        var query = ""
        var zoomStep = 0
        var fitRequest: UUID?
        var requestedPage = 1
        var searchStep = 0
        var matchIndex = 0
        var matches: [PDFSelection] = []
        var lastSelection: PDFSelection?
        var observers: [NSObjectProtocol] = []
        var pageChanged: ((Int) -> Void)?
        var metricsChanged: ((Int, Int) -> Void)?
        var reportedPage: Int?
        var reportedMetrics: (count: Int, percent: Int)?
        func attach(_ view: PDFView) {
            for name in [Notification.Name.PDFViewPageChanged, .PDFViewScaleChanged, .PDFViewDocumentChanged, NSView.frameDidChangeNotification] {
                observers.append(NotificationCenter.default.addObserver(
                    forName: name, object: view, queue: .main
                ) { [weak self, weak view] _ in
                    guard let view else { return }
                    self?.publishMetrics(view)
                })
            }
        }
        func publishMetrics(_ view: PDFView) {
            // PDFKit also emits these notifications during SwiftUI updates.
            // Publish only changed values on the next main-loop turn.
            DispatchQueue.main.async { [weak self, weak view] in
                guard let self, let view else { return }
                let count = view.document?.pageCount ?? 0
                let scale = view.scaleFactor
                // In continuous mode PDFKit defines this as its fit-width
                // scale, independently of the current manual zoom.
                let fit = view.scaleFactorForSizeToFit
                let percent = count > 0 && scale.isFinite && scale > 0 && fit.isFinite && fit > 0
                    ? Int((scale / fit * 100).rounded()) : 0
                if self.reportedMetrics?.count != count || self.reportedMetrics?.percent != percent {
                    self.reportedMetrics = (count, percent)
                    self.metricsChanged?(count, percent)
                }
                if let page = view.currentPage, let index = view.document?.index(for: page), index != NSNotFound {
                    let number = index + 1
                    // Scrolling must update the page readout without issuing a
                    // second go(to:) that snaps the PDF back to the page top.
                    self.requestedPage = number
                    if self.reportedPage != number {
                        self.reportedPage = number
                        self.pageChanged?(number)
                    }
                }
            }
        }
        deinit { for observer in observers { NotificationCenter.default.removeObserver(observer) } }
    }
}

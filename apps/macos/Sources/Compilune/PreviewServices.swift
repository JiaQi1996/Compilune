import AppKit
import PDFKit

@MainActor extension Workspace {
    func referencePreview(_ request: [String: Any]) {
        guard let id = request["id"] as? String else { return }
        let reply: ([String: Any]) -> Void = { [weak self] values in
            self?.send?(values.merging(["type": "referencePreview", "id": id]) { _, new in new })
        }
        guard let path = request["path"] as? String, let label = request["label"] as? String,
            let symbol = symbolList.first(where: { $0.path == path && $0.label == label && $0.kind == "ref" }),
            ["figure", "table"].contains(symbol.preview["kind"] ?? "")
        else { reply(["error": "未找到可预览的图片或表格"]); return }
        guard !pdfStale, let pdf = successfulPDF else {
            reply(["error": "源码有未编译修改，请先成功编译以生成准确预览"]); return
        }
        let revision = revision
        let cwd = buildCWD
        let source = project.url.appendingPathComponent(path).resolvingSymlinksInPath()
        guard source.path.hasPrefix(project.url.resolvingSymlinksInPath().path + "/") else { return }
        let bin = Preferences.shared.texBin
        Task {
            var locations: [[String: String]] = []
            let first = Int(symbol.preview["startLine"] ?? "") ?? symbol.line
            let last = Int(symbol.preview["endLine"] ?? "") ?? symbol.line
            let sourceLines = ((try? self.contents(path)) ?? "").components(separatedBy: "\n")
            let structural = try? NSRegularExpression(pattern: #"^\\(?:centering|label\s*\{[^{}]*\}|begin\s*\{[^{}]*\}(?:\[[^\]]*\])?(?:\{[^{}]*\})?|end\s*\{[^{}]*\})\s*$"#)
            var eligible: [Int] = []
            if last > first + 1 {
                for line in (first + 1)..<min(last, first + 2000) where line > 0 && line <= sourceLines.count {
                    let value = sourceLines[line - 1].components(separatedBy: "%").first?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    if value.isEmpty || structural?.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) != nil { continue }
                    eligible.append(line)
                }
            }
            if eligible.isEmpty { eligible = [symbol.line] }
            let step = max(1, Int(ceil(Double(eligible.count) / 10)))
            var lineSet = Set(stride(from: 0, to: eligible.count, by: step).map { eligible[$0] })
            lineSet.insert(eligible[0]); lineSet.insert(eligible[eligible.count - 1])
            let lines = lineSet.sorted()
            for line in lines.prefix(14) {
                let result: Result<[String: String], Error> = await withCheckedContinuation { continuation in
                    SyncService.query(bin: bin, cwd: cwd, arguments: ["view", "-i", "\(line):1:\(source.path)", "-o", pdf.path]) {
                        continuation.resume(returning: $0)
                    }
                }
                if case .success(let fields) = result, fields["Page"] != nil { locations.append(fields) }
            }
            guard revision == self.revision, !self.pdfStale else {
                reply(["error": "源码已变化，请重新编译后预览"]); return
            }
            if let image = Self.previewImage(pdf: pdf, locations: locations) {
                reply(["image": image, "note": "最近一次成功编译的 PDF" + (Set(locations.compactMap { $0["Page"] }).count > 1 ? " · 跨页内容仅显示首页" : "")])
            } else { reply(["error": "未找到 PDF 中的对应区域，请确认 SyncTeX 可用并重新编译"] ) }
        }
    }
    static func previewImage(pdf: URL, locations: [[String: String]]) -> String? {
        guard let document = PDFDocument(url: pdf), let number = locations.first?["Page"].flatMap(Int.init),
            let page = document.page(at: number - 1) else { return nil }
        let bounds = page.bounds(for: .mediaBox)
        var crop = CGRect.null
        for fields in locations where fields["Page"].flatMap(Int.init) == number {
            guard let x = (fields["h"] ?? fields["x"]).flatMap(Double.init),
                let y = (fields["v"] ?? fields["y"]).flatMap(Double.init) else { continue }
            let width = max(20, abs(fields["W"].flatMap(Double.init) ?? 160))
            let height = max(12, abs(fields["H"].flatMap(Double.init) ?? 16))
            let depth = max(0, fields["D"].flatMap(Double.init) ?? 4)
            crop = crop.union(CGRect(x: x, y: bounds.maxY - y - depth, width: width, height: height + depth))
        }
        guard !crop.isNull else { return nil }
        crop = crop.insetBy(dx: -10, dy: -10).intersection(bounds)
        guard crop.width > 0, crop.height > 0 else { return nil }
        let scale = min(2, 1200 / max(crop.width, crop.height))
        guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: max(1, Int(crop.width * scale)),
            pixelsHigh: max(1, Int(crop.height * scale)), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
            isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
            let graphics = NSGraphicsContext(bitmapImageRep: bitmap) else { return nil }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = graphics
        let context = graphics.cgContext
        context.setFillColor(NSColor.white.cgColor)
        context.fill(CGRect(x: 0, y: 0, width: bitmap.pixelsWide, height: bitmap.pixelsHigh))
        context.scaleBy(x: scale, y: scale)
        context.translateBy(x: -crop.minX, y: -crop.minY)
        page.draw(with: .mediaBox, to: context)
        NSGraphicsContext.restoreGraphicsState()
        var result = bitmap
        if let pixels = bitmap.bitmapData {
            var left = bitmap.pixelsWide, top = bitmap.pixelsHigh, right = -1, bottom = -1
            for y in 0..<bitmap.pixelsHigh {
                for x in 0..<bitmap.pixelsWide {
                    let i = y * bitmap.bytesPerRow + x * 4
                    if pixels[i + 3] > 10 && min(pixels[i], min(pixels[i + 1], pixels[i + 2])) < 245 {
                        left = min(left, x); right = max(right, x); top = min(top, y); bottom = max(bottom, y)
                    }
                }
            }
            if right >= left && bottom >= top {
                left = max(0, left - 12); top = max(0, top - 12)
                right = min(bitmap.pixelsWide - 1, right + 12); bottom = min(bitmap.pixelsHigh - 1, bottom + 12)
                if let cropped = bitmap.cgImage?.cropping(to: CGRect(x: left, y: top, width: right - left + 1, height: bottom - top + 1)) {
                    result = NSBitmapImageRep(cgImage: cropped)
                }
            }
        }
        guard let data = result.representation(using: .png, properties: [:]) else { return nil }
        return "data:image/png;base64," + data.base64EncodedString()
    }
}

@MainActor extension Workspace {
    func localImagePreview(_ request: [String: Any]) {
        guard let id = request["id"] as? String, let file = request["file"] as? String,
            let sourcePath = request["sourcePath"] as? String, sourcePath == selected else { return }
        let reply: ([String: Any]) -> Void = { [weak self] values in
            self?.send?(values.merging(["type": "referencePreview", "id": id]) { _, new in new })
        }
        let root = project.url.resolvingSymlinksInPath()
        var bases = request["label"] as? String == "exact" ? [root] : [buildCWD, root.appendingPathComponent(sourcePath).deletingLastPathComponent(), root]
        // Common graphicspath declarations, interpreted only as local paths.
        if let source = try? contents(sourcePath), let re = try? NSRegularExpression(pattern: #"\\graphicspath\s*\{((?:\s*\{[^{}]*\}\s*)+)\}"#),
            let dirs = try? NSRegularExpression(pattern: #"\{([^{}]*)\}"#) {
            let text = source as NSString
            for match in re.matches(in: source, range: NSRange(location: 0, length: text.length)) {
                let body = text.substring(with: match.range(at: 1)) as NSString
                for dir in dirs.matches(in: body as String, range: NSRange(location: 0, length: body.length)) {
                    bases.append(buildCWD.appendingPathComponent(body.substring(with: dir.range(at: 1))))
                }
            }
        }
        let names = (file as NSString).pathExtension.isEmpty ? [file + ".pdf", file + ".png", file + ".jpg", file + ".jpeg"] : [file]
        let known = Set(files.map { $0.resolvingSymlinksInPath().path })
        let candidates = bases.flatMap { base in names.map { base.appendingPathComponent($0).resolvingSymlinksInPath().standardizedFileURL } }
        guard let url = candidates.first(where: { $0.path.hasPrefix(root.path + "/") && known.contains($0.path) }),
            ["png", "jpg", "jpeg", "pdf", "gif", "webp", "tiff", "bmp"].contains(url.pathExtension.lowercased()),
            let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
            let size = attrs[.size] as? Int, size <= 20 * 1024 * 1024,
            let image = NSImage(contentsOf: url), image.size.width > 0, image.size.height > 0 else {
            reply(["error": "未找到项目内可预览的图片（支持 PNG、JPEG、PDF 等，最大 20 MB）"]); return
        }
        let factor = min(1, 900 / max(image.size.width, image.size.height))
        let target = NSSize(width: max(1, image.size.width * factor), height: max(1, image.size.height * factor))
        guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(target.width), pixelsHigh: Int(target.height),
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
            let context = NSGraphicsContext(bitmapImageRep: bitmap) else { reply(["error": "图片读取失败"]); return }
        NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = context
        image.draw(in: NSRect(origin: .zero, size: target)); NSGraphicsContext.restoreGraphicsState()
        guard let data = bitmap.representation(using: .png, properties: [:]) else { reply(["error": "图片读取失败"]); return }
        reply(["image": "data:image/png;base64," + data.base64EncodedString(), "note": url.pathExtension.lowercased() == "pdf" ? "本地 PDF · 第 1 页" : "本地图片 · 无需编译"])
    }
}

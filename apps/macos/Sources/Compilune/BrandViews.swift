import AppKit
import SwiftUI

enum AppBrand {
    static var icon: NSImage {
        let url = Bundle.main.resourceURL?.appendingPathComponent("AppIcon.icns")
        return url.flatMap { NSImage(contentsOf: $0) } ?? NSImage(named: NSImage.applicationIconName)
            ?? NSImage()
    }
}
struct ProjectPinButton: View {
    let project: Project
    @ObservedObject var library = Library.shared
    var body: some View {
        Button {
            var copy = project
            copy.pinned.toggle()
            library.update(copy)
        } label: {
            Image(systemName: project.pinned ? "pin.fill" : "pin").frame(width: 28, height: 28)
        }.buttonStyle(.borderless).foregroundStyle(project.pinned ? sage : .secondary)
            .help(project.pinned ? "取消置顶：" + project.name : "置顶项目：" + project.name)
            .accessibilityLabel(project.pinned ? "取消置顶" : "置顶项目")
    }
}

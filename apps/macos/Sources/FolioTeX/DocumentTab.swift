import SwiftUI

struct DocumentTab: View {
    @ObservedObject var workspace: Workspace
    let path: String
    @ViewState private var hovered = false
    @ViewState private var closeHovered = false
    private var selected: Bool { workspace.selected == path }
    private var name: String { URL(fileURLWithPath: path).lastPathComponent }
    var body: some View {
        HStack(spacing: 2) {
            Button {
                workspace.open(path)
            } label: {
                HStack(spacing: 6) {
                    Text(name).lineLimit(1)
                    if workspace.buffers[path]?.dirty == true {
                        Circle().fill(sage).frame(width: 5, height: 5).accessibilityLabel("尚未保存")
                    }
                }.padding(.leading, 12).padding(.trailing, 4).frame(height: 34).contentShape(Rectangle())
            }.buttonStyle(.plain).help("切换到 \(path)")
            Button {
                workspace.closeTab(path)
            } label: {
                Image(systemName: "xmark").font(.system(size: 10, weight: .medium))
                    .frame(width: 22, height: 22)
                    .background(
                        closeHovered ? sage.opacity(0.18) : .clear, in: RoundedRectangle(cornerRadius: 4)
                    )
                    .contentShape(Rectangle())
            }.buttonStyle(.plain).padding(.trailing, 6)
                .onHover { closeHovered = $0 }
                .help("保存并关闭 \(name)，保留磁盘文件")
                .accessibilityLabel("关闭 \(name)")
        }.frame(height: 34)
            .foregroundStyle(selected ? Color.primary : Color.secondary)
            .background(sage.opacity(selected ? 0.17 : hovered ? 0.07 : 0))
            .overlay(alignment: .bottom) { if selected { Rectangle().fill(sage).frame(height: 2) } }
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 6, topTrailingRadius: 6))
            .onHover { hovered = $0 }
            .accessibilityIdentifier("document-tab:" + path)
    }
}

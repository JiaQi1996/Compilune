import AppKit
import SwiftUI

struct NewItemActions: View {
    @ObservedObject var workspace: Workspace
    let parent: String
    var body: some View {
        ForEach(NewProjectItem.allCases, id: \.rawValue) { kind in
            Button(kind.rawValue) { workspace.promptNewItem(kind, parent: parent) }
                .help("在" + (parent.isEmpty ? "项目根目录" : parent) + kind.rawValue)
        }
    }
}
struct FileTreeView: View {
    @ObservedObject var workspace: Workspace
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                sectionButton("文件", outline: false)
                sectionButton("大纲", outline: true)
                Spacer(minLength: 0)
            }.padding(.horizontal, 10).padding(.vertical, 6)
            if workspace.showOutline {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(
                            OutlineNode.tree(
                                workspace.symbolList, files: workspace.files, root: workspace.project.url,
                                main: workspace.project.root)
                        ) { node in DocumentOutlineBranch(workspace: workspace, node: node) }
                    }.padding(.horizontal, 8).padding(.vertical, 4)
                }
            } else {
                GeometryReader { geometry in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(SourceNode.tree(workspace.files, root: workspace.project.url)) { node in
                                FileTreeBranch(workspace: workspace, node: node)
                            }
                            Color.clear.frame(minHeight: 100, maxHeight: .infinity).frame(maxWidth: .infinity)
                                .contentShape(Rectangle())
                                .onTapGesture { workspace.fileTreeSelection = nil }
                                .contextMenu { NewItemActions(workspace: workspace, parent: "") }
                                .dropDestination(for: String.self) { items, _ in
                                    workspace.moveDropped(items, to: "")
                                }
                                .help("单击选中项目根目录；右键新建；拖到这里移回根目录")
                        }.frame(minHeight: geometry.size.height, alignment: .top).padding(.horizontal, 8)
                    }
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func sectionButton(_ title: String, outline: Bool) -> some View {
        Button {
            workspace.showOutline = outline
        } label: {
            Text(title).fontWeight(workspace.showOutline == outline ? .semibold : .regular)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(
                    workspace.showOutline == outline ? sage.opacity(0.15) : .clear,
                    in: RoundedRectangle(cornerRadius: 5))
        }.buttonStyle(.plain).help(outline ? "显示仅包含 TeX 的层级大纲" : "显示项目文件和文件夹")
    }
}
struct FileTreeBranch: View {
    @ObservedObject var workspace: Workspace
    let node: SourceNode
    var depth = 0
    @ViewState private var expanded = true
    @ViewState private var dropTarget = false
    private var directory: Bool { node.children != nil }
    private var destination: String { directory ? node.path : workspace.directoryForItem(node.path) }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                if directory {
                    Button {
                        expanded.toggle()
                        workspace.fileTreeSelection = node.path
                    } label: {
                        Image(systemName: expanded ? "chevron.down" : "chevron.right").font(
                            .system(size: 9, weight: .semibold)
                        ).frame(width: 14, height: 26)
                    }
                    .buttonStyle(.plain).help(expanded ? "收起文件夹" : "展开文件夹")
                } else {
                    Color.clear.frame(width: 14, height: 26)
                }
                Button {
                    workspace.fileTreeSelection = node.path
                    if directory { expanded.toggle() } else { workspace.open(node.path) }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: directory ? (expanded ? "folder.fill" : "folder") : "doc.text")
                            .foregroundStyle(directory ? sage : .secondary)
                        Text(URL(fileURLWithPath: node.path).lastPathComponent).lineLimit(1)
                        if node.path == workspace.project.root {
                            Text("主").font(.caption2).foregroundStyle(sage)
                        }
                        Spacer(minLength: 0)
                    }.frame(height: 28).contentShape(Rectangle())
                }.buttonStyle(.plain).help(directory ? "选择或展开文件夹：" + node.path : "打开 " + node.path)
            }.padding(.leading, CGFloat(depth) * 18).padding(.trailing, 4)
                .background(
                    dropTarget
                        ? sage.opacity(0.25)
                        : workspace.fileTreeSelection == node.path ? sage.opacity(0.14) : .clear,
                    in: RoundedRectangle(cornerRadius: 4)
                )
                .contextMenu {
                    NewItemActions(workspace: workspace, parent: destination)
                    Divider()
                    Button("重命名 / 移动…") { workspace.renameFile(node.path) }.help("重命名或移动，不自动修改文稿引用")
                    Button("移到废纸篓", role: .destructive) { workspace.trashFile(node.path) }.help("将此项移到系统废纸篓")
                    Button("在 Finder 显示") {
                        NSWorkspace.shared.activateFileViewerSelecting([
                            workspace.project.url.appendingPathComponent(node.path)
                        ])
                    }.help("在 Finder 选中此项")
                }
                .draggable(workspace.project.id.uuidString + "|" + node.path)
                .dropDestination(for: String.self) { items, _ in
                    let moved = workspace.moveDropped(items, to: destination)
                    if moved { expanded = true }
                    return moved
                } isTargeted: {
                    dropTarget = $0
                }
            if directory && expanded {
                ForEach(node.children ?? []) { child in
                    FileTreeBranch(workspace: workspace, node: child, depth: depth + 1)
                }
            }
        }
    }
}

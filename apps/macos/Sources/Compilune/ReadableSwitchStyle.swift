import SwiftUI

struct ReadableSwitchStyle: ToggleStyle {
    @Environment(\.isEnabled) private var enabled
    @Environment(\.colorScheme) private var scheme
    private var dark: Bool { scheme == .dark }
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 12) {
            configuration.label.foregroundStyle(Color(nsColor: .labelColor))
            Spacer(minLength: 8)
            Text(enabled ? (configuration.isOn ? "已开启" : "已关闭") : "不可用")
                .font(.caption).foregroundStyle(Color(nsColor: enabled ? .secondaryLabelColor : .labelColor))
            Button {
                configuration.isOn.toggle()
            } label: {
                ZStack {
                    Capsule().fill(track(on: configuration.isOn))
                    Capsule().strokeBorder(
                        enabled ? Color.primary.opacity(0.16) : Color.primary.opacity(0.5), lineWidth: 1)
                    Circle().fill(enabled ? Color.white : (dark ? Color(white: 0.65) : Color(white: 0.9)))
                        .frame(width: 17, height: 17).offset(x: enabled && configuration.isOn ? 9 : -9)
                }.frame(width: 42, height: 23).contentShape(Capsule())
            }.buttonStyle(.plain).disabled(!enabled)
                .accessibilityLabel(configuration.isOn ? "关闭此选项" : "开启此选项")
                .help(enabled ? (configuration.isOn ? "点击关闭" : "点击开启") : "不可用：需先开启自动保存")
        }.padding(.vertical, 3)
    }
    private func track(on: Bool) -> Color {
        if !enabled { return dark ? Color(white: 0.28) : Color(white: 0.56) }
        return on ? sage : (dark ? Color(white: 0.36) : Color(white: 0.81))
    }
}

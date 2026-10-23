// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Compilune",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "Compilune", targets: ["Compilune"])],
    targets: [
        .executableTarget(name: "Compilune", resources: [.copy("Resources")])
    ]
)

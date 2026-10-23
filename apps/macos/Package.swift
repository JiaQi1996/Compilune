// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FolioTeX",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "FolioTeX", targets: ["FolioTeX"])],
    targets: [
        .executableTarget(name: "FolioTeX", resources: [.copy("Resources")])
    ]
)

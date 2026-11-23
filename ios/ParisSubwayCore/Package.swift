// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ParisSubwayCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "ParisSubwayCore", targets: ["ParisSubwayCore"]),
    ],
    targets: [
        .target(name: "ParisSubwayCore"),
        .testTarget(
            name: "ParisSubwayCoreTests",
            dependencies: ["ParisSubwayCore"]
        ),
    ]
)

// swift-tools-version:5.9
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import PackageDescription

// The windowed app is the Xcode target in project.yml (macOS 14 or newer).
// This manifest does not set `platforms`, so Linux can still run the URL tests.
// SwiftUI and WebKit stay behind `os(macOS)`.
let package = Package(
    name: "BlinkyBot",
    products: [
        .library(name: "BlinkyComposeURL", targets: ["BlinkyComposeURL"]),
        .executable(name: "BlinkyBot", targets: ["BlinkyBot"]),
    ],
    targets: [
        .target(
            name: "BlinkyComposeURL",
            path: "Sources/BlinkyComposeURL"
        ),
        .executableTarget(
            name: "BlinkyBot",
            dependencies: ["BlinkyComposeURL"],
            path: "Sources/BlinkyBot",
            linkerSettings: [
                .linkedFramework("WebKit", .when(platforms: [.macOS])),
            ]
        ),
        .testTarget(
            name: "BlinkyComposeURLTests",
            dependencies: ["BlinkyComposeURL"],
            path: "Tests/BlinkyComposeURLTests"
        ),
    ]
)

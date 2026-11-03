// swift-tools-version:5.9
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import PackageDescription

// macOS 14 matches project.yml. SwiftPM otherwise defaults below 10.15, and
// `swift test` then rejects SwiftUI. Linux is not listed, so it keeps the
// tools-version default and the URL tests still run there.
// SwiftUI and WebKit stay behind `os(macOS)`.
let package = Package(
    name: "BlinkyBot",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(name: "BlinkyComposeURL", targets: ["BlinkyComposeURL"]),
        .library(name: "BlinkyLocalRuntime", targets: ["BlinkyLocalRuntime"]),
        .library(name: "BlinkyOnboarding", targets: ["BlinkyOnboarding"]),
        .executable(name: "BlinkyBot", targets: ["BlinkyBot"]),
    ],
    dependencies: [
        .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.9.6"),
    ],
    targets: [
        .target(
            name: "BlinkyComposeURL",
            path: "Sources/BlinkyComposeURL"
        ),
        .target(
            name: "BlinkyLocalRuntime",
            path: "Sources/BlinkyLocalRuntime"
        ),
        .target(
            name: "BlinkyOnboarding",
            dependencies: ["BlinkyLocalRuntime"],
            path: "Sources/BlinkyOnboarding"
        ),
        .executableTarget(
            name: "BlinkyBot",
            dependencies: [
                "BlinkyComposeURL",
                "BlinkyLocalRuntime",
                "BlinkyOnboarding",
                .product(name: "Sparkle", package: "Sparkle"),
            ],
            path: "Sources/BlinkyBot",
            linkerSettings: [
                .linkedFramework("WebKit", .when(platforms: [.macOS])),
                .linkedFramework("ServiceManagement", .when(platforms: [.macOS])),
            ]
        ),
        .testTarget(
            name: "BlinkyComposeURLTests",
            dependencies: ["BlinkyComposeURL"],
            path: "Tests/BlinkyComposeURLTests"
        ),
        .testTarget(
            name: "BlinkyLocalRuntimeTests",
            dependencies: ["BlinkyLocalRuntime"],
            path: "Tests/BlinkyLocalRuntimeTests"
        ),
        .testTarget(
            name: "BlinkyOnboardingTests",
            dependencies: ["BlinkyOnboarding"],
            path: "Tests/BlinkyOnboardingTests"
        ),
    ]
)

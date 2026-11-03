import AppKit
import Foundation

struct ListedWindow {
    var owner: String
    var name: String
    var id: Int
    var width: Double
    var height: Double
}

let chromeTitles: Set<String> = ["Back", "Forward", "Reload", "Address and Search", "Address"]

func argValue(_ flag: String) -> String? {
    guard let index = CommandLine.arguments.firstIndex(of: flag), index + 1 < CommandLine.arguments.count else { return nil }
    return CommandLine.arguments[index + 1]
}

func number(_ value: Any?) -> Double {
    if let value = value as? NSNumber { return value.doubleValue }
    return 0
}

func listedWindows() -> [ListedWindow] {
    let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
    let raw = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
    var windows: [ListedWindow] = []
    for item in raw {
        if Int(number(item[kCGWindowLayer as String])) != 0 { continue }
        let bounds = item[kCGWindowBounds as String] as? [String: Any] ?? [:]
        windows.append(ListedWindow(
            owner: item[kCGWindowOwnerName as String] as? String ?? "",
            name: item[kCGWindowName as String] as? String ?? "",
            id: Int(number(item[kCGWindowNumber as String])),
            width: number(bounds["Width"]),
            height: number(bounds["Height"])
        ))
    }
    return windows
}

func walk(_ element: AXUIElement, depth: Int, notes: inout [String], urlField: inout Bool, chrome: inout Bool) {
    if depth > 6 { return }
    var titleRef: CFTypeRef?
    var valueRef: CFTypeRef?
    var roleRef: CFTypeRef?
    var childrenRef: CFTypeRef?
    if AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &titleRef) == .success, let title = titleRef as? String, !title.isEmpty {
        notes.append(title)
        if chromeTitles.contains(title) { chrome = true }
    }
    let role = (AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleRef) == .success) ? (roleRef as? String ?? "") : ""
    if AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valueRef) == .success, let value = valueRef as? String, !value.isEmpty {
        if role == "AXTextField" || role == "AXComboBox" || role == "AXTextArea" {
            notes.append(value)
            let lower = value.lowercased()
            if lower.contains("127.0.0.1") || lower.contains("localhost") || lower.contains("http://") || lower.contains("https://") {
                urlField = true
            }
        }
    }
    if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef) == .success, let children = childrenRef as? [AXUIElement] {
        for child in children.prefix(30) {
            walk(child, depth: depth + 1, notes: &notes, urlField: &urlField, chrome: &chrome)
        }
    }
}

func accessibility(of windows: [ListedWindow]) -> (trusted: Bool, notes: [String], urlField: Bool, chrome: Bool) {
    guard AXIsProcessTrusted() else { return (false, [], false, false) }
    guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "bot.blinky.shell").first else {
        return (true, [], false, false)
    }
    var notes: [String] = []
    var urlField = false
    var chrome = false
    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    var ref: CFTypeRef?
    if AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &ref) == .success, let axWindows = ref as? [AXUIElement] {
        for window in axWindows {
            walk(window, depth: 0, notes: &notes, urlField: &urlField, chrome: &chrome)
        }
    }
    _ = windows
    return (true, notes, urlField, chrome)
}

func emit(_ payload: [String: Any], ok: Bool) {
    let data = try! JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
    exit(ok ? 0 : 1)
}

let windows = listedWindows()
let blinky = windows.filter { $0.owner == "BlinkyBot" && $0.width >= 240 && $0.height >= 180 }
let ax = accessibility(of: windows)
let names = blinky.map(\.name)
let urlInTitle = names.contains { name in
    let lower = name.lowercased()
    return lower.contains("127.0.0.1") || lower.contains("localhost") || lower.contains("http://") || lower.contains("https://")
}
let windowPayload: [[String: Any]] = blinky.map { window in
    [
        "owner": window.owner,
        "name": window.name,
        "id": window.id,
        "width": window.width,
        "height": window.height,
    ]
}
let payload: [String: Any] = [
    "windows": windowPayload,
    "axTrusted": ax.trusted,
    "axNotes": Array(ax.notes.prefix(40)),
    "urlField": ax.urlField,
    "browserChrome": ax.chrome,
    "urlInTitle": urlInTitle,
]
if let needle = argValue("--contains") {
    let haystack = (names + ax.notes).joined(separator: "\n")
    var found = payload
    found["needle"] = needle
    found["found"] = haystack.contains(needle)
    emit(found, ok: haystack.contains(needle))
}
let titledOk = !blinky.isEmpty && !urlInTitle && blinky.contains { $0.name.isEmpty || $0.name == "BlinkyBot" }
let ok = titledOk && !ax.urlField && !ax.chrome
emit(payload, ok: ok)

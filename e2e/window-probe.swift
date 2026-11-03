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

func roleOf(_ element: AXUIElement) -> String {
    var roleRef: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleRef) == .success else { return "" }
    return roleRef as? String ?? ""
}

func isSwitch(_ element: AXUIElement) -> Bool {
    ["AXCheckBox", "AXSwitch", "AXToggle", "AXButton"].contains(roleOf(element))
}

func press(_ element: AXUIElement) -> Bool {
    AXUIElementPerformAction(element, kAXPressAction as CFString) == .success
}

func childrenOf(_ element: AXUIElement) -> [AXUIElement] {
    var childrenRef: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef) == .success else { return [] }
    return childrenRef as? [AXUIElement] ?? []
}

func pressSwitch(element: AXUIElement, parent: AXUIElement?) -> Bool {
    var candidates = [element]
    if let parent { candidates.append(parent) }
    if let parent { candidates.append(contentsOf: childrenOf(parent)) }
    candidates.append(contentsOf: childrenOf(element))
    for candidate in candidates where isSwitch(candidate) {
        if press(candidate) { return true }
    }
    return false
}

func walk(_ element: AXUIElement, depth: Int, notes: inout [String], urlField: inout Bool, chrome: inout Bool, click: String?, clickLast: Bool, clicked: inout Bool, lastElement: inout AXUIElement?, lastParent: inout AXUIElement?, parent: AXUIElement?, visits: inout Int) {
    if depth > 18 || visits > 4000 || notes.count > 500 { return }
    visits += 1
    var titleRef: CFTypeRef?
    var valueRef: CFTypeRef?
    var roleRef: CFTypeRef?
    var descriptionRef: CFTypeRef?
    var childrenRef: CFTypeRef?
    var label = ""
    if AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &titleRef) == .success, let title = titleRef as? String, !title.isEmpty {
        notes.append(title)
        label = title
        if chromeTitles.contains(title) { chrome = true }
    }
    if AXUIElementCopyAttributeValue(element, kAXDescriptionAttribute as CFString, &descriptionRef) == .success, let description = descriptionRef as? String, !description.isEmpty {
        notes.append(description)
        if label.isEmpty { label = description }
    }
    let role = (AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleRef) == .success) ? (roleRef as? String ?? "") : ""
    if label.contains("Rex") || label == "Check again" {
        notes.append("\(role) :: \(label)")
    }
    if AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valueRef) == .success, let value = valueRef as? String, !value.isEmpty {
        if role == "AXTextField" || role == "AXComboBox" || role == "AXTextArea" || role == "AXStaticText" {
            notes.append(value)
            let lower = value.lowercased()
            if lower.contains("127.0.0.1") || lower.contains("localhost") || lower.contains("http://") || lower.contains("https://") {
                urlField = true
            }
        }
    }
    if let click, label == click || (role == "AXStaticText" && valueRef as? String == click) {
        lastElement = element
        lastParent = parent
        if !clickLast && !clicked {
            clicked = pressSwitch(element: element, parent: parent)
        }
    }
    if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef) == .success, let children = childrenRef as? [AXUIElement] {
        for child in children.prefix(50) {
            walk(child, depth: depth + 1, notes: &notes, urlField: &urlField, chrome: &chrome, click: click, clickLast: clickLast, clicked: &clicked, lastElement: &lastElement, lastParent: &lastParent, parent: element, visits: &visits)
        }
    }
}

func accessibility(of windows: [ListedWindow], click: String?, clickLast: Bool) -> (trusted: Bool, notes: [String], urlField: Bool, chrome: Bool, clicked: Bool) {
    guard AXIsProcessTrusted() else { return (false, [], false, false, false) }
    guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "bot.blinky.shell").first else {
        return (true, [], false, false, false)
    }
    var notes: [String] = []
    var urlField = false
    var chrome = false
    var clicked = false
    var lastElement: AXUIElement?
    var lastParent: AXUIElement?
    var visits = 0
    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    AXUIElementSetAttributeValue(axApp, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    var ref: CFTypeRef?
    if AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &ref) == .success, let axWindows = ref as? [AXUIElement] {
        for window in axWindows {
            walk(window, depth: 0, notes: &notes, urlField: &urlField, chrome: &chrome, click: click, clickLast: clickLast, clicked: &clicked, lastElement: &lastElement, lastParent: &lastParent, parent: nil, visits: &visits)
        }
    }
    if clickLast, let lastElement {
        clicked = pressSwitch(element: lastElement, parent: lastParent)
    }
    _ = windows
    return (true, notes, urlField, chrome, clicked)
}

func emit(_ payload: [String: Any], ok: Bool) {
    let data = try! JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
    exit(ok ? 0 : 1)
}

let windows = listedWindows()
let blinky = windows.filter { $0.owner == "BlinkyBot" && $0.width >= 240 && $0.height >= 180 }
let click = argValue("--click")
let clickLast = CommandLine.arguments.contains("--click-last")
let ax = accessibility(of: windows, click: click, clickLast: clickLast)
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
    "axNotes": Array(ax.notes.prefix(200)),
    "urlField": ax.urlField,
    "browserChrome": ax.chrome,
    "urlInTitle": urlInTitle,
    "clicked": ax.clicked,
]
if let click {
    var found = payload
    found["click"] = click
    emit(found, ok: ax.clicked)
}
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

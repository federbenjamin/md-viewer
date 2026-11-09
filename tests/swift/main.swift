import Foundation

let viewer = URL(string: "mdviewer://app/viewer/viewer.html")!
var failures = 0

func expect(_ condition: Bool, _ label: String) {
    if !condition {
        failures += 1
        print("FAIL: \(label)")
    }
}

func link(_ value: String) -> ViewerPolicy.Navigation {
    ViewerPolicy.navigation(to: URL(string: value), isLinkActivated: true, viewerURL: viewer)
}

func other(_ value: String) -> ViewerPolicy.Navigation {
    ViewerPolicy.navigation(to: URL(string: value), isLinkActivated: false, viewerURL: viewer)
}

for blocked in [
    "mdviewer://app/viewer/docs/guide.md",
    "mdviewer://app/other.md",
    "mdviewer://app/document",
    "mdviewer://app/viewer/viewer.html?x=1",
    "mdviewer://elsewhere/viewer/viewer.html",
    "mdviewer://app/viewer/",
] {
    expect(link(blocked) == .cancel, "activated link stays on the viewer: \(blocked)")
    expect(other(blocked) == .cancel, "other navigation stays on the viewer: \(blocked)")
}

expect(link("mdviewer://app/viewer/viewer.html#section") == .allow, "a fragment link scrolls")
expect(link("mdviewer://app/viewer/viewer.html#") == .allow, "an empty fragment link scrolls")
expect(link("mdviewer://app/viewer/viewer.html") == .allow, "a link to the viewer itself stays")
expect(other("mdviewer://app/viewer/viewer.html") == .allow, "the first load is allowed")

for external in ["https://example.com/a", "http://example.com/a", "mailto:a@b.example"] {
    let url = URL(string: external)!
    expect(link(external) == .openExternally(url), "activated \(external) opens outside")
    expect(other(external) == .cancel, "unactivated \(external) is cancelled")
}

expect(link("tel:123") == .cancel, "an unknown scheme is cancelled")
expect(
    ViewerPolicy.navigation(to: nil, isLinkActivated: true, viewerURL: viewer) == .cancel,
    "a navigation with no URL is cancelled"
)

expect(
    !ViewerPolicy.isLoadFailure(NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled)),
    "a cancelled load shows no failure"
)
expect(
    !ViewerPolicy.isLoadFailure(NSError(domain: "WebKitErrorDomain", code: 102)),
    "a load the policy interrupted shows no failure"
)
expect(
    ViewerPolicy.isLoadFailure(NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut)),
    "a timed-out load is a failure"
)
expect(
    ViewerPolicy.isLoadFailure(NSError(domain: "WebKitErrorDomain", code: 103)),
    "another WebKit error is a failure"
)

let start = Date(timeIntervalSince1970: 1_000)
expect(ViewerPolicy.shouldReloadAfterCrash(now: start, lastReload: nil), "the first crash reloads")
expect(
    !ViewerPolicy.shouldReloadAfterCrash(now: start.addingTimeInterval(9), lastReload: start),
    "a crash soon after a reload stops the loop"
)
expect(
    ViewerPolicy.shouldReloadAfterCrash(now: start.addingTimeInterval(10), lastReload: start),
    "a much later crash reloads again"
)

expect(
    ViewerPolicy.status(forReadError: NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoSuchFileError)) == 404,
    "a missing bundled file is 404"
)
expect(
    ViewerPolicy.status(forReadError: NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoPermissionError)) == 500,
    "an unreadable bundled file is 500"
)
expect(
    ViewerPolicy.status(forReadError: NSError(domain: NSPOSIXErrorDomain, code: Int(ENOENT))) == 500,
    "a same-numbered code in another domain is 500"
)

if failures > 0 {
    print("\(failures) policy check(s) failed")
    exit(1)
}
print("policy checks passed")

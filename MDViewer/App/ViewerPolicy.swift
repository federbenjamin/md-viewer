import Foundation

enum ViewerPolicy {
    enum Navigation: Equatable {
        case allow
        case cancel
        case openExternally(URL)
    }

    private static let externalSchemes: Set<String> = ["http", "https", "mailto"]
    private static let crashLoopWindow: TimeInterval = 10
    private static let webKitErrorDomain = "WebKitErrorDomain"
    private static let frameLoadInterruptedByPolicyChange = 102

    // Only the viewer page may fill the web view: any other mdviewer: page has no document and no way back.
    static func navigation(to url: URL?, isLinkActivated: Bool, viewerURL: URL) -> Navigation {
        guard let url, let scheme = url.scheme else { return .cancel }
        if isLinkActivated, externalSchemes.contains(scheme) { return .openExternally(url) }
        let withoutFragment = String(url.absoluteString.prefix(while: { $0 != "#" }))
        return withoutFragment == viewerURL.absoluteString ? .allow : .cancel
    }

    // A navigation the policy cancelled is reported through the same callbacks as a real failure.
    static func isLoadFailure(_ error: any Error) -> Bool {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain, nsError.code == NSURLErrorCancelled { return false }
        return !(nsError.domain == webKitErrorDomain && nsError.code == frameLoadInterruptedByPolicyChange)
    }

    static func shouldReloadAfterCrash(now: Date, lastReload: Date?) -> Bool {
        guard let lastReload else { return true }
        return now.timeIntervalSince(lastReload) >= crashLoopWindow
    }

    static func status(forReadError error: any Error) -> Int {
        let nsError = error as NSError
        return nsError.domain == NSCocoaErrorDomain && nsError.code == NSFileReadNoSuchFileError ? 404 : 500
    }
}

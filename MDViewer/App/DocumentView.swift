import Foundation
import OSLog
import SwiftUI
import WebKit
#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct DocumentView {
    let text: String

    func makeCoordinator() -> NavigationPolicy {
        NavigationPolicy()
    }

    fileprivate func makeWebView(navigationDelegate: NavigationPolicy) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(ViewerSchemeHandler(text: text), forURLScheme: ViewerSchemeHandler.scheme)
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = navigationDelegate
        webView.load(URLRequest(url: ViewerSchemeHandler.viewerURL))
        return webView
    }
}

#if os(macOS)
extension DocumentView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView {
        makeWebView(navigationDelegate: context.coordinator)
    }

    func updateNSView(_ webView: WKWebView, context: Context) {}
}
#else
extension DocumentView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        makeWebView(navigationDelegate: context.coordinator)
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}
#endif

final class NavigationPolicy: NSObject, WKNavigationDelegate {
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "", category: "navigation")
    private static let failureMessage = "This document could not be shown."

    private var lastCrashReload: Date?
    private var showsFailure = false

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
        switch ViewerPolicy.navigation(
            to: navigationAction.request.url,
            isLinkActivated: navigationAction.navigationType == .linkActivated,
            viewerURL: ViewerSchemeHandler.viewerURL
        ) {
        case .allow:
            decisionHandler(.allow)
        case .cancel:
            decisionHandler(.cancel)
        case .openExternally(let url):
            #if os(macOS)
            NSWorkspace.shared.open(url)
            #else
            UIApplication.shared.open(url)
            #endif
            decisionHandler(.cancel)
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping @MainActor (WKNavigationResponsePolicy) -> Void
    ) {
        if navigationResponse.isForMainFrame,
            let response = navigationResponse.response as? HTTPURLResponse,
            !(200..<300).contains(response.statusCode)
        {
            Self.logger.error("The viewer page answered \(response.statusCode, privacy: .public)")
            decisionHandler(.cancel)
            showFailure(in: webView)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        handleLoadError(error, in: webView)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: any Error
    ) {
        handleLoadError(error, in: webView)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Self.logger.error("The web content process ended")
        guard !showsFailure else { return }
        let now = Date()
        if ViewerPolicy.shouldReloadAfterCrash(now: now, lastReload: lastCrashReload) {
            lastCrashReload = now
            webView.load(URLRequest(url: ViewerSchemeHandler.viewerURL))
        } else {
            showFailure(in: webView)
        }
    }

    private func handleLoadError(_ error: any Error, in webView: WKWebView) {
        guard ViewerPolicy.isLoadFailure(error) else { return }
        let nsError = error as NSError
        Self.logger.error("The viewer failed to load: \(nsError.domain, privacy: .public) \(nsError.code, privacy: .public)")
        showFailure(in: webView)
    }

    // A native label, because the failure can be that the web content cannot show anything.
    private func showFailure(in webView: WKWebView) {
        guard !showsFailure else { return }
        showsFailure = true
        #if os(macOS)
        let label = NSTextField(wrappingLabelWithString: Self.failureMessage)
        label.alignment = .center
        #else
        let label = UILabel()
        label.text = Self.failureMessage
        label.numberOfLines = 0
        label.textAlignment = .center
        #endif
        label.translatesAutoresizingMaskIntoConstraints = false
        webView.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: webView.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: webView.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: webView.leadingAnchor, constant: 24),
        ])
    }
}

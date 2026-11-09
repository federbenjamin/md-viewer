import Foundation
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
    private static let externalSchemes: Set<String> = ["http", "https", "mailto"]

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url, let scheme = url.scheme else {
            decisionHandler(.cancel)
            return
        }
        if navigationAction.navigationType == .linkActivated, Self.externalSchemes.contains(scheme) {
            #if os(macOS)
            NSWorkspace.shared.open(url)
            #else
            UIApplication.shared.open(url)
            #endif
            decisionHandler(.cancel)
        } else if scheme == ViewerSchemeHandler.scheme {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
        }
    }
}

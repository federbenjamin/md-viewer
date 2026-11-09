import Foundation
import OSLog
import WebKit

final class ViewerSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "mdviewer"
    static let viewerURL = URL(string: "mdviewer://app/viewer/viewer.html")!

    private static let servedFolders: Set<String> = ["viewer", "lib", "vendor"]
    private static let plainText = "text/plain; charset=utf-8"
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "", category: "scheme-handler")

    // The extension's policy is the one source, so the two hosts cannot drift apart.
    private static let contentSecurityPolicy: String = {
        guard
            let url = Bundle.main.url(forResource: "manifest", withExtension: "json"),
            let data = try? Data(contentsOf: url),
            let manifest = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let policies = manifest["content_security_policy"] as? [String: Any],
            let policy = policies["extension_pages"] as? String
        else {
            preconditionFailure("The bundled manifest.json has no content_security_policy.extension_pages")
        }
        return policy
    }()

    private let text: String

    init(text: String) {
        self.text = text
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        let path = url.path(percentEncoded: false)
        if path == "/document" {
            send(Data(text.utf8), contentType: Self.plainText, for: url, to: urlSchemeTask)
        } else if let file = bundledFile(at: path) {
            sendBundledFile(file, path: path, for: url, to: urlSchemeTask)
        } else {
            send(Data(), status: 404, contentType: Self.plainText, for: url, to: urlSchemeTask)
        }
    }

    // Every response is finished inside start, so no task is ever in flight to stop.
    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {}

    private func sendBundledFile(_ file: URL, path: String, for url: URL, to task: any WKURLSchemeTask) {
        do {
            send(try Data(contentsOf: file), contentType: Self.mimeType(of: file), for: url, to: task)
        } catch {
            let status = ViewerPolicy.status(forReadError: error)
            // A missing file's path can come from the document, so only a file known to be bundled logs in the clear.
            if status == 404 {
                Self.logger.error("Bundled file is missing: \(path)")
            } else {
                Self.logger.error("Bundled file is unreadable: \(path, privacy: .public)")
            }
            send(Data(), status: status, contentType: Self.plainText, for: url, to: task)
        }
    }

    private func bundledFile(at path: String) -> URL? {
        guard
            let folder = path.split(separator: "/").first.map(String.init),
            Self.servedFolders.contains(folder),
            let resources = Bundle.main.resourceURL
        else {
            return nil
        }
        let root = resources.appending(path: folder, directoryHint: .isDirectory).standardizedFileURL
        let file = resources.appending(path: String(path.dropFirst())).standardizedFileURL
        return file.path.hasPrefix(root.path + "/") ? file : nil
    }

    private static func mimeType(of file: URL) -> String {
        switch file.pathExtension.lowercased() {
        case "html": "text/html"
        case "js", "mjs": "text/javascript"
        case "css": "text/css"
        case "woff2": "font/woff2"
        default: "application/octet-stream"
        }
    }

    private func send(
        _ body: Data,
        status: Int = 200,
        contentType: String,
        for url: URL,
        to task: any WKURLSchemeTask
    ) {
        let fields = [
            "Content-Type": contentType,
            "Content-Security-Policy": Self.contentSecurityPolicy,
            "X-Content-Type-Options": "nosniff",
        ]
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: fields) else {
            task.didFailWithError(URLError(.badServerResponse))
            return
        }
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
    }
}

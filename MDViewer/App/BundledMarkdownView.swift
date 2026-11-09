import Foundation
import OSLog
import SwiftUI

struct BundledMarkdownView: View {
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "", category: "BundledMarkdownView")
    private static let unavailableText = "This page could not be loaded."

    let resource: String

    private var text: String {
        guard let url = Bundle.main.url(forResource: resource, withExtension: "md") else {
            Self.logger.error("Bundled page \(resource, privacy: .public) is missing from the app bundle")
            return Self.unavailableText
        }
        do {
            return try String(contentsOf: url, encoding: .utf8)
        } catch {
            let cause = error as NSError
            Self.logger.error("Bundled page \(resource, privacy: .public) could not be read: \(cause.domain, privacy: .public) \(cause.code, privacy: .public)")
            return Self.unavailableText
        }
    }

    var body: some View {
        DocumentView(text: text)
    }
}

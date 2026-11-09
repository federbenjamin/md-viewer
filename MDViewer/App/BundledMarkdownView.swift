import Foundation
import SwiftUI

struct BundledMarkdownView: View {
    let resource: String

    private var text: String {
        guard
            let url = Bundle.main.url(forResource: resource, withExtension: "md"),
            let contents = try? String(contentsOf: url, encoding: .utf8)
        else {
            return "This page could not be loaded."
        }
        return contents
    }

    var body: some View {
        DocumentView(text: text)
    }
}

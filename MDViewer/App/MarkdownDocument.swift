import Foundation
import SwiftUI
import UniformTypeIdentifiers

nonisolated struct MarkdownDocument: FileDocument {
    static let contentType = UTType(importedAs: "net.daringfireball.markdown", conformingTo: .plainText)
    static let readableContentTypes = [contentType]

    let text: String

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        text = String(decoding: data, as: UTF8.self)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        throw CocoaError(.featureUnsupported)
    }
}

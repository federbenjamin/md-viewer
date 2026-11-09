import Foundation
import SwiftUI
#if os(iOS)
import UIKit
#endif

@main
struct MDViewerApp: App {
    var body: some Scene {
        #if os(macOS)
        Window(Bundle.main.displayName, id: "welcome") {
            WelcomeView()
        }
        #endif

        DocumentGroup(viewing: MarkdownDocument.self) { file in
            // The web view reads its text once, so a change on disk needs a new one.
            DocumentView(text: file.document.text)
                .id(file.document.text)
        }

        #if os(iOS)
        DocumentGroupLaunchScene(LocalizedStringResource(stringLiteral: Bundle.main.displayName)) {
        } background: {
            Color(uiColor: .systemGroupedBackground)
        } overlayAccessoryView: { geometry in
            WelcomeView()
                .position(x: geometry.frame.midX, y: geometry.frame.minY + 64)
        }
        #endif
    }
}

extension Bundle {
    var displayName: String {
        object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Markdown"
    }
}

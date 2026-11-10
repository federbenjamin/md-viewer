import Foundation
import SwiftUI
#if os(iOS)
import UIKit
#endif

@main
struct MDViewerApp: App {
    #if os(iOS)
    @State private var shownScreen: AppScreen?
    #endif

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
        // The launch scene's accessory views are decorative and take no taps, so the screens are its actions; actions replace the default Create Document.
        DocumentGroupLaunchScene(LocalizedStringResource(stringLiteral: Bundle.main.displayName)) {
            ForEach(AppScreen.allCases) { screen in
                Button(screen.title) {
                    shownScreen = screen
                }
            }
        } background: {
            Color(uiColor: .systemGroupedBackground)
                .sheet(item: $shownScreen) { screen in
                    AppScreenSheet(screen: screen)
                }
        }
        #endif
    }
}

extension Bundle {
    var displayName: String {
        object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Markdown"
    }
}

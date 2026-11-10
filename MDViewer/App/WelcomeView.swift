import Foundation
import SwiftUI
#if os(macOS)
import AppKit
#endif

enum AppScreen: CaseIterable, Identifiable {
    case setup, licences, privacy

    var id: Self { self }

    var title: String {
        switch self {
        case .setup: "Setup"
        case .licences: "Licences"
        case .privacy: "Privacy"
        }
    }

    @ViewBuilder var content: some View {
        switch self {
        case .setup: SetupView()
        case .licences: BundledMarkdownView(resource: "THIRD_PARTY_NOTICES")
        case .privacy: BundledMarkdownView(resource: "PRIVACY")
        }
    }
}

#if os(macOS)
struct WelcomeView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text(Bundle.main.displayName)
                    .font(.largeTitle)
                Button("Open…") {
                    NSDocumentController.shared.openDocument(nil)
                }
                .keyboardShortcut(.defaultAction)
                ForEach(AppScreen.allCases) { screen in
                    NavigationLink(screen.title) {
                        screen.content
                            .navigationTitle(screen.title)
                    }
                }
            }
            .padding(32)
        }
        .frame(minWidth: 480, minHeight: 400)
    }
}
#else
struct AppScreenSheet: View {
    @Environment(\.dismiss) private var dismiss
    let screen: AppScreen

    var body: some View {
        NavigationStack {
            screen.content
                .navigationTitle(screen.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") {
                            dismiss()
                        }
                    }
                }
        }
    }
}
#endif

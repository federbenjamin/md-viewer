import Foundation
import SwiftUI
#if os(macOS)
import SafariServices
#endif

struct SetupView: View {
    #if os(macOS)
    @State private var couldNotOpenSettings = false
    #endif

    private var steps: [String] {
        let name = Bundle.main.displayName
        #if os(macOS)
        return [
            "In Safari, choose Safari > Settings > Extensions.",
            "Turn on \(name).",
            "For an unsigned build, first turn on Develop > Allow Unsigned Extensions.",
            "Open a Markdown page and allow \(name) on that site.",
        ]
        #else
        return [
            "Open Settings > Apps > Safari > Extensions.",
            "Turn on \(name).",
            "Open a Markdown page in Safari and allow \(name) on that site.",
        ]
        #endif
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                Text("\(index + 1). \(step)")
            }
            #if os(macOS)
            Button("Open Safari Extension Settings", action: openSettings)
            if couldNotOpenSettings {
                Text("Safari could not open this extension's settings. Follow the steps above instead.")
                    .foregroundStyle(.secondary)
            }
            #endif
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    #if os(macOS)
    private func openSettings() {
        Task {
            do {
                try await SFSafariApplication.showPreferencesForExtension(
                    withIdentifier: Bundle.main.bundleIdentifier! + ".Extension"
                )
                couldNotOpenSettings = false
            } catch {
                couldNotOpenSettings = true
            }
        }
    }
    #endif
}

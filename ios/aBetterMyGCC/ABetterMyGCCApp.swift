import SwiftUI

@main
struct ABetterMyGCCApp: App {
    @StateObject private var browser = BrowserModel()

    var body: some Scene {
        WindowGroup {
            BrowserView(model: browser)
                .tint(.gccAccent)
        }
    }
}

extension Color {
    /// GCC crimson, lifted in dark mode so it stays readable.
    static let gccAccent = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.96, green: 0.47, blue: 0.44, alpha: 1)
            : UIColor(red: 0.65, green: 0.0, blue: 0.0, alpha: 1)
    })
}

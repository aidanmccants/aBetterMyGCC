import SafariServices
import SwiftUI
import WebKit

/// Puts an existing WKWebView (owned by a model) into SwiftUI.
struct WebViewContainer: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

struct IdentifiedURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

// MARK: - JavaScript alert / confirm / prompt

/// A JavaScript dialog waiting for an answer. myGCC uses confirm() before
/// dropping courses, so these must always be answered exactly once.
struct WebDialog: Identifiable {
    enum Kind {
        case alert
        case confirm
        case prompt(defaultText: String)
    }

    let id = UUID()
    let title: String
    let message: String
    let kind: Kind
    /// (OK pressed, text for prompts)
    let finish: (Bool, String?) -> Void
}

private struct WebDialogModifier: ViewModifier {
    @Binding var dialog: WebDialog?
    @State private var text = ""

    func body(content: Content) -> some View {
        content
            .alert(dialog?.title ?? "", isPresented: isPresented, presenting: dialog) { d in
                switch d.kind {
                case .alert:
                    Button("OK") { answer(d, ok: true) }
                case .confirm:
                    Button("Cancel", role: .cancel) { answer(d, ok: false) }
                    Button("OK") { answer(d, ok: true) }
                case .prompt:
                    TextField("", text: $text)
                    Button("Cancel", role: .cancel) { answer(d, ok: false) }
                    Button("OK") { answer(d, ok: true) }
                }
            } message: { d in
                Text(d.message)
            }
            .onChange(of: dialog?.id) { _ in
                if case .prompt(let initial)? = dialog?.kind { text = initial }
            }
    }

    private var isPresented: Binding<Bool> {
        Binding(get: { dialog != nil }, set: { shown in
            // Dismissed without a button: answer "cancel". Deferred, because SwiftUI can
            // report the dismissal before the tapped button's action runs.
            if !shown, let d = dialog { DispatchQueue.main.async { answer(d, ok: false) } }
        })
    }

    private func answer(_ d: WebDialog, ok: Bool) {
        guard dialog?.id == d.id else { return }
        dialog = nil
        d.finish(ok, ok ? text : nil)
    }
}

extension View {
    func webDialogs(_ dialog: Binding<WebDialog?>) -> some View {
        modifier(WebDialogModifier(dialog: dialog))
    }
}

// MARK: - Downloads (Download CSV, attachments)

final class DownloadManager: NSObject, WKDownloadDelegate {
    var onFinish: ((URL) -> Void)?
    var onError: ((String) -> Void)?
    private var destinations: [ObjectIdentifier: URL] = [:]

    func track(_ download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(suggestedFilename.isEmpty ? "download" : suggestedFilename)
        destinations[ObjectIdentifier(download)] = url
        completionHandler(url)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = destinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        onFinish?(url)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        destinations.removeValue(forKey: ObjectIdentifier(download))
        onError?(error.localizedDescription)
    }
}

// MARK: - Hosts

/// GCC's own sites stay inside the app.
func isCollegeHost(_ host: String?) -> Bool {
    guard let host = host?.lowercased() else { return false }
    return host == "gcc.edu" || host.hasSuffix(".gcc.edu")
}

/// Sign-in providers myGCC may send you through. They stay in the app so the
/// sign-in cookie lands in the app's web view.
func isSignInHost(_ host: String?) -> Bool {
    guard let host = host?.lowercased() else { return false }
    let providers = ["microsoftonline.com", "microsoft.com", "live.com", "msauth.net", "msftauth.net",
                     "okta.com", "duosecurity.com", "duo.com", "google.com", "gstatic.com"]
    return providers.contains { host == $0 || host.hasSuffix("." + $0) }
}

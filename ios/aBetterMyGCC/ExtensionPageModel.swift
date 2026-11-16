import SwiftUI
import WebKit

/// Owns the web view for one extension page (popup, Settings, demo, log).
final class ExtensionPageModel: NSObject, ObservableObject {
    let url: URL
    let webView: WKWebView

    @Published var title = "aBetterMyGCC"
    @Published var dialog: WebDialog?
    @Published var share: IdentifiedURL?

    var onOpenWebURL: ((URL) -> Void)?
    var onClose: (() -> Void)?

    private var titleObservation: NSKeyValueObservation?
    private let downloads = DownloadManager()

    init(url: URL, host: ExtensionHost) {
        self.url = url
        webView = WKWebView(frame: .zero, configuration: host.makeExtensionPageConfiguration())
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        host.register(webView, world: .page)

        downloads.onFinish = { [weak self] file in self?.share = IdentifiedURL(url: file) }
        titleObservation = webView.observe(\.title, options: [.new]) { [weak self] wv, _ in
            if let t = wv.title, !t.isEmpty { self?.title = t }
        }
        webView.load(URLRequest(url: url))
    }

    fileprivate func openOutside(_ url: URL) {
        if let open = onOpenWebURL { open(url) } else { UIApplication.shared.open(url) }
    }
}

extension ExtensionPageModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.allow); return }
        switch url.scheme?.lowercased() ?? "" {
        case ExtensionHost.scheme, "about", "blob", "data", "javascript", "":
            decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
        case "http", "https":
            if navigationAction.targetFrame?.isMainFrame == false {
                decisionHandler(.allow) // a frame inside the page
            } else {
                decisionHandler(.cancel)
                openOutside(url)
            }
        default:
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
        }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        downloads.track(download)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        downloads.track(download)
    }
}

extension ExtensionPageModel: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        switch url.scheme?.lowercased() ?? "" {
        case "http", "https": openOutside(url)
        case ExtensionHost.scheme, "about", "blob", "data", "": webView.load(navigationAction.request)
        default: UIApplication.shared.open(url)
        }
        return nil
    }

    func webViewDidClose(_ webView: WKWebView) {
        onClose?()
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        ask(.alert, message) { _, _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        ask(.confirm, message) { ok, _ in completionHandler(ok) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        ask(.prompt(defaultText: defaultText ?? ""), prompt) { _, text in completionHandler(text) }
    }

    private func ask(_ kind: WebDialog.Kind, _ message: String, finish: @escaping (Bool, String?) -> Void) {
        guard dialog == nil else { finish(false, nil); return }
        dialog = WebDialog(title: "aBetterMyGCC", message: message, kind: kind, finish: finish)
    }
}

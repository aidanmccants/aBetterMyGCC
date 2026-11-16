import SwiftUI
import WebKit

/// Owns the main myGCC web view and everything it asks the UI to do.
final class BrowserModel: NSObject, ObservableObject {
    static let homeURL = URL(string: "https://my.gcc.edu/ICS/")!

    let host = ExtensionHost.shared
    let webView: WKWebView

    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var isLoading = false
    @Published var progress: Double = 0
    @Published var sheet: BrowserSheet?
    @Published var dialog: WebDialog?

    private var observations: [NSKeyValueObservation] = []
    private let downloads = DownloadManager()

    override init() {
        webView = WKWebView(frame: .zero, configuration: ExtensionHost.shared.makeBrowserConfiguration())
        super.init()
        host.delegate = self

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        if #available(iOS 16.4, *) { webView.isInspectable = true }

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(pulledToRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        host.register(webView, world: host.contentWorld)
        // The background page lives (hidden) inside the main web view so its timers keep running.
        host.startBackground(in: webView)

        downloads.onFinish = { [weak self] url in self?.present(.share(url)) }
        downloads.onError = { [weak self] message in self?.showMessage("The download failed: \(message)") }

        observations = [
            webView.observe(\.canGoBack, options: [.initial, .new]) { [weak self] wv, _ in self?.canGoBack = wv.canGoBack },
            webView.observe(\.canGoForward, options: [.initial, .new]) { [weak self] wv, _ in self?.canGoForward = wv.canGoForward },
            webView.observe(\.estimatedProgress, options: [.new]) { [weak self] wv, _ in self?.progress = wv.estimatedProgress },
            webView.observe(\.isLoading, options: [.new]) { [weak self] wv, _ in
                self?.isLoading = wv.isLoading
                if !wv.isLoading { wv.scrollView.refreshControl?.endRefreshing() }
            },
        ]

        if UserDefaults.standard.bool(forKey: "gccxSkipWelcome") { skipWelcomeForScreenshots() }
        webView.load(URLRequest(url: Self.homeURL))
        openLaunchScreenIfRequested()
    }

    // MARK: Actions

    func goHome() { webView.load(URLRequest(url: Self.homeURL)) }

    func reload() {
        if webView.url == nil || webView.url?.scheme == "about" { goHome() } else { webView.reload() }
    }

    @objc private func pulledToRefresh() { reload() }

    func showSettings() {
        if let url = host.popupPageURL { openExtensionPage(url, compact: true) }
    }

    func openExtensionPage(_ url: URL, compact: Bool = false) {
        let page = ExtensionPageModel(url: url, host: host)
        page.onOpenWebURL = { [weak self] link in self?.openWebURL(link) }
        page.onClose = { [weak self, weak page] in
            guard let self = self, case .extensionPage(let shown, _)? = self.sheet, shown === page else { return }
            self.sheet = nil
        }
        present(.extensionPage(page, compact: compact))
    }

    func openWebURL(_ url: URL) {
        if isCollegeHost(url.host) || isSignInHost(url.host) {
            sheet = nil
            webView.load(URLRequest(url: url))
        } else if url.scheme == "http" || url.scheme == "https" {
            present(.safari(url))
        } else {
            UIApplication.shared.open(url)
        }
    }

    /// Shows a sheet, replacing (after it animates away) any sheet already up.
    func present(_ next: BrowserSheet) {
        guard sheet != nil else { sheet = next; return }
        sheet = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { [weak self] in self?.sheet = next }
    }

    private func showMessage(_ message: String) {
        dialog = WebDialog(title: "aBetterMyGCC", message: message, kind: .alert) { _, _ in }
    }

    /// For screenshots: `-gccxSkipWelcome YES` marks the welcome screen as seen,
    /// on myGCC and in the demo, so pages are visible.
    private func skipWelcomeForScreenshots() {
        UserDefaults.standard.set(host.version, forKey: "gccx.installedVersion")
        _ = host.storage.set(["onboarding": "done", "demo:onboarding": "done",
                              "whatsnewSeen": host.version, "demo:whatsnewSeen": host.version])
    }

    /// For screenshots and testing: `-gccxOpen settings|options|demo|<extension path>`
    /// opens that page in a sheet once the first page has loaded.
    private var launchTarget: String?

    private func openLaunchScreenIfRequested() {
        launchTarget = UserDefaults.standard.string(forKey: "gccxOpen")
        // Fallback in case myGCC is slow or unreachable.
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in self?.openLaunchTarget() }
    }

    fileprivate func openLaunchTarget() {
        guard let target = launchTarget else { return }
        launchTarget = nil
        switch target {
        case "settings": showSettings()
        case "options": if let url = host.optionsPageURL { openExtensionPage(url) }
        default:
            if let url = URL(string: ExtensionHost.baseURL + (target == "demo" ? "demo/index.html" : target)) {
                openExtensionPage(url)
            }
        }
    }

    private func showLoadError(_ error: Error, for url: URL?) {
        let escape = { (s: String) in
            s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
                .replacingOccurrences(of: "\"", with: "&quot;")
        }
        let target = escape((url ?? Self.homeURL).absoluteString)
        let html = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="light dark"><style>
        body{font:17px -apple-system,system-ui,sans-serif;margin:0;padding:64px 28px;text-align:center;color:CanvasText;background:Canvas}
        h1{font-size:22px;margin:0 0 8px} p{opacity:.7;line-height:1.4}
        a{display:inline-block;margin-top:18px;padding:12px 24px;border-radius:12px;background:#a60000;color:#fff;text-decoration:none;font-weight:600}
        </style></head><body><h1>Can't reach myGCC</h1><p>\(escape(error.localizedDescription))</p><a href="\(target)">Try again</a></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}

// MARK: - Requests from the extension

extension BrowserModel: ExtensionHostDelegate {
    func extensionHost(_ host: ExtensionHost, openExtensionPage url: URL) {
        openExtensionPage(url)
    }

    func extensionHost(_ host: ExtensionHost, openWebURL url: URL) {
        openWebURL(url)
    }

    func extensionHost(_ host: ExtensionHost, closePageIn webView: WKWebView) {
        if case .extensionPage(let page, _)? = sheet, page.webView === webView { sheet = nil }
    }
}

// MARK: - Navigation

extension BrowserModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.allow); return }
        switch url.scheme?.lowercased() ?? "" {
        case "http", "https", "about", "blob", "data", "javascript", "":
            decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
        case ExtensionHost.scheme:
            decisionHandler(.cancel)
            openExtensionPage(url)
        default:
            // mailto:, tel:, tg:, sms:, App Store links…
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let disposition = (navigationResponse.response as? HTTPURLResponse)?
            .value(forHTTPHeaderField: "Content-Disposition")?.lowercased() ?? ""
        let download = !navigationResponse.canShowMIMEType || disposition.hasPrefix("attachment")
        decisionHandler(download ? .download : .allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        downloads.track(download)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        downloads.track(download)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if launchTarget != nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.openLaunchTarget() }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handle(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handle(error)
    }

    private func handle(_ error: Error) {
        let ns = error as NSError
        // Cancelled loads and "frame load interrupted" (downloads, app links) are not failures.
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        if ns.domain == "WebKitErrorDomain" && (ns.code == 102 || ns.code == 204) { return }
        showLoadError(error, for: ns.userInfo[NSURLErrorFailingURLErrorKey] as? URL ?? webView.url)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

// MARK: - New windows and JavaScript dialogs

extension BrowserModel: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // target=_blank and window.open: myGCC opens here, other sites in Safari.
        guard let url = navigationAction.request.url else { return nil }
        switch url.scheme?.lowercased() ?? "" {
        case "http", "https": openWebURL(url)
        case ExtensionHost.scheme: openExtensionPage(url)
        case "", "about", "blob", "data", "javascript": webView.load(navigationAction.request)
        default: UIApplication.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        ask(.alert, message, frame) { _, _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        ask(.confirm, message, frame) { ok, _ in completionHandler(ok) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        ask(.prompt(defaultText: defaultText ?? ""), prompt, frame) { _, text in completionHandler(text) }
    }

    private func ask(_ kind: WebDialog.Kind, _ message: String, _ frame: WKFrameInfo,
                     finish: @escaping (Bool, String?) -> Void) {
        // An alert can't show over a sheet or another alert; answer "cancel" rather than hang the page.
        guard sheet == nil, dialog == nil else { finish(false, nil); return }
        dialog = WebDialog(title: frame.request.url?.host ?? "myGCC", message: message, kind: kind, finish: finish)
    }
}

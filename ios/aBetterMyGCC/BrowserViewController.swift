import UIKit
import WebKit

/// The main screen: myGCC in a web view with the extension running inside it,
/// plus a small toolbar (back, forward, home, reload, extension settings).
final class BrowserViewController: UIViewController {
    static let homeURL = URL(string: "https://my.gcc.edu/ICS/")!

    private let host = ExtensionHost.shared
    private var webView: WKWebView!
    private let progress = UIProgressView(progressViewStyle: .bar)
    private let toolbar = UIToolbar()
    private var backItem: UIBarButtonItem!
    private var forwardItem: UIBarButtonItem!
    private var observations: [NSKeyValueObservation] = []
    private lazy var ui = WebUI(presenter: self)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        host.delegate = self

        webView = WKWebView(frame: .zero, configuration: host.makeBrowserConfiguration())
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = true
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        if #available(iOS 16.4, *) {
            #if DEBUG
            webView.isInspectable = true
            #endif
        }
        host.register(webView, world: host.contentWorld)
        ui.downloadSourceView = view

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(pullToRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        backItem = UIBarButtonItem(image: UIImage(systemName: "chevron.backward"), style: .plain, target: self, action: #selector(goBack))
        backItem.accessibilityLabel = "Back"
        forwardItem = UIBarButtonItem(image: UIImage(systemName: "chevron.forward"), style: .plain, target: self, action: #selector(goForward))
        forwardItem.accessibilityLabel = "Forward"
        let home = UIBarButtonItem(image: UIImage(systemName: "house"), style: .plain, target: self, action: #selector(goHome))
        home.accessibilityLabel = "myGCC home"
        let reload = UIBarButtonItem(image: UIImage(systemName: "arrow.clockwise"), style: .plain, target: self, action: #selector(reloadPage))
        reload.accessibilityLabel = "Reload"
        let settings = UIBarButtonItem(image: UIImage(systemName: "slider.horizontal.3"), style: .plain, target: self, action: #selector(showSettings))
        settings.accessibilityLabel = "aBetterMyGCC settings"
        let flex = { UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil) }
        toolbar.items = [backItem, flex(), forwardItem, flex(), home, flex(), reload, flex(), settings]

        progress.trackTintColor = .clear
        progress.isUserInteractionEnabled = false

        for v in [webView!, toolbar, progress] as [UIView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(v)
        }
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: toolbar.topAnchor),

            toolbar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            toolbar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),

            progress.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progress.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progress.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        // Fill the strip under the toolbar (home indicator area) with the toolbar's color.
        let underlay = UIView()
        underlay.translatesAutoresizingMaskIntoConstraints = false
        underlay.backgroundColor = .secondarySystemBackground
        view.insertSubview(underlay, belowSubview: toolbar)
        toolbar.barTintColor = .secondarySystemBackground
        NSLayoutConstraint.activate([
            underlay.topAnchor.constraint(equalTo: toolbar.topAnchor),
            underlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            underlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            underlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        observations = [
            webView.observe(\.canGoBack, options: [.initial, .new]) { [weak self] wv, _ in self?.backItem.isEnabled = wv.canGoBack },
            webView.observe(\.canGoForward, options: [.initial, .new]) { [weak self] wv, _ in self?.forwardItem.isEnabled = wv.canGoForward },
            webView.observe(\.estimatedProgress, options: [.new]) { [weak self] wv, _ in self?.updateProgress(wv) },
            webView.observe(\.isLoading, options: [.new]) { [weak self] wv, _ in self?.updateProgress(wv) },
        ]

        host.startBackground(in: view)
        webView.load(URLRequest(url: Self.homeURL))
    }

    private func updateProgress(_ wv: WKWebView) {
        progress.isHidden = !wv.isLoading
        progress.setProgress(Float(wv.estimatedProgress), animated: wv.isLoading)
        if !wv.isLoading { webView.scrollView.refreshControl?.endRefreshing() }
    }

    @objc private func goBack() { webView.goBack() }
    @objc private func goForward() { webView.goForward() }
    @objc private func goHome() { webView.load(URLRequest(url: Self.homeURL)) }
    @objc private func reloadPage() {
        if webView.url == nil || webView.url?.scheme == "about" { goHome() } else { webView.reload() }
    }
    @objc private func pullToRefresh(_ sender: UIRefreshControl) { reloadPage() }

    @objc private func showSettings() {
        if let url = host.popupPageURL { showExtensionPage(url, compact: true) }
    }

    private func showExtensionPage(_ url: URL, compact: Bool = false) {
        let show = { [weak self] in
            guard let self = self else { return }
            let page = ExtensionPageViewController(url: url, host: self.host)
            page.onOpenWebURL = { [weak self] link in self?.openWebURL(link) }
            let nav = UINavigationController(rootViewController: page)
            nav.modalPresentationStyle = .pageSheet
            if let sheet = nav.sheetPresentationController {
                sheet.detents = compact ? [.medium(), .large()] : [.large()]
                sheet.prefersGrabberVisible = true
            }
            self.present(nav, animated: true)
        }
        if let presented = presentedViewController { presented.dismiss(animated: true, completion: show) } else { show() }
    }

    private func openWebURL(_ url: URL) {
        let open = { [weak self] in
            guard let self = self else { return }
            if isCollegeHost(url.host) || isSignInHost(url.host) {
                self.webView.load(URLRequest(url: url))
            } else {
                self.ui.openInSafariView(url)
            }
        }
        if let presented = presentedViewController { presented.dismiss(animated: true, completion: open) } else { open() }
    }

    private func showLoadError(_ error: Error, for url: URL?) {
        let target = (url ?? Self.homeURL).absoluteString
            .replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "\"", with: "&quot;")
        let message = error.localizedDescription
            .replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
        let html = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="light dark"><style>
        body{font:17px -apple-system,system-ui,sans-serif;margin:0;padding:48px 24px;text-align:center;color:CanvasText;background:Canvas}
        h1{font-size:22px} p{opacity:.75} a{display:inline-block;margin-top:16px;padding:12px 22px;border-radius:12px;background:#a60000;color:#fff;text-decoration:none;font-weight:600}
        </style></head><body><h1>Can't reach myGCC</h1><p>\(message)</p><a href="\(target)">Try again</a></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}

// MARK: - Extension requests

extension BrowserViewController: ExtensionHostDelegate {
    func extensionHost(_ host: ExtensionHost, openExtensionPage url: URL) {
        showExtensionPage(url)
    }

    func extensionHost(_ host: ExtensionHost, openWebURL url: URL) {
        openWebURL(url)
    }

    func extensionHost(_ host: ExtensionHost, closePageIn webView: WKWebView) {
        guard let nav = presentedViewController as? UINavigationController,
              let page = nav.viewControllers.first as? ExtensionPageViewController,
              page.webView === webView else { return }
        nav.dismiss(animated: true)
    }
}

// MARK: - Navigation

extension BrowserViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else {
            decisionHandler(.allow); return
        }
        switch scheme {
        case "http", "https", "about", "blob", "data", "javascript":
            if #available(iOS 14.5, *), navigationAction.shouldPerformDownload {
                decisionHandler(.download); return
            }
            decisionHandler(.allow)
        case ExtensionHost.scheme:
            decisionHandler(.cancel)
            showExtensionPage(url)
        default:
            // mailto:, tel:, tg:, sms:, App Store links…
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if #available(iOS 14.5, *) {
            let disposition = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
            if !navigationResponse.canShowMIMEType || disposition.lowercased().hasPrefix("attachment") {
                decisionHandler(.download); return
            }
        }
        decisionHandler(.allow)
    }

    @available(iOS 14.5, *)
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        ui.track(download)
    }

    @available(iOS 14.5, *)
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        ui.track(download)
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
        let failing = (ns.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? webView.url
        showLoadError(error, for: failing)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

// MARK: - New windows and JavaScript dialogs

extension BrowserViewController: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // target=_blank and window.open: myGCC pages open here, anything else in Safari.
        if let url = navigationAction.request.url {
            switch url.scheme?.lowercased() {
            case "http", "https":
                openWebURL(url)
            case ExtensionHost.scheme:
                showExtensionPage(url)
            case nil, "about", "blob", "data", "javascript":
                webView.load(navigationAction.request)
            default:
                UIApplication.shared.open(url)
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        ui.alert(message: message, host: frame.request.url?.host, completion: completionHandler)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        ui.confirm(message: message, host: frame.request.url?.host, completion: completionHandler)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        ui.prompt(message: prompt, defaultText: defaultText, host: frame.request.url?.host, completion: completionHandler)
    }
}

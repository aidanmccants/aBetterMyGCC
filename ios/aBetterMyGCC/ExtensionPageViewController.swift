import UIKit
import WebKit

/// Shows one of the extension's own pages (popup, Settings, demo, log) in a sheet.
final class ExtensionPageViewController: UIViewController {
    let url: URL
    private let host: ExtensionHost
    private(set) var webView: WKWebView!
    private lazy var ui = WebUI(presenter: self)
    private var titleObservation: NSKeyValueObservation?
    var onOpenWebURL: ((URL) -> Void)?

    init(url: URL, host: ExtensionHost) {
        self.url = url
        self.host = host
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(done))

        webView = WKWebView(frame: .zero, configuration: host.makeExtensionPageConfiguration())
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        if #available(iOS 16.4, *) {
            #if DEBUG
            webView.isInspectable = true
            #endif
        }
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.register(webView, world: .page)
        ui.downloadSourceView = view
        titleObservation = webView.observe(\.title, options: [.initial, .new]) { [weak self] wv, _ in
            self?.title = (wv.title?.isEmpty == false) ? wv.title : "aBetterMyGCC"
        }
        webView.load(URLRequest(url: url))
    }

    @objc private func done() {
        dismiss(animated: true)
    }

    fileprivate func openOutside(_ url: URL) {
        if let handler = onOpenWebURL { handler(url) } else { ui.openInSafariView(url) }
    }
}

extension ExtensionPageViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.allow); return }
        switch url.scheme?.lowercased() {
        case ExtensionHost.scheme, "about", "blob", "data", "javascript":
            if #available(iOS 14.5, *), navigationAction.shouldPerformDownload {
                decisionHandler(.download); return
            }
            decisionHandler(.allow)
        case "http", "https":
            if navigationAction.targetFrame?.isMainFrame == false {
                decisionHandler(.allow) // iframes inside an extension page
            } else {
                decisionHandler(.cancel)
                openOutside(url)
            }
        default:
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
        }
    }

    @available(iOS 14.5, *)
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        ui.track(download)
    }

    @available(iOS 14.5, *)
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        ui.track(download)
    }
}

extension ExtensionPageViewController: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            switch url.scheme?.lowercased() {
            case "http", "https": openOutside(url)
            case ExtensionHost.scheme, "about", "blob", "data", nil: webView.load(navigationAction.request)
            default: UIApplication.shared.open(url)
            }
        }
        return nil
    }

    func webViewDidClose(_ webView: WKWebView) {
        dismiss(animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        ui.alert(message: message, host: nil, completion: completionHandler)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        ui.confirm(message: message, host: nil, completion: completionHandler)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        ui.prompt(message: prompt, defaultText: defaultText, host: nil, completion: completionHandler)
    }
}

import Foundation
import UIKit
import WebKit

/// What the extension asks the app's UI to do.
protocol ExtensionHostDelegate: AnyObject {
    /// Show one of the extension's own pages (popup, options, demo, logs).
    func extensionHost(_ host: ExtensionHost, openExtensionPage url: URL)
    /// Open a web address (myGCC in the main view, anything else in Safari).
    func extensionHost(_ host: ExtensionHost, openWebURL url: URL)
    /// An extension page called window.close().
    func extensionHost(_ host: ExtensionHost, closePageIn webView: WKWebView)
}

/// Runs the unmodified Chrome extension (bundled as `Extension/` in the app)
/// inside WKWebView:
/// - content scripts and CSS from manifest.json are injected into myGCC pages
///   in an isolated content world;
/// - the background service worker runs in a hidden web view;
/// - chrome.storage.local is one JSON file shared by every context;
/// - chrome.runtime.sendMessage is routed to the background context.
final class ExtensionHost: NSObject {
    static let shared = ExtensionHost()

    static let scheme = "gccx-extension"
    static let baseURL = "gccx-extension://ext/"
    static let handlerName = "gccx"

    let root: URL
    let manifest: [String: Any]
    let contentWorld = WKContentWorld.world(name: "aBetterMyGCC")
    let storage = ExtensionStorage()

    weak var delegate: ExtensionHostDelegate?

    private let shimTemplate: String
    private var backgroundWebView: WKWebView?
    private var backgroundReady = false
    private var backgroundQueue: [() -> Void] = []
    private var startupFired = false
    private var targets: [(view: WeakWebView, world: WKContentWorld)] = []
    private lazy var session: URLSession = URLSession(configuration: .ephemeral)

    private override init() {
        root = Bundle.main.resourceURL!.appendingPathComponent("Extension", isDirectory: true)
        let manifestData = (try? Data(contentsOf: root.appendingPathComponent("manifest.json"))) ?? Data("{}".utf8)
        manifest = ((try? JSONSerialization.jsonObject(with: manifestData)) as? [String: Any]) ?? [:]
        shimTemplate = (try? String(contentsOf: root.appendingPathComponent("__ios/shim.js"), encoding: .utf8)) ?? ""
        super.init()
    }

    var version: String { manifest["version"] as? String ?? "0" }

    var optionsPageURL: URL? {
        let page = (manifest["options_ui"] as? [String: Any])?["page"] as? String ?? manifest["options_page"] as? String
        return page.flatMap { URL(string: Self.baseURL + $0) }
    }

    var popupPageURL: URL? {
        let action = (manifest["action"] as? [String: Any]) ?? (manifest["browser_action"] as? [String: Any])
        return (action?["default_popup"] as? String).flatMap { URL(string: Self.baseURL + $0) }
    }

    // MARK: - Configurations

    /// Configuration for the main browser: myGCC with the content scripts injected.
    func makeBrowserConfiguration() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = "Version/17.0 Mobile/15E148 Safari/604.1"
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
        }
        let ucc = config.userContentController
        ucc.addScriptMessageHandler(self, contentWorld: contentWorld, name: Self.handlerName)

        let groups = manifest["content_scripts"] as? [[String: Any]] ?? []
        let matches = groups.map { $0["matches"] as? [String] ?? [] }
        ucc.addUserScript(WKUserScript(source: shim(context: "content", extra: ["groups": matches]),
                                       injectionTime: .atDocumentStart, forMainFrameOnly: false, in: contentWorld))

        var mobileCSSAdded = false
        for (index, group) in groups.enumerated() {
            let allFrames = group["all_frames"] as? Bool ?? false
            let runAt = group["run_at"] as? String ?? "document_idle"
            let time: WKUserScriptInjectionTime = runAt == "document_start" ? .atDocumentStart : .atDocumentEnd
            let gate = "if (!(globalThis.__gccxRun && globalThis.__gccxRun[\(index)])) throw new Error('aBetterMyGCC: not for this page');\n"

            var cssList: [[String: String]] = (group["css"] as? [String] ?? []).compactMap { path in
                readText(path).map { ["name": path, "css": $0] }
            }
            if !cssList.isEmpty && !mobileCSSAdded, let mobile = readText("__ios/mobile.css") {
                cssList.append(["name": "__ios/mobile.css", "css": mobile])
                mobileCSSAdded = true
            }
            if !cssList.isEmpty {
                let source = gate + "globalThis.__gccxInjectCSS(\(jsonString(cssList)));"
                ucc.addUserScript(WKUserScript(source: source, injectionTime: time, forMainFrameOnly: !allFrames, in: contentWorld))
            }
            for path in group["js"] as? [String] ?? [] {
                guard let text = readText(path) else { continue }
                let source = gate + text + "\n//# sourceURL=\(Self.baseURL)\(path)"
                ucc.addUserScript(WKUserScript(source: source, injectionTime: time, forMainFrameOnly: !allFrames, in: contentWorld))
            }
        }
        return config
    }

    /// Configuration for the extension's own pages and the background context.
    func makeExtensionPageConfiguration(context: String = "page") -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.setURLSchemeHandler(ExtensionSchemeHandler(host: self), forURLScheme: Self.scheme)
        let ucc = config.userContentController
        ucc.addScriptMessageHandler(self, contentWorld: .page, name: Self.handlerName)
        ucc.addUserScript(WKUserScript(source: shim(context: context, extra: [:]),
                                       injectionTime: .atDocumentStart, forMainFrameOnly: false, in: .page))
        return config
    }

    /// Registers a web view so it hears chrome.storage.onChanged.
    func register(_ webView: WKWebView, world: WKContentWorld) {
        targets.removeAll { $0.view.value == nil || $0.view.value === webView }
        targets.append((WeakWebView(webView), world))
    }

    private func shim(context: String, extra: [String: Any]) -> String {
        var config: [String: Any] = ["context": context, "manifest": manifest, "base": Self.baseURL]
        config.merge(extra) { $1 }
        return shimTemplate.replacingOccurrences(of: "/*__GCCX_CONFIG__*/ null", with: jsonString(config))
    }

    // MARK: - Background context

    /// Starts the background page in a hidden web view inside `container`.
    /// It has to be in the view hierarchy so its timers keep running.
    func startBackground(in container: UIView) {
        if let bg = backgroundWebView {
            if bg.superview !== container { container.addSubview(bg) }
            return
        }
        let bg = WKWebView(frame: CGRect(x: 0, y: 0, width: 1, height: 1), configuration: makeExtensionPageConfiguration(context: "background"))
        bg.alpha = 0
        bg.isUserInteractionEnabled = false
        bg.isAccessibilityElement = false
        bg.navigationDelegate = self
        container.addSubview(bg)
        backgroundWebView = bg
        register(bg, world: .page)
        loadBackground()
    }

    private func loadBackground() {
        backgroundReady = false
        backgroundWebView?.load(URLRequest(url: URL(string: Self.baseURL + "__background.html")!))
    }

    /// The service worker as a page: its importScripts() files, then itself.
    func backgroundHTML() -> String {
        let worker = (manifest["background"] as? [String: Any])?["service_worker"] as? String ?? ""
        var scripts: [String] = []
        if let source = readText(worker) {
            let dir = (worker as NSString).deletingLastPathComponent
            let callRegex = try! NSRegularExpression(pattern: #"importScripts\(([^)]*)\)"#)
            let nameRegex = try! NSRegularExpression(pattern: #"['"]([^'"]+)['"]"#)
            let ns = source as NSString
            for call in callRegex.matches(in: source, range: NSRange(location: 0, length: ns.length)) {
                let args = ns.substring(with: call.range(at: 1)) as NSString
                for name in nameRegex.matches(in: args as String, range: NSRange(location: 0, length: args.length)) {
                    let file = args.substring(with: name.range(at: 1))
                    scripts.append(dir.isEmpty ? file : dir + "/" + file)
                }
            }
            scripts.append(worker)
        }
        let tags = scripts.map { "<script src=\"/\($0)\"></script>" }.joined(separator: "\n")
        return "<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>aBetterMyGCC background</title></head><body>\n\(tags)\n</body></html>"
    }

    private func whenBackgroundReady(_ work: @escaping () -> Void) {
        if backgroundReady { work() } else { backgroundQueue.append(work) }
    }

    private func fireLifecycleEvents() {
        guard let bg = backgroundWebView else { return }
        let defaults = UserDefaults.standard
        let previous = defaults.string(forKey: "gccx.installedVersion")
        var events: [(String, [String: Any])] = []
        if !startupFired { events.append(("onStartup", [:])) }
        if previous == nil {
            events.append(("onInstalled", ["reason": "install"]))
        } else if previous != version {
            events.append(("onInstalled", ["reason": "update", "previousVersion": previous!]))
        }
        startupFired = true
        defaults.set(version, forKey: "gccx.installedVersion")
        for (name, detail) in events {
            bg.callAsyncJavaScript("window.__gccxBg && window.__gccxBg.fire(n, d);",
                                   arguments: ["n": name, "d": jsonString(detail)], in: nil, in: .page, completionHandler: nil)
        }
    }

    func sendToBackground(_ message: Any, sender: [String: Any], completion: @escaping (String?) -> Void) {
        whenBackgroundReady { [weak self] in
            guard let bg = self?.backgroundWebView else { completion(nil); return }
            bg.callAsyncJavaScript("return await window.__gccxBg.dispatch(m, s);",
                                   arguments: ["m": jsonString(message), "s": jsonString(sender)],
                                   in: nil, in: .page) { result in
                if case .success(let value) = result { completion(value as? String) } else { completion(nil) }
            }
        }
    }

    // MARK: - Storage change broadcast

    private func broadcast(_ changes: [String: Any]) {
        guard !changes.isEmpty else { return }
        let json = jsonString(changes)
        targets.removeAll { $0.view.value == nil }
        for target in targets {
            target.view.value?.callAsyncJavaScript("if (globalThis.__gccxStorageChanged) globalThis.__gccxStorageChanged(c);",
                                                   arguments: ["c": json], in: nil, in: target.world, completionHandler: nil)
        }
    }

    // MARK: - Files

    func readData(_ path: String) -> Data? {
        let clean = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let file = root.appendingPathComponent(clean).standardizedFileURL
        let base = root.standardizedFileURL.path.hasSuffix("/") ? root.standardizedFileURL.path : root.standardizedFileURL.path + "/"
        guard file.path.hasPrefix(base) else { return nil }
        return try? Data(contentsOf: file)
    }

    func readText(_ path: String) -> String? {
        readData(path).flatMap { String(data: $0, encoding: .utf8) }
    }

    /// Body and MIME type for a gccx-extension:// URL.
    func resource(for url: URL) -> (Data, String)? {
        let path = url.path
        if path == "/__background.html" {
            return (Data(backgroundHTML().utf8), "text/html; charset=utf-8")
        }
        guard let data = readData(path) else { return nil }
        return (data, Self.mimeType(for: path))
    }

    static func mimeType(for path: String) -> String {
        switch (path as NSString).pathExtension.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs", "cjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "md", "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }

    // MARK: - Network requests for the background and extension pages

    private func performFetch(_ request: [String: Any], completion: @escaping (String) -> Void) {
        guard let urlString = request["url"] as? String, let url = URL(string: urlString) else {
            completion(jsonString(["error": "Bad URL"])); return
        }
        if url.scheme == Self.scheme {
            if let found = resource(for: url) {
                completion(jsonString(["status": 200, "statusText": "OK", "headers": ["content-type": found.1], "body": found.0.base64EncodedString()]))
            } else {
                completion(jsonString(["status": 404, "statusText": "Not Found", "headers": [:] as [String: String], "body": ""]))
            }
            return
        }
        guard url.scheme == "https" || url.scheme == "http" else {
            completion(jsonString(["error": "Unsupported URL scheme"])); return
        }
        var req = URLRequest(url: url, timeoutInterval: 600)
        req.httpMethod = request["method"] as? String ?? "GET"
        for (key, value) in request["headers"] as? [String: String] ?? [:] {
            req.setValue(value, forHTTPHeaderField: key)
        }
        if let body = request["body"] as? String { req.httpBody = Data(body.utf8) }
        session.dataTask(with: req) { data, response, error in
            let reply: String
            if let error = error {
                reply = jsonString(["error": error.localizedDescription])
            } else {
                let http = response as? HTTPURLResponse
                var headers: [String: String] = [:]
                for (k, v) in http?.allHeaderFields ?? [:] { headers[String(describing: k).lowercased()] = String(describing: v) }
                let status = http?.statusCode ?? 200
                reply = jsonString([
                    "status": status,
                    "statusText": HTTPURLResponse.localizedString(forStatusCode: status),
                    "headers": headers,
                    "body": (data ?? Data()).base64EncodedString(),
                ])
            }
            DispatchQueue.main.async { completion(reply) }
        }.resume()
    }
}

// MARK: - Messages from the injected shim

extension ExtensionHost: WKScriptMessageHandlerWithReply {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        let reply: (Any?) -> Void = { value in DispatchQueue.main.async { replyHandler(value, nil) } }
        guard let text = message.body as? String,
              let object = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
              let op = object["op"] as? String else {
            replyHandler(nil, "Bad message"); return
        }
        let fromContent = message.world.name == contentWorld.name

        switch op {
        case "storage.get":
            reply(jsonString(storage.get(object["keys"] as? [String])))
        case "storage.set":
            broadcast(storage.set(object["items"] as? [String: Any] ?? [:]))
            reply(nil)
        case "storage.remove":
            broadcast(storage.remove(object["keys"] as? [String] ?? []))
            reply(nil)
        case "storage.clear":
            broadcast(storage.clear())
            reply(nil)
        case "runtime.sendMessage":
            let frameURL = message.frameInfo.request.url?.absoluteString ?? ""
            var sender: [String: Any] = ["url": frameURL, "id": "abettermygcc-ios", "frameId": message.frameInfo.isMainFrame ? 0 : 1]
            if fromContent { sender["tab"] = ["id": 1, "url": message.webView?.url?.absoluteString ?? frameURL] }
            sendToBackground(object["message"] ?? NSNull(), sender: sender) { reply($0) }
        case "openOptions":
            if let url = optionsPageURL { delegate?.extensionHost(self, openExtensionPage: url) }
            reply(nil)
        case "openURL":
            if let raw = object["url"] as? String {
                let url = URL(string: raw, relativeTo: URL(string: Self.baseURL))?.absoluteURL
                if let url = url {
                    if url.scheme == Self.scheme { delegate?.extensionHost(self, openExtensionPage: url) }
                    else { delegate?.extensionHost(self, openWebURL: url) }
                }
            }
            reply(nil)
        case "console":
            NSLog("[gccx %@ %@] %@ — %@", object["context"] as? String ?? "?", object["level"] as? String ?? "log",
                  object["message"] as? String ?? "", object["url"] as? String ?? "")
            reply(nil)
        case "closePage":
            if let webView = message.webView { delegate?.extensionHost(self, closePageIn: webView) }
            reply(nil)
        case "fetch":
            // Only the extension's own pages and background may make requests through the app.
            if fromContent { replyHandler(nil, "Not allowed"); return }
            performFetch(object) { reply($0) }
        default:
            replyHandler(nil, "Unknown operation \(op)")
        }
    }
}

// MARK: - Background page lifecycle

extension ExtensionHost: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === backgroundWebView else { return }
        NSLog("[gccx] background page loaded")
        backgroundReady = true
        fireLifecycleEvents()
        let queued = backgroundQueue
        backgroundQueue.removeAll()
        queued.forEach { $0() }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        retryBackground(webView)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        retryBackground(webView)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard webView === backgroundWebView else { return }
        loadBackground()
    }

    private func retryBackground(_ webView: WKWebView) {
        guard webView === backgroundWebView else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.loadBackground() }
    }
}

// MARK: - gccx-extension:// scheme

final class ExtensionSchemeHandler: NSObject, WKURLSchemeHandler {
    private unowned let host: ExtensionHost

    init(host: ExtensionHost) { self.host = host }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL)); return
        }
        let (data, mime, status) = host.resource(for: url).map { ($0.0, $0.1, 200) }
            ?? (Data("Not found".utf8), "text/plain; charset=utf-8", 404)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": mime,
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
        ])!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

// MARK: - chrome.storage.local

/// One JSON file in Application Support, shared by every context.
final class ExtensionStorage {
    private var data: [String: Any] = [:]
    private let fileURL: URL
    private let queue = DispatchQueue(label: "gccx.storage", qos: .utility)

    init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("aBetterMyGCC", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("storage.json")
        if let raw = try? Data(contentsOf: fileURL),
           let object = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] {
            data = object
        }
    }

    func get(_ keys: [String]?) -> [String: Any] {
        guard let keys = keys else { return data }
        var out: [String: Any] = [:]
        for key in keys { if let value = data[key] { out[key] = value } }
        return out
    }

    func set(_ items: [String: Any]) -> [String: Any] {
        var changes: [String: Any] = [:]
        for (key, value) in items {
            let old = data[key]
            if let old = old, (old as AnyObject).isEqual(value) { continue }
            var change: [String: Any] = ["newValue": value]
            if let old = old { change["oldValue"] = old }
            changes[key] = change
            data[key] = value
        }
        if !changes.isEmpty { save() }
        return changes
    }

    func remove(_ keys: [String]) -> [String: Any] {
        var changes: [String: Any] = [:]
        for key in keys {
            if let old = data.removeValue(forKey: key) { changes[key] = ["oldValue": old] }
        }
        if !changes.isEmpty { save() }
        return changes
    }

    func clear() -> [String: Any] {
        var changes: [String: Any] = [:]
        for (key, old) in data { changes[key] = ["oldValue": old] }
        data.removeAll()
        save()
        return changes
    }

    private func save() {
        let snapshot = data
        let url = fileURL
        queue.async {
            if let raw = try? JSONSerialization.data(withJSONObject: snapshot) {
                try? raw.write(to: url, options: .atomic)
            }
        }
    }
}

// MARK: - Helpers

final class WeakWebView {
    weak var value: WKWebView?
    init(_ value: WKWebView) { self.value = value }
}

func jsonString(_ value: Any) -> String {
    guard JSONSerialization.isValidJSONObject([value]),
          let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]),
          let text = String(data: data, encoding: .utf8) else { return "null" }
    return text
}

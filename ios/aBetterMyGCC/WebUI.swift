import SafariServices
import UIKit
import WebKit

/// JavaScript alert/confirm/prompt panels and file downloads, shared by the
/// main browser and the extension page sheet. myGCC uses confirm() before
/// dropping courses, so these have to work.
final class WebUI: NSObject {
    weak var presenter: UIViewController?

    init(presenter: UIViewController) {
        self.presenter = presenter
    }

    private func present(_ vc: UIViewController) -> Bool {
        guard var top = presenter, top.viewIfLoaded?.window != nil else { return false }
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        top.present(vc, animated: true)
        return true
    }

    func alert(message: String, host: String?, completion: @escaping () -> Void) {
        let ac = UIAlertController(title: host, message: message, preferredStyle: .alert)
        ac.addAction(UIAlertAction(title: "OK", style: .default) { _ in completion() })
        if !present(ac) { completion() }
    }

    func confirm(message: String, host: String?, completion: @escaping (Bool) -> Void) {
        let ac = UIAlertController(title: host, message: message, preferredStyle: .alert)
        ac.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completion(false) })
        ac.addAction(UIAlertAction(title: "OK", style: .default) { _ in completion(true) })
        if !present(ac) { completion(false) }
    }

    func prompt(message: String, defaultText: String?, host: String?, completion: @escaping (String?) -> Void) {
        let ac = UIAlertController(title: host, message: message, preferredStyle: .alert)
        ac.addTextField { $0.text = defaultText }
        ac.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completion(nil) })
        ac.addAction(UIAlertAction(title: "OK", style: .default) { [weak ac] _ in completion(ac?.textFields?.first?.text ?? "") })
        if !present(ac) { completion(nil) }
    }

    func openInSafariView(_ url: URL) {
        guard url.scheme == "http" || url.scheme == "https" else {
            UIApplication.shared.open(url)
            return
        }
        let safari = SFSafariViewController(url: url)
        if !present(safari) { UIApplication.shared.open(url) }
    }

    func share(fileURL: URL, sourceView: UIView?) {
        let sheet = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
        if let pop = sheet.popoverPresentationController, let view = sourceView {
            pop.sourceView = view
            pop.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 40, width: 1, height: 1)
        }
        _ = present(sheet)
    }

    // MARK: Downloads (Download CSV, attachments)

    private var downloads: [ObjectIdentifier: URL] = [:]
    weak var downloadSourceView: UIView?

    @available(iOS 14.5, *)
    func track(_ download: WKDownload) {
        download.delegate = self
    }
}

@available(iOS 14.5, *)
extension WebUI: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("Downloads", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let name = suggestedFilename.isEmpty ? "download" : suggestedFilename
        let url = dir.appendingPathComponent(name)
        try? FileManager.default.removeItem(at: url)
        downloads[ObjectIdentifier(download)] = url
        completionHandler(url)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        share(fileURL: url, sourceView: downloadSourceView)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
        alert(message: "The download failed: \(error.localizedDescription)", host: nil) {}
    }
}

/// Hosts are part of GCC's own sites; these stay inside the app.
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

import SwiftUI
import WebKit

/// The main screen: myGCC with the extension running inside it, and a
/// toolbar for back, forward, home, reload and the extension's settings.
struct BrowserView: View {
    @ObservedObject var model: BrowserModel

    var body: some View {
        VStack(spacing: 0) {
            WebViewContainer(webView: model.webView)
                .overlay(alignment: .top) {
                    if model.isLoading {
                        ProgressView(value: model.progress)
                            .progressViewStyle(.linear)
                            .transition(.opacity)
                    }
                }
            BrowserToolbar(model: model)
        }
        .background(Color(uiColor: .systemBackground))
        .animation(.easeInOut(duration: 0.2), value: model.isLoading)
        .sheet(item: $model.sheet) { sheet in
            BrowserSheetView(sheet: sheet)
        }
        .webDialogs($model.dialog)
    }
}

private struct BrowserToolbar: View {
    @ObservedObject var model: BrowserModel

    var body: some View {
        HStack {
            button("chevron.backward", "Back", enabled: model.canGoBack) { model.webView.goBack() }
            button("chevron.forward", "Forward", enabled: model.canGoForward) { model.webView.goForward() }
            button("house", "myGCC home") { model.goHome() }
            button("arrow.clockwise", "Reload") { model.reload() }
            button("slider.horizontal.3", "aBetterMyGCC settings") { model.showSettings() }
        }
        .padding(.horizontal, 8)
        .padding(.top, 6)
        .padding(.bottom, 4)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
    }

    private func button(_ symbol: String, _ label: String, enabled: Bool = true,
                        action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 19, weight: .regular))
                .frame(maxWidth: .infinity, minHeight: 40)
                .contentShape(Rectangle())
        }
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

/// Everything the main screen can show in a sheet.
enum BrowserSheet: Identifiable {
    case extensionPage(ExtensionPageModel, compact: Bool)
    case safari(URL)
    case share(URL)

    var id: String {
        switch self {
        case .extensionPage(let page, _): return "page-\(ObjectIdentifier(page).hashValue)"
        case .safari(let url): return "safari-\(url.absoluteString)"
        case .share(let url): return "share-\(url.path)"
        }
    }
}

private struct BrowserSheetView: View {
    let sheet: BrowserSheet

    var body: some View {
        switch sheet {
        case .extensionPage(let page, let compact):
            ExtensionPageView(model: page)
                .presentationDetents(compact ? [.medium, .large] : [.large])
                .presentationDragIndicator(.visible)
        case .safari(let url):
            SafariView(url: url).ignoresSafeArea()
        case .share(let url):
            ShareSheet(items: [url])
                .presentationDetents([.medium, .large])
        }
    }
}

/// One of the extension's own pages (popup, Settings, demo, log) in a sheet.
struct ExtensionPageView: View {
    @ObservedObject var model: ExtensionPageModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            WebViewContainer(webView: model.webView)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle(model.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
        }
        .webDialogs($model.dialog)
        .sheet(item: $model.share) { item in
            ShareSheet(items: [item.url]).presentationDetents([.medium, .large])
        }
    }
}

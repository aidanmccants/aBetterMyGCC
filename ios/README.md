# aBetterMyGCC for iOS

An iPhone and iPad app that opens myGCC with the aBetterMyGCC extension built in. It runs the same extension code in this repository; nothing is rewritten for iOS.

## How it works

- **Content scripts:** the app reads `manifest.json` at launch and injects every `content_scripts` CSS and JS file into myGCC pages, in manifest order. They run in an isolated WebKit content world, the same way Chrome runs content scripts, so myGCC's own scripts can't see them.
- **Background worker:** `src/background.js` (plus its `importScripts` files) runs in a hidden web view. `chrome.runtime.sendMessage` from pages is routed to it, so dining menus, themes and Plan with AI all work. Its network requests go through the app, so there are no CORS limits, just like an extension worker.
- **Storage:** `chrome.storage.local` is one JSON file in the app's Application Support folder, shared by every context. `chrome.storage.onChanged` fires in all of them.
- **Extension pages:** the toolbar's settings button opens `popup/popup.html` in a sheet. "Advanced settings" opens `options/options.html`, which also covers the AI key, the demo and the log. They are served from a `gccx-extension://` URL scheme.
- **Shim:** `Injected/shim.js` provides the `chrome.*` APIs the extension uses. `Injected/mobile.css` adds phone fixes: wide tables scroll inside their box, the page comes before myGCC's sidebar links, the plan drawer fits the screen, the main tabs scroll sideways, inputs don't zoom, and the Feedback button is smaller.
- **App behavior:** alert/confirm/prompt dialogs, downloads (Download CSV opens the share sheet), pull to refresh, swipe back and forward, `mailto:`/Telegram links, and links outside gcc.edu opening in Safari.

The extension files are copied into the app at build time (`scripts/bundle-extension.sh`), so every build ships the current extension.

## Build

GitHub Actions (`.github/workflows/ios.yml`) builds on every push:

- `aBetterMyGCC-iOS-unsigned-ipa`: an unsigned device build. Sign and install it with AltStore, Sideloadly or your own Apple Developer account.
- `aBetterMyGCC-iOS-simulator`: a `.app` for the iOS Simulator (`xcrun simctl install booted aBetterMyGCC.app`).
- `aBetterMyGCC-iOS-screenshots`: the app running in the Simulator (live myGCC, the settings popup, Settings, and the demo's dashboard, planner and schedule, in light and dark), plus the app's log of extension errors.

The screenshots use two launch arguments, which also help when testing by hand:

- `-gccxOpen settings|options|demo|<extension path>` opens that page in a sheet at launch.
- `-gccxSkipWelcome YES` marks the welcome screen as seen.

Pushing a tag that starts with `ios-v` (for example `ios-v1.1.0`) also attaches both files to a GitHub release.

To build locally on a Mac:

```sh
brew install xcodegen
cd ios && xcodegen generate && open aBetterMyGCC.xcodeproj
```

Pick your team under Signing & Capabilities, then run.

Requires iOS 16 or later. The UI is SwiftUI; WKWebView is wrapped with `UIViewRepresentable`.

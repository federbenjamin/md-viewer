# md-viewer

A very thin Markdown viewer for Safari on iPhone, iPad, and Mac: a Safari Web Extension that shows web `.md` documents as formatted pages, and its containing app, which opens local `.md` files read-only with the same JavaScript renderer. It is for anyone reading Markdown on Apple devices. The repo holds the web extension (`web/`), the Xcode project and SwiftUI app, and Node tests of the renderer. The name is a placeholder.

## Project state

- 2026-11-09: not launched — nothing is released and the App Store listing does not exist. Retires at the first public release.
- 2026-11-09: no user data leaves the device. The extension keeps up to the 20 most recently opened documents in `storage.session`, and the app holds only the open document. Retires if either ever stores a document anywhere else.
- 2026-11-09: the viewer loads the remote images a document names, in the extension and the app, so each image request reaches that site; nothing else is sent off the device. Retires if anything else ever is.

## Conventions

- The renderer in `web/` has one entry point, shared by the extension's viewer page and the app's web view; a host never gets its own copy.
- Third-party JavaScript is vendored as pinned files under `web/vendor/` and never loaded from a network.
- The product name and bundle prefix live only in `Config/Base.xcconfig`.

## Don'ts

- [security] Never write Markdown-derived HTML to a page without DOMPurify.
- [security] Never loosen the viewer's Content Security Policy to make a library work.
- Never commit an Apple team ID, certificate, or provisioning profile; `Config/Local.xcconfig` holds a builder's own team and is git-ignored.

<!-- >>> git-workflow (generated block; do not edit by hand) -->
## Git workflow

- `main` changes only through a PR, squash-merged.
<!-- <<< git-workflow -->

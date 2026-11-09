# MD Viewer

A very thin Markdown viewer for Safari on iPhone, iPad, and Mac. A Safari Web Extension shows web `.md` and `.markdown` documents as formatted pages, and its containing app opens local Markdown files read-only with the same renderer. It supports GitHub-style Markdown, code highlighting, math (KaTeX), and diagrams (Mermaid).

## Install

Needs Xcode 27 and Node with pnpm. The app runs on iOS 27 and macOS 26 or later.

```
pnpm install
cp Config/Local.xcconfig.example Config/Local.xcconfig
```

Put your own Apple team in `Config/Local.xcconfig`, open `MDViewer/MDViewer.xcodeproj`, then build and run the `MDViewer (macOS)` or `MDViewer (iOS)` scheme. An unsigned build works with `CODE_SIGNING_ALLOWED=NO`, as in `scripts/checks.sh`.

## Setup

On a Mac, open Safari > Settings > Extensions and turn on MD Viewer. An unsigned build also needs Develop > Allow Unsigned Extensions. The app's Setup screen has a button that opens these settings.

On iPhone or iPad, open Settings > Apps > Safari > Extensions and turn on MD Viewer.

The first time you visit a Markdown page on a site, Safari asks whether to allow the extension there.

## Use

- **Web documents.** After the site grant, a `.md` or `.markdown` page served as text renders in the viewer. HTML pages such as GitHub's file view stay as they are.
- **Raw text.** The Raw button swaps the rendered page and its source in place.
- **Local files.** Open a Markdown file with Open With or a double-click on a Mac, from Files on iPhone or iPad, or with the app's Open button on a Mac.

## Test

```
pnpm test
sh scripts/checks.sh
```

`pnpm test` runs the Node tests. `scripts/checks.sh` runs them and builds both schemes unsigned. Run `pnpm vendor` after changing a pinned version in `package.json`.

## Known limits

- The address bar shows the extension's address, not the document's.
- Raw text can flash before the viewer appears.
- Local files show remote images only; a relative image shows its alt text.
- A Personal Team iPhone install lapses after 7 days.
- Safari on a Mac may need Allow Unsigned Extensions turned on again at each launch.
- `text/markdown` display and matching a URL with a query string are confirmed on the iOS 27.2 simulator and unconfirmed on macOS until the Safari checks are run there.
- A saved viewer URL does not outlive a reinstall of the extension.

## App Review notes

- Guideline 4.4.2: the `*://*/*.md` and `*://*/*.markdown` matches exist to render Markdown documents, and the extension acts only on a matching URL whose content type is a text type it renders.
- `NSAllowsArbitraryLoadsInWebContent` is set so `http://` images in documents load in the app's web view.

Privacy: [PRIVACY.md](PRIVACY.md). Support: GitHub Issues.

## License

[MIT](LICENSE). Bundled libraries and their licences are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

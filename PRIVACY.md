# Privacy

MD Viewer shows Markdown documents on your device.

- **What it stores.** The extension keeps the text of up to 20 recently opened pages, each with the time it was opened, in Safari's session storage on your device, so the viewer page can show them. That storage is held in memory and is cleared when Safari closes. The app reads a file you open and keeps no copy of it.
- **What it sends.** MD Viewer has no accounts, no analytics, and no tracking, and it never sends the text of your documents anywhere. It makes your device contact a website only in the cases below.
- **Remote images.** When a document names an image on a website, the viewer fetches that image from that site as soon as the document opens, in both the extension and the app, without asking first. The site sees an ordinary image request from your device, including your IP address, your browser details, and the image's address. As with any web image, it may stay in the system's web cache.
- **Re-reading a page.** When Safari decodes a Markdown page as anything other than UTF-8, the extension requests that page once more from the site it came from, to read it as UTF-8.
- **Links.** Opening a link goes to that site in your browser, under that site's own privacy policy.

## Support

Report a problem through [GitHub Issues](https://github.com/federbenjamin/md-viewer/issues).

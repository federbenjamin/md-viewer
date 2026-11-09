const HAS_SCHEME = /^[a-z][a-z0-9+.\-]*:/i;

function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveUrl(value, base) {
  if (value.startsWith("#") || HAS_SCHEME.test(value)) return value;
  if (base === null || !isHttpUrl(base)) return null;
  try {
    return new URL(value, base).href;
  } catch {
    return null;
  }
}

export function rewriteUrls(root, { src }) {
  for (const link of root.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href");
    const resolved = resolveUrl(href, src);
    if (resolved !== null && resolved !== href) link.setAttribute("href", resolved);
  }
  for (const image of root.querySelectorAll("img[src]")) {
    const value = image.getAttribute("src");
    const resolved = resolveUrl(value, src);
    if (resolved === null) {
      const alt = image.getAttribute("alt");
      if (alt) image.replaceWith(image.ownerDocument.createTextNode(alt));
      else image.remove();
    } else if (resolved !== value) {
      image.setAttribute("src", resolved);
    }
  }
}

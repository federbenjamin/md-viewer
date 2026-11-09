const HAS_SCHEME = /^[a-z][a-z0-9+.\-]*:/i;
const HTTP_URL = /^https?:/i;

export function resolveUrl(value, base) {
  if (value.startsWith("#") || HAS_SCHEME.test(value)) return value;
  if (base === null) return null;
  try {
    return new URL(value, base).href;
  } catch {
    return null;
  }
}

// The HTML standard's splitting: a URL may hold commas, and only commas at its end close the candidate.
function parseSrcset(value) {
  const candidates = [];
  const urlToken = /[\s,]*(\S+)/g;
  const descriptorToken = /[^,(]*(?:\([^)]*\)[^,(]*)*/y;
  for (let match = urlToken.exec(value); match !== null; match = urlToken.exec(value)) {
    const url = match[1].replace(/,+$/, "");
    let descriptor = "";
    if (url === match[1]) {
      descriptorToken.lastIndex = urlToken.lastIndex;
      descriptor = descriptorToken.exec(value)[0].trim();
      urlToken.lastIndex = descriptorToken.lastIndex;
    }
    if (url) candidates.push({ url, descriptor });
  }
  return candidates;
}

// DOMPurify tests the whole attribute once, so only this per-candidate check sees a later candidate's scheme.
function rewriteSrcset(element, base) {
  const kept = parseSrcset(element.getAttribute("srcset")).flatMap(({ url, descriptor }) => {
    const resolved = resolveUrl(url, base);
    if (resolved === null || !HTTP_URL.test(resolved)) return [];
    return [descriptor ? `${resolved} ${descriptor}` : resolved];
  });
  if (kept.length > 0) element.setAttribute("srcset", kept.join(", "));
  else element.removeAttribute("srcset");
}

function replaceWithAlt(image) {
  const alt = image.getAttribute("alt");
  if (alt) image.replaceWith(image.ownerDocument.createTextNode(alt));
  else image.remove();
}

export function rewriteUrls(root, { src }) {
  for (const link of root.querySelectorAll("a[href], area[href]")) {
    const href = link.getAttribute("href");
    const resolved = resolveUrl(href, src);
    if (resolved === null) link.removeAttribute("href");
    else if (resolved !== href) link.setAttribute("href", resolved);
  }
  for (const element of root.querySelectorAll("[srcset]")) {
    rewriteSrcset(element, src);
    if (element.localName === "img" && !element.hasAttribute("srcset") && !element.hasAttribute("src")) {
      replaceWithAlt(element);
    }
  }
  for (const image of root.querySelectorAll("img[src]")) {
    const value = image.getAttribute("src");
    const resolved = resolveUrl(value, src);
    if (resolved === null) replaceWithAlt(image);
    else if (resolved !== value) image.setAttribute("src", resolved);
  }
}

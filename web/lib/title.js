function lastPathSegment(src) {
  if (src === null) return null;
  const segment = new URL(src).pathname.split("/").filter(Boolean).pop();
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function documentTitle(root, src) {
  const heading = root.querySelector("h1")?.textContent.trim();
  return heading || lastPathSegment(src) || "Markdown";
}

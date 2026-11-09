import { Marked } from "../vendor/marked.esm.js";
import DOMPurify from "../vendor/purify.es.mjs";
import { mathExtension } from "./math.js";

// http, https, mailto, any scheme-less relative URL, and `#fragment`.
export const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|(?![a-z][a-z0-9+.\-]*:))/i;

export const PURIFY_CONFIG = Object.freeze({
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["style", "form"],
  FORBID_ATTR: ["style"],
  ALLOWED_URI_REGEXP,
});

export function createRenderer(window) {
  const marked = new Marked({ gfm: true }, mathExtension);
  const purify = DOMPurify(window);
  // DOMPurify keeps data: on img whatever ALLOWED_URI_REGEXP says; the config can only add to that list.
  purify.addHook("uponSanitizeAttribute", (_node, data) => {
    if ((data.attrName === "src" || data.attrName === "href") && /^\s*data:/i.test(data.attrValue)) {
      data.keepAttr = false;
    }
  });
  return {
    render(markdown) {
      return purify.sanitize(marked.parse(markdown), PURIFY_CONFIG);
    },
  };
}

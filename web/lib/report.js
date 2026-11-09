// The error's class only: a message can echo fragments of the document.
export function errorClass(error) {
  return error?.name ?? "unknown";
}

export function reportFailure(subject, error) {
  console.warn(`mdviewer: ${subject} failed: ${errorClass(error)}`);
}

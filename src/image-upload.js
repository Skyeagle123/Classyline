import { IMAGE_REFERENCE, MAX_IMAGE_BYTES } from "../shared/product-images.js";
export function validateSelection(file) {
  if (!file || !file.size || file.size > MAX_IMAGE_BYTES)
    throw Error("Choose an image up to 2 MiB.");
  if (file.type && !["image/jpeg", "image/png"].includes(file.type))
    throw Error(
      "Choose JPEG or PNG. WebP uploads are temporarily disabled; convert HEIC or animated files before uploading.",
    );
}
export const UPLOAD_TIMEOUT_MS = 30000;
async function sendImage(file, signal) {
  const response = await fetch("/api/admin/product-images", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
    signal,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error(
      "Upload was not confirmed. Your product image has not changed.",
    );
  }
  if (!response.ok)
    throw Error(
      result.error || "Upload failed. Your product image has not changed.",
    );
  if (response.status !== 201 || !IMAGE_REFERENCE.test(result.image))
    throw Error(
      "Upload was not confirmed. Your product image has not changed.",
    );
  return result;
}
export async function uploadProductImage(file, signal) {
  validateSelection(file);
  const controller = new AbortController();
  const cancelled = () =>
    new DOMException(
      "Upload cancelled. Storage was not confirmed; the product image has not changed. An unused upload may remain. No automatic retry was made.",
      "AbortError",
    );
  const cancel = () => controller.abort(cancelled());
  if (signal?.aborted) throw cancelled();
  signal?.addEventListener("abort", cancel, { once: true });
  let rejectAbort;
  const interrupted = new Promise((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort(controller.signal.reason);
  controller.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException(
          "Upload timed out. Storage was not confirmed; the product image has not changed. An unused upload may remain. No automatic retry was made.",
          "TimeoutError",
        ),
      ),
    UPLOAD_TIMEOUT_MS,
  );
  try {
    // Settle on cancellation even if a stalled transport ignores AbortSignal.
    // The losing request cannot update the editor or trigger an automatic retry.
    const result = await Promise.race([
      sendImage(file, controller.signal),
      interrupted,
    ]);
    if (controller.signal.aborted) throw controller.signal.reason;
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
export function withUploadedImage(product, result) {
  if (!IMAGE_REFERENCE.test(result?.image))
    throw Error("Invalid image upload response.");
  return { ...product, image: result.image };
}

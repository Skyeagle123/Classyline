import { IMAGE_REFERENCE, MAX_IMAGE_BYTES } from "../shared/product-images.js";
export function validateSelection(file) {
  if (!file || !file.size || file.size > MAX_IMAGE_BYTES)
    throw Error("Choose an image up to 2 MiB.");
  if (
    file.type &&
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw Error(
      "Choose JPEG, PNG or WebP. Convert HEIC or animated files before uploading.",
    );
}
export async function uploadProductImage(file, signal) {
  validateSelection(file);
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
export function withUploadedImage(product, result) {
  if (!IMAGE_REFERENCE.test(result?.image))
    throw Error("Invalid image upload response.");
  return { ...product, image: result.image };
}

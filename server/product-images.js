import { IMAGE_REFERENCE, MAX_IMAGE_BYTES } from "../shared/product-images.js";
import { ImageFailure, validateImage } from "./image-validation.js";
const unavailable = () => {
  throw new ImageFailure(
    503,
    "Image storage is unavailable. The product image was not changed.",
  );
};
const keyFor = (reference) =>
  "products/images/v1/" + reference.slice("/api/product-images/".length);
async function readImageBody(request) {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_IMAGE_BYTES)
  )
    throw new ImageFailure(413, "Choose an image up to 2 MiB.");
  if (
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/octet-stream",
    ].includes(request.headers.get("content-type")?.split(";")[0])
  )
    throw new ImageFailure(
      415,
      "Choose JPEG, PNG or WebP. HEIC, SVG and animated images are not supported.",
    );
  const reader = request.body?.getReader();
  if (!reader) throw new ImageFailure(400, "Choose an image first.");
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new ImageFailure(413, "Choose an image up to 2 MiB.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  return bytes;
}
export async function uploadImage(request, bucket) {
  if (!bucket?.put) unavailable();
  const image = await validateImage(await readImageBody(request));
  const reference = `/api/product-images/${crypto.randomUUID()}.${image.ext}`,
    key = keyFor(reference);
  let stored;
  try {
    stored = await bucket.put(key, image.bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: {
        contentType: image.type,
        cacheControl: "private, no-store",
      },
      customMetadata: { purpose: "classyline-product-image-v1" },
    });
  } catch {
    unavailable();
  }
  if (stored === null)
    throw new ImageFailure(
      409,
      "Image key conflict. Choose Upload Image again; no existing image was overwritten.",
    );
  if (!stored || stored.key !== key || stored.size !== image.bytes.length)
    unavailable();
  return {
    image: reference,
    width: image.width,
    height: image.height,
    size: stored.size,
    type: image.type,
  };
}
export async function deliverImage(request, db, bucket, canReadDraft) {
  const url = new URL(request.url),
    reference = url.pathname;
  if (!IMAGE_REFERENCE.test(reference) || url.search)
    throw new ImageFailure(404, "Image not found");
  const active = await db
    .prepare(
      "SELECT id FROM products WHERE active=1 AND image IN (?,?) LIMIT 1",
    )
    .bind(reference, url.href)
    .first();
  if (!active && !(await canReadDraft()))
    throw new ImageFailure(404, "Image not found");
  if (!bucket?.get) unavailable();
  let object;
  try {
    object = await (request.method === "HEAD"
      ? bucket.head(keyFor(reference))
      : bucket.get(keyFor(reference)));
  } catch {
    unavailable();
  }
  const type = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[
    reference.split(".").at(-1)
  ];
  if (
    !object ||
    object.customMetadata?.purpose !== "classyline-product-image-v1" ||
    object.httpMetadata?.contentType !== type ||
    !Number.isSafeInteger(object.size) ||
    object.size < 1 ||
    object.size > MAX_IMAGE_BYTES
  )
    throw new ImageFailure(404, "Image not found");
  const headers = {
    "Content-Type": type,
    "Content-Length": String(object.size),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": active
      ? "public, max-age=0, must-revalidate"
      : "private, no-store",
  };
  if (object.httpEtag) headers.ETag = object.httpEtag;
  return new Response(request.method === "HEAD" ? null : object.body, {
    headers,
  });
}

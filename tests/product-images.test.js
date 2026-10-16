import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import jpeg from "jpeg-js";
import { zlibSync, unzlibSync } from "fflate";
import { database } from "./adapter.js";
import { digest } from "../server/security.js";
import {
  imageReference,
  exportRows,
  validateRows,
} from "../shared/catalog-import.js";
import { createWorkbook, parseWorkbook } from "../src/excel.js";
import {
  uploadProductImage,
  withUploadedImage,
  validateSelection,
} from "../src/image-upload.js";
import { MAX_IMAGE_BYTES } from "../shared/product-images.js";

import { handle } from "../server/api.js";
import { validateImage, crc32 } from "../server/image-validation.js";
test("local selected-image previews are allowed by image CSP without weakening scripts or connections", async () => {
  const headers = await readFile(
    new URL("../public/_headers", import.meta.url),
    "utf8",
  );
  assert.match(headers, /img-src 'self' https: blob:;/);
  assert.match(headers, /script-src 'self';/);
  assert.match(headers, /connect-src 'self';/);
  assert.match(headers, /object-src 'none';/);
});
const origin = "https://image-test.invalid";
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGM8uXg2AwMDEwMDAwMDAwAYrAILT2TYiwAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const webp = Uint8Array.from(
  Buffer.from(
    "UklGRjIAAABXRUJQVlA4ICYAAABQAQCdASoCAAIAAUAmJQBOgCgAAP7wkKNVU9fjd9RPYR33zAAAAA==",
    "base64",
  ),
);
const jpg = jpeg.encode(
  { width: 2, height: 2, data: new Uint8Array(16).fill(255) },
  80,
).data;
const concat = (...parts) =>
  Uint8Array.from(Buffer.concat(parts.map((p) => Buffer.from(p))));
function chunk(type, data) {
  const result = new Uint8Array(data.length + 12),
    view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(Buffer.from(type), 4);
  result.set(data, 8);
  view.setUint32(
    result.length - 4,
    crc32(result.subarray(4, result.length - 4)),
  );
  return result;
}
function bucket() {
  const objects = new Map();
  return {
    objects,
    puts: [],
    reads: [],
    async put(key, bytes, options) {
      this.puts.push({ key, options });
      assert.deepEqual(options.onlyIf, { etagDoesNotMatch: "*" });
      if (objects.has(key)) return null;
      const object = {
        key,
        size: bytes.length,
        bytes: bytes.slice(),
        ...options,
        httpEtag: '"test-etag"',
      };
      objects.set(key, object);
      return object;
    },
    async get(key) {
      this.reads.push(key);
      const obj = objects.get(key);
      return obj ? { ...obj, body: new Response(obj.bytes).body } : null;
    },
    async head(key) {
      this.reads.push(key);
      return objects.get(key) || null;
    },
  };
}
async function setup() {
  const DB = database(),
    token = crypto.randomUUID();
  DB.sqlite
    .prepare("INSERT INTO sessions VALUES (?,?)")
    .run(await digest(token), Math.floor(Date.now() / 1000) + 3600);
  DB.sqlite.exec(
    "INSERT INTO products VALUES ('p','Synthetic Shirt','Tops','','/products/original.jpg',3800,0); INSERT INTO variants VALUES ('v','p','Free Size','Blue',3)",
  );
  return { DB, PRODUCT_IMAGES: bucket(), cookie: `__Host-cl_session=${token}` };
}
function request(path, method = "GET", body, headers = {}) {
  return new Request(origin + path, {
    method,
    headers: { Origin: origin, ...headers },
    ...(body === undefined ? {} : { body }),
  });
}
const upload = (env, bytes = png, extra = {}) =>
  handle(
    request("/api/admin/product-images", "POST", bytes, {
      Cookie: env.cookie,
      "Content-Type": "image/png",
      ...extra,
    }),
    env,
  );
const read = (env, ref, cookie, method = "GET") =>
  handle(
    request(ref, method, undefined, cookie ? { Cookie: cookie } : {}),
    env,
  );

test("real JPEG/PNG validation and conditional R2 storage confirm success before returning a reference", async () => {
  const env = await setup();
  for (const [bytes, type, ext] of [
    [png, "image/png", "png"],
    [jpg, "image/jpeg", "jpg"],
  ]) {
    // MIME and filename never select the persisted type.
    const response = await upload(env, bytes, {
      "Content-Type": "application/octet-stream",
    });
    assert.equal(response.status, 201, await response.clone().text());
    const result = await response.json();
    assert.equal(result.type, type);
    assert.equal(result.width, 2);
    assert.equal(result.height, 2);
    assert.match(
      result.image,
      new RegExp(`^/api/product-images/[a-f0-9-]+\\.${ext}$`),
    );
    assert.ok(
      env.PRODUCT_IMAGES.objects.has(
        "products/images/v1/" + result.image.split("/").at(-1),
      ),
    );
  }
  assert.equal(new Set(env.PRODUCT_IMAGES.puts.map((p) => p.key)).size, 2);
  assert.equal(
    env.DB.sqlite.prepare("SELECT image FROM products").get().image,
    "/products/original.jpg",
  );
  assert.equal(
    env.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    3,
  );
});
test("unsupported, empty, truncated and forged image content never reaches R2", async () => {
  const env = await setup();
  for (const bytes of [
    new Uint8Array(),
    Buffer.from('<svg onload="alert(1)"/>'),
    png.slice(0, 30),
    jpg.slice(0, -8),
    webp.slice(0, -5),
    concat(png, Buffer.from("html")),
  ]) {
    assert.ok((await upload(env, bytes)).status >= 400);
  }
  const badCrc = png.slice();
  badCrc[45] ^= 1;
  assert.equal((await upload(env, badCrc)).status, 400);
  const badWebp = webp.slice(0, 32);
  new DataView(badWebp.buffer).setUint32(4, 24, true);
  new DataView(badWebp.buffer).setUint32(16, 12, true);
  assert.equal((await upload(env, badWebp)).status, 415);
  assert.equal(
    (await upload(env, png, { "Content-Type": "image/svg+xml" })).status,
    415,
  );
  assert.equal(env.PRODUCT_IMAGES.puts.length, 0);
});
test("declared and actual oversized bodies are rejected, including false content-length", async () => {
  const env = await setup(),
    large = new Uint8Array(MAX_IMAGE_BYTES + 1);
  assert.equal(
    (await upload(env, png, { "Content-Length": String(large.length) })).status,
    413,
  );
  assert.equal(
    (await upload(env, large, { "Content-Length": "1" })).status,
    413,
  );
  assert.equal((await upload(env, large)).status, 413);
  assert.equal(env.PRODUCT_IMAGES.puts.length, 0);
});
test("PNG decompression bombs, illegal filters, animation and extreme dimensions are bounded", async () => {
  const header = png.slice(16, 29),
    env = await setup();
  for (const raw of [
    new Uint8Array(200000).fill(0),
    new Uint8Array(14).fill(5),
  ]) {
    const malicious = concat(
      png.slice(0, 8),
      chunk("IHDR", header),
      chunk("IDAT", zlibSync(raw)),
      chunk("IEND", new Uint8Array()),
    );
    assert.equal((await upload(env, malicious)).status, 400);
  }
  const huge = header.slice();
  new DataView(huge.buffer).setUint32(0, 100000);
  await assert.rejects(
    validateImage(concat(png.slice(0, 8), chunk("IHDR", huge), png.slice(33))),
    /dimensions/,
  );
  await assert.rejects(
    validateImage(
      concat(png.slice(0, 33), chunk("acTL", new Uint8Array(8)), png.slice(33)),
    ),
    /Invalid/,
  );
  assert.equal(env.PRODUCT_IMAGES.puts.length, 0);
});
test("metadata is stripped without re-encoding pixels; safe JPEG orientation is retained", async () => {
  const hidden = Buffer.from("PRIVATE-GPS-TEST"),
    comment = concat([255, 254, 0, hidden.length + 2], hidden);
  const exif = Uint8Array.from([
    255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0,
    18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const cleaned = await validateImage(
    concat(jpg.slice(0, 2), comment, exif, jpg.slice(2)),
  );
  assert.equal(Buffer.from(cleaned.bytes).includes(hidden), false);
  assert.ok(Buffer.from(cleaned.bytes).includes(Buffer.from(exif)));
  const cleanedPng = await validateImage(
    concat(png.slice(0, 33), chunk("tEXt", hidden), png.slice(33)),
  );
  assert.deepEqual(cleanedPng.bytes, (await validateImage(png)).bytes);
});
test("indexed PNG palette references are validated after scanline unfiltering", async () => {
  const header = png.slice(16, 29);
  header[9] = 3;
  const indexed = (raw) =>
    concat(
      png.slice(0, 8),
      chunk("IHDR", header),
      chunk("PLTE", new Uint8Array([255, 255, 255])),
      chunk("IDAT", zlibSync(Uint8Array.from(raw))),
      chunk("IEND", new Uint8Array()),
    );
  assert.equal(
    (await validateImage(indexed([0, 0, 0, 2, 0, 0]))).type,
    "image/png",
  );
  await assert.rejects(validateImage(indexed([0, 0, 1, 2, 0, 0])), /Invalid/);
  await assert.rejects(validateImage(indexed([0, 0, 0, 1, 0, 1])), /Invalid/);
});
test("administrator authorization and same-origin enforcement precede storage", async () => {
  const env = await setup();
  assert.equal((await upload(env, png, { Cookie: "" })).status, 401);
  assert.equal(
    (await upload(env, png, { Cookie: "__Host-cl_session=forged" })).status,
    401,
  );
  assert.equal(
    (await upload(env, png, { Origin: "https://attacker.invalid" })).status,
    403,
  );
  assert.equal((await upload(env, png, { Origin: "" })).status, 403);
  env.DB.sqlite.exec("UPDATE sessions SET expires_at=0");
  assert.equal((await upload(env)).status, 401);
  assert.equal(env.PRODUCT_IMAGES.puts.length, 0);
});
test("missing R2, failed writes, unconfirmed writes and collisions fail closed with sanitized errors", async () => {
  const env = await setup();
  delete env.PRODUCT_IMAGES;
  assert.equal((await upload(env)).status, 503);
  for (const put of [
    async () => {
      throw Error("private-storage-error");
    },
    async () => undefined,
    async () => ({ key: "other", size: 1 }),
    async () => null,
  ]) {
    env.PRODUCT_IMAGES = { put };
    const response = await upload(env);
    assert.ok([409, 503].includes(response.status));
    assert.doesNotMatch(
      await response.text(),
      /private-storage-error|products\/images/,
    );
  }
  assert.equal(
    env.DB.sqlite.prepare("SELECT image FROM products").get().image,
    "/products/original.jpg",
  );
});
test("per-session and global upload limits reject before extra storage writes", async () => {
  const env = await setup();
  for (let i = 0; i < 10; i++) assert.equal((await upload(env)).status, 201);
  assert.equal((await upload(env)).status, 429);
  assert.equal(env.PRODUCT_IMAGES.puts.length, 10);
  const token = crypto.randomUUID();
  env.DB.sqlite
    .prepare("INSERT INTO sessions VALUES (?,?)")
    .run(await digest(token), Math.floor(Date.now() / 1000) + 3600);
  env.cookie = `__Host-cl_session=${token}`;
  for (let i = 0; i < 9; i++) assert.equal((await upload(env)).status, 201);
  assert.equal((await upload(env)).status, 429);
  assert.equal(env.PRODUCT_IMAGES.puts.length, 19);
});
test("draft/orphan images require an admin session; only actively referenced images are public", async () => {
  const env = await setup(),
    result = await (await upload(env)).json();
  assert.equal((await read(env, result.image)).status, 404);
  const admin = await read(env, result.image, env.cookie);
  assert.equal(admin.status, 200);
  assert.equal(admin.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(
    new Uint8Array(await admin.arrayBuffer()),
    (await validateImage(png)).bytes,
  );
  env.DB.sqlite.prepare("UPDATE products SET image=?").run(result.image);
  const catalog = await (await handle(request("/api/catalog"), env)).json();
  assert.equal(catalog.products.length, 0);
  assert.equal((await read(env, result.image)).status, 404);
  env.DB.sqlite.exec("UPDATE products SET active=1");
  const publicImage = await read(env, result.image);
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get("Content-Type"), "image/png");
  assert.equal(publicImage.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(publicImage.headers.get("Cache-Control"), /must-revalidate/);
  const head = await read(env, result.image, undefined, "HEAD");
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  env.DB.sqlite.exec("UPDATE products SET active=0");
  assert.equal((await read(env, result.image)).status, 404);
});
test("delivery never exposes arbitrary/private objects, query aliases or corrupt object metadata", async () => {
  const env = await setup(),
    result = await (await upload(env)).json();
  for (const ref of [
    "/api/product-images/private.txt",
    "/api/product-images/x.png",
    result.image + "?download=1",
    result.image.replace(".png", ".svg"),
  ])
    assert.equal((await read(env, ref, env.cookie)).status, 404);
  assert.equal(env.PRODUCT_IMAGES.reads.length, 0);
  const obj = [...env.PRODUCT_IMAGES.objects.values()][0];
  obj.customMetadata = { purpose: "private" };
  assert.equal((await read(env, result.image, env.cookie)).status, 404);
  env.PRODUCT_IMAGES.get = async () => {
    throw Error("private-bucket-name");
  };
  const failed = await read(env, result.image, env.cookie);
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private-bucket-name/);
});
test("uploaded references survive Excel round-trip and retain existing image compatibility", async () => {
  const env = await setup(),
    result = await (await upload(env)).json();
  const product = {
    id: "CL-TEST",
    title: "Synthetic",
    category: "Tops",
    collections: [],
    description: "Test only",
    price_cents: 3800,
    active: 0,
    image: result.image,
    variants: [{ id: "test-v", size: "Free Size", color: "Blue", stock: 3 }],
  };
  const rows = parseWorkbook(createWorkbook(exportRows([product]))),
    validated = validateRows(rows);
  assert.deepEqual(validated[0].errors, []);
  assert.equal(validated[0].product.image, result.image);
  assert.equal(validated[0].product.active, 0);
  for (const image of [
    "/products/shirt.jpg",
    "https://example.invalid/shirt.png",
    result.image,
  ])
    assert.equal(imageReference(image), image);
  for (const image of [
    result.image + "?x=1",
    "/api/product-images/../private.png",
    "/api/product-images/not-a-uuid.png",
  ])
    assert.throws(() => imageReference(image));
});
test("image-only editor replacement preserves identity, status, price and variant stock", async () => {
  const env = await setup(),
    result = await (await upload(env)).json();
  const original = {
    id: "p",
    title: "Synthetic",
    active: false,
    image: "/products/old.jpg",
    price_cents: 3800,
    variants: [
      {
        id: "v",
        stock: 3,
        expected_stock: 3,
        size: "Free Size",
        color: "Blue",
      },
    ],
  };
  assert.deepEqual(withUploadedImage(original, result), {
    ...original,
    image: result.image,
  });
  assert.equal(original.image, "/products/old.jpg");
  assert.throws(() =>
    withUploadedImage(original, { image: "https://attacker.invalid" }),
  );
  const payload = {
    ...original,
    image: result.image,
    category: "Tops",
    description: "Test only",
  };
  assert.equal(
    (
      await handle(
        request("/api/admin/products", "PUT", JSON.stringify(payload), {
          Cookie: env.cookie,
          "Content-Type": "application/json",
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal(
    env.DB.sqlite.prepare("SELECT active FROM products").get().active,
    0,
  );
  assert.equal(
    env.DB.sqlite.prepare("SELECT stock FROM variants").get().stock,
    3,
  );
  assert.equal(
    (await (await handle(request("/api/catalog"), env)).json()).products.length,
    0,
  );
});
test("client only accepts confirmed 201 references and fails safely for storage/network errors", async () => {
  const original = globalThis.fetch,
    file = new File([png], "owner-photo.png", { type: "image/png" });
  const reference =
    "/api/product-images/12345678-1234-4123-8123-123456789abc.png";
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/admin/product-images");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.body, file);
      return Response.json({ image: reference }, { status: 201 });
    };
    assert.equal((await uploadProductImage(file)).image, reference);
    for (const [status, body] of [
      [200, { image: reference }],
      [201, { image: "/private" }],
      [503, { error: "Storage unavailable" }],
    ]) {
      globalThis.fetch = async () => Response.json(body, { status });
      await assert.rejects(uploadProductImage(file));
    }
    globalThis.fetch = async () => {
      throw Error("Offline");
    };
    await assert.rejects(uploadProductImage(file), /Offline/);
    assert.throws(
      () =>
        validateSelection(
          new File([png], "photo.svg", { type: "image/svg+xml" }),
        ),
      /JPEG/,
    );
    assert.throws(
      () => validateSelection({ size: MAX_IMAGE_BYTES + 1, type: "image/png" }),
      /2 MiB/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("WebP uploads fail closed for lossy/lossless content and spoofed MIME; no decoder is shipped", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const lock = JSON.parse(
    await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.dependencies["@jsquash/webp"], undefined);
  assert.equal(lock.packages["node_modules/@jsquash/webp"], undefined);
  await assert.rejects(
    readFile(new URL("../server/webp-codec.js", import.meta.url)),
    { code: "ENOENT" },
  );
  // Includes a VP8L header with a malformed/truncated lossless bitstream.
  const lossless = Buffer.from(
    "5249464612000000574542505650384c050000002f0000000000",
    "hex",
  );
  for (const bytes of [webp, lossless, webp.subarray(0, 12)]) {
    const env = await setup();
    for (const type of [
      "image/webp",
      "image/jpeg",
      "image/png",
      "application/octet-stream",
    ]) {
      const response = await upload(env, bytes, { "Content-Type": type });
      assert.equal(response.status, 415);
      assert.match((await response.json()).error, /WebP.*disabled/);
    }
    assert.equal(env.PRODUCT_IMAGES.puts.length, 0);
  }
  assert.throws(
    () =>
      validateSelection(new File([webp], "photo.webp", { type: "image/webp" })),
    /WebP.*disabled/,
  );
  assert.equal(
    imageReference("/products/existing.webp"),
    "/products/existing.webp",
  );
});

function pngData(bytes) {
  const chunks = [];
  for (let at = 8; at < bytes.length;) {
    const length = new DataView(
      bytes.buffer,
      bytes.byteOffset + at,
      4,
    ).getUint32(0);
    if (Buffer.from(bytes.subarray(at + 4, at + 8)).toString() === "IDAT")
      chunks.push(bytes.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  return concat(...chunks);
}
test("PNG canonicalization removes appended junk, duplicate Adler and extra zlib streams without changing pixels", async () => {
  const original = pngData(png),
    raw = unzlibSync(original),
    canonical = (await validateImage(png)).bytes;
  for (const extra of [
    original.subarray(-4),
    concat(Buffer.from("PRIVATE-JUNK"), original.subarray(-4)),
    zlibSync(raw),
  ]) {
    const env = await setup();
    const response = await upload(
      env,
      concat(
        png.subarray(0, 33),
        chunk("IDAT", concat(original, extra)),
        chunk("IEND", []),
      ),
    );
    assert.equal(response.status, 201);
    const ref = (await response.json()).image;
    const stored = new Uint8Array(
      await (await read(env, ref, env.cookie)).arrayBuffer(),
    );
    assert.deepEqual(stored, canonical);
    assert.deepEqual(unzlibSync(pngData(stored)), raw);
    assert.deepEqual((await validateImage(stored)).bytes, stored);
  }
});
test("JPEG APP14 strips private/trailing payloads and only retains one fixed Adobe transform", async () => {
  const segment = (data) =>
    concat([255, 238, (data.length + 2) >> 8, (data.length + 2) & 255], data);
  const valid = Uint8Array.from([
    ...Buffer.from("Adobe"),
    0,
    100,
    0,
    0,
    0,
    0,
    1,
  ]);
  for (const payload of [
    Buffer.from("PRIVATE-METADATA-PROBE"),
    concat(valid, Buffer.from("SECRET")),
    concat(valid.subarray(0, 7), [1], valid.subarray(8)),
  ]) {
    const result = await validateImage(
      concat(jpg.subarray(0, 2), segment(payload), jpg.subarray(2)),
    );
    assert.deepEqual(result.bytes, (await validateImage(jpg)).bytes);
  }
  const approved = segment(valid);
  const result = await validateImage(
    concat(jpg.subarray(0, 2), approved, jpg.subarray(2)),
  );
  assert.ok(Buffer.from(result.bytes).includes(Buffer.from(approved)));
  await assert.rejects(
    validateImage(
      concat(jpg.subarray(0, 2), approved, approved, jpg.subarray(2)),
    ),
    /Invalid/,
  );
});

test("disabling new WebP uploads preserves existing WebP delivery, Draft privacy and Excel references", async () => {
  const env = await setup(),
    ref = "/api/product-images/12345678-1234-4123-8123-123456789abc.webp";
  const key = "products/images/v1/" + ref.split("/").at(-1);
  env.PRODUCT_IMAGES.objects.set(key, {
    key,
    size: webp.length,
    bytes: webp,
    httpMetadata: { contentType: "image/webp" },
    customMetadata: { purpose: "classyline-product-image-v1" },
  });
  env.DB.sqlite.prepare("UPDATE products SET image=?").run(ref);
  assert.equal((await read(env, ref)).status, 404);
  const admin = await read(env, ref, env.cookie);
  assert.equal(admin.status, 200);
  assert.equal(admin.headers.get("Cache-Control"), "private, no-store");
  env.DB.sqlite.exec("UPDATE products SET active=1");
  const publicImage = await read(env, ref);
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get("Content-Type"), "image/webp");
  assert.deepEqual(new Uint8Array(await publicImage.arrayBuffer()), webp);
  const product = {
    ...env.DB.sqlite.prepare("SELECT * FROM products").get(),
    collections: [],
    variants: env.DB.sqlite.prepare("SELECT * FROM variants").all(),
  };
  const rows = validateRows(
    parseWorkbook(createWorkbook(exportRows([product]))),
  );
  assert.deepEqual(rows[0].errors, []);
  assert.equal(rows[0].product.image, ref);
  assert.equal(env.PRODUCT_IMAGES.puts.length, 0);
});

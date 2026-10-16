import module from "@jsquash/webp/codec/dec/webp_dec.wasm";
import decode, { init } from "@jsquash/webp/decode.js";
let ready;
export async function decodeWebP(bytes) {
  // Pages imports a precompiled module: no runtime compilation or network fetch.
  ready ||= init(module);
  await ready;
  return decode(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
}

import React from "react";
import { uploadProductImage, validateSelection } from "../image-upload.js";
export default function ImageUpload({ onUploaded, onBusy, disabled = false }) {
  const [file, setFile] = React.useState(null),
    [preview, setPreview] = React.useState(""),
    [busy, setBusy] = React.useState(false),
    [message, setMessage] = React.useState("");
  const pending = React.useRef(null),
    live = React.useRef(true),
    picker = React.useRef(null);
  React.useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      pending.current?.abort();
    };
  }, []);
  React.useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function upload() {
    if (!file || disabled || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    onBusy(true);
    setMessage("");
    try {
      const result = await uploadProductImage(file, controller.signal);
      if (live.current) {
        onUploaded(result);
        setFile(null);
        setMessage(
          "Image uploaded and stored. Review the image field, then Save product. Its Draft/Active status has not changed.",
        );
      }
    } catch (e) {
      if (live.current)
        setMessage(
          e.name === "AbortError"
            ? "Upload interrupted. Storage was not confirmed; the product image has not changed."
            : e.message,
        );
    } finally {
      pending.current = null;
      if (live.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  return (
    <section
      className="image-upload space-y-3"
      aria-busy={busy}
      aria-label="Upload product image"
    >
      <h3 className="text-xl">Product image</h3>
      <p className="muted text-sm">
        Choose a photo from your phone or computer. Still JPEG, PNG or WebP; up
        to 2 MiB and 4 megapixels. Uploading does not save or publish the
        product.
      </p>
      <input
        ref={picker}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled || busy}
        className="input"
        aria-label="Choose product image"
        onChange={(e) => {
          const chosen = e.target.files[0];
          e.target.value = "";
          setMessage("");
          setFile(null);
          if (!chosen) return;
          try {
            validateSelection(chosen);
            setFile(chosen);
          } catch (error) {
            setMessage(error.message);
          }
        }}
      />
      {preview && (
        <figure>
          <img
            className="upload-preview"
            src={preview}
            alt="Selected product image — not uploaded yet"
            onError={() => {
              setFile(null);
              setMessage(
                "This file cannot be displayed. Choose another JPEG, PNG or WebP image.",
              );
            }}
          />
          <figcaption className="muted text-sm">
            Preview only — not stored yet.
          </figcaption>
        </figure>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="navchip"
          disabled={disabled || busy}
          onClick={() => picker.current?.click()}
        >
          {file ? "Replace selected image" : "Choose Image"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!file || disabled || busy}
          onClick={upload}
        >
          {busy ? "Uploading…" : "Upload Image"}
        </button>
      </div>
      <p role="status" aria-live="polite">
        {busy ? "Uploading and verifying storage…" : message}
      </p>
    </section>
  );
}

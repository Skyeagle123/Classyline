import React from "react";
import {
  collections,
  newProduct,
  editProduct,
  productPayload,
} from "../catalog.js";
import { api } from "../api.js";
import ImageUpload from "./ImageUpload.jsx";
import { withUploadedImage } from "../image-upload.js";

export default function ProductEditor({ catalog, refresh, run }) {
  const [draft, setDraft] = React.useState(newProduct),
    [existing, setExisting] = React.useState(false),
    [saving, setSaving] = React.useState(false),
    [uploading, setUploading] = React.useState(false);
  const change = (key, value) => setDraft((p) => ({ ...p, [key]: value }));
  const variant = (index, key, value) =>
    setDraft((p) => ({
      ...p,
      variants: p.variants.map((v, i) =>
        i === index ? { ...v, [key]: value } : v,
      ),
    }));
  return (
    <section className="card p-5">
      <h2 className="text-2xl">Product studio</h2>
      <p className="muted">
        One image per product. Add a separate variant for each size and color.
        Existing variant identities stay fixed; stock changes are checked by the
        server.
      </p>
      <label className="block my-4">
        Edit a product
        <select
          className="input"
          disabled={saving || uploading}
          value={existing ? draft.id : ""}
          onChange={(e) => {
            const p = catalog?.products.find((p) => p.id === e.target.value);
            setDraft(p ? editProduct(p) : newProduct());
            setExisting(Boolean(p));
          }}
        >
          <option value="">Create a new product</option>
          {catalog?.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (uploading || saving) return;
          setSaving(true);
          try {
            await run(async () => {
              await api("/admin/products", {
                method: "PUT",
                body: JSON.stringify(productPayload(draft)),
              });
              await refresh();
              setDraft(newProduct());
              setExisting(false);
            });
          } finally {
            setSaving(false);
          }
        }}
      >
        <fieldset disabled={saving || uploading} className="space-y-4">
          <ImageUpload
            key={`${existing ? "existing" : "new"}:${draft.id}`}
            disabled={saving}
            onBusy={setUploading}
            onUploaded={(result) =>
              setDraft((p) => withUploadedImage(p, result))
            }
          />
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              ["id", "Product ID"],
              ["title", "Product title"],
              ["image", "Image URL or local path"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  className="input"
                  required
                  value={draft[key]}
                  readOnly={key === "id" && existing}
                  onChange={(e) => change(key, e.target.value)}
                />
              </label>
            ))}
            <label>
              Collection
              <select
                className="input"
                value={draft.category}
                onChange={(e) => change("category", e.target.value)}
              >
                {[
                  ...new Set([
                    ...collections.map((c) => c.label),
                    draft.category,
                  ]),
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Price (USD cents)
              <input
                className="input"
                type="number"
                min="0"
                max="100000000"
                step="1"
                required
                value={draft.price_cents}
                onChange={(e) => change("price_cents", Number(e.target.value))}
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => change("active", e.target.checked)}
              />
              Available in storefront
            </label>
          </div>
          {draft.image && (
            <img
              className="upload-preview"
              src={draft.image}
              alt="Current product image"
            />
          )}
          <label className="block">
            Description
            <textarea
              className="input"
              rows="3"
              maxLength="2000"
              value={draft.description}
              onChange={(e) => change("description", e.target.value)}
            />
          </label>
          <h3 className="text-xl">Sizes, colors & stock</h3>
          {draft.variants.map((v, i) => (
            <fieldset className="variant-editor" key={i}>
              <legend>Variant {i + 1}</legend>
              {[
                ["id", "Variant ID"],
                ["size", "Size"],
                ["color", "Color"],
                ["stock", "Stock"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    className="input"
                    required
                    readOnly={key !== "stock" && v.expected_stock !== undefined}
                    type={key === "stock" ? "number" : "text"}
                    min={key === "stock" ? 0 : undefined}
                    max={key === "stock" ? 1000000 : undefined}
                    step={key === "stock" ? 1 : undefined}
                    value={v[key]}
                    onChange={(e) =>
                      variant(
                        i,
                        key,
                        key === "stock"
                          ? Number(e.target.value)
                          : e.target.value,
                      )
                    }
                  />
                </label>
              ))}
              {v.expected_stock === undefined && (
                <button
                  type="button"
                  className="navchip"
                  onClick={() =>
                    change(
                      "variants",
                      draft.variants.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove new variant
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            className="navchip"
            disabled={draft.variants.length >= 100}
            onClick={() =>
              change("variants", [
                ...draft.variants,
                { id: "", size: "", color: "", stock: 0 },
              ])
            }
          >
            Add size/color variant
          </button>
          <button className="btn ml-3">
            {saving ? "Saving…" : "Save product"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}

# Storefront design and catalog preparation

Current V2 navigation, category and variant contracts are documented in [STOREFRONT-V2.md](STOREFRONT-V2.md). The R3 notes below record earlier design decisions; the shared taxonomy and current Admin/Excel implementation supersede the former six-collection and inactive-editor limitations.

Based on accepted R3 d830c4d52858b6b4ed941f1ef60bd0dd5b927cce. Server authentication, stock, idempotency, cart coordination and checkout protocol remain unchanged.

Collections: New In, Dresses, Tops, Sets, Jackets, Sale. Each uses the existing persisted category field (one collection per product). New In is explicitly assigned, not inferred from a nonexistent arrival date. Sale asserts no discount or previous price. Multiple collections, image galleries, file uploads and discount pricing require a separately reviewed schema/API change.

Product studio submits to the existing authenticated PUT /api/admin/products. Edit snapshots carry expected_stock exactly as read; existing variant IDs, sizes and colors cannot be changed. On a stock conflict, reload the product from the selector before retrying. Saving resets the draft so a stale snapshot cannot be reused accidentally. Omitting an existing variant does not delete it. Deactivation removes a product from the public catalog; the current API does not list inactive products, so later reactivation requires its original record through the advanced editor.

Required owner merchandise inputs: stable product and variant IDs, titles/descriptions, approved local or HTTPS image path, price in USD cents, collection, sizes/colors and actual stock. No real merchandise, price, shipping rate or return policy is invented.

tests/fixtures/synthetic-catalog.json contains six clearly labelled synthetic fixtures with artificial test prices and stock. All are inactive by default. They are not fetched by the app, imported into a database or included as live merchandise. The placeholder image states that it is synthetic. An explicitly authorized isolated test may activate fixtures; production must not.

Fonts are bundled from @fontsource (Manrope and Cormorant Garamond); no font CDN requests. Two concrete UI issues corrected: unavailable product loading never ends; size filter buttons lacked pressed state/minimum touch target. The prior LOW finding identifiers/text are not preserved in the repository, so these cannot be claimed as verified matches to those historical findings.

Validation is Node/React server rendering and local SQLite plus Vite build, security scan and dependency audit. No native browser, mobile screenshot or Cloudflare D1 validation is claimed.

Publication gate: existing Cloudflare branch auto-deploys must be disabled for this development branch before push if no deployment is authorized. Do not change production settings to do so. This task does not modify Cloudflare.

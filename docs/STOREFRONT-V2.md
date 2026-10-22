# Storefront V2 — Option 2, review candidate only

## Provenance and release boundary

Starting main: `492fb4a963f9a0c9a8a24cf783a47cbe44ae7586`, tree
`2632c6bd097c61af2eff1b48cefb186b1ad3802d`. Read-only Cloudflare preflight
confirmed canonical Production deployment `05c1e186-a17a-4a37-b1e1-c3be59cffd11`
SUCCESS with Functions, serving application
`b64e078ee6ecfc5f4e124fe6d68129164f521b8a` on Production branch main.

GitHub main contains the release controller and the older static application,
not the deployed storefront application. The feature branch is based on exactly
the required main commit. It first brings in the **unchanged approved application
delta from `393ff88e…` to `b64e078…`**, then adds V2. Consequently the PR against
main is a full application integration, not a small UI-only patch. Reviewers can
isolate V2 by comparing this branch to the approved application; retained `ops/`
and manual-release files come from main. The implementation report records the
complete file list and separates imported baseline files from V2 changes.

The Production deployment workflow is byte-identical to main. It still pins the
previous approved application, so it **cannot release V2**. A future release
candidate, exact CI approval, Preview authorization and separately reviewed
release-controller update will be needed; none is performed here. Automatic
Production builds were disabled. Preview branch inclusion was custom and listed
only `phase/admin-r2-image-upload`, `fix/remove-storefront-filters` and
`fix/mobile-collection-layout`, so the new feature branch is not eligible for
automatic Preview deployment.

## Navigation and merchandise

Primary collection navigation is New In, a Shop disclosure, and Sale. Shop
contains Shop All plus Clothing and Accessories groups. `/shop` is the visual
category hub; `/shop/clothing` and `/shop/accessories` narrow its tiles.
`/category/shop-all` displays the complete public API catalog. Existing category
and product routes are retained. No search, price or size filters are added.

`shared/categories.js` defines 16 clothing and five accessory types, as well as
the legacy New In/Sale category labels and Pajamas label. New In/Sale membership
comes from persisted category/collection metadata, never an invented discount
or inferred arrival time. Group matching changes display only. The API remains
the authority for active-product visibility.

Tiles use images from the public catalog for that category, excluding explicit
drafts, or a neutral CL placeholder. No new merchandise image is generated or
published. Desktop/mobile use the same semantic navigation disclosure, native
buttons and links; hidden links are not focusable. Escape closes and restores
trigger focus, outside pointer clicks, navigation, focus leaving the disclosure
and Back/Forward close it. The panel scrolls within the viewport. Product grids
remain one mobile column, two from 640px and three from 900px. Typography and the
Ivory/Espresso/Taupe/Dusty Rose palette remain unchanged.

## Independent color and size selection

Colors and sizes are exact, separate stored string values. Multiword and
ambiguous colors are displayed as text; only an exact known color name gets an
optional decorative swatch. No user string becomes arbitrary CSS. Labels are
accessible and selection uses native buttons with `aria-pressed`.

Choose an available color, then one of its available sizes. Colors with no stock
and impossible/out-of-stock size combinations are disabled. Changing color keeps
the selected size only if the exact combination remains available; otherwise it
clears size. This avoids trapping users in a combination with no selectable
alternative. S/M/L/XL/2XL/Free Size/No Size, numeric and legacy size values are
supported without rewriting their identities. An ambiguous duplicate pair fails
closed. Add-to-bag sends only the exact existing `variant_id`. No stock values,
server prices, reservation logic or checkout protocol are changed.

## Category, Admin and Excel compatibility

The Admin category options and shared Excel row validation use the same category
list; the Admin editor retains an existing unlisted category option. Existing
variant identities and optimistic stock snapshots are preserved. The accepted
direct Admin API already accepts bounded category text, so no server API change
or schema migration is needed for these labels.

The Excel template uses a hidden Categories sheet and a workbook-scoped named
range for category validation, avoiding Excel's inline-list length limit. Its
existing 11 columns, typed string/number encoding, formula rejection, zip limits,
preview-before-confirmation, session-bound ticket, conflict detection and replay
protection are unchanged. All expanded and legacy labels round-trip through the
actual workbook parser/row validator/exporter. Collections retain `|` syntax.

Limits remain **50 products / 100 total variants per import, 20 variants per
product in Excel**, and **100 variants per product in the existing Admin editor
and direct API**. A product with 21–100 variants must use the existing Admin editor
with its exact IDs and stock snapshots; do not split its inventory into fake
products or import a partial inventory to work around the limit. Exports of such
products are archival: the current importer deliberately rejects >20 entries.
Over 100 variants requires a separately designed and approved contract change.

## Existing-category migration plan — not executed

The existing `products.category` column is text. Migrations 0001–0003 remain
byte-identical to the approved application; there is no migration 0004.

1. Under separate read-only authorization, export the Admin catalog and record
   IDs, exact categories/collections, variant IDs and stock snapshots. A direct
   DB alternative is `SELECT id,title,category FROM products WHERE category IN
   ('Jeans','Pajamas','Pajamas & Sleepwear','Scarves') ORDER BY id;`.
2. Jeans and Scarves now have dedicated navigation entries; leave their stored
   category labels and collection tags unchanged. If historically classified as
   Tops, propose per-product reclassification for Owner review, never infer it
   from a title or image.
3. Legacy Pajamas remains accepted and appears in Pajamas & Sleepwear through a
   display alias. If the Owner wants its stored label updated, use a separately
   approved Admin/Excel preview showing only explicitly listed category changes.
   Preserve every product/variant ID, price, image reference, active state and
   current stock snapshot. Stop on stock or catalog conflict.
4. Save the before/after export and audit event. A later category rollback changes
   only reviewed labels; never restore an old database snapshot over new orders
   or inventory. No automatic category migration or live data access occurred.

## Validation and remaining gates

New tests cover category/group membership, explicit New In/Sale, navigation
open/close and keyboard behavior, neutral/draft-safe tiles, independent selection,
exact cart identities, unavailable/ambiguous pairs, Free Size/No Size/legacy values,
all-category Excel round-trip and named range, unchanged import limits and a
local SQLite Admin/import/export scenario without unrelated stock/order changes.
Existing checkout, reservations, privacy, image sanitization, Admin and Excel
tests run because the shared catalog contract is affected. Tests use local mocks
and in-memory SQLite; no Cloudflare D1/R2 writes or application requests occurred.

Actual rendered mobile browser acceptance is **UNVERIFIED**: Playwright is present
but Chromium's executable is unavailable. Mounted React and responsive-CSS checks
are offline evidence, not a claim of hosted/browser visual acceptance. A future
separately authorized protected Preview should verify 360px, 768px and desktop,
touch/keyboard, direct category/product navigation and refresh, and the Excel
category dropdown in Excel/LibreOffice. Do not repeat hosted write tests simply
to test this visual change. No deployment, dispatch, merge, DNS/domain purchase,
credentials, Access policy or Production data changes are included.

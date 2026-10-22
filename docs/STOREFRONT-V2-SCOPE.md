# Storefront V2 complete PR scope

Base: `492fb4a963f9a0c9a8a24cf783a47cbe44ae7586`. Approved deployed application: `b64e078ee6ecfc5f4e124fe6d68129164f521b8a`.

86 changed files against main: 64 imported byte-identical application files and 22 V2 files (including this inventory). No deletion; no Production release workflow or `ops/` change. The entire `server/`, `functions/`, migrations, image validator and checkout implementation match the deployed application.

## V2 changes

- `docs/CATALOG-DESIGN.md`
- `docs/EXCEL-CATALOG.md`
- `docs/STOREFRONT-V2-DOMAIN.md`
- `docs/STOREFRONT-V2-SCOPE.md`
- `docs/STOREFRONT-V2.md`
- `shared/catalog-import.js`
- `shared/categories.js`
- `src/catalog.js`
- `src/components/CategoryTiles.jsx`
- `src/components/Header.jsx`
- `src/components/ProductEditor.jsx`
- `src/components/ShopNavigation.jsx`
- `src/excel.js`
- `src/index.css`
- `src/main.jsx`
- `src/pages/Category.jsx`
- `src/pages/Home.jsx`
- `src/pages/ProductDetail.jsx`
- `src/pages/Shop.jsx`
- `src/variants.js`
- `tests/catalog-ui.test.js`
- `tests/storefront-v2.test.js`

## Imported approved application, byte-identical

- `.github/workflows/storefront.yml`
- `.gitignore`
- `README.md`
- `docs/API.md`
- `docs/IMPLEMENTATION.md`
- `docs/PRODUCT-IMAGES.md`
- `docs/PRODUCTION-RELEASE-PREPARATION.md`
- `docs/R1.md`
- `docs/R2.md`
- `docs/R3.md`
- `docs/VALIDATION.md`
- `functions/api/[[path]].js`
- `index.html`
- `migrations/0001_storefront.sql`
- `migrations/0002_checkout_recovery.sql`
- `migrations/0003_catalog_import.sql`
- `package-lock.json`
- `package.json`
- `postcss.config.cjs`
- `public/_headers`
- `public/_routes.json`
- `public/products/cl-shirt-001.jpg`
- `public/synthetic-placeholder.svg`
- `scripts/security-check.mjs`
- `server/api.js`
- `server/catalog-import.js`
- `server/checkout.js`
- `server/image-validation.js`
- `server/product-images.js`
- `server/security.js`
- `shared/checkout-protocol.js`
- `shared/product-images.js`
- `src/api.js`
- `src/auth/PasswordGate.jsx`
- `src/cart-ui.js`
- `src/cart.js`
- `src/checkout.js`
- `src/components/CartDrawer.jsx`
- `src/components/ContactLinks.jsx`
- `src/components/ExcelCatalog.jsx`
- `src/components/Filters.jsx`
- `src/components/Footer.jsx`
- `src/components/ImageUpload.jsx`
- `src/components/ProductCard.jsx`
- `src/excel-worker.js`
- `src/image-upload.js`
- `src/pages/Admin.jsx`
- `src/preview-product.js`
- `src/store.jsx`
- `src/utils.js`
- `tests/adapter.js`
- `tests/api.test.js`
- `tests/cart-errors.test.js`
- `tests/cart.test.js`
- `tests/contact-links.test.js`
- `tests/excel-import.test.js`
- `tests/fixtures/owner-catalog-template.xlsx`
- `tests/fixtures/synthetic-catalog.json`
- `tests/image-upload-ui.test.js`
- `tests/preview-product.test.js`
- `tests/product-images.test.js`
- `tests/protocol.test.js`
- `tests/remediation.test.js`
- `tests/rollback.test.js`

## Local validation

Node 24.19.0; `npm ci --ignore-scripts` succeeded. `npm test`: 148 passed, zero failures/skips (136 accepted application tests plus 12 V2 tests). Security checks passed; npm audit: zero vulnerabilities. Vite static build and Wrangler 4.150.0 Pages Functions build succeeded. New/shared JavaScript syntax and Storefront CI YAML passed. No live data tests or deployment requests. Actual mobile/browser visual rendering remains unverified because the Chromium executable is unavailable. GitHub CI is reported separately against the final published SHA.

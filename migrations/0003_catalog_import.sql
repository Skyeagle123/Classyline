-- Additive only. No product/order/variant column or inventory changes.
CREATE INDEX products_sku_case ON products(id COLLATE NOCASE);
CREATE TABLE product_collections (
  product_id TEXT NOT NULL REFERENCES products(id),
  collection TEXT NOT NULL,
  PRIMARY KEY(product_id, collection)
);
CREATE TABLE catalog_imports (
  id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

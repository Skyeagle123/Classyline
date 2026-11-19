CREATE TABLE variant_purchase_costs (
  variant_id TEXT PRIMARY KEY REFERENCES variants(id),
  cost_cents INTEGER NOT NULL CHECK(cost_cents BETWEEN 0 AND 100000000)
);

CREATE TABLE whatsapp_sales (
  id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  delivery_charge_cents INTEGER NOT NULL CHECK(delivery_charge_cents >= 0),
  delivery_cost_cents INTEGER NOT NULL CHECK(delivery_cost_cents >= 0),
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK(status IN ('confirmed','dispatched','delivered','cancelled','returned','returned_damaged')),
  created_at INTEGER NOT NULL,
  business_day TEXT NOT NULL,
  dispatched_at INTEGER,
  delivered_at INTEGER,
  collected_at INTEGER
);

CREATE TABLE whatsapp_sale_items (
  sale_id TEXT NOT NULL REFERENCES whatsapp_sales(id),
  variant_id TEXT NOT NULL REFERENCES variants(id),
  title TEXT NOT NULL,
  size TEXT NOT NULL,
  color TEXT NOT NULL,
  unit_cents INTEGER NOT NULL CHECK(unit_cents >= 0),
  cost_cents INTEGER CHECK(cost_cents >= 0),
  qty INTEGER NOT NULL CHECK(qty BETWEEN 1 AND 20),
  PRIMARY KEY(sale_id, variant_id)
);

CREATE INDEX whatsapp_sales_created ON whatsapp_sales(created_at DESC, id DESC);

CREATE TRIGGER whatsapp_reserve_stock AFTER INSERT ON whatsapp_sale_items BEGIN
  UPDATE variants SET stock = stock - NEW.qty WHERE id = NEW.variant_id;
END;

CREATE TRIGGER whatsapp_restore_stock AFTER UPDATE OF status ON whatsapp_sales
WHEN (NEW.status = 'cancelled' AND OLD.status = 'confirmed')
  OR (NEW.status = 'returned' AND OLD.status IN ('dispatched','delivered'))
BEGIN
  UPDATE variants SET stock = stock + (
    SELECT qty FROM whatsapp_sale_items WHERE sale_id = NEW.id AND variant_id = variants.id
  ) WHERE id IN (SELECT variant_id FROM whatsapp_sale_items WHERE sale_id = NEW.id);
END;

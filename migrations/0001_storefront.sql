PRAGMA foreign_keys=ON;
CREATE TABLE products(id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', image TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents BETWEEN 0 AND 100000000), active INTEGER NOT NULL CHECK(active IN (0,1)));
CREATE TABLE variants(id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), size TEXT NOT NULL, color TEXT NOT NULL, stock INTEGER NOT NULL CHECK(stock>=0), UNIQUE(product_id,size,color));
CREATE TABLE regions(id TEXT PRIMARY KEY, name TEXT NOT NULL, fee_cents INTEGER CHECK(fee_cents BETWEEN 0 AND 100000000));
INSERT INTO regions(id,name) VALUES ('beirut','Beirut'),('mount-lebanon','Mount Lebanon'),('north','North Lebanon'),('akkar','Akkar'),('bekaa','Bekaa'),('baalbek-hermel','Baalbek-Hermel'),('south','South Lebanon'),('nabatieh','Nabatieh'),('keserwan-jbeil','Keserwan-Jbeil');
CREATE TABLE orders(id TEXT PRIMARY KEY, reference TEXT UNIQUE NOT NULL, idempotency_key TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL, customer_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, region_id TEXT NOT NULL REFERENCES regions(id), delivery_cents INTEGER NOT NULL, subtotal_cents INTEGER NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('cod','whatsapp')), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','dispatched','delivered','cancelled')), created_at INTEGER NOT NULL);
CREATE TABLE order_items(order_id TEXT NOT NULL REFERENCES orders(id), variant_id TEXT NOT NULL REFERENCES variants(id), title TEXT NOT NULL, size TEXT NOT NULL, color TEXT NOT NULL, unit_cents INTEGER NOT NULL, qty INTEGER NOT NULL CHECK(qty BETWEEN 1 AND 20), PRIMARY KEY(order_id,variant_id));
CREATE TRIGGER reserve_stock AFTER INSERT ON order_items BEGIN UPDATE variants SET stock=stock-NEW.qty WHERE id=NEW.variant_id; END;
CREATE TRIGGER restore_stock AFTER UPDATE OF status ON orders WHEN NEW.status='cancelled' AND OLD.status!='cancelled' BEGIN UPDATE variants SET stock=stock+COALESCE((SELECT qty FROM order_items WHERE order_id=NEW.id AND variant_id=variants.id),0) WHERE id IN (SELECT variant_id FROM order_items WHERE order_id=NEW.id); END;
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE audit(id TEXT PRIMARY KEY, action TEXT NOT NULL, target TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TRIGGER validate_delivery BEFORE INSERT ON orders BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM regions WHERE id=NEW.region_id AND fee_cents=NEW.delivery_cents) THEN RAISE(ABORT,'Delivery changed') END;
END;
CREATE TRIGGER validate_item BEFORE INSERT ON order_items BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=NEW.variant_id AND p.active=1 AND p.price_cents=NEW.unit_cents AND p.title=NEW.title AND v.size=NEW.size AND v.color=NEW.color) THEN RAISE(ABORT,'Catalog changed') END;
END;

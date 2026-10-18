-- Owner-approved pending reservation lifetime: 30 minutes. Confirmed orders do not expire.
ALTER TABLE orders ADD COLUMN reservation_expires_at INTEGER;
ALTER TABLE orders ADD COLUMN cancellation_reason TEXT CHECK(cancellation_reason IN ('expired','admin'));
UPDATE orders SET reservation_expires_at=created_at+1800 WHERE status='pending';
CREATE INDEX pending_reservation_expiry ON orders(reservation_expires_at) WHERE status='pending';
CREATE INDEX pending_customer_phone ON orders(phone) WHERE status='pending';
-- Normalize previously accepted formatted numbers before applying per-phone admission.
WITH cleaned AS (SELECT id,replace(replace(replace(replace(phone,' ',''),'-',''),'(',''),')','') AS number FROM orders),
international AS (SELECT id,CASE WHEN number LIKE '00%' THEN '+'||substr(number,3) WHEN number LIKE '+%' THEN number WHEN length(number) IN (7,8) AND number NOT GLOB '*[^0-9]*' THEN '+961'||CASE WHEN number LIKE '0%' THEN substr(number,2) ELSE number END ELSE number END AS number FROM cleaned)
UPDATE orders SET phone=(SELECT CASE WHEN number LIKE '+9610%' THEN '+961'||substr(number,6) ELSE number END FROM international WHERE international.id=orders.id)
 WHERE id IN (SELECT id FROM international WHERE number LIKE '+%' AND length(number) BETWEEN 9 AND 16 AND substr(number,2,1)!='0' AND substr(number,2) NOT GLOB '*[^0-9]*');
CREATE TABLE retired_order_keys(idempotency_key TEXT PRIMARY KEY, retired_at INTEGER NOT NULL);
CREATE TRIGGER reject_retired_order BEFORE INSERT ON orders BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM retired_order_keys WHERE idempotency_key=NEW.idempotency_key) THEN RAISE(ABORT,'Order attempt retired') END;
 SELECT CASE WHEN NEW.reservation_expires_at IS NULL OR NEW.reservation_expires_at!=NEW.created_at+1800 OR NEW.reservation_expires_at<=unixepoch() THEN RAISE(ABORT,'Reservation deadline required') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM orders WHERE phone=NEW.phone AND status='pending' AND reservation_expires_at>NEW.created_at) THEN RAISE(ABORT,'Pending customer order exists') END;
END;
CREATE TRIGGER reject_expired_confirmation BEFORE UPDATE OF status ON orders
 WHEN OLD.status='pending' AND NEW.status='confirmed' AND OLD.reservation_expires_at<=unixepoch()
 BEGIN SELECT RAISE(ABORT,'Reservation expired'); END;

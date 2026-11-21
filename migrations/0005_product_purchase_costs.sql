CREATE TABLE product_purchase_costs (
  product_id TEXT PRIMARY KEY REFERENCES products(id),
  cost_cents INTEGER NOT NULL CHECK(cost_cents BETWEEN 0 AND 100000000)
);

-- Carry forward existing costs only where all entered variant costs agree.
INSERT INTO product_purchase_costs(product_id, cost_cents)
SELECT v.product_id, MIN(c.cost_cents)
FROM variant_purchase_costs c JOIN variants v ON v.id = c.variant_id
GROUP BY v.product_id HAVING COUNT(DISTINCT c.cost_cents) = 1;

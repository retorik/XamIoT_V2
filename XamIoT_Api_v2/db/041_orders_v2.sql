-- 041_orders_v2.sql
-- Ajout statut "completed", colonne carrier, timestamps supplémentaires, table order_logs

-- 1. Nouveau statut completed (reconstruction de la contrainte CHECK)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK(status IN ('pending','paid','processing','shipped','delivered','completed','cancelled','refunded'));

-- 2. Nouvelles colonnes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier       text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at  timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at  timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz;

-- 3. Table order_logs — journal par commande (statuts, expédition, paiements, notes)
CREATE TABLE IF NOT EXISTS order_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type       text        NOT NULL,  -- 'status_change' | 'payment' | 'shipping_update' | 'note'
  status_from      text,
  status_to        text,
  tracking_number  text,
  carrier          text,
  note             text,
  created_by_email text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_logs_order_created ON order_logs(order_id, created_at DESC);

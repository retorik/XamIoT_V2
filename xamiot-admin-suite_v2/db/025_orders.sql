-- 025_orders.sql
-- Tables boutique : commandes, lignes de commande, configuration Stripe.

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Coordonnées (dénormalisées au moment de la commande)
  email text NOT NULL,
  full_name text,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  country text NOT NULL DEFAULT 'FR',
  -- Montants en centimes EUR
  subtotal_cents integer NOT NULL DEFAULT 0,
  shipping_cents integer NOT NULL DEFAULT 0,
  tax_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  -- Stripe
  stripe_payment_intent_id text UNIQUE,
  stripe_payment_status text,  -- requires_payment_method | requires_confirmation | processing | succeeded | canceled
  -- Statut logistique
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','paid','processing','shipped','delivered','cancelled','refunded')),
  tracking_number text,
  notes text,
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  shipped_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_stripe ON orders(stripe_payment_intent_id);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  sku text NOT NULL,
  name text NOT NULL,           -- snapshot nom FR au moment de la commande
  unit_price_cents integer NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  total_cents integer NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

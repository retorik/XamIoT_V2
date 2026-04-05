-- 037_user_addresses.sql
-- Adresses utilisateur : livraison et facturation.

CREATE TABLE IF NOT EXISTS user_addresses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         text,                          -- ex: "Maison", "Bureau"
  type          text NOT NULL DEFAULT 'shipping'
    CHECK(type IN ('shipping','billing')),
  is_default    boolean NOT NULL DEFAULT false,
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  company       text,
  line1         text NOT NULL,
  line2         text,
  postal_code   text NOT NULL,
  city          text NOT NULL,
  region        text,                          -- état / province
  country_code  char(2) NOT NULL DEFAULT 'FR' REFERENCES countries(code),
  phone         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_default ON user_addresses(user_id, type, is_default);

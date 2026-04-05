-- 038_orders_addresses.sql
-- Enrichissement des commandes : adresses shipping + billing complètes.
-- Les anciennes colonnes (full_name, address_line1, address_line2, city, postal_code, country)
-- sont conservées pour rétrocompatibilité. Les nouvelles colonnes sont nullable
-- pour ne pas casser les commandes existantes.

-- Adresse de livraison (enrichissement)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_first_name text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_last_name  text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_company    text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_line1      text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_line2      text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_postal_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_city       text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_region     text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_country_code char(2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_phone      text;

-- Adresse de facturation
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_same_as_shipping boolean NOT NULL DEFAULT true;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_first_name  text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_last_name   text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_company     text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_line1       text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_line2       text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_postal_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_city        text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_region      text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_country_code char(2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_phone       text;

-- Migrer les données existantes vers les nouvelles colonnes
UPDATE orders SET
  shipping_line1       = address_line1,
  shipping_line2       = address_line2,
  shipping_city        = city,
  shipping_postal_code = postal_code,
  shipping_country_code = CASE WHEN length(country) = 2 THEN country ELSE 'FR' END,
  shipping_first_name  = split_part(COALESCE(full_name,''), ' ', 1),
  shipping_last_name   = CASE
    WHEN position(' ' in COALESCE(full_name,'')) > 0
    THEN substring(full_name from position(' ' in full_name) + 1)
    ELSE ''
  END
WHERE shipping_line1 IS NULL AND address_line1 IS NOT NULL;

-- 024_boutique.sql
-- Tables boutique : catégories de produits, produits, traductions, images.

-- =============================================
-- CATÉGORIES DE PRODUITS
-- =============================================
CREATE TABLE IF NOT EXISTS product_categories (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text    UNIQUE NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- TRADUCTIONS DES CATÉGORIES
-- =============================================
CREATE TABLE IF NOT EXISTS product_category_translations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
  lang        text NOT NULL CHECK(lang IN ('fr','en','es')),
  name        text NOT NULL,
  UNIQUE(category_id, lang)
);

-- =============================================
-- PRODUITS
-- =============================================
CREATE TABLE IF NOT EXISTS products (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                 text    UNIQUE NOT NULL,
  slug                text    UNIQUE NOT NULL,
  category_id         uuid    REFERENCES product_categories(id) ON DELETE SET NULL,
  status              text    NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  price_cents         integer NOT NULL DEFAULT 0,          -- prix en centimes EUR
  compare_price_cents integer,                              -- prix barré (optionnel)
  stock_qty           integer NOT NULL DEFAULT 0,
  is_physical         boolean NOT NULL DEFAULT true,        -- false = produit numérique
  sort_order          integer NOT NULL DEFAULT 0,
  featured_media_id   uuid    REFERENCES cms_media(id) ON DELETE SET NULL,
  created_by          uuid    REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  published_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_products_status   ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- =============================================
-- TRADUCTIONS DES PRODUITS
-- =============================================
CREATE TABLE IF NOT EXISTS product_translations (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lang              text    NOT NULL CHECK(lang IN ('fr','en','es')),
  name              text    NOT NULL,
  description       text,                                   -- HTML TipTap
  seo_title         text,
  seo_description   text,
  is_auto_translated boolean NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, lang)
);

-- =============================================
-- IMAGES SUPPLÉMENTAIRES (GALLERY)
-- =============================================
CREATE TABLE IF NOT EXISTS product_images (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id   uuid    NOT NULL REFERENCES cms_media(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(product_id, media_id)
);

-- =============================================
-- SEEDS — catégories
-- =============================================

WITH c AS (
  INSERT INTO product_categories (slug, sort_order)
  VALUES ('capteurs', 0)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO product_category_translations (category_id, lang, name)
SELECT c.id, lang, name FROM c, (VALUES ('fr','Capteurs'),('en','Sensors'),('es','Sensores')) AS t(lang, name)
WHERE c.id IS NOT NULL
ON CONFLICT (category_id, lang) DO NOTHING;

WITH c AS (
  INSERT INTO product_categories (slug, sort_order)
  VALUES ('accessoires', 10)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO product_category_translations (category_id, lang, name)
SELECT c.id, lang, name FROM c, (VALUES ('fr','Accessoires'),('en','Accessories'),('es','Accesorios')) AS t(lang, name)
WHERE c.id IS NOT NULL
ON CONFLICT (category_id, lang) DO NOTHING;

-- =============================================
-- SEEDS — produits (catégorie 'capteurs')
-- =============================================

-- Produit 1 : Capteur sonore ESP32-C3
WITH cat AS (
  SELECT id FROM product_categories WHERE slug = 'capteurs'
),
p AS (
  INSERT INTO products (sku, slug, category_id, status, price_cents, stock_qty, published_at)
  SELECT 'XAM-ESP32-C3-01', 'capteur-sonore-esp32-c3', cat.id, 'published', 4990, 50, now()
  FROM cat
  ON CONFLICT (sku) DO NOTHING
  RETURNING id
)
INSERT INTO product_translations (product_id, lang, name, description)
SELECT p.id, 'fr',
  'Capteur sonore ESP32-C3',
  '<p>Capteur de surveillance sonore XamIoT SoundSense basé sur ESP32-C3. Connexion Wi-Fi, mesure 0–100 %.</p>'
FROM p
WHERE p.id IS NOT NULL
ON CONFLICT (product_id, lang) DO NOTHING;

-- Produit 2 : Kit de démarrage XamIoT
WITH cat AS (
  SELECT id FROM product_categories WHERE slug = 'capteurs'
),
p AS (
  INSERT INTO products (sku, slug, category_id, status, price_cents, stock_qty, published_at)
  SELECT 'XAM-STARTER-KIT', 'kit-demarrage-xamiot', cat.id, 'published', 9990, 20, now()
  FROM cat
  ON CONFLICT (sku) DO NOTHING
  RETURNING id
)
INSERT INTO product_translations (product_id, lang, name, description)
SELECT p.id, 'fr',
  'Kit de démarrage XamIoT',
  '<p>Kit complet incluant 1 capteur ESP32-C3, câble USB-C et guide d''installation.</p>'
FROM p
WHERE p.id IS NOT NULL
ON CONFLICT (product_id, lang) DO NOTHING;

-- Produit 3 : Capteur Pro Multi-zones
WITH cat AS (
  SELECT id FROM product_categories WHERE slug = 'capteurs'
),
p AS (
  INSERT INTO products (sku, slug, category_id, status, price_cents, stock_qty)
  SELECT 'XAM-SENSOR-PRO', 'capteur-pro-multi-zones', cat.id, 'draft', 14990, 10
  FROM cat
  ON CONFLICT (sku) DO NOTHING
  RETURNING id
)
INSERT INTO product_translations (product_id, lang, name, description)
SELECT p.id, 'fr',
  'Capteur Pro Multi-zones',
  '<p>Version professionnelle du capteur XamIoT, idéale pour surveiller plusieurs zones simultanément.</p>'
FROM p
WHERE p.id IS NOT NULL
ON CONFLICT (product_id, lang) DO NOTHING;

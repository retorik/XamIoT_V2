-- 028_cms_default_pages.sql
-- Seed des pages légales et utilitaires par défaut (statut draft, FR uniquement).

-- Page Politique de confidentialité
WITH p AS (
  INSERT INTO cms_pages (slug, status, sort_order, show_in_menu)
  VALUES ('politique-de-confidentialite', 'draft', 10, false)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO cms_page_translations (page_id, lang, title, content)
SELECT p.id, 'fr', 'Politique de confidentialité', ''
FROM p
WHERE p.id IS NOT NULL;

-- Page Conditions d'utilisation
WITH p AS (
  INSERT INTO cms_pages (slug, status, sort_order, show_in_menu)
  VALUES ('conditions-utilisation', 'draft', 11, false)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO cms_page_translations (page_id, lang, title, content)
SELECT p.id, 'fr', 'Conditions d''utilisation', ''
FROM p
WHERE p.id IS NOT NULL;

-- Page Conditions d'abonnement
WITH p AS (
  INSERT INTO cms_pages (slug, status, sort_order, show_in_menu)
  VALUES ('conditions-abonnement', 'draft', 12, false)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO cms_page_translations (page_id, lang, title, content)
SELECT p.id, 'fr', 'Conditions d''abonnement', ''
FROM p
WHERE p.id IS NOT NULL;

-- Page CGV
WITH p AS (
  INSERT INTO cms_pages (slug, status, sort_order, show_in_menu)
  VALUES ('cgv', 'draft', 13, false)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO cms_page_translations (page_id, lang, title, content)
SELECT p.id, 'fr', 'CGV – Acheter SoundSense', ''
FROM p
WHERE p.id IS NOT NULL;

-- Page Aide en ligne
WITH p AS (
  INSERT INTO cms_pages (slug, status, sort_order, show_in_menu)
  VALUES ('aide-en-ligne', 'draft', 14, true)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO cms_page_translations (page_id, lang, title, content)
SELECT p.id, 'fr', 'Aide en ligne', ''
FROM p
WHERE p.id IS NOT NULL;

-- Page Contact support
WITH p AS (
  INSERT INTO cms_pages (slug, status, sort_order, show_in_menu)
  VALUES ('contact-support', 'draft', 15, true)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO cms_page_translations (page_id, lang, title, content)
SELECT p.id, 'fr', 'Contact support', ''
FROM p
WHERE p.id IS NOT NULL;

-- Page Mentions légales (déjà référencée dans le footer du site)
WITH p AS (
  INSERT INTO cms_pages (slug, status, sort_order, show_in_menu)
  VALUES ('mentions-legales', 'draft', 9, false)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO cms_page_translations (page_id, lang, title, content)
SELECT p.id, 'fr', 'Mentions légales', ''
FROM p
WHERE p.id IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('028') ON CONFLICT DO NOTHING;

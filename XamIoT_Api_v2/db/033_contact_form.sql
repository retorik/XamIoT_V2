-- 033_contact_form.sql
-- Contenu "après formulaire" sur les pages CMS + rate limit formulaire de contact

-- Champ "texte après formulaire" sur les traductions de pages CMS
ALTER TABLE cms_page_translations ADD COLUMN IF NOT EXISTS content_after TEXT;

-- Paramètres rate limit dédiés au formulaire de contact public
ALTER TABLE rate_limit_config ADD COLUMN IF NOT EXISTS contact_max         INTEGER NOT NULL DEFAULT 5;
ALTER TABLE rate_limit_config ADD COLUMN IF NOT EXISTS contact_window_ms   INTEGER NOT NULL DEFAULT 3600000;

-- Initialise les valeurs si la ligne existe déjà
UPDATE rate_limit_config SET contact_max=5, contact_window_ms=3600000 WHERE id=1;

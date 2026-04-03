-- 023_cms.sql
-- Tables CMS : pages, traductions, médias.
-- Lot 1 — base du site public dynamique.

-- =============================================
-- MÉDIAS
-- =============================================
CREATE TABLE IF NOT EXISTS cms_media (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      text        NOT NULL,          -- nom physique sur le FS
  original_name text        NOT NULL,          -- nom d'upload de l'utilisateur
  mime_type     text        NOT NULL,
  size_bytes    bigint,
  width_px      integer,
  height_px     integer,
  alt_text      text,
  folder        text        NOT NULL DEFAULT '/',
  url_path      text        NOT NULL,          -- ex: /media/2026/04/uuid_image.jpg
  created_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_media_folder ON cms_media(folder);
CREATE INDEX IF NOT EXISTS idx_cms_media_mime   ON cms_media(mime_type);

-- =============================================
-- PAGES CMS
-- =============================================
CREATE TABLE IF NOT EXISTS cms_pages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text        UNIQUE NOT NULL,
  status            text        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  sort_order        integer     NOT NULL DEFAULT 0,
  parent_id         uuid        REFERENCES cms_pages(id) ON DELETE SET NULL,
  show_in_menu      boolean     NOT NULL DEFAULT true,
  featured_media_id uuid        REFERENCES cms_media(id) ON DELETE SET NULL,
  created_by        uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  published_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_slug   ON cms_pages(slug);
CREATE INDEX IF NOT EXISTS idx_cms_pages_status ON cms_pages(status, sort_order);

-- =============================================
-- TRADUCTIONS DE PAGES
-- =============================================
CREATE TABLE IF NOT EXISTS cms_page_translations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id           uuid        NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  lang              text        NOT NULL CHECK (lang IN ('fr','en','es')),
  title             text        NOT NULL,
  content           text,           -- HTML riche (TipTap)
  seo_title         text,
  seo_description   text,
  menu_label        text,           -- libellé menu si différent du titre
  is_auto_translated boolean    NOT NULL DEFAULT false,
  translated_at     timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(page_id, lang)
);

CREATE INDEX IF NOT EXISTS idx_cms_trans_page_lang ON cms_page_translations(page_id, lang);

-- =============================================
-- SEEDS — pages initiales (FR uniquement)
-- =============================================

-- Page Accueil
WITH p AS (
  INSERT INTO cms_pages (slug, status, sort_order, show_in_menu, published_at)
  VALUES ('home', 'published', 0, false, now())   -- home non affichée dans le menu
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO cms_page_translations (page_id, lang, title, seo_title, seo_description, content)
SELECT p.id, 'fr',
  'Accueil',
  'XamIoT — Surveillance sonore intelligente',
  'XamIoT SoundSense : capteur IoT de surveillance sonore, alertes en temps réel et historique depuis votre smartphone.',
  '<h1>Bienvenue sur XamIoT</h1>
<p>XamIoT SoundSense est un système de surveillance sonore intelligent basé sur un capteur ESP32-C3 connecté en Wi-Fi. Suivez les niveaux sonores de vos espaces en temps réel, recevez des alertes push personnalisées et consultez l''historique depuis l''application mobile.</p>
<h2>Fonctionnalités clés</h2>
<ul>
  <li>Mesure du niveau sonore en temps réel (0–100 %)</li>
  <li>Alertes push personnalisables sur iOS et Android</li>
  <li>Historique graphique des 30 dernières mesures</li>
  <li>Configuration Wi-Fi par Bluetooth (BLE)</li>
  <li>Mise à jour firmware à distance (OTA)</li>
</ul>'
FROM p
WHERE p.id IS NOT NULL;

-- Page À propos
WITH p AS (
  INSERT INTO cms_pages (slug, status, sort_order, show_in_menu, published_at)
  VALUES ('about', 'published', 10, true, now())
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO cms_page_translations (page_id, lang, title, seo_title, seo_description, content)
SELECT p.id, 'fr',
  'À propos',
  'À propos — XamIoT',
  'Découvrez l''histoire et la mission de XamIoT.',
  '<h1>À propos de XamIoT</h1>
<p>XamIoT est une solution IoT française conçue pour la surveillance sonore intelligente des espaces professionnels et résidentiels.</p>
<p>Notre capteur SoundSense, basé sur l''ESP32-C3, mesure en continu les niveaux sonores et envoie des alertes en temps réel via l''application mobile disponible sur iOS et Android.</p>'
FROM p
WHERE p.id IS NOT NULL;

-- Page Test iOS
WITH p AS (
  INSERT INTO cms_pages (slug, status, sort_order, show_in_menu, published_at)
  VALUES ('test-ios', 'published', 20, true, now())
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO cms_page_translations (page_id, lang, title, seo_title, seo_description, content, menu_label)
SELECT p.id, 'fr',
  'Application iOS',
  'Télécharger XamIoT SoundSense — iOS',
  'Téléchargez l''application XamIoT SoundSense sur l''App Store pour surveiller vos capteurs depuis votre iPhone.',
  '<h1>XamIoT SoundSense — iOS</h1>
<p>L''application iOS vous permet de surveiller vos capteurs XamIoT SoundSense depuis votre iPhone ou iPad.</p>
<h2>Fonctionnalités</h2>
<ul>
  <li>Tableau de bord temps réel de tous vos capteurs</li>
  <li>Graphique sonore des 30 dernières mesures</li>
  <li>Création et gestion des règles d''alerte</li>
  <li>Historique des notifications reçues</li>
  <li>Enrôlement des capteurs par Bluetooth</li>
</ul>
<h2>Installation</h2>
<p>Disponible sur l''App Store. Recherchez <strong>XamIoT SoundSense</strong>.</p>',
  'App iOS'
FROM p
WHERE p.id IS NOT NULL;

-- Page Test Android
WITH p AS (
  INSERT INTO cms_pages (slug, status, sort_order, show_in_menu, published_at)
  VALUES ('test-android', 'published', 30, true, now())
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO cms_page_translations (page_id, lang, title, seo_title, seo_description, content, menu_label)
SELECT p.id, 'fr',
  'Application Android',
  'Télécharger XamIoT SoundSense — Android',
  'Téléchargez l''application XamIoT SoundSense sur Google Play pour surveiller vos capteurs depuis votre Android.',
  '<h1>XamIoT SoundSense — Android</h1>
<p>L''application Android vous permet de surveiller vos capteurs XamIoT SoundSense depuis votre smartphone Android.</p>
<h2>Fonctionnalités</h2>
<ul>
  <li>Tableau de bord temps réel de tous vos capteurs</li>
  <li>Graphique sonore des 30 dernières mesures</li>
  <li>Création et gestion des règles d''alerte</li>
  <li>Historique des notifications reçues</li>
  <li>Enrôlement des capteurs par Bluetooth</li>
</ul>
<h2>Installation</h2>
<p>Disponible sur Google Play. Recherchez <strong>XamIoT SoundSense</strong>.</p>',
  'App Android'
FROM p
WHERE p.id IS NOT NULL;

-- Page Contact
WITH p AS (
  INSERT INTO cms_pages (slug, status, sort_order, show_in_menu, published_at)
  VALUES ('contact', 'published', 40, true, now())
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO cms_page_translations (page_id, lang, title, seo_title, seo_description, content)
SELECT p.id, 'fr',
  'Contact',
  'Contact — XamIoT',
  'Contactez l''équipe XamIoT pour toute question sur nos produits et solutions IoT.',
  '<h1>Nous contacter</h1>
<p>Pour toute question sur nos produits ou pour obtenir de l''aide, n''hésitez pas à nous écrire.</p>
<p>Email : <a href="mailto:support@xamiot.com">support@xamiot.com</a></p>'
FROM p
WHERE p.id IS NOT NULL;

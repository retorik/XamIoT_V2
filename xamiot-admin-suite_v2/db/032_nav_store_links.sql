-- 032_nav_store_links.sql
-- Liens App Store / Google Play et logos dans le header de navigation

INSERT INTO app_config (key, value, description, is_secret) VALUES
  ('appstore_url',       'https://apps.apple.com',     'URL du lien App Store dans le header du site',           false),
  ('googleplay_url',     'https://play.google.com',    'URL du lien Google Play dans le header du site',          false),
  ('nav_appstore_logo',  '',                            'URL de l''image à afficher à la place du texte App Store (optionnel)', false),
  ('nav_googleplay_logo','',                            'URL de l''image à afficher à la place du texte Google Play (optionnel)', false)
ON CONFLICT (key) DO NOTHING;

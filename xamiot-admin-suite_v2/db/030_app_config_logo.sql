-- 030_app_config_logo.sql
-- Ajout des clés de configuration du logo dans app_config.
-- La table app_config est un store clé/valeur : pas de colonne à ajouter.
-- On insère les clés logo_url et logo_height si elles n'existent pas encore.

INSERT INTO app_config (key, value, description, is_secret) VALUES
  ('logo_url',    '',   'URL du logo affiché dans l''en-tête du site public (laisser vide pour utiliser le texte)', false),
  ('logo_height', '40', 'Hauteur du logo en pixels (défaut : 40)',                                                  false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (filename) VALUES ('030_app_config_logo.sql')
ON CONFLICT DO NOTHING;

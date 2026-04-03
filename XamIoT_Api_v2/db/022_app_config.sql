-- 022_app_config.sql
-- Table de configuration générale administrable depuis le backoffice.
-- Contient les paramètres éditables sans redéploiement.
-- Les URLs d'environnement restent dans .env (elles changent entre DEV et PROD).

CREATE TABLE IF NOT EXISTS app_config (
  key         text PRIMARY KEY,
  value       text,
  description text,
  is_secret   boolean NOT NULL DEFAULT false,  -- si true : masqué dans le backoffice
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Seeds — valeurs initiales non destructives
INSERT INTO app_config (key, value, description, is_secret) VALUES
  ('site_name',              'XamIoT',             'Nom du site public',                                   false),
  ('support_email',          'support@xamiot.com', 'Adresse email de support affichée aux utilisateurs',   false),
  ('password_min_length',    '8',                  'Longueur minimale des mots de passe utilisateur',      false),
  ('password_require_upper', 'true',               'Exiger au moins une majuscule dans le mot de passe',   false),
  ('password_require_digit', 'true',               'Exiger au moins un chiffre dans le mot de passe',      false),
  ('available_langs',        'fr,en,es',           'Langues disponibles sur le site (séparées par virgule)', false),
  ('default_lang',           'fr',                 'Langue par défaut du site public',                     false),
  ('deepl_api_key',          '',                   'Clé API DeepL pour la traduction automatique',         true)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE app_config IS 'Configuration générale administrable depuis le backoffice — hors URLs d''environnement (gérées via .env)';

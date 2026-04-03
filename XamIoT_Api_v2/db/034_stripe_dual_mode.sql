-- 034_stripe_dual_mode.sql
-- Ajout du support double mode Stripe (test/live) avec switch rapide.
-- Migre les anciennes clés uniques vers le bon mode selon leur préfixe.

-- Mode actif : 'test' ou 'live'
INSERT INTO app_config (key, value, description, is_secret)
VALUES ('stripe_mode', 'test', 'Mode Stripe actif (test ou live)', false)
ON CONFLICT (key) DO NOTHING;

-- Clés test
INSERT INTO app_config (key, value, description, is_secret)
VALUES ('stripe_test_secret_key', '', 'Clé secrète Stripe mode test (sk_test_…)', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value, description, is_secret)
VALUES ('stripe_test_webhook_secret', '', 'Webhook secret Stripe mode test (whsec_…)', true)
ON CONFLICT (key) DO NOTHING;

-- Clés live
INSERT INTO app_config (key, value, description, is_secret)
VALUES ('stripe_live_secret_key', '', 'Clé secrète Stripe mode live (sk_live_…)', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value, description, is_secret)
VALUES ('stripe_live_webhook_secret', '', 'Webhook secret Stripe mode live (whsec_…)', true)
ON CONFLICT (key) DO NOTHING;

-- Migration des anciennes clés vers le bon mode
-- Si l'ancienne clé commence par sk_test_ → copier dans stripe_test_secret_key
UPDATE app_config SET value = (
  SELECT value FROM app_config WHERE key = 'stripe_secret_key'
)
WHERE key = 'stripe_test_secret_key'
  AND (value IS NULL OR value = '')
  AND EXISTS (
    SELECT 1 FROM app_config WHERE key = 'stripe_secret_key' AND value LIKE 'sk_test_%'
  );

-- Si l'ancienne clé commence par sk_live_ → copier dans stripe_live_secret_key
UPDATE app_config SET value = (
  SELECT value FROM app_config WHERE key = 'stripe_secret_key'
)
WHERE key = 'stripe_live_secret_key'
  AND (value IS NULL OR value = '')
  AND EXISTS (
    SELECT 1 FROM app_config WHERE key = 'stripe_secret_key' AND value LIKE 'sk_live_%'
  );

-- Migrer le webhook secret vers le mode correspondant à la clé active
UPDATE app_config SET value = (
  SELECT value FROM app_config WHERE key = 'stripe_webhook_secret'
)
WHERE key = 'stripe_test_webhook_secret'
  AND (value IS NULL OR value = '')
  AND EXISTS (
    SELECT 1 FROM app_config WHERE key = 'stripe_webhook_secret' AND value IS NOT NULL AND value != ''
  )
  AND EXISTS (
    SELECT 1 FROM app_config WHERE key = 'stripe_secret_key' AND value LIKE 'sk_test_%'
  );

UPDATE app_config SET value = (
  SELECT value FROM app_config WHERE key = 'stripe_webhook_secret'
)
WHERE key = 'stripe_live_webhook_secret'
  AND (value IS NULL OR value = '')
  AND EXISTS (
    SELECT 1 FROM app_config WHERE key = 'stripe_webhook_secret' AND value IS NOT NULL AND value != ''
  )
  AND EXISTS (
    SELECT 1 FROM app_config WHERE key = 'stripe_secret_key' AND value LIKE 'sk_live_%'
  );

-- Mettre à jour stripe_mode selon l'ancienne clé
UPDATE app_config SET value = 'live'
WHERE key = 'stripe_mode'
  AND EXISTS (
    SELECT 1 FROM app_config WHERE key = 'stripe_secret_key' AND value LIKE 'sk_live_%'
  );

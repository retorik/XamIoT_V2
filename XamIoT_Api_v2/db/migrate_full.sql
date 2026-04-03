BEGIN;

-- Extensions (génération d'UUID côté serveur)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Utilisateurs
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Appareils mobiles (APNs)
CREATE TABLE IF NOT EXISTS mobile_devices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   text NOT NULL DEFAULT 'iOS',
  bundle_id  text,
  apns_token text NOT NULL UNIQUE,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mobile_devices_user ON mobile_devices(user_id);

-- ESP (clé = esp_uid = chipid)
CREATE TABLE IF NOT EXISTS esp_devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  esp_uid      text NOT NULL UNIQUE,
  name         text,
  topic_prefix text NOT NULL DEFAULT '',
  last_seen    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_esp_devices_user ON esp_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_esp_devices_uid  ON esp_devices(esp_uid);

-- Règles d'alerte
CREATE TABLE IF NOT EXISTS alert_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  esp_id         uuid NOT NULL REFERENCES esp_devices(id) ON DELETE CASCADE,
  field          text NOT NULL,   -- ex: soundPct
  op             text NOT NULL,   -- >, >=, <, <=, ==, !=, contains, notcontains
  threshold_num  double precision,
  threshold_str  text,
  cooldown_sec   integer NOT NULL DEFAULT 120,
  enabled        boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_esp ON alert_rules(esp_id);

-- Cooldown des règles
CREATE TABLE IF NOT EXISTS alert_state (
  rule_id   uuid PRIMARY KEY REFERENCES alert_rules(id) ON DELETE CASCADE,
  last_sent timestamptz
);

COMMIT;

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS esp_devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  esp_uid      text NOT NULL UNIQUE,
  name         text,
  topic_prefix text NOT NULL DEFAULT '',
  last_seen    timestamptz
);

-- Petits index utiles
CREATE INDEX IF NOT EXISTS idx_esp_devices_user   ON esp_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_esp_devices_uid    ON esp_devices(esp_uid);
COMMIT;

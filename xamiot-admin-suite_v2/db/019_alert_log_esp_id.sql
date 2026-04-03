-- Migration 019 : ajoute esp_id (FK uuid) à alert_log
-- Remplace le lien textuel device_id (esp_uid) par une FK propre vers esp_devices

ALTER TABLE alert_log
  ADD COLUMN IF NOT EXISTS esp_id uuid REFERENCES esp_devices(id) ON DELETE SET NULL;

-- Backfill des lignes existantes
UPDATE alert_log al
   SET esp_id = e.id
  FROM esp_devices e
 WHERE e.esp_uid = al.device_id
   AND al.esp_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_alert_log_esp_id ON alert_log(esp_id);

-- Backfill device_type_id pour les ESP existants sans type (ex: après re-enrollment)
UPDATE esp_devices
   SET device_type_id = (SELECT id FROM device_types WHERE name = 'ESP32-SoundSense' LIMIT 1)
 WHERE device_type_id IS NULL
   AND (SELECT id FROM device_types WHERE name = 'ESP32-SoundSense' LIMIT 1) IS NOT NULL;

-- Migration 047 — Associer les devices simulés existants au type SoundSense
-- Les futurs devices simulés sont créés avec device_type_id via createSimulatedDevice() (auth.js).
-- Cette migration rattrape les devices déjà créés sans type.

UPDATE esp_devices
SET device_type_id = (SELECT id FROM device_types WHERE name = 'SoundSense' LIMIT 1)
WHERE is_simulated = true
  AND device_type_id IS NULL;

INSERT INTO schema_migrations(version) VALUES ('047_simulator_device_type.sql')
ON CONFLICT DO NOTHING;

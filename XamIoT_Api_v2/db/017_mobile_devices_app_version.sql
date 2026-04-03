-- 017_mobile_devices_app_version.sql
-- Ajoute le suivi de la version et du build de l'app mobile
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS app_version      TEXT,
  ADD COLUMN IF NOT EXISTS app_build_number INT;

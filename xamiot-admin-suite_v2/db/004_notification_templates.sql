-- db/004_notification_templates.sql
-- Templates de notification push par type de device

ALTER TABLE device_types
  ADD COLUMN IF NOT EXISTS notif_title_tpl text DEFAULT '{device_name} — Alerte !',
  ADD COLUMN IF NOT EXISTS notif_body_tpl  text DEFAULT '{field_label} {op} {threshold} {unit} — valeur actuelle : {current_value} {unit}';

-- Seed : template adapté pour ESP32-SoundSense
UPDATE device_types
SET
  notif_title_tpl = 'XamIoT SoundSense !',
  notif_body_tpl  = 'Seuil {op} {threshold} {unit} avec {current_value} {unit}. Périphérique : {device_name}.'
WHERE name = 'ESP32-SoundSense';

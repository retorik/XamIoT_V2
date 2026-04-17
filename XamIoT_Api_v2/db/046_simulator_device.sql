-- Migration 046 : colonne is_simulated sur esp_devices
-- Permet de distinguer les devices simulés (créés automatiquement au signup)
-- des devices physiques réels (enrôlés via BLE).
--
-- Rollback : voir 046_simulator_device_rollback.sql

ALTER TABLE esp_devices
  ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_esp_simulated ON esp_devices(user_id, is_simulated);

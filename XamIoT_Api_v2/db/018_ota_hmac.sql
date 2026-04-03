-- Migration 018 : ajout colonne hmac_sha256 dans ota_updates
-- Utilisée pour vérifier l'intégrité des firmwares côté ESP32

ALTER TABLE ota_updates
  ADD COLUMN IF NOT EXISTS hmac_sha256 TEXT;

-- Migration 016 : ajout des métadonnées mobile (modèle, OS, timezone)
ALTER TABLE mobile_devices ADD COLUMN IF NOT EXISTS model      TEXT;
ALTER TABLE mobile_devices ADD COLUMN IF NOT EXISTS os_version TEXT;
ALTER TABLE mobile_devices ADD COLUMN IF NOT EXISTS timezone   TEXT;

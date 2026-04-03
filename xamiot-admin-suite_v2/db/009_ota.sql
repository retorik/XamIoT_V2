-- db/009_ota.sql
-- Gestion des mises à jour OTA

-- Mise à jour OTA (firmware + métadonnées)
CREATE TABLE IF NOT EXISTS ota_updates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version         text        NOT NULL,
  name            text        NOT NULL,
  description     text,
  device_type_id  uuid        REFERENCES device_types(id) ON DELETE SET NULL,
  firmware_file   text        NOT NULL,  -- chemin relatif dans /data/ota/
  firmware_size   bigint,
  md5             text,
  min_fw_version  text,        -- version min du firmware actuel pour être éligible (optionnel)
  scheduled_at    timestamptz, -- null = non planifié / déclenchement manuel
  created_by      text,        -- email de l'admin
  created_at      timestamptz DEFAULT now(),
  status          text        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','scheduled','deploying','done','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_ota_updates_type   ON ota_updates(device_type_id);
CREATE INDEX IF NOT EXISTS idx_ota_updates_status ON ota_updates(status);

-- Déploiement OTA par device (suivi individuel)
CREATE TABLE IF NOT EXISTS ota_deployments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ota_id      uuid        NOT NULL REFERENCES ota_updates(id) ON DELETE CASCADE,
  esp_id      uuid        NOT NULL REFERENCES esp_devices(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','triggered','downloading','flashing','success','failed','skipped')),
  triggered_at timestamptz,
  last_seen_at  timestamptz,
  fw_version_before text,   -- version avant la mise à jour
  fw_version_after  text,   -- version après (reportée par l'ESP)
  error_msg   text,
  progress    integer,      -- % de progression (0-100, null si inconnu)
  created_at  timestamptz DEFAULT now(),
  UNIQUE(ota_id, esp_id)
);

CREATE INDEX IF NOT EXISTS idx_ota_deployments_ota ON ota_deployments(ota_id);
CREATE INDEX IF NOT EXISTS idx_ota_deployments_esp ON ota_deployments(esp_id);

-- Ajout de la version firmware courante sur esp_devices
ALTER TABLE esp_devices ADD COLUMN IF NOT EXISTS fw_version text;

-- Migration 043 : support URL externe pour les firmwares legacy (sans upload)
-- firmware_url : URL directe HTTP/HTTPS (ex: http://fw.xamiot.com/fw250.bin)
-- Quand renseignée, firmware_file n'est pas requis et le HMAC n'est pas vérifié.

ALTER TABLE ota_updates
  ADD COLUMN IF NOT EXISTS firmware_url text;

-- firmware_file peut maintenant être null (pour les OTA en mode URL externe)
ALTER TABLE ota_updates
  ALTER COLUMN firmware_file DROP NOT NULL;

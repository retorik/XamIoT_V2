-- db/008_mqtt_logs.sql
-- Log brut de toutes les trames MQTT reçues + configuration de rétention des logs

-- Table de rétention des logs (une ligne par type de log)
CREATE TABLE IF NOT EXISTS retention_config (
  log_type     text        PRIMARY KEY,  -- ex: 'mqtt_raw', 'alert_log', ...
  retain_days  integer     NOT NULL DEFAULT 30,
  updated_at   timestamptz DEFAULT now()
);

-- Valeurs par défaut
INSERT INTO retention_config (log_type, retain_days) VALUES
  ('mqtt_raw',  7),
  ('alert_log', 90)
ON CONFLICT DO NOTHING;

-- Log brut des trames MQTT
CREATE TABLE IF NOT EXISTS mqtt_raw_logs (
  id          bigserial   PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  topic       text        NOT NULL,
  payload     text        NOT NULL,
  esp_uid     text,
  esp_id      uuid        REFERENCES esp_devices(id) ON DELETE SET NULL,
  payload_size integer
);

CREATE INDEX IF NOT EXISTS idx_mqtt_raw_logs_received ON mqtt_raw_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mqtt_raw_logs_esp_id   ON mqtt_raw_logs(esp_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_raw_logs_topic    ON mqtt_raw_logs(topic);

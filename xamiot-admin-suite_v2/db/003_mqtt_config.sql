-- db/003_mqtt_config.sql
-- Gestion dynamique des types de devices et trames MQTT

-- =============================================
-- TYPES DE DEVICES IoT
-- =============================================
CREATE TABLE IF NOT EXISTS device_types (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  description text,
  created_at  timestamptz DEFAULT now()
);

-- =============================================
-- DÉFINITIONS DE TRAMES MQTT
-- =============================================
CREATE TABLE IF NOT EXISTS mqtt_frame_definitions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_type_id uuid NOT NULL REFERENCES device_types(id) ON DELETE CASCADE,
  name           text NOT NULL,
  topic_suffix   text NOT NULL,
  direction      text NOT NULL DEFAULT 'inbound'
                   CHECK (direction IN ('inbound','outbound')),
  format         text NOT NULL DEFAULT 'json'
                   CHECK (format IN ('json','text','binary')),
  description    text,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(device_type_id, name)
);

-- =============================================
-- CHAMPS D'UNE TRAME MQTT
-- =============================================
CREATE TABLE IF NOT EXISTS mqtt_frame_fields (
  id                 uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_id           uuid             NOT NULL REFERENCES mqtt_frame_definitions(id) ON DELETE CASCADE,
  name               text             NOT NULL,
  label              text,
  data_type          text             NOT NULL DEFAULT 'number'
                       CHECK (data_type IN ('number','string','boolean')),
  unit               text,
  min_value          double precision,
  max_value          double precision,
  is_primary_metric  boolean          DEFAULT false,
  description        text,
  sort_order         integer          DEFAULT 0,
  created_at         timestamptz      DEFAULT now(),
  UNIQUE(frame_id, name)
);

-- =============================================
-- PATTERNS DE TOPICS MQTT PAR TYPE DE DEVICE
-- =============================================
CREATE TABLE IF NOT EXISTS mqtt_topic_patterns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_type_id uuid NOT NULL REFERENCES device_types(id) ON DELETE CASCADE,
  pattern        text NOT NULL,
  frame_id       uuid REFERENCES mqtt_frame_definitions(id) ON DELETE SET NULL,
  description    text,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(device_type_id, pattern)
);

-- =============================================
-- RATTACHEMENT ESP → TYPE DE DEVICE
-- =============================================
ALTER TABLE esp_devices
  ADD COLUMN IF NOT EXISTS device_type_id uuid REFERENCES device_types(id) ON DELETE SET NULL;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_frame_defs_type   ON mqtt_frame_definitions(device_type_id);
CREATE INDEX IF NOT EXISTS idx_frame_fields_frame ON mqtt_frame_fields(frame_id);
CREATE INDEX IF NOT EXISTS idx_topic_patterns_type ON mqtt_topic_patterns(device_type_id);
CREATE INDEX IF NOT EXISTS idx_esp_device_type    ON esp_devices(device_type_id);

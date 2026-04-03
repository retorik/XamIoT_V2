-- db/003_mqtt_config_seed.sql
-- Données initiales : type ESP32-SoundSense (comportement existant)
-- À exécuter APRÈS 003_mqtt_config.sql

DO $$
DECLARE
  v_type_id  uuid;
  v_frame_id uuid;
BEGIN

  -- Insérer le type "ESP32-SoundSense" si absent
  INSERT INTO device_types (name, description)
  VALUES ('ESP32-SoundSense', 'Capteur de niveau sonore XamIoT SoundSense')
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_type_id FROM device_types WHERE name = 'ESP32-SoundSense';

  -- Insérer la trame "status" si absente
  INSERT INTO mqtt_frame_definitions (device_type_id, name, topic_suffix, direction, format, description)
  VALUES (v_type_id, 'status', 'status', 'inbound', 'json', 'Trame de statut périodique (niveau sonore)')
  ON CONFLICT (device_type_id, name) DO NOTHING;

  SELECT id INTO v_frame_id
  FROM mqtt_frame_definitions
  WHERE device_type_id = v_type_id AND name = 'status';

  -- Champs de la trame status
  INSERT INTO mqtt_frame_fields (frame_id, name, label, data_type, unit, min_value, max_value, is_primary_metric, sort_order)
  VALUES
    (v_frame_id, 'soundPct', 'Niveau sonore',    'number', '%',  0, 100, true,  0),
    (v_frame_id, 'soundAvg', 'Moyenne sonore',   'number', '%',  0, 100, false, 1),
    (v_frame_id, 'soundMin', 'Minimum sonore',   'number', '%',  0, 100, false, 2),
    (v_frame_id, 'soundMax', 'Maximum sonore',   'number', '%',  0, 100, false, 3)
  ON CONFLICT (frame_id, name) DO NOTHING;

  -- Pattern MQTT
  INSERT INTO mqtt_topic_patterns (device_type_id, pattern, frame_id, description)
  VALUES (v_type_id, 'devices/+/status', v_frame_id, 'Topic de statut standard')
  ON CONFLICT (device_type_id, pattern) DO NOTHING;

END $$;

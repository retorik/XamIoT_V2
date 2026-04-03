-- db/006_rule_templates.sql
-- Modèles de règles d'alerte configurables par type de device

CREATE TABLE IF NOT EXISTS alert_rule_templates (
  id             uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  device_type_id uuid             NOT NULL REFERENCES device_types(id) ON DELETE CASCADE,
  name           text             NOT NULL,
  description    text,
  field          text             NOT NULL,
  op             text             NOT NULL
                   CHECK (op IN ('>','>=','<','<=','==','!=','contains','notcontains')),
  threshold_num  double precision,
  threshold_str  text,
  cooldown_sec   integer          DEFAULT 60,
  sort_order     integer          DEFAULT 0,
  created_at     timestamptz      DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_templates_type ON alert_rule_templates(device_type_id);

-- Seed : modèles de base pour ESP32-SoundSense
INSERT INTO alert_rule_templates (device_type_id, name, description, field, op, threshold_num, cooldown_sec, sort_order)
SELECT
  dt.id,
  tpl.name, tpl.description, tpl.field, tpl.op, tpl.threshold_num, tpl.cooldown_sec, tpl.sort_order
FROM device_types dt
CROSS JOIN (VALUES
  ('Bruit modéré',   'Alerte dès que le niveau sonore dépasse 50%',  'soundPct', '>',  50, 120, 0),
  ('Bruit élevé',    'Alerte dès que le niveau sonore dépasse 70%',  'soundPct', '>',  70,  60, 1),
  ('Bruit critique', 'Alerte dès que le niveau sonore dépasse 90%',  'soundPct', '>',  90,  30, 2),
  ('Silence',        'Alerte si le niveau sonore passe sous 5%',     'soundPct', '<',   5, 300, 3)
) AS tpl(name, description, field, op, threshold_num, cooldown_sec, sort_order)
WHERE dt.name = 'ESP32-SoundSense'
ON CONFLICT DO NOTHING;

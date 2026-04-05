-- 038_sys_notif.sql
-- Système 3 : Règles de notifications système (capteurs ET/OU + perte connexion ESP)
-- Totalement indépendant de alert_rules (Système 1) et auto_notif_templates (Système 2)

-- =============================================
-- Règles système (définies par l'admin)
-- =============================================
CREATE TABLE IF NOT EXISTS sys_notif_rules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  description           TEXT,
  enabled               BOOLEAN NOT NULL DEFAULT true,

  -- Type de déclencheur
  trigger_type          TEXT NOT NULL CHECK (trigger_type IN (
    'sensor_threshold', 'device_offline', 'device_online', 'device_silence'
  )),

  -- Logique multi-conditions (pour sensor_threshold)
  logic_op              TEXT NOT NULL DEFAULT 'AND' CHECK (logic_op IN ('AND', 'OR')),

  -- Scope (à quels devices s'applique la règle)
  scope_type            TEXT NOT NULL DEFAULT 'all' CHECK (scope_type IN (
    'all', 'device_type', 'specific_device'
  )),
  scope_device_type_id  UUID REFERENCES device_types(id) ON DELETE SET NULL,
  scope_esp_id          UUID REFERENCES esp_devices(id) ON DELETE SET NULL,

  -- Paramètre délai (pour offline/silence/online)
  offline_threshold_sec INTEGER DEFAULT 300,   -- délai avant alerte (5 min)

  -- Anti-spam
  cooldown_sec          INTEGER NOT NULL DEFAULT 300,

  -- Canaux
  channel_push          BOOLEAN NOT NULL DEFAULT true,
  channel_email         BOOLEAN NOT NULL DEFAULT false,

  -- Templates de notification
  push_title_tpl        TEXT NOT NULL DEFAULT '{device_name} — Alerte',
  push_body_tpl         TEXT NOT NULL DEFAULT '{trigger_label}',
  email_subject_tpl     TEXT,
  email_html_tpl        TEXT,

  -- Audit
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sys_notif_rules_type    ON sys_notif_rules(trigger_type);
CREATE INDEX IF NOT EXISTS idx_sys_notif_rules_enabled ON sys_notif_rules(enabled);

-- =============================================
-- Conditions des règles capteurs (ET/OU)
-- =============================================
CREATE TABLE IF NOT EXISTS sys_notif_conditions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id        UUID NOT NULL REFERENCES sys_notif_rules(id) ON DELETE CASCADE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  field          TEXT NOT NULL,
  op             TEXT NOT NULL CHECK (op IN ('>','>=','<','<=','==','!=','contains','notcontains')),
  threshold_num  DOUBLE PRECISION,
  threshold_str  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sys_notif_conditions_rule ON sys_notif_conditions(rule_id);

-- =============================================
-- État par (règle × device) — cooldown + offline
-- =============================================
CREATE TABLE IF NOT EXISTS sys_notif_state (
  rule_id          UUID NOT NULL REFERENCES sys_notif_rules(id) ON DELETE CASCADE,
  esp_id           UUID NOT NULL REFERENCES esp_devices(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, esp_id),
  last_notified    TIMESTAMPTZ,
  is_offline       BOOLEAN NOT NULL DEFAULT false,
  went_offline_at  TIMESTAMPTZ,
  came_online_at   TIMESTAMPTZ
);

-- =============================================
-- Journal des envois règles système
-- =============================================
CREATE TABLE IF NOT EXISTS sys_notif_log (
  id              BIGSERIAL PRIMARY KEY,
  rule_id         UUID REFERENCES sys_notif_rules(id) ON DELETE SET NULL,
  rule_name       TEXT,                    -- snapshot du nom au moment de l'envoi
  trigger_type    TEXT NOT NULL,
  esp_id          UUID REFERENCES esp_devices(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  channel         TEXT NOT NULL,           -- 'push_apns' | 'push_fcm' | 'email'
  recipient       TEXT,
  status          TEXT NOT NULL CHECK (status IN (
    'sent', 'failed', 'skipped_cooldown', 'skipped_disabled',
    'skipped_no_recipient', 'skipped_smtp_off'
  )),
  trigger_detail  JSONB,                   -- conditions évaluées, valeurs, match, cooldown
  push_result     JSONB,                   -- réponse APNS/FCM complète
  error           TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sys_notif_log_rule ON sys_notif_log(rule_id);
CREATE INDEX IF NOT EXISTS idx_sys_notif_log_esp  ON sys_notif_log(esp_id);
CREATE INDEX IF NOT EXISTS idx_sys_notif_log_sent ON sys_notif_log(sent_at DESC);

INSERT INTO schema_migrations (version) VALUES ('045') ON CONFLICT DO NOTHING;

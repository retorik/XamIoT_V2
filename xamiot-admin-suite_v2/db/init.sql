CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Séquence pour alert_log (bigint auto-increment)
CREATE SEQUENCE IF NOT EXISTS alert_log_id_seq;

-- =============================================
-- USERS
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        citext      UNIQUE NOT NULL,
  pass_hash    text        NOT NULL,
  first_name   text,
  last_name    text,
  phone        text,
  is_active    boolean     DEFAULT false,
  activated_at timestamptz,
  is_admin     boolean     DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- =============================================
-- MOBILE DEVICES (iOS + Android)
-- =============================================
CREATE TABLE IF NOT EXISTS mobile_devices (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES users(id) ON DELETE CASCADE,
  name       text,
  platform   text        CHECK (platform IN ('iOS', 'Android')) DEFAULT 'iOS',
  apns_token text        UNIQUE,
  fcm_token  text        UNIQUE,
  bundle_id  text        NOT NULL,
  sandbox    boolean     DEFAULT false,
  is_active  boolean     DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_seen  timestamptz DEFAULT now()
);

-- =============================================
-- ESP32-C3 DEVICES
-- =============================================
CREATE TABLE IF NOT EXISTS esp_devices (
  id                 uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid             REFERENCES users(id) ON DELETE CASCADE,
  esp_uid            text             UNIQUE NOT NULL,
  name               text,
  topic_prefix       text             NOT NULL,
  mqtt_password_hash text,
  mqtt_enabled       boolean          DEFAULT true,
  is_superuser       boolean          DEFAULT false,
  last_seen          timestamptz,
  last_db            double precision,
  created_at         timestamptz      DEFAULT now()
);

-- =============================================
-- ALERT RULES
-- =============================================
CREATE TABLE IF NOT EXISTS alert_rules (
  id             uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  esp_id         uuid             REFERENCES esp_devices(id) ON DELETE CASCADE,
  field          text             NOT NULL,
  op             text             NOT NULL CHECK (op IN ('>','>=','<','<=','==','!=','contains','notcontains')),
  threshold_num  double precision,
  threshold_str  text,
  enabled        boolean          DEFAULT true,
  cooldown_sec   integer          DEFAULT 60,
  created_at     timestamptz      DEFAULT now()
);

-- =============================================
-- ANTI-SPAM MEMO
-- =============================================
CREATE TABLE IF NOT EXISTS alert_state (
  rule_id   uuid PRIMARY KEY REFERENCES alert_rules(id) ON DELETE CASCADE,
  last_sent timestamptz
);

-- =============================================
-- ALERT LOG
-- =============================================
CREATE TABLE IF NOT EXISTS alert_log (
  id        bigint      PRIMARY KEY DEFAULT nextval('alert_log_id_seq'),
  rule_id   uuid,
  device_id text,
  sent_at   timestamptz NOT NULL DEFAULT now(),
  channel   text,
  status    text,
  payload   jsonb,
  error     text
);

-- =============================================
-- USER NOTIFICATION BADGE
-- =============================================
CREATE TABLE IF NOT EXISTS user_badge (
  user_id      uuid    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  unread_count integer DEFAULT 0,
  updated_at   timestamptz DEFAULT now()
);

-- =============================================
-- PASSWORD RESET TOKENS
-- =============================================
CREATE TABLE IF NOT EXISTS password_resets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_devices_user          ON mobile_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_esp_user              ON esp_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_rules_esp             ON alert_rules(esp_id);
CREATE INDEX IF NOT EXISTS idx_alert_log_rule_sent   ON alert_log(rule_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_log_device_sent ON alert_log(device_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_resets_user  ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_active ON password_resets(user_id, created_at DESC)
  WHERE used_at IS NULL;

-- Migration 036 : ajout limiteur app mobile (iOS/Android)
ALTER TABLE rate_limit_config
  ADD COLUMN IF NOT EXISTS app_max        INTEGER DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS app_window_ms  BIGINT  DEFAULT 900000;

UPDATE rate_limit_config SET app_max = 1000, app_window_ms = 900000 WHERE id = 1;

INSERT INTO schema_migrations (version) VALUES ('036') ON CONFLICT DO NOTHING;

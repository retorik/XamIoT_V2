-- 035_portal_config.sql
-- Paramètres portail client (configurables depuis le backoffice)

-- Clés app_config pour le portail
INSERT INTO app_config (key, value, description) VALUES
  ('portal_refresh_interval_sec', '60', 'Intervalle de rafraîchissement automatique du portail (secondes)'),
  ('portal_idle_timeout_sec',     '60', 'Délai d''inactivité avant pause du rafraîchissement (secondes)'),
  ('portal_auto_logout_min',      '30', 'Déconnexion automatique après inactivité (minutes, 0 = désactivé)')
ON CONFLICT DO NOTHING;

-- Rate limiting dédié au login portail client
ALTER TABLE rate_limit_config
  ADD COLUMN IF NOT EXISTS portal_login_max       integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS portal_login_window_ms  integer NOT NULL DEFAULT 900000;

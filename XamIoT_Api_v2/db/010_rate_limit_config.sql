-- db/010_rate_limit_config.sql
CREATE TABLE IF NOT EXISTS rate_limit_config (
  id               integer PRIMARY KEY DEFAULT 1,
  global_max       integer NOT NULL DEFAULT 500,   -- requêtes max / fenêtre (toutes routes)
  global_window_ms integer NOT NULL DEFAULT 900000, -- fenêtre en ms (défaut 15 min)
  auth_max         integer NOT NULL DEFAULT 20,    -- requêtes max sur /auth/* et /admin/login
  poll_max         integer NOT NULL DEFAULT 2000,  -- requêtes max pour les endpoints de polling (status bar)
  updated_at       timestamptz DEFAULT now()
);
INSERT INTO rate_limit_config (id) VALUES (1) ON CONFLICT DO NOTHING;

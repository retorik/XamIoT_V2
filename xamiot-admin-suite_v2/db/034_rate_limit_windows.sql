-- Migration 034 : ajout colonnes auth_window_ms et poll_window_ms dans rate_limit_config
-- auth et poll avaient auparavant une fenêtre partagée avec global

ALTER TABLE rate_limit_config
  ADD COLUMN IF NOT EXISTS auth_window_ms  INTEGER NOT NULL DEFAULT 900000,
  ADD COLUMN IF NOT EXISTS poll_window_ms  INTEGER NOT NULL DEFAULT 900000;

-- Mettre à jour la ligne existante (id=1) pour initialiser avec global_window_ms
UPDATE rate_limit_config
   SET auth_window_ms = COALESCE(global_window_ms, 900000),
       poll_window_ms = COALESCE(global_window_ms, 900000)
 WHERE id = 1;

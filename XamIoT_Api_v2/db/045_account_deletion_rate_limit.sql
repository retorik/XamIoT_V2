-- Migration 045 : rate limit dédié aux routes de suppression de compte
-- Plus strict que authLimiter (20/15min) : 5 requêtes max par heure
-- Couvre les deux routes : /auth/request-account-deletion et /auth/confirm-account-deletion

ALTER TABLE rate_limit_config
  ADD COLUMN IF NOT EXISTS deletion_max       integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS deletion_window_ms integer NOT NULL DEFAULT 3600000; -- 1h

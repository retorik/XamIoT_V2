-- Migration 035 : ajout limiteur spécifique aux routes /admin/*
ALTER TABLE rate_limit_config
  ADD COLUMN IF NOT EXISTS admin_max        INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS admin_window_ms  INTEGER NOT NULL DEFAULT 900000;

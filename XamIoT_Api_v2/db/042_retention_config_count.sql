-- Migration 042 : ajoute retain_count à retention_config
ALTER TABLE retention_config
  ADD COLUMN IF NOT EXISTS retain_count integer;

-- Migration 020 : cascade DELETE sur alert_log
-- Problème : la suppression d'un device ou d'une règle ne supprimait pas les logs associés.
-- Fix :
--   1. alert_log.esp_id  : ON DELETE SET NULL → ON DELETE CASCADE
--   2. alert_log.rule_id : pas de FK → ON DELETE CASCADE

-- 1. Remplacer la FK esp_id (SET NULL → CASCADE)
ALTER TABLE alert_log
  DROP CONSTRAINT IF EXISTS alert_log_esp_id_fkey;

ALTER TABLE alert_log
  ADD CONSTRAINT alert_log_esp_id_fkey
    FOREIGN KEY (esp_id) REFERENCES esp_devices(id) ON DELETE CASCADE;

-- 2. Ajouter FK rule_id avec cascade
-- Nettoyage préalable : supprime les logs dont la règle n'existe plus (orphelins)
DELETE FROM alert_log
  WHERE rule_id IS NOT NULL
    AND rule_id NOT IN (SELECT id FROM alert_rules);

ALTER TABLE alert_log
  DROP CONSTRAINT IF EXISTS alert_log_rule_id_fkey;

ALTER TABLE alert_log
  ADD CONSTRAINT alert_log_rule_id_fkey
    FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE CASCADE;

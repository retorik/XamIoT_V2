-- db/012_alert_rules_user_label.sql
-- Ajout du nom personnalisé de l'utilisateur pour sa règle
-- + référence optionnelle au template source
ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS user_label  text,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES alert_rule_templates(id) ON DELETE SET NULL;

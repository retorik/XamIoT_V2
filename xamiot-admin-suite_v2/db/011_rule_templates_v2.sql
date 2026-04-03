-- db/011_rule_templates_v2.sql
-- Les modèles de règles ne définissent plus le seuil (c'est l'utilisateur qui le fixe dans l'app)
-- cooldown_sec renommé en cooldown_min_sec (cooldown minimum imposé à l'utilisateur)

ALTER TABLE alert_rule_templates
  RENAME COLUMN cooldown_sec TO cooldown_min_sec;

-- On garde threshold_num / threshold_str pour compatibilité ascendante mais l'UI admin ne les expose plus
-- Ils peuvent servir de "valeur par défaut suggérée" dans l'app mobile si besoin futur

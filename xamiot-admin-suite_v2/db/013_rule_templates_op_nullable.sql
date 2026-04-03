-- db/013_rule_templates_op_nullable.sql
-- L'admin ne définit plus l'opérateur dans le template (c'est l'utilisateur qui le choisit).
-- On rend op nullable et on vide les valeurs existantes.
ALTER TABLE alert_rule_templates ALTER COLUMN op DROP NOT NULL;
UPDATE alert_rule_templates SET op = NULL;

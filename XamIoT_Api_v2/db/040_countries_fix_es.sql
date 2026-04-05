-- 040_countries_fix_es.sql
-- Correction : l'Espagne (ES) était absente de la migration 039_countries_regions.sql

UPDATE countries SET region='Europe', subregion='Southern Europe' WHERE code='ES';

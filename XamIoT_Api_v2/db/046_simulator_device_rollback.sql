-- ROLLBACK migration 046 — suppression du simulateur
-- ⚠️  Ce script supprime TOUTES les données des devices simulés (cascade alert_rules, alert_state).
-- À exécuter UNIQUEMENT si on veut annuler complètement la fonctionnalité simulateur.
--
-- Sur le VPS DEV :
--   docker exec -i postgres psql -U postgres -d xamiot_v2 < /home/jeremy/XamIoT_v2/api/db/046_simulator_device_rollback.sql
--
-- Sur le VPS PROD (ecrimoi.com) :
--   docker exec -i xamiot-postgres psql -U xamiot -d xamiot_v2 < .../046_simulator_device_rollback.sql

-- 1. Suppression des devices simulés (ON DELETE CASCADE gère alert_rules + alert_state)
DELETE FROM esp_devices WHERE is_simulated = true;

-- 2. Suppression de l'index
DROP INDEX IF EXISTS idx_esp_simulated;

-- 3. Suppression de la colonne
ALTER TABLE esp_devices DROP COLUMN IF EXISTS is_simulated;

-- 4. Retrait de la migration du registre
DELETE FROM schema_migrations WHERE version = '046_simulator_device.sql';

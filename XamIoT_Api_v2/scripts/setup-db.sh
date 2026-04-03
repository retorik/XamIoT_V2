#!/usr/bin/env bash
# scripts/setup-db.sh
# Crée la base de données xamiot_v2 et l'utilisateur dédié sur le PostgreSQL du VPS
# Usage: ssh jeremy@ecrimoi.com, puis exécuter ce script depuis le serveur
# Pré-requis: docker exec sur le conteneur xamiot-postgres (superuser xamiot)

set -e

DB_NAME="xamiot_v2"
DB_USER="xamiot_v2_user"
DB_PASS="${DB_PASSWORD:-CHANGE_ME}"  # Passer via variable d'env: DB_PASSWORD=xxx ./setup-db.sh

echo "=== Création de la base $DB_NAME et de l'utilisateur $DB_USER ==="

docker exec -i xamiot-postgres psql -U xamiot -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';
    RAISE NOTICE 'Utilisateur $DB_USER créé.';
  ELSE
    RAISE NOTICE 'Utilisateur $DB_USER existe déjà.';
  END IF;
END
\$\$;
"

docker exec -i xamiot-postgres psql -U xamiot -c "
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')
\gexec
"

docker exec -i xamiot-postgres psql -U xamiot -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo "=== Extensions (pgcrypto + citext) ==="
docker exec -i xamiot-postgres psql -U xamiot -d $DB_NAME -c "
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
"

echo ""
echo "=== Terminé ==="
echo "Connexion prod: postgresql://$DB_USER:PASSWORD@postgres:5432/$DB_NAME"
echo ""
echo "Prochaine étape: déployer XamIoT_Api_v2 avec docker-compose.prod.yml"

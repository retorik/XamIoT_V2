#!/bin/bash
# setup-mqtt-worker.sh
# Insère le worker MQTT (api_worker) dans esp_devices avec is_superuser=true.
# À exécuter UNE FOIS après chaque création de base de données (dev ou prod).
#
# Usage dev  : ./scripts/setup-mqtt-worker.sh dev  <mqtt_pass>
# Usage prod : ./scripts/setup-mqtt-worker.sh prod <mqtt_pass>
#
# Le hash bcrypt est généré en Node.js (bcryptjs déjà dans les deps de l'API).

ENV="${1:-dev}"
MQTT_PASS="${2}"

if [ -z "$MQTT_PASS" ]; then
  echo "Usage: $0 <dev|prod> <mqtt_password>"
  exit 1
fi

# Génère le hash bcrypt via Node (bcryptjs)
HASH=$(node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('${MQTT_PASS}', 10).then(h => { process.stdout.write(h); });
" 2>/dev/null)

if [ -z "$HASH" ]; then
  echo "Erreur: impossible de générer le hash bcrypt (Node.js disponible ?)"
  exit 1
fi

echo "Hash généré: ${HASH:0:20}..."

if [ "$ENV" = "dev" ]; then
  CONTAINER="xamiot-db-v2-dev"
  DB_USER="xamiot_v2_user"
  DB_NAME="xamiot_v2"
else
  CONTAINER="xamiot-postgres"
  DB_USER="xamiot"
  DB_NAME="xamiot_v2"
fi

docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
INSERT INTO esp_devices (user_id, esp_uid, name, topic_prefix, mqtt_password_hash, mqtt_enabled, is_superuser)
VALUES (NULL, 'api_worker', 'API Worker (MQTT superuser)', 'devices/+', '${HASH}', true, true)
ON CONFLICT (esp_uid) DO UPDATE
  SET mqtt_password_hash = EXCLUDED.mqtt_password_hash,
      mqtt_enabled = true,
      is_superuser = true;
SELECT esp_uid, is_superuser, mqtt_enabled FROM esp_devices WHERE esp_uid = 'api_worker';
"

echo ""
echo "Worker MQTT inséré. Pense à mettre MQTT_USER=api_worker MQTT_PASS=${MQTT_PASS} dans .env.local"

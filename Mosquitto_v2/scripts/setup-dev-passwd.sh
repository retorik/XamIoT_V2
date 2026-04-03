#!/bin/bash
# setup-dev-passwd.sh
# Génère le fichier config/passwd pour le Mosquitto dev (docker-compose.dev.yml).
# Nécessite que le container dev soit démarré : docker compose -f docker-compose.dev.yml up -d
#
# Usage: ./scripts/setup-dev-passwd.sh [worker_pass] [esp_pass]
#   worker_pass : mot de passe du worker API  (défaut: change-me-local)
#   esp_pass    : mot de passe d'un ESP test  (défaut: testpass123)

WORKER_PASS="${1:-change-me-local}"
ESP_PASS="${2:-testpass123}"
PASSWD_FILE="config/passwd"

CONTAINER="xamiot-mosquitto-v2-dev"

# Crée le fichier passwd vide dans le container
docker exec "$CONTAINER" sh -c "touch /mosquitto/config/passwd && chmod 600 /mosquitto/config/passwd"

# Ajoute le worker (api_worker)
docker exec "$CONTAINER" mosquitto_passwd -b /mosquitto/config/passwd api_worker "$WORKER_PASS"

# Ajoute un device ESP de test (esp_test_device)
docker exec "$CONTAINER" mosquitto_passwd -b /mosquitto/config/passwd esp_test_device "$ESP_PASS"

echo "✅ Fichier passwd généré dans le container."
echo "   api_worker       → $WORKER_PASS"
echo "   esp_test_device  → $ESP_PASS"
echo ""
echo "Relance le container pour prendre en compte : docker compose -f docker-compose.dev.yml restart"

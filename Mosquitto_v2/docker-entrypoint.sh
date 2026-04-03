#!/bin/sh
set -e

# Substitue ${MQTT_PG_PASSWORD} dans le template via sed (pas besoin de gettext/envsubst)
sed "s|\${MQTT_PG_PASSWORD}|${MQTT_PG_PASSWORD}|g" \
    /mosquitto/config/mosquitto.conf.template > /mosquitto/config/mosquitto.conf

echo "[ENTRYPOINT] mosquitto.conf généré depuis le template."

exec "$@"

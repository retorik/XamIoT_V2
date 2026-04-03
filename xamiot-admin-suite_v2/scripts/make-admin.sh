#!/bin/bash
# Usage: ./scripts/make-admin.sh support@xamiot.com
# Passe un utilisateur existant en admin sur le VPS (container xamiot-postgres)

EMAIL="${1}"
if [ -z "$EMAIL" ]; then
  echo "Usage: $0 <email>"
  exit 1
fi

docker exec xamiot-postgres psql -U xamiot -d xamiot_v2 -c \
  "UPDATE users SET is_admin=true WHERE email='${EMAIL}'; SELECT email, is_admin FROM users WHERE email='${EMAIL}';"

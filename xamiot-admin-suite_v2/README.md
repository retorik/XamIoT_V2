# XamIoT v2 — Monorepo

Plateforme IoT de mesure sonore en temps réel. Ce dépôt contient l'ensemble des composants du projet XamIoT v2.

---

## Structure

```
XamIoT_V2/
├── admin-ui/       # Back-office React (Vite) — gestion devices, users, trames, OTA
├── src/            # API Express.js — authentification, routes admin, MQTT worker
├── ios/            # App iOS Swift/SwiftUI — enrollment BLE, alertes, dashboard
├── android/        # App Android Kotlin/Jetpack Compose
├── esp32/          # Firmware ESP32-C3 SoundSense (PlatformIO)
├── mosquitto/      # Configuration broker MQTT
├── scripts/        # Scripts setup DB, déploiement
└── docker-compose* # Fichiers Docker Compose (dev + prod)
```

---

## Prérequis

- Node.js 20+
- Docker & Docker Compose
- PlatformIO (firmware ESP32)

---

## Démarrage local

### API + Admin UI

```bash
cp .env.example .env.local
# Remplir les variables dans .env.local
docker compose -f docker-compose.dev.yml up -d
```

### Admin UI seul (dev)

```bash
cd admin-ui
npm install
npm run dev
# → http://localhost:5173
```

## Déploiement (VPS)

```bash
bash scripts/deploy.sh
```

URL de production : `https://xamiot.holiceo.com`

## Pages back-office

| Page | Description |
|---|---|
| Login | Authentification admin |
| Dashboard | Vue d'ensemble |
| Users | Gestion des utilisateurs |
| UserDetails | Détail utilisateur + appareils mobiles (model, os_version, timezone, token, env Sandbox/Prod/FCM) |
| EspDevices | Gestion des appareils ESP32 |
| DeviceTypes | Types de devices + trames MQTT (renommer, supprimer) |
| Rules | Règles d'alerte |
| Alerts | Historique des alertes |
| Notifications | Templates de notification |
| Settings | Configuration SMTP + whitelist IP rate limiter |
| ApnsConfig | Configuration APNs (sandbox / production / les deux) |
| OtaUpdates | Gestion firmwares OTA |
| MqttLogs | Logs MQTT |

## Variables d'environnement

Voir `.env.example` pour la liste complète.

| Variable | Description |
|---|---|
| `VITE_API_URL` | URL de base de l'API XamIoT v2 |
| `DATABASE_URL` | Connexion PostgreSQL |
| `JWT_SECRET` | Secret JWT API |
| `MQTT_BROKER_URL` | URL broker MQTT |
| `OTA_HMAC_KEY` | Clé HMAC pour validation firmwares OTA |

## Firmware ESP32-C3

Voir `esp32/` — projet PlatformIO. Version courante : **v2.2.5**

```bash
cd esp32
pio run --target upload
```

## Infrastructure VPS

- OS : Debian 12
- Reverse proxy : Traefik v3
- BDD : PostgreSQL 16 (container `xamiot-postgres`)
- Broker MQTT : Mosquitto (TLS port 8883)
- Réseau Docker : `proxy` (Traefik) + `backend` (BDD)

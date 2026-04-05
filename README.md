# XamIoT v2 — Monorepo

Plateforme de surveillance acoustique IoT : capteurs ESP32-C3, apps mobiles, back-office, API, portail client et site web public.

## Structure

| Dossier | Composant | Stack |
|---------|-----------|-------|
| `XamIoT_Api_v2/` | API backend | Express.js + PostgreSQL |
| `xamiot-admin-suite_v2/` | Back-office admin | React + Vite |
| `XamIoT_Portal_v2/` | Portail client (suivi) | Next.js |
| `XamIoT_Site_v2/` | Site web public + boutique | Next.js |
| `XamIoT_IoS_v2/` | App iOS | Swift / SwiftUI |
| `XamIoT_Android_v2/` | App Android | Kotlin / Jetpack Compose |
| `ESP32-C3-Sensor_v2/` | Firmware capteur | PlatformIO / ESP32-C3 |
| `Mosquitto_v2/` | Broker MQTT | Mosquitto |

## Prérequis

- Node.js 20+
- PostgreSQL 16
- Docker & Docker Compose (pour le VPS)
- PlatformIO (pour le firmware)
- Xcode 15+ (pour iOS)
- Android Studio (pour Android)

## Installation locale (API)

```bash
cd XamIoT_Api_v2
cp .env.example .env.local
npm install
npm run dev
```

## Installation locale (Site web)

```bash
cd XamIoT_Site_v2
npm install
npm run dev
```

## Tests

```bash
cd XamIoT_Api_v2
npm test
```

## Déploiement VPS dev

```bash
bash scripts/deploy.sh
```

Le script fait : rsync → migrations DB → rebuild containers Docker.

## URLs

| Service | Dev (holiceo.com) | Prod (ecrimoi.com) |
|---------|-------------------|--------------------|
| API | https://apixam.holiceo.com | https://api.xamiot.com |
| Admin | https://xamiot.holiceo.com | https://admin.xamiot.com |
| Portail | https://xamcli.holiceo.com | https://portail.xamiot.com |
| Site | https://xamsite.holiceo.com | https://xamiot.com |
| MQTT | mqtt.holiceo.com:8883 | mqtt.xamiot.com:8883 |

## Variables d'environnement

| Fichier | Usage | Commité |
|---------|-------|---------|
| `.env.local` | Dev local Mac | Non |
| `.env.dev` | VPS dev | Non |
| `.env.prod` | VPS prod | Jamais |
| `.env.example` | Template documenté | Oui |

## Repo GitHub

https://github.com/retorik/XamIoT_V2

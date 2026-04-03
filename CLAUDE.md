# CLAUDE.md — XamIoT v2 (Monorepo)

## Structure du monorepo

| Dossier | Composant | Stack |
|---------|-----------|-------|
| `xamiot-admin-suite_v2/` | Back-office (Admin UI) | React + Vite |
| `XamIoT_Api_v2/` | API backend | Express.js |
| `XamIoT_IoS_v2/` | App iOS | Swift / SwiftUI |
| `XamIoT_Android_v2/` | App Android | Kotlin / Jetpack Compose |
| `ESP32-C3-Sensor_v2/` | Firmware capteur | PlatformIO / ESP32-C3 |
| `XamIoT_Portal_v2/` | Portail client | React |
| `XamIoT_Site_v2/` | Site web public | React |
| `Mosquitto_v2/` | Broker MQTT | Mosquitto |

**Repo GitHub** : `https://github.com/retorik/XamIoT_V2`

---

## URLs par environnement

> **REGLE ABSOLUE** : Ne jamais utiliser l'IP `192.168.1.6` dans le code applicatif. Elle est reservee exclusivement aux connexions SSH. Toujours utiliser les noms de domaine ci-dessous.

### Dev (VPS holiceo.com) — SEUL environnement actif

| Service | URL |
|---------|-----|
| **Backoffice (Admin UI)** | https://xamiot.holiceo.com |
| **API** | https://apixam.holiceo.com |
| **Portail client** | https://xamcli.holiceo.com |
| **Site web** | https://xamsite.holiceo.com |
| **MQTT** | mqtt.holiceo.com:8883 (TLS) |

### Production (VPS ecrimoi.com) — NE PAS TOUCHER

| Service | URL |
|---------|-----|
| **Backoffice (Admin UI)** | https://admin.xamiot.com |
| **API** | https://api.xamiot.com |
| **Portail client** | https://portail.xamiot.com |
| **Site web** | https://xamiot.com |
| **MQTT** | mqtt.xamiot.com:8883 (TLS) |

> Tout developpement et deploiement se fait UNIQUEMENT sur le VPS dev (holiceo.com).

---

## Deploiement VPS dev

### REGLE ABSOLUE — Ne jamais deployer manuellement

**Toujours utiliser :**

```bash
bash scripts/deploy.sh
```

### Ce que fait le script

1. **Rsync API** — `XamIoT_Api_v2/` → VPS `/home/jeremy/XamIoT_v2/api/`
2. **Rsync Admin UI** — `xamiot-admin-suite_v2/` → VPS `/home/jeremy/XamIoT_v2/admin/`
3. **Rsync Portail** — `XamIoT_Portal_v2/` → VPS `/home/jeremy/XamIoT_v2/portal/`
4. **Migrations DB** — applique `db/0*.sql` non encore appliques
5. **Rebuild containers** — API + Admin UI + Portail

### Chemins VPS

| Composant | Chemin VPS | Container |
|-----------|-----------|-----------|
| API | `/home/jeremy/XamIoT_v2/api/` | `xamiot-api` |
| Admin UI | `/home/jeremy/XamIoT_v2/admin/` | `xamiot-admin-ui` |
| Portail client | `/home/jeremy/XamIoT_v2/portal/` | `xamiot-portal` |

### Variables d'environnement

| Environnement | Fichier env |
|---------------|------------|
| VPS Dev (holiceo.com) | `.env.dev` |
| VPS Prod (ecrimoi.com) | `.env.prod` |
| Local Mac | `.env.local` |

---

## Verification post-deploiement

```bash
# Containers actifs
ssh jeremy@192.168.1.6 "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep xamiot"

# Reponse HTTP
curl -sk https://xamiot.holiceo.com/ | head -3
curl -sk https://apixam.holiceo.com/health
```

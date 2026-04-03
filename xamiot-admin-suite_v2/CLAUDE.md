# CLAUDE.md — xamiot-admin-suite_v2 (Back-office XamIoT)

## ⚠️ RÈGLE ABSOLUE — Ce repo ne contient QUE le back-office

**Ce dépôt (`https://github.com/retorik/XamIoT_V2`) ne contient que :**
- `admin-ui/` — Back-office React (Vite)
- `db/` — Migrations SQL
- `scripts/` — Scripts de deploy et setup
- `docs/` — Documentation
- `docker-compose*.yml` — Configuration Docker

**Les autres composants XamIoT ont chacun leur dossier dédié. Ne JAMAIS les copier ici.**

## Sources de vérité par composant

| Composant | Dossier local (source de vérité) | Ce repo ? |
|-----------|----------------------------------|-----------|
| **Back-office** | `xamiot-admin-suite_v2/admin-ui/` | ✅ OUI |
| **Migrations SQL** | `xamiot-admin-suite_v2/db/` | ✅ OUI |
| **Scripts deploy** | `xamiot-admin-suite_v2/scripts/` | ✅ OUI |
| App iOS | `XamIoT_IoS_v2/` | ❌ NON |
| App Android | `XamIoT_Android_v2/` | ❌ NON |
| Firmware ESP32 | `ESP32-C3-Sensor_v2/` | ❌ NON |
| API Express.js | `XamIoT_Api_v2/` | ❌ NON |
| Portail client | `XamIoT_Portal_v2/` | ❌ NON |
| Site public | `XamIoT_Site_v2/` | ❌ NON |
| Broker MQTT | `Mosquitto_v2/` | ❌ NON |

> Les dossiers `ios/`, `android/`, `esp32/`, `src/`, `portal/`, `site/`, `mosquitto/` sont dans le `.gitignore` pour éviter toute confusion.

---

## URLs par environnement

> ⚠️ **RÈGLE ABSOLUE** : Ne jamais utiliser l'IP `192.168.1.6` dans le code applicatif. Elle est réservée exclusivement aux connexions SSH. Toujours utiliser les noms de domaine ci-dessous.

### Dev (VPS holiceo.com) — ⚠️ SEUL environnement actif jusqu'à nouvel ordre

| Service | URL |
|---------|-----|
| **Backoffice (Admin UI)** | https://xamiot.holiceo.com |
| **API** | https://apixam.holiceo.com |
| **Portail client** | https://xamcli.holiceo.com |
| **Site web** | https://xamsite.holiceo.com |
| **MQTT** | mqtt.holiceo.com:8883 (TLS) |

### Production (VPS ecrimoi.com) — NE PAS TOUCHER jusqu'à nouvel ordre

| Service | URL |
|---------|-----|
| **Backoffice (Admin UI)** | https://admin.xamiot.com |
| **API** | https://api.xamiot.com |
| **Portail client** | https://portail.xamiot.com |
| **Site web** | https://xamiot.com et https://www.xamiot.com |
| **MQTT** | mqtt.xamiot.com:8883 (TLS) |

> ⚠️ Tout développement et déploiement se fait UNIQUEMENT sur le VPS dev (holiceo.com). Ne pas déployer en production sans instruction explicite.

---

## Déploiement VPS dev

### ⛔ RÈGLE ABSOLUE — Ne jamais déployer manuellement

**Toujours et uniquement utiliser le script :**

```bash
bash scripts/deploy.sh
```

**Ne JAMAIS faire directement sur le VPS :**
```bash
# ❌ INTERDIT — le code source n'a pas été rsynced, le container tourne sur l'ancien code
ssh jeremy@192.168.1.6 "cd /home/jeremy/XamIoT_v2/api && docker compose up -d --build"
```

**Pourquoi c'est dangereux :** Docker voit que le `Dockerfile` n'a pas changé côté VPS → il peut réutiliser le cache → le container affiche "Running" ou "Started" sans avoir le nouveau code.

**Ordre obligatoire :**
1. Modifier le code localement
2. `bash scripts/deploy.sh` ← fait rsync + migrations + rebuild dans le bon ordre

### Ce que fait le script

1. **Rsync API** — `XamIoT_Api_v2/` → VPS `/home/jeremy/XamIoT_v2/api/`
2. **Rsync Admin UI** — `xamiot-admin-suite_v2/` → VPS `/home/jeremy/XamIoT_v2/admin/`
3. **Rsync Portail** — `XamIoT_Portal_v2/` → VPS `/home/jeremy/XamIoT_v2/portal/`
4. **Migrations DB** — applique `db/0*.sql` non encore appliqués
5. **Rebuild containers** — API + Admin UI + Portail

### Chemins VPS

| Composant | Chemin VPS | Container |
|-----------|-----------|-----------|
| API | `/home/jeremy/XamIoT_v2/api/` | `xamiot-api` |
| Admin UI | `/home/jeremy/XamIoT_v2/admin/` | `xamiot-admin-ui` |
| Portail client | `/home/jeremy/XamIoT_v2/portal/` | `xamiot-portal` |

### Variables d'environnement

| Environnement | Fichier env | Docker Compose |
|---------------|------------|----------------|
| VPS Dev (holiceo.com) | `.env.dev` | `docker-compose.dev.yml` |
| VPS Prod (ecrimoi.com) | `.env.prod` | `docker-compose.prod.yml` |
| Local Mac | `.env.local` | `docker-compose.dev.yml` |

> Le VPS dev utilise `.env.dev` (PAS `.env.prod`).

| Fichier obsolète | Raison |
|-----------------|--------|
| `docker-compose.admin-ui.yml` | ⚠️ NE PAS UTILISER — ancien fichier, domaine incorrect |

### Contraintes techniques connues

- **`docker exec -i` dans un heredoc SSH** : le flag `-i` consomme le reste du heredoc comme stdin → le script s'arrête silencieusement.
- **`docker compose up --build` sans rsync préalable** : le container tourne sur l'ancien code. Toujours passer par `scripts/deploy.sh`.

---

## Vérification post-déploiement

```bash
# Containers actifs
ssh jeremy@192.168.1.6 "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep xamiot"

# Réponse HTTP
curl -sk https://xamiot.holiceo.com/ | head -3
curl -sk https://apixam.holiceo.com/health

# Code déployé
ssh jeremy@192.168.1.6 "docker inspect xamiot-api --format '{{.State.StartedAt}}'"
```

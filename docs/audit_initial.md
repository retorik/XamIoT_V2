# Audit Initial — XamIoT V1 sur ecrimoi.com
> Réalisé le 2026-04-04 — Lecture seule, aucune modification effectuée.

---

## 1. Containers Docker actifs (XamIoT V1)

| Container | Image | Statut | Ports internes |
|-----------|-------|--------|----------------|
| `xamiot-api` | `xamiot-api:latest` | Up 5 weeks | 3000/tcp |
| `xamiot-admin-ui` | `xamiot-admin-xamiot-admin-ui` | Up 5 weeks | 80/tcp |
| `mosquitto` | `iegomez/mosquitto-go-auth:2.1.0-mosquitto_2.0.15` | Up 7 weeks | 1883-1884/tcp |
| `xamiot-postgres` | `postgres:16-alpine` | Up 2 months | 5432/tcp |
| `xamiot-pgadmin` | `dpage/pgadmin4` | Up 2 months | 80/tcp, 443/tcp |
| `xamiot-wordpress-1` | `wordpress:php8.2-apache` | Up 7 weeks | 80/tcp |
| `xamiot-db-1` | `mariadb:11.4` | Up 7 weeks (healthy) | 3306/tcp |
| `fw-xamiot` | `nginx:alpine` | Up 6 weeks | 80/tcp |

**Containers non-XamIoT (intouchables) :** traefik, mailu-* (×11), ecrimoi-*, fauvet-*, pikku-*, rcmco-*, pubetnet-*, listmonk, sftpgo, docker-backup-manager, apiwedo, frontadmin, publicwebsite, mypdfapp, jirafeau, photos-rcmco.

---

## 2. Images Docker XamIoT V1

| Image | Taille | Date build |
|-------|--------|------------|
| `xamiot-api:latest` | 906 MB | 2026-02-22 |
| `xamiot-admin-xamiot-admin-ui` | 92.8 MB | 2026-02-22 |
| `xamiot-admin-admin-frontend` | 73.9 MB | 2026-02-11 |
| `iegomez/mosquitto-go-auth:2.1.0-mosquitto_2.0.15` | 239 MB | 2023-05-24 |
| `postgres:16-alpine` | 395 MB | 2026-01-28 |

---

## 3. Volumes Docker

Volumes liés à XamIoT :
- `postgres_postgres_data` — données PostgreSQL partagé
- `postgres_pgadmin_data` — données pgAdmin
- `xamiot_db_data` — données MariaDB WordPress XamIoT
- `xamiot_wp_data` — fichiers WordPress XamIoT

---

## 4. Réseaux Docker

| Réseau | Rôle |
|--------|------|
| `proxy` | Réseau Traefik — tous les services exposés |
| `backend` | Réseau PostgreSQL partagé |
| `mosquitto_mqtt` | Réseau MQTT XamIoT — API + Mosquitto + Postgres (alias `db`) |
| `xamiot_internal` | Réseau interne XamIoT V1 |

---

## 5. Arborescence fichiers XamIoT V1

```
/home/jeremy/
├── api/
│   ├── xamiot/                    ← API V1 (actif)
│   │   ├── src/                   ← code source
│   │   ├── db/                    ← migrations SQL
│   │   ├── secrets/               ← APNs .p8 + FCM JSON (accès restreint)
│   │   ├── docker-compose.yml     ← compose actif
│   │   ├── .env                   ← secrets réels
│   │   └── node_modules/
│   ├── xamiot-admin/              ← Admin UI V1 (actif, container xamiot-admin-ui)
│   │   ├── admin-ui/              ← code source React
│   │   ├── src/                   ← ancien code source backend
│   │   ├── docker-compose.admin-ui.yml  ← compose actif
│   │   └── docker-compose.yml
│   └── xamiot-backend/            ← ancien admin frontend (inactif)
├── mosquitto/                     ← Mosquitto V1 (actif)
│   ├── config/mosquitto.conf
│   ├── data/
│   └── log/
├── postgres/                      ← PostgreSQL partagé (actif)
│   ├── docker-compose.yml
│   └── .env
└── wordpress/xamiot/              ← WordPress XamIoT (site actuel)
```

**`/home/jeremy/XamIoT_v2/` → N'existe pas encore.**

---

## 6. Configuration Traefik

- **Image :** `traefik:v3.6.7`
- **Entrypoints :** `web:80`, `websecure:443`, `mqtts:8883`
- **Certresolver :** `le` (TLS-ALPN-01, Let's Encrypt)
- **Network Traefik :** `proxy` (external)
- **Dashboard :** exposé sur `127.0.0.1:8080`
- **Config :** tout via labels Docker, pas de fichier statique

### Labels Traefik XamIoT V1 en place

| Service | Domaine | Router | Port |
|---------|---------|--------|------|
| API | `api.xamiot.com` | `api-xamiot` | 3000 |
| Admin UI | `admin.xamiot.com` | `xamiot-admin-ui` | 80 |
| Mosquitto | `mqtt.xamiot.com` (TCP/TLS) | `mqtt-xamiot` (TCP) | 1883 |

**⚠️ Domaines non encore routés :** `portail.xamiot.com`, `xamiot.com`, `www.xamiot.com` — pas de containers V1 pour ces services.

---

## 7. PostgreSQL

### Instance
- **Container :** `xamiot-postgres` (postgres:16-alpine)
- **Superuser :** `xamiot` (Superuser, Create role, Create DB, Replication, Bypass RLS)
- **Réseaux :** `backend` (alias `postgres`) + `mosquitto_mqtt` (alias `db`)
- **Volume :** `postgres_postgres_data`
- **Non exposé sur Internet**

### Bases de données existantes

| Base | Owner | Usage |
|------|-------|-------|
| `notify` | xamiot | **Base XamIoT V1 active** |
| `xamiot` | xamiot | Vide (inutilisée) |
| `listmonk` | listmonk | Listmonk mailing |
| `mypdfapp` | mypdfapp | App PDF |
| `wedodiet_db` | wedodiet_user | App Wedodiet |
| `postgres`, `template0`, `template1` | xamiot | Système |

### Schéma BDD V1 (base `notify`)

| Table | Nb lignes | Description |
|-------|-----------|-------------|
| `users` | 21 | Comptes utilisateurs |
| `esp_devices` | 7 | Capteurs ESP32 |
| `mobile_devices` | 15 | Appareils mobiles (iOS uniquement en V1) |
| `alert_rules` | 6 | Règles d'alerte |
| `alert_log` | 1 140 | Historique des alertes envoyées |
| `alert_state` | — | État dernier envoi par règle |
| `user_badge` | — | Compteur notifications non-lues |
| `password_resets` | — | Tokens de réinitialisation |

### Détail des colonnes V1 vs V2 (différences)

**`users`** — identique V1 ↔ V2

**`esp_devices`** — V1 manque vs V2 :
- `fw_version` (text)
- `device_type_id` (uuid → FK device_types)
- Nom colonne `topic_prefix` : présent dans les deux

**`mobile_devices`** — V1 uniquement `apns_token` (iOS only), pas de `fcm_token`. V2 ajoute :
- `fcm_token` (text UNIQUE)
- `os_version`, `app_version`, `app_build_number`, `model`, `timezone`

**`alert_rules`** — V1 manque vs V2 :
- `user_id` (V2 a une référence directe à users, en plus de esp_id→user)
- `user_label` (libellé personnalisé)
- `cooldown_min_sec` (V1 a `cooldown_sec`)

**`alert_log`** — V1 manque vs V2 :
- `esp_id` (UUID, FK esp_devices.id) — V1 a seulement `device_id` (text, FK esp_uid)

**Tables inexistantes en V1 (nouvelles dans V2) :**
- `orders`, `order_items`, `order_logs`
- `products`, `product_translations`, `product_categories`, `product_category_translations`, `product_images`
- `countries`
- `cms_pages`, `cms_page_translations`, `cms_media`
- `support_tickets`, `ticket_messages`
- `rma_requests`, `ota_updates`, `ota_deployments`
- `audit_logs`, `app_config`, `smtp_config`, `apns_config`, `fcm_config`
- `device_types`, `mqtt_frame_definitions`, `mqtt_frame_fields`, `mqtt_topic_patterns`
- `alert_rule_templates`, `manual_campaigns`, `rate_limit_config`, `retention_config`
- `user_addresses`

---

## 8. Mosquitto V1

- **Image :** `iegomez/mosquitto-go-auth:2.1.0-mosquitto_2.0.15` (2023, ancienne)
- **Écoute :** port 1883 en clair en interne (TLS terminé par Traefik sur 8883)
- **Auth :** plugin go-auth, backend postgres, base `notify`
- **Query auth :** `SELECT mqtt_password_hash FROM public.esp_devices WHERE esp_uid = $1 AND mqtt_enabled = true`
- **Superuser query :** ❌ absente
- **ACL query :** ❌ absente (tous les users authentifiés peuvent pub/sub partout)
- **Persistence :** activé, dans `./data/`

**Différences avec V2 :**
- V2 ajoute superuser query (is_superuser) pour l'API worker
- V2 ajoute ACL stricte par device (topics autorisés)
- V2 utilise une image plus récente avec `mosquitto-go-auth` plus récent

---

## 9. API V1 — Variables d'environnement

```env
PORT=3000
NODE_ENV=production
PGHOST=db
PGPORT=5432
PGDATABASE=notify                    # ← la vraie base s'appelle notify, pas xamiot
PGUSER=xamiot
PGPASSWORD=[redacted]
MQTT_HOST=mosquitto
MQTT_PORT=1883
MQTT_USER=api_xamiot
MQTT_PASSWORD=[redacted]
ACTIVATION_LINK_BASE=https://api.xamiot.com/auth/activate
MAIL_FROM=XamIoT <no-reply@xamiot.com>
SMTP_HOST=mail.ecrimoi.com
SMTP_PORT=465
SMTP_USER=no-reply@xamiot.com
SMTP_PASS=[redacted]
APNS_TEAM_ID=52P2R277KX
APNS_KEY_ID=GGGNLJ8269
APNS_P8_PATH=/secrets/AuthKey_GGGNLJ8269.p8
APNS_BUNDLE_ID=com.xamiot.SoundSense
APNS_USE_SANDBOX=true
FCM_SERVICE_ACCOUNT_FILE=/secrets/firebase-service-account.json
```

---

## 10. Cron jobs

| Tâche | Fréquence | Impact |
|-------|-----------|--------|
| `docker builder prune -af` | Dimanche 03h00 | Nettoyage images Docker — inoffensif |
| Jobs Wedodiet | — | Non XamIoT, intouchables |

---

## 11. Observations critiques

| # | Observation | Impact migration |
|---|-------------|-----------------|
| 1 | `XamIoT_v2/` n'existe pas sur le VPS prod | À créer en Étape 5 |
| 2 | La base BDD V1 s'appelle **`notify`**, pas `xamiot` | La cartographie V1→V2 doit cibler `notify` comme source |
| 3 | La base `xamiot` est vide — peut servir de base cible V2 ou en créer une nouvelle `xamiot_v2` | À décider |
| 4 | Mosquitto V1 sans superuser/ACL — V2 est plus strict | Les devices V1 resteront compatibles après migration des `mqtt_password_hash` |
| 5 | `mobile_devices` V1 iOS uniquement (apns_token UNIQUE NOT NULL) — V2 supporte aussi Android | Mapping à adapter : `apns_token` dans V2 est nullable |
| 6 | Secrets APNs (.p8) et FCM (.json) stockés dans `/home/jeremy/api/xamiot/secrets/` | À récupérer et transférer pour V2 |
| 7 | `portail.xamiot.com`, `xamiot.com`, `www.xamiot.com` n'existent pas en V1 | Nouvelles routes Traefik à créer pour V2 |
| 8 | L'image Mosquitto V1 date de 2023 | V2 utilise une image plus récente |
| 9 | `alert_rules.cooldown_sec` en V1 vs `cooldown_min_sec` en V2 | Conversion nécessaire : `cooldown_sec / 60 → cooldown_min_sec` (arrondi) |
| 10 | V1 `mobile_devices.apns_token` NOT NULL — V2 l'accepte nullable | Migration directe possible |

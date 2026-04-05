# Procédure de bascule — XamIoT V1 → V2
> Rédigée le 2026-04-04

---

## Prérequis validés avant bascule

- [x] Étape 1 — Audit initial complet
- [x] Étape 2 — Plan migration BDD
- [x] Étape 3 — Test migration sur copie isolée
- [x] Étape 4 — Secrets V2 générés et communiqués
- [x] Étape 5 — Arborescence ~/XamIoT_v2/ + fichiers config prêts
- [x] Étape 6 — Mosquitto V2 configuré
- [x] Étape 7 — Traefik integration documentée
- [x] Étape 8 — Migration PostgreSQL prod exécutée et vérifiée

**À vérifier avant de lancer la bascule :**
- [ ] DNS : `portail.xamiot.com`, `xamiot.com`, `www.xamiot.com` résolus vers ecrimoi.com
- [ ] SMTP configuré via interface admin V2 (post-démarrage API)
- [ ] APNs + FCM configurés via interface admin V2 (post-démarrage API)

---

## Ordre d'exécution

### 0. Sauvegarde de précaution

```bash
ssh jeremy@ecrimoi.com
docker exec xamiot-postgres pg_dump -U xamiot -Fc notify \
  > /home/jeremy/XamIoT_v2/docs/backup_notify_prebascule_$(date +%Y%m%d_%H%M%S).dump
```

### 1. Démarrer Mosquitto V2

```bash
cd /home/jeremy/XamIoT_v2/Mosquitto_v2
docker compose up -d --build
docker logs mosquitto-v2 --tail 20
```

Vérifier : aucune erreur de connexion PostgreSQL dans les logs.

### 2. Démarrer l'API V2

```bash
cd /home/jeremy/XamIoT_v2/XamIoT_Api_v2
docker compose up -d --build
docker logs xamiot-api --tail 30
```

Vérifier :
- `[DB] Connected` dans les logs
- `[MQTT] Connected` dans les logs
- Aucune erreur de migration

### 3. Démarrer l'Admin UI V2

```bash
cd /home/jeremy/XamIoT_v2/xamiot-admin-suite_v2
docker compose up -d --build
docker logs xamiot-admin-ui --tail 10
```

### 4. Démarrer le Portail V2

```bash
cd /home/jeremy/XamIoT_v2/XamIoT_Portal_v2
docker compose up -d --build
docker logs xamiot-portal --tail 10
```

### 5. Démarrer le Site V2

```bash
cd /home/jeremy/XamIoT_v2/XamIoT_Site_v2
docker compose up -d --build
docker logs xamiot-site --tail 10
```

### 6. Vérifier les routes Traefik

```bash
# Dashboard Traefik (depuis ecrimoi.com)
curl -s http://localhost:8080/api/rawdata | python3 -m json.tool | grep -E 'xamiot-(api|admin|portal|site|mqtt)-v2'
```

Chaque router V2 doit apparaître avec statut `enabled`.

### 7. Tests de connectivité

```bash
# API health
curl -sk https://api.xamiot.com/health

# Admin UI
curl -sk https://admin.xamiot.com/ | head -3

# Portal
curl -sk https://portail.xamiot.com/ | head -3

# Site
curl -sk https://xamiot.com/ | head -3

# MQTT (depuis un client externe)
mosquitto_sub -h mqtt.xamiot.com -p 8883 --capath /etc/ssl/certs \
  -u api_xamiot -P <pwd> -t 'devices/+/status' -C 1 --quiet
```

### 8. Arrêter les containers V1 (GO uniquement après validation des tests)

```bash
# Arrêt API V1
cd /home/jeremy/api/xamiot
docker compose down

# Arrêt Admin UI V1
cd /home/jeremy/api/xamiot-admin
docker compose -f docker-compose.admin-ui.yml down

# Arrêt Mosquitto V1
cd /home/jeremy/mosquitto
docker compose down
```

> **Ne pas arrêter** : xamiot-postgres, xamiot-pgadmin, WordPress xamiot, Traefik, Mailu, et tous les autres services non-XamIoT.

---

## Après bascule

1. Configurer SMTP via `https://admin.xamiot.com` → Paramètres → SMTP
2. Configurer APNs via `https://admin.xamiot.com` → Paramètres → APNs
3. Configurer FCM via `https://admin.xamiot.com` → Paramètres → FCM
4. Vérifier réception de notifications push sur un device de test
5. Désactiver le pseudo-device `api_xamiot` :

```sql
-- Sur xamiot-postgres, base xamiot_v2
UPDATE esp_devices SET mqtt_enabled = false WHERE esp_uid = 'api_xamiot';
```

*Rédigée le 2026-04-04*

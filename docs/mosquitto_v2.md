# Mosquitto V2 — Configuration et différences avec V1
> Rédigé le 2026-04-04

---

## 1. Architecture

| Élément | V1 | V2 |
|---------|----|----|
| Container | `mosquitto` | `mosquitto-v2` |
| Image | `iegomez/mosquitto-go-auth:2.1.0-mosquitto_2.0.15` (2023) | Build custom depuis `Dockerfile` (base mosquitto officielle + go-auth récent) |
| Port interne | 1883 | 1883 |
| Port exposé | 8883 via Traefik TCP | 8883 via Traefik TCP |
| Domaine MQTT | `mqtt.xamiot.com` | `mqtt.xamiot.com` (même domaine) |
| TLS | Terminé par Traefik (passthrough) | Terminé par Traefik (passthrough) |
| Base PostgreSQL | `notify` (user `xamiot`) | `xamiot_v2` (user `xamiot_v2_user`) |
| Réseau interne | `mosquitto_mqtt` | `xamiot_v2_net` |

---

## 2. Améliorations sécurité V2

### 2.1 Superuser query (absent en V1)

V1 n'avait pas de superuser query — tous les devices authentifiés pouvaient pub/sub librement.

V2 :
```sql
SELECT COALESCE(is_superuser::int, 0)
FROM public.esp_devices
WHERE esp_uid = $1 AND mqtt_enabled = true
```
L'API worker (`mqtt_api_v2`) est marqué `is_superuser=true` → peut s'abonner à `devices/+/status` sans restriction ACL.

### 2.2 ACL stricte par device (absent en V1)

V1 : aucune ACL → devices pouvaient publier/s'abonner sur n'importe quel topic.

V2 : chaque ESP peut uniquement :
- **Publier** sur `devices/<son_esp_uid>/status`
- **Publier** sur `devices/<son_esp_uid>/availability`
- **S'abonner** à `devices/<son_esp_uid>/cmd/#`

Query ACL :
```sql
SELECT topic FROM (
  SELECT 'devices/' || esp_uid || '/status'       AS topic, 2 AS rw FROM public.esp_devices WHERE esp_uid = $1 AND mqtt_enabled = true
  UNION ALL
  SELECT 'devices/' || esp_uid || '/availability' AS topic, 2 AS rw FROM public.esp_devices WHERE esp_uid = $1 AND mqtt_enabled = true
  UNION ALL
  SELECT 'devices/' || esp_uid || '/cmd/#'        AS topic, 1 AS rw FROM public.esp_devices WHERE esp_uid = $1 AND mqtt_enabled = true
) t WHERE rw = $2 OR rw = 3 OR (rw = 1 AND $2 = 4)
```

### 2.3 Auth hash

V1 & V2 : bcrypt (cost 10) — compatible directement. Les `mqtt_password_hash` migrés depuis V1 fonctionnent sans modification.

---

## 3. Credentials MQTT V2

| Rôle | Username | Mot de passe | Issu de |
|------|----------|--------------|---------|
| API worker | `mqtt_api_v2` | `sZT2ayc5wI2dgthuS2vZRB75wRwFAc5T` | Secrets générés Étape 4 |
| Devices ESP32 | `<esp_uid>` | hashé bcrypt en base (migré V1) | Table `esp_devices.mqtt_password_hash` |

> Note : en V2 le username MQTT d'un device = son `esp_uid`. Le mot de passe est hashé bcrypt et stocké dans `esp_devices.mqtt_password_hash`. L'API le génère à l'enrollment.
>
> L'entrée `api_xamiot` de V1 est migrée avec `is_superuser=true` pour maintenir la compatibilité pendant la transition. Elle devra être désactivée manuellement (`mqtt_enabled=false`) après validation V2.

---

## 4. Fichiers de configuration

```
Mosquitto_v2/
├── Dockerfile                    ← build custom go-auth
├── docker-entrypoint.sh          ← génère mosquitto.conf depuis template + MQTT_PG_PASSWORD
├── docker-compose.ecrimoi.yml    ← compose production ecrimoi.com (copié → docker-compose.yml)
├── docker-compose.prod.yml       ← compose dev holiceo.com (mqtt.holiceo.com)
├── config/
│   ├── mosquitto.conf.template   ← template avec ${MQTT_PG_PASSWORD}
│   └── mosquitto.dev.conf        ← config dev locale
└── .env.prod                     ← MQTT_PG_PASSWORD (non commité, ecrimoi.com)
```

---

## 5. Déploiement sur ecrimoi.com

### Prérequis
- Réseau Docker `xamiot_v2_net` créé ✅ (créé en Étape 5)
- Réseau Docker `backend` existant ✅ (réseau shared PostgreSQL)
- Réseau Docker `proxy` existant ✅ (Traefik)
- Base `xamiot_v2` initialisée avec table `esp_devices` ✅ (Étape 8)
- `.env.prod` présent avec `MQTT_PG_PASSWORD` ✅

### Commandes (après migration données — Étape 8)
```bash
cd /home/jeremy/XamIoT_v2/Mosquitto_v2
docker compose -f docker-compose.yml up -d --build
docker logs mosquitto-v2 --tail 20
```

### Vérification
```bash
# Test connexion depuis un client MQTT local
mosquitto_pub -h mqtt.xamiot.com -p 8883 --capath /etc/ssl/certs \
  -u api_xamiot -P <mqtt_password_hash_of_api_xamiot> \
  -t "devices/test/status" -m '{"test":1}'
```

---

## 6. Rollback

Si Mosquitto V2 pose problème pendant la bascule :
1. `docker stop mosquitto-v2`
2. Relancer l'ancien Mosquitto V1 : `docker start mosquitto`
3. Les labels Traefik seront rebasculés sur V1 (procédure rollback)

---

## 7. Nettoyage post-validation

Après validation complète V2 :
1. Désactiver `api_xamiot` dans `esp_devices` : `UPDATE esp_devices SET mqtt_enabled=false WHERE esp_uid='api_xamiot'`
2. Stopper et supprimer le container Mosquitto V1 (`mosquitto`)
3. Supprimer le réseau `mosquitto_mqtt` si vide

*Rédigé le 2026-04-04 — Mosquitto_v2/ sur ecrimoi.com*

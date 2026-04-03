# ROADMAP — XamIoT v2

## Réalisé

| Date | Item |
|---|---|
| 2026-03-27 | Création de tous les composants v2 (API, iOS, Android, Admin, Mosquitto, ESP32) |
| 2026-03-27 | API v2 : correction schéma DB complet (9 tables alignées avec le code) |
| 2026-03-27 | API v2 : suppression JWT hardcodé, rate limiting, CORS origin-restricted |
| 2026-03-27 | API v2 : graceful degradation APNs (pas de crash sans clé .p8) |
| 2026-03-27 | API v2 : bug GET /admin/me corrigé (bloquant back-office) |
| 2026-03-27 | API v2 : bug FCM token Android corrigé (mqttWorker) |
| 2026-03-27 | API v2 : CHECK constraint op étendu (contains/notcontains) |
| 2026-03-27 | API v2 : /admin/login rate-limité (strict 20/15min) |
| 2026-03-27 | iOS : ServerConfig + sélecteur 5 taps + toutes URLs via ServerConfig |
| 2026-03-27 | Android : ServerConfig + sélecteur 5 taps + toutes URLs via ServerConfig |
| 2026-03-27 | Mosquitto_v2 : mot de passe PG retiré du code → env var, ACL par device, superuser worker |
| 2026-03-27 | Admin-suite v2 : docker-compose.dev.yml, CORS corrigé, user admin créé |
| 2026-03-27 | Worker MQTT (api_worker) inséré dans DB dev avec is_superuser=true |
| 2026-03-27 | ESP32 : version firmware bumped 1.1.9 → 2.0.0 |
| 2026-03-27 | iOS + Android : BLE enrollment pousse MQTT host+port selon mode local/prod (ServerConfig) |

## En cours

*(rien)*

## Réalisé (suite)

| Date | Item |
|---|---|
| 2026-03-31 | Déploiement VPS 192.168.1.6 : DB xamiot_v2 + user xamiot_v2_user créés |
| 2026-03-31 | Déploiement VPS : /home/jeremy/XamIoT_v2/{api,admin,mosquitto} + docker-compose.prod.yml |
| 2026-03-31 | API live sur https://apixam.holiceo.com via Traefik + Let's Encrypt |
| 2026-03-31 | Admin UI live sur https://xamiot.holiceo.com |
| 2026-03-31 | Mosquitto v2 déployé port 1883 (LAN uniquement), auth PostgreSQL go-auth |
| 2026-03-31 | api_worker inséré en DB avec is_superuser=true, MQTT worker connecté |
| 2026-03-31 | Compte admin support@xamiot.com créé et activé |
| 2026-03-31 | Mosquitto Dockerfile : apt → sed (base image bullseye trop ancienne) |

## Prévu

| Item | Priorité |
|---|---|
| Migration données v1 → v2 (users, esp_devices, alert_rules) | Haute |
| Tests mobiles iOS + Android sur device physique | Haute |
| Tester Mosquitto_v2 dev (démarrage + script passwd) | Moyenne |
| Révocation clés APNS (AuthKey_Y7SDPM4V35.p8 + AuthKey_GGGNLJ8269.p8) | Avant production |
| Révocation Firebase service account key v1 | Avant production |
| Ajouter `GET /me` (profil utilisateur complet) si besoin app mobile | Basse |

## Backlog

- Tests unitaires API (auth, règles, alertes)
- Tests d'intégration (flux MQTT complet)
- Rotation automatique JWT (refresh token)
- Push Android via FCM pour les alertes (tester avec device réel)

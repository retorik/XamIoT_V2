# Roadmap — XamIoT v2

---

## En cours

- Stabilisation firmware ESP32-C3 (coexistence BLE+WiFi, reconnexion MQTT TLS)

---

## Prévu

- Règles d'alerte éditables depuis l'app iOS et Android (template + seuil utilisateur)
- OTA firmware depuis le back-office (upload + déclenchement MQTT)
- Notifications push APNS (iOS) et FCM (Android) à l'alerte

---

## Backlog

- Multi-device par utilisateur (dashboard agrégé)
- Historique des niveaux sonores (stockage timeseries)
- Export CSV des données

---

## Réalisé

### 2026-04-03
- Site public : boutique (`/boutique`, `/boutique/[slug]`), pages CMS dynamiques corrigées (fix 404)
- Portail client : page appareils (IoT + mobiles), notifications/règles, commandes, profil corrigé
- Back-office : dashboard stats en cours/total (Tickets/RMA/Commandes), éditeur CMS fix contenu vide
- Back-office : configuration Stripe éditable (clés sauvegardées en base)
- API : profil `/me/profile`, Stripe `PUT /admin/stripe`, volume media persistant

### 2026-04-02
- Bouton Renommer les trames MQTT dans le back-office (TypesDevices)
- Correction doublon "Niveau en temps réel" dans la création de règle iOS/Android
- Firmware v2.2.5 : crash BLE+WiFi résolu, logs watchdog assainis
- Firmware v2.2.4 : suppression credentials MQTT par défaut, enrollment BLE obligatoire
- Firmware v2.2.3/v2.2.2 : fix MQTT TLS reconnexion (EBADF, WDT)

### 2026-03-31
- Monorepo complet initialisé (API, admin-ui, iOS, Android, ESP32, Mosquitto)
- Règles d'alerte éditables (templates admin + personnalisation utilisateur)
- Fix PATCH règle : field + template_id correctement persistés

### 2026-03-27
- Audit complet du projet v2 (scores santé, 7 risques critiques identifiés)
- Admin suite v2 : UserDetails redesign, rate limit logs, fix login unicode

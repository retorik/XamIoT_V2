# Changelog — XamIoT v2

Toutes les modifications notables de ce projet sont documentées ici.
Format : [SemVer](https://semver.org/) — `[version] YYYY-MM-DD`

---

## [Non publié]

---

## Site public (site/)

### [2026-04-03]
#### Corrigé
- Pages CMS renvoyaient systématiquement 404 : la vérification `page.status !== 'published'` a été retirée de `app/[slug]/page.tsx` — l'API filtre déjà `WHERE status='published'`, le champ n'est pas retourné dans la réponse publique

#### Ajouté
- Boutique publique (`/boutique`, `/boutique/[slug]`) : catalogue produits multilingue, bannière compte requis pour commander
- Page dynamique CMS (`/[slug]`) : affichage contenu riche, SEO, image vedette
- Header enrichi : liens Boutique, Contact, Support, Mon espace (plain link)
- Favicon identique au back-office

---

## Portail client (portal/)

### [2026-04-03]
#### Ajouté
- Page `/devices` : liste capteurs IoT + appareils mobiles (iOS/Android) en deux sections
- Page `/notifications` : gestion des règles d'alerte par device (toggle on/off)
- Page `/commandes` : historique des commandes avec détail
- Page `/profile` corrigée : appel `GET /me/profile` (au lieu de `/users/:id` admin)
- Sidebar : suppression des liens Boutique et Panier

---

## Back-office (admin-ui)

### [2026-04-03]
#### Ajouté
- **Dashboard** : stats en deux valeurs (en cours / total) pour Tickets, RMA et Commandes (`StatSplit`)
- **Éditeur CMS** (`PageEditor`) : contenu TipTap désormais chargé correctement après fetch API (dépendances `useEffect` corrigées)
- **Configuration Stripe** : clés `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` éditables depuis l'interface (sauvegarde en base via `PUT /admin/stripe`)

#### Corrigé
- Picker de logo : `item.url` → `MEDIA_BASE + item.url_path` (champ retourné par l'API)
- Logs MQTT : `hasCount: true` activé pour afficher le nombre de logs par device

---

### [2026-04-02]
#### Ajouté
- Bouton **Renommer** sur les trames MQTT dans la section Types de devices (`DeviceTypes.jsx`)
  - Formulaire inline avec champs nom, suffixe, description
  - Sauvegarde via `PUT /admin/frames/:id`
- Cache-control nginx corrigé : `index.html` servi sans cache, assets hashés mis en cache 1 an

#### Corrigé
- Boutons Renommer/Supprimer non visibles : `overflow: hidden` retiré du conteneur parent
- Duplication "Niveau en temps réel" dans la création de règle iOS/Android (`Rules.jsx`) — SQL `DISTINCT ON (t.id)` côté API

---

## API (src/)

### [2026-04-03]
#### Ajouté
- `GET /me/profile` : endpoint profil utilisateur pour le portail client
- `GET /esp-devices/:id` avec vérification d'ownership (portail)
- `PUT /admin/stripe` : sauvegarde `stripe_secret_key` et `stripe_webhook_secret` en base (`app_config`)
- `GET /admin/stripe` : lecture depuis DB en priorité, puis variable d'env ; retourne `key_hint`, `source`, `webhook_configured`
- `GET /admin/summary` enrichi : `tickets_total/open`, `rma_total/open`, `orders_total/active/done`
- `GET /public/products` et `GET /public/products/:slug` : catalogue boutique public
- Middleware d'audit (`auditMiddleware.js`) : IP via `req.ip`, corps filtré dans `details`
- Rétention logs MQTT configurable par device (`retain_count` via `app_config`)
- Volume Docker `xamiot_media_data:/data/media` ajouté (`docker-compose.prod.yml`) — persistance des uploads
- Menu public (`GET /public/menu`) : retourne `title` et `menu_label` séparément

#### Corrigé
- Stripe lazy-init : réinitialise l'instance si la clé change (DB override)

---

### [2026-04-02]
#### Corrigé
- `GET /admin/device-types/:id/rule-templates` : ajout `DISTINCT ON (t.id)` pour éviter les doublons de templates selon les types de device
- Routes admin : correction des middlewares et gestion des erreurs

---

## Firmware ESP32-C3 (esp32/)

### v2.2.5 — 2026-04-02
#### Ajouté
- `esp_task_wdt_reset()` avant `g_mqtt.connect()` pour éviter le crash WDT lors du handshake TLS MQTT (pouvait bloquer >30 s)

#### Corrigé
- **Crash `abort()` lors de l'enrollment BLE** : `esp_wifi_set_ps(WIFI_PS_NONE)` interdit par l'ESP32-C3 quand BLE est actif → rétabli `prepareCoex()` dans `SW_BEGIN`
- Log watchdog WiFi répétitif toutes les 2 s sans credentials → supprimé
- `WiFi.disconnect()` appelé dans le watchdog même sans credentials → conditionné à la présence d'un SSID valide

### v2.2.4 — 2026-04-02
#### Modifié
- **Suppression des valeurs MQTT par défaut** (`mqtt.xamiot.com`, `mqtt_user`, `mqtt_pass`) : plus aucune connexion MQTT tentée sans enrollment BLE préalable
- `loadMqttSettings()` : charge depuis NVS uniquement, retourne vide si absent
- `resetStoredCredentials()` : efface le namespace MQTT sans y réécrire de valeurs par défaut
- `mqttReconnectIfNeeded()` : guard si `host`, `port`, `user` ou `pass` vides

### v2.2.3 — 2026-04-02
#### Ajouté
- `esp_task_wdt_reset()` avant `g_mqtt.connect()` (première version — WDT fix)

#### Corrigé
- `flush()` + 500 ms avant chaque tentative de reconnexion MQTT TLS (évite `errno: 9 EBADF`)

### v2.2.2 — 2026-04-02
#### Corrigé
- `flush()` avant `stop()` dans `SW_PREPARE` pour libérer proprement le socket lwIP
- Délai inter-phases porté à 200 ms pour `SW_BEGIN` (stack WiFi ESP32-C3)
- `flush()` + délai 500 ms dans `mqttReconnectIfNeeded()`

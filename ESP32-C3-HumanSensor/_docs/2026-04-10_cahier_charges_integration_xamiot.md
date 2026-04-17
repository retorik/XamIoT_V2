# Cahier des charges — Intégration HLK-LD2410C dans XamIoT

**Date :** 2026-04-10  
**Auteur :** Session Claude Code  
**Contexte :** Intégration du capteur de présence humaine radar HLK-LD2410C dans le système XamIoT v2 (API, back-office, portail client, apps iOS/Android)

---

## Prompt d'implémentation pour Claude Code

---

Tu travailles sur le monorepo **XamIoT v2** (`/Users/jeremyfauvet/Dev_Claude/XamIoT/`).

Il s'agit d'intégrer un nouveau type de capteur : **HumanSensor** (radar de présence HLK-LD2410C sur ESP32-C3).

### Contrainte absolue
Ne modifier **aucun** fichier existant avant d'avoir lu son contenu complet. Respecter toutes les règles du `CLAUDE.md` du projet (déploiement DEV+PROD simultané, `docker-compose.ecrimoi.yml` sur PROD, jamais `docker-compose.prod.yml`).

---

## 1. Firmware ESP32-C3 (`ESP32-C3-HumanSensor/`)

### Objectif
Transformer le prototype HTTP en firmware de production compatible XamIoT.

### 1.1 Configuration dynamique du WiFi (priorité : critique)

Remplacer les `#define WIFI_SSID` / `WIFI_PASS` hardcodés par un système de provisioning :

**Option recommandée : BLE enrollment** (cohérent avec SoundSense)
- Exposer un service BLE GATT au démarrage si aucune config n'est enregistrée en NVS
- Caractéristiques : `wifi_ssid`, `wifi_pass`, `mqtt_host`, `mqtt_port`, `mqtt_user`, `mqtt_pass`, `device_uid`
- Après réception, stocker en NVS via `Preferences`, redémarrer
- Désactiver le BLE une fois connecté (libère mémoire — ESP32-C3 limitation BLE+WiFi simultanés)

**Alternative : portail captif WiFi**
- AP temporaire `HumanSensor-XXXX` avec interface web de configuration
- Plus simple mais moins cohérent avec l'UX des autres capteurs XamIoT

### 1.2 Publication MQTT (priorité : critique)

Ajouter `PubSubClient` (ou `AsyncMqttClient`) aux dépendances `platformio.ini`.

**Topic de publication :**
```
xamiot/{esp_uid}/data
```

**Payload JSON :**
```json
{
  "presence": true,
  "state": "moving",
  "moving_dist_cm": 120,
  "moving_energy": 85,
  "static_dist_cm": 0,
  "static_energy": 0,
  "target_dist_cm": 120,
  "out_pin": 1,
  "device_type": "HumanSensor"
}
```

- Publier à chaque **changement d'état** de `presence` (évite le flood)
- Publier également sur heartbeat toutes les 60s (keep-alive + données fraîches)
- Connexion TLS (port 8883) avec certificat CA du broker Mosquitto XamIoT
- Authentification : `mqtt_user` / `mqtt_pass` reçus à l'enrollment

### 1.3 `esp_uid` unique (priorité : haute)

Générer un identifiant unique à partir de l'adresse MAC ESP32-C3 :
```cpp
// Format identique aux SoundSense : "XXXXXXXXXXXXXX" (hex MAC sans séparateurs)
uint8_t mac[6];
esp_read_mac(mac, ESP_MAC_WIFI_STA);
char uid[13];
snprintf(uid, sizeof(uid), "%02X%02X%02X%02X%02X%02X", mac[0],mac[1],mac[2],mac[3],mac[4],mac[5]);
```

Stocker en NVS. Envoyer dans chaque payload MQTT et pendant l'enrollment BLE.

### 1.4 OTA (priorité : moyenne)

Ajouter `ArduinoOTA` ou `HTTPClient` + serveur de mise à jour.
- Déclencher via topic MQTT `xamiot/{esp_uid}/cmd` avec payload `{"cmd":"ota","url":"..."}`
- Optionnel en V1 — documenter la procédure USB comme alternative

### 1.5 Ce qui ne change PAS

- Le parseur UART (ring buffer, CRC, struct AppState) : **conserver tel quel**
- La calibration EMA + hystérésis : **conserver telle quelle**
- Le gestionnaire WiFi (`wifi_mgr.cpp`) : **conserver, juste retirer les credentials hardcodés**
- Le serveur HTTP `/status` : **conserver** (utile pour debug local)

---

## 2. API (`XamIoT_Api_v2/`)

### 2.1 Nouveau `device_type` : HumanSensor

Créer une migration `db/048_humansensor_device_type.sql` :

```sql
INSERT INTO device_types (name, fields_schema, notif_title_tpl, notif_body_tpl)
VALUES (
  'HumanSensor',
  '[
    {"field":"presence","label":"Présence","type":"boolean"},
    {"field":"state","label":"État","type":"string"},
    {"field":"moving_dist_cm","label":"Distance mouvement (cm)","type":"number"},
    {"field":"static_dist_cm","label":"Distance statique (cm)","type":"number"},
    {"field":"moving_energy","label":"Énergie mouvement","type":"number"},
    {"field":"target_dist_cm","label":"Distance cible (cm)","type":"number"}
  ]',
  'Présence détectée — {{name}}',
  'Mouvement détecté à {{moving_dist_cm}} cm'
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO schema_migrations(version) VALUES ('048_humansensor_device_type.sql')
ON CONFLICT DO NOTHING;
```

### 2.2 Worker MQTT — Parsing du payload HumanSensor

Dans `src/mqttWorker.js`, le worker reçoit les trames sur `xamiot/+/data`.

Le payload `device_type: "HumanSensor"` permet à `evaluateAlertRules()` d'utiliser les bons templates.

Les champs à stocker / exposer :
- `last_db` = `presence ? 1 : 0` (booléen → entier pour cohérence avec la colonne existante)
- Stocker le payload complet en `mqtt_raw_logs` (comportement existant, rien à changer)

### 2.3 Règles d'alerte recommandées (à créer en back-office)

| Règle | Field | Opérateur | Valeur | Usage |
|-------|-------|-----------|--------|-------|
| Présence détectée | `presence` | `==` | `1` | Alerte intrusion / arrivée |
| Absence prolongée | `presence` | `==` | `0` | Alerte départ inattendu |
| Présence proche | `moving_dist_cm` | `<` | `100` | Zone de proximité |

---

## 3. Back-office (`xamiot-admin-suite_v2/`)

Aucune modification nécessaire en V1 : le back-office gère les `device_types` de façon générique. La création du type via migration suffit.

En V2 (optionnel) :
- Ajouter un éditeur visuel des seuils de sensibilité par gate LD2410C (nécessite un endpoint API dédié + commande UART vers le capteur)

---

## 4. Portail client (`XamIoT_Portal_v2/`)

### 4.1 Affichage sur `/devices`

Ajouter le type `HumanSensor` à la logique d'icône/couleur de la carte device.

Icône suggérée : radar / onde (SVG), couleur : bleu (`#3B82F6`).

### 4.2 Page détail `/devices/[id]`

**Onglet Mesures** — afficher :
- Indicateur de présence (grand cercle vert "Présent" / gris "Absent")
- État textuel (`moving` / `static` / `none`)
- Distance au mouvement le plus proche (cm)
- Énergie de mouvement (barre de progression 0–100)

**Onglet Historique** — graphique timeline présence/absence (axe temps).

**Traductions FR/EN/ES** à ajouter dans le même pattern que les autres pages :
```ts
const T = {
  fr: { presence: 'Présence', absent: 'Absent', moving: 'Mouvement', static: 'Statique' },
  en: { presence: 'Presence', absent: 'Absent', moving: 'Moving', static: 'Static' },
  es: { presence: 'Presencia', absent: 'Ausente', moving: 'Movimiento', static: 'Estático' }
}
```

---

## 5. Apps iOS (`XamIoT_IoS_v2/`) et Android (`XamIoT_Android_v2/`)

### 5.1 Enrollment BLE (si option BLE retenue pour le firmware)

- L'app détecte un périphérique BLE nommé `HumanSensor-XXXX` lors du scan
- Affiche un formulaire de provisioning WiFi (même UX que l'enrollment SoundSense)
- Envoie les champs GATT : `wifi_ssid`, `wifi_pass`, `mqtt_host`, `mqtt_port`, `mqtt_user`, `mqtt_pass`
- L'app récupère l'`esp_uid` retourné par le capteur et appelle `POST /esp-devices` pour enregistrer

### 5.2 Affichage

- Icône et couleur distinctes pour le type `HumanSensor`
- Indicateur de présence en temps réel (polling /status ou push via MQTT over WebSocket si implémenté)
- Pas de badge `Démo` (pas de device simulé prévu pour ce type en V1)

---

## 6. Ordre d'implémentation recommandé

1. **Migration DB 048** — créer le `device_type` HumanSensor (5 min)
2. **Firmware : MQTT** — ajouter PubSubClient + publication au changement d'état (2–4h)
3. **Firmware : `esp_uid` MAC** — identifiant unique (30 min)
4. **Firmware : WiFi dynamique** — NVS + BLE enrollment ou portail captif (4–8h)
5. **Portail client** — affichage présence (2–3h)
6. **Apps iOS/Android** — enrollment + affichage (4–8h)
7. **Firmware : OTA** — optionnel, reporter en V2

---

## 7. Points d'attention

| Sujet | Détail |
|-------|--------|
| **BLE + WiFi simultanés sur ESP32-C3** | Limitation hardware connue : désactiver le BLE après enrollment pour libérer les ressources RF |
| **UART 256000 baud** | Non standard — vérifier la stabilité sur câble > 30 cm, utiliser un câble court ou réduire à 115200 avec reconfiguration du LD2410C |
| **Flood MQTT** | Publier uniquement sur changement d'état + heartbeat 60s — éviter le polling 2s actuel en MQTT |
| **`last_db` booléen** | La colonne `last_db` est de type NUMERIC dans XamIoT — stocker `presence ? 1 : 0` |
| **Cohérence avec SoundSense** | Réutiliser exactement la même structure BLE GATT que SoundSense pour l'enrollment (même UX dans les apps) |
| **Pas de simulateur V1** | Contrairement à SoundSense, ne pas créer de device simulé HumanSensor à l'inscription — la présence physique est difficile à simuler de façon réaliste |

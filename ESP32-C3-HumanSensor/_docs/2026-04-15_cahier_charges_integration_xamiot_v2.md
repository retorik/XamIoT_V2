# Cahier des charges — Intégration HLK-LD2410C dans XamIoT (v2)

**Date :** 2026-04-15  
**Auteur :** Session Claude Code  
**Basé sur :** lecture complète du firmware SoundSense (`ESP32-C3-Sensor_v2/`), du worker MQTT (`XamIoT_Api_v2/src/mqttWorker.js`, `mqttConfig.js`), des apps iOS (`XamIoT_IoS_v2/`) et de la source firmware HumanSensor existante (`ESP32-C3-HumanSensor/src/`)

---

## Principe directeur

Le HumanSensor doit s'intégrer dans XamIoT **exactement comme le SoundSense**, en réutilisant le même protocole BLE, les mêmes UUIDs, le même format de topic MQTT, la même logique NVS. Seuls changent : le nom BLE, le type de device, le payload, et la logique de lecture du capteur LD2410C.

---

## 1. Firmware (`ESP32-C3-HumanSensor/`)

### 1.1 Ce qui est à conserver intact

| Fichier | Pourquoi conserver |
|---------|-------------------|
| `src/main.cpp` | Parseur UART ring buffer, calibration EMA — réutilisable tel quel |
| `src/app_state.h` | Struct `AppState` — déjà correcte |
| `src/wifi_mgr.cpp` | Smart connect WiFi, BSSID lock, watchdog — identique au SoundSense |
| `src/web_ui.cpp` | Serveur HTTP `/status` — utile pour debug local |

Retirer uniquement les `#define WIFI_SSID` / `WIFI_PASS` hardcodés dans `main.cpp`.

---

### 1.2 Dépendances `platformio.ini` à ajouter

```ini
lib_deps =
    knolleary/PubSubClient @ ^2.8

board_build.partitions = min_spiffs.csv   ; OTA

build_flags =
    -DOTA_HMAC_KEY='"<secret_identique_au_backend>"'
```

La bibliothèque OTA est déjà disponible nativement dans le framework Arduino ESP32.  
**Pas de AsyncMqttClient — utiliser PubSubClient comme le SoundSense.**

---

### 1.3 Nouveau `config.h`

```cpp
#define FW_VERSION "1.0.0"
#define DEVICE_TYPE_NAME "HumanSensor"

// ===== BLE =====
// Même format que SoundSense : "HUMAN-SENSOR-<chipId>"
// L'app iOS filtre par préfixe → changer kTargetNamePrefix côté app
#define BLE_NAME_PREFIX       "HUMAN-SENSOR-"
#define BLE_ACTIVE_TIMEOUT_MS 300000UL   // 5 min — identique SoundSense

// ===== UUIDs BLE — IDENTIQUES au SoundSense =====
// Les apps iOS/Android mappent par UUID de caractéristique (pas par UUID de service)
// → réutilisation directe sans modification des apps côté UUIDs
#define SERVICE_WIFI_UUID  "4fafc201-1fb5-459e-8fcc-c5c9c331914c"
#define WIFI_SSID_UUID     "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define WIFI_PASS_UUID     "cba1d466-3d7c-4382-8098-edbded2ef9e0"
#define WIFI_STATUS_UUID   "5e3b1f9e-2d8a-4a1f-8c3d-9e7f1a3b5c7d"

#define SERVICE_MQTT_UUID  "9f4b9d01-7c7c-4f82-a7d7-1f2aeee10001"
#define MQTT_HOST_UUID     "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0001"
#define MQTT_PORT_UUID     "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0002"
#define MQTT_USER_UUID     "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0003"
#define MQTT_PASS_UUID     "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0004"
#define MQTT_STATUS_UUID   "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0005"
#define MQTT_BASE_UUID     "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb1005"
#define DEVICE_ID_UUID     "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb1006"

// ===== GPIO (inchangés) =====
#define LD_RX_PIN   20
#define LD_TX_PIN   21
#define LD_OUT_PIN  10
#define LD_BAUD     256000

// ===== Bouton + LED (Qt Py ESP32-C3) =====
#define BOOT_BTN_PIN   9
#define LED_PIN        8
#define LED_ACTIVE_LOW 1
#define RESET_BTN_HOLD_MS 5000

// ===== MQTT — pas de valeurs par défaut, config via BLE obligatoire =====
// ===== OTA HMAC =====
#ifndef OTA_HMAC_KEY
#define OTA_HMAC_KEY "CHANGE_ME_BEFORE_PRODUCTION"
#endif
```

---

### 1.4 `globals.h` / `globals.cpp` — nouveaux fichiers à créer

Modèle identique au SoundSense (`ESP32-C3-Sensor_v2/src/globals.h`).  
Variables à déclarer : `mqtt_host`, `mqtt_port`, `mqtt_user`, `mqtt_pass`, `g_chipId[17]`, `MQTT_BASE`, `MQTT_TOPIC_STATUS`, `wifiConnected`, `g_mqtt`, `g_netSecure`, etc.

---

### 1.5 `nvs_store.cpp` — copier depuis SoundSense

Copier **tel quel** `nvs_store.cpp` + `nvs_store.h` depuis `ESP32-C3-Sensor_v2/src/`.  
Les namespaces NVS (`"wifi"`, `"wifi_bak"`, `"mqtt"`) sont identiques → les apps iOS/Android n'ont rien à changer de ce côté.

---

### 1.6 `ble.cpp` / `ble.h` — copier depuis SoundSense

Copier **tel quel** depuis `ESP32-C3-Sensor_v2/src/`.  
Le BLE transporte exactement les mêmes données (WiFi SSID/PASS + MQTT HOST/PORT/USER/PASS + DEVICE_ID + MQTT_BASE).  
Seul le `BLE_NAME_PREFIX` change (défini dans `config.h`).

**Comportement BLE (identique SoundSense) :**
- Au boot : si MQTT non configuré en NVS → `activateBLE()` immédiatement
- Si MQTT configuré → `startMQTT()` direct, BLE inactif
- Appui court BOOT (<5s pendant exécution) → `activateBLE()`, fenêtre 5 min
- Appui 2s au boot → effacement MQTT uniquement + BLE re-enrollment
- Appui 5s pendant exécution → factory reset complet (WiFi + MQTT) + reboot
- `BLEDevice::deinit(true)` après réception des credentials MQTT pour libérer ~50KB heap avant handshake TLS

---

### 1.7 `mqtt_mgr.cpp` — adapter depuis SoundSense

Copier depuis `ESP32-C3-Sensor_v2/src/mqtt_mgr.cpp` avec les adaptations suivantes :

**Topics :**
```cpp
// Dans startMQTT() — format identique SoundSense
MQTT_BASE           = String("devices/") + g_chipId;
MQTT_TOPIC_STATUS   = MQTT_BASE + "/status";
MQTT_TOPIC_AVAIL    = MQTT_BASE + "/availability";
MQTT_TOPIC_CMD_OTA  = MQTT_BASE + "/cmd/ota";
MQTT_TOPIC_CMD_REBOOT = MQTT_BASE + "/cmd/reboot";
MQTT_TOPIC_CMD_RESET  = MQTT_BASE + "/cmd/reset_mqtt";
```

**Payload publié sur `MQTT_TOPIC_STATUS` :**
```json
{
  "presence": 1,
  "state": "moving",
  "moving_dist_cm": 120,
  "moving_energy": 85,
  "static_dist_cm": 0,
  "static_energy": 0,
  "target_dist_cm": 120,
  "out_pin": 1,
  "uptime": 3600,
  "version": "1.0.0",
  "device_type": "HumanSensor"
}
```

> `"presence"` vaut **1** (présence) ou **0** (absence) — entier, pas boolean JSON.  
> `"device_type": "HumanSensor"` est obligatoire pour l'auto-détection du type par le worker MQTT.

**Politique de publication (adaptée au capteur de présence) :**

```cpp
// Publier immédiatement sur changement d'état de présence
bool lastPresence = false;  // global
if (currentPresence != lastPresence) {
    mqttPublishStatus();
    lastPresence = currentPresence;
    g_lastPublishMs = millis();
}
// Heartbeat toutes les 60s (keep-alive + mise à jour last_seen)
if ((millis() - g_lastPublishMs) >= 60000UL) {
    mqttPublishStatus();
    g_lastPublishMs = millis();
}
```

> Ne pas publier à chaque trame UART (le LD2410C émet en continu ~8-10Hz) — uniquement sur changement d'état + heartbeat.  
> Rate limit recommandé : 15 publications/minute max (idem constante PUB_MAX_PER_MIN).

**TLS :** copier le certificat ISRG Root X1 PEM depuis SoundSense (`config.cpp`). Connexion identique : port 8883, TLS avec vérification SNI, même logique de reconnexion avec backoff exponentiel.

---

### 1.8 `ota_mgr.cpp` — copier depuis SoundSense

Copier **tel quel** depuis `ESP32-C3-Sensor_v2/src/ota_mgr.cpp` + `ota_mgr.h`.  
Le mécanisme OTA est identique : commande via `devices/<chipId>/cmd/ota` avec payload `{"url":"...","hmac":"...","version":"..."}`.

---

### 1.9 `reset_button.cpp` — copier depuis SoundSense

Copier **tel quel**. Même logique : appui court → BLE, appui long 5s → factory reset.

---

### 1.10 `main.cpp` — réécriture partielle

Le parseur UART existant est conservé. Ajouter :

```cpp
#include "globals.h"
#include "nvs_store.h"
#include "wifi_mgr.h"
#include "ble.h"
#include "mqtt_mgr.h"
#include "ota_mgr.h"
#include "reset_button.h"

// Dans setup() :
// 1. Serial.begin(115200)
// 2. resetButtonInit()
// 3. Calculer g_chipId via macToId(ESP.getEfuseMac())
//    → String macToId(uint64_t mac) :
//      snprintf("%08X%08X", mac>>32, mac&0xFFFFFFFF) → substring(4) = 12 chars hex
// 4. MQTT_BASE = "devices/" + g_chipId
// 5. Watchdog (esp_task_wdt_init 30s)
// 6. loadMqttSettings()
// 7. startI2S() → remplacer par démarrage UART LD2410C
// 8. Si MQTT configuré → startMQTT(), sinon → activateBLE()
// 9. tryConnectFromStored()

// Dans loop() :
// 1. esp_task_wdt_reset()
// 2. otaLoop()
// 3. if (otaIsRunning()) { return; }
// 4. bleStatusService() / resetButtonService()
// 5. BLE short press + auto-stop
// 6. processBleWifiInbox() / processBleMqttInbox()
// 7. wifiSwitchService() / wifiWatchdogService()
// 8. [NOUVEAU] lire AppState depuis parseur LD2410C
// 9. [NOUVEAU] politique de publication MQTT (changement présence + heartbeat)
// 10. mqttLoop()
```

---

## 2. Backend (`XamIoT_Api_v2/`)

### 2.1 Migration DB — nouveau device_type HumanSensor

Créer `db/048_humansensor_device_type.sql` :

```sql
-- Étape 1 : créer le device_type
INSERT INTO device_types (name, notif_title_tpl, notif_body_tpl)
VALUES (
  'HumanSensor',
  'Présence détectée — {device_name}',
  '{state} à {moving_dist_cm} cm'
)
ON CONFLICT (name) DO NOTHING;

-- Étape 2 : créer la frame MQTT inbound "status"
-- (topic_suffix = "status" car le firmware publie sur devices/<chipId>/status)
INSERT INTO mqtt_frame_definitions (device_type_id, name, topic_suffix, direction)
SELECT id, 'Trame principale', 'status', 'inbound'
FROM device_types WHERE name = 'HumanSensor'
ON CONFLICT DO NOTHING;

-- Étape 3 : créer les champs de la trame
-- Le champ is_primary_metric=true sera stocké dans esp_devices.last_db
-- On choisit "presence" (0/1) comme champ primaire
WITH frame AS (
  SELECT fd.id AS frame_id
  FROM mqtt_frame_definitions fd
  JOIN device_types dt ON dt.id = fd.device_type_id
  WHERE dt.name = 'HumanSensor' AND fd.topic_suffix = 'status'
  LIMIT 1
)
INSERT INTO mqtt_frame_fields (frame_id, name, label, data_type, unit, min_value, max_value, is_primary_metric, sort_order)
SELECT frame_id, field_name, field_label, field_data_type, field_unit, field_min, field_max, field_primary, field_order
FROM frame, (VALUES
  ('presence',       'Présence',         'number', NULL, 0, 1,   true,  1),
  ('state',          'État',             'string', NULL, NULL, NULL, false, 2),
  ('moving_dist_cm', 'Distance mouv. (cm)','number','cm', 0, 600, false, 3),
  ('moving_energy',  'Énergie mouvement','number',  '%', 0, 100, false, 4),
  ('static_dist_cm', 'Distance stat. (cm)','number','cm', 0, 600, false, 5),
  ('static_energy',  'Énergie statique', 'number',  '%', 0, 100, false, 6),
  ('target_dist_cm', 'Distance cible (cm)','number','cm', 0, 600, false, 7)
) AS t(field_name, field_label, field_data_type, field_unit, field_min, field_max, field_primary, field_order)
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations(version) VALUES ('048_humansensor_device_type.sql')
ON CONFLICT DO NOTHING;
```

> **Pourquoi `presence` comme champ primaire ?**  
> `last_db` accepte une valeur numérique. Presence = 1 (présent) ou 0 (absent) est la métrique la plus représentative du HumanSensor. Les apps iOS/Android lisent `last_db` comme `Double?` → 1.0 = présent, 0.0 = absent.

### 2.2 Worker MQTT — aucune modification requise

Le worker souscrit à `devices/+/status` — le HumanSensor publie sur ce même pattern.  
L'auto-détection du type lit `obj.device_type` = `"HumanSensor"` → assigne `device_type_id` automatiquement.  
Le champ primaire (presence) est lu via `getMqttConfig()` → `is_primary_metric = true` → `last_db` mis à jour.

**Aucune ligne à modifier dans `mqttWorker.js`, `mqttConfig.js`, ou `app.js`.**

### 2.3 Règles d'alerte — templates à créer en back-office

À créer manuellement dans le back-office une fois le device_type en place :

| Template | Champ | Op | Valeur | Cooldown suggéré |
|----------|-------|----|----|------|
| Présence détectée | `presence` | `==` | `1` | 120s |
| Absence détectée | `presence` | `==` | `0` | 300s |
| Proximité (< 1m) | `moving_dist_cm` | `<` | `100` | 60s |

---

## 3. Apps iOS (`XamIoT_IoS_v2/`) et Android (`XamIoT_Android_v2/`)

### 3.1 Modification minimale obligatoire — filtre BLE

**iOS** — dans `BLEManager.swift`, ligne :
```swift
private let kTargetNamePrefix = "SOUND-SENSOR"
```
→ Remplacer par une liste de préfixes acceptés :
```swift
private let kTargetNamePrefixes = ["SOUND-SENSOR", "HUMAN-SENSOR"]

// Dans upsert() :
guard let n = name, kTargetNamePrefixes.contains(where: { n.hasPrefix($0) }) else { return }
```

**Android** : même modification dans l'équivalent du filtre BLE scan (chercher `"SOUND-SENSOR"` dans le code Android).

> Les UUIDs BLE des caractéristiques sont identiques → **aucune autre modification** dans `BLEManager.swift` n'est nécessaire pour l'enrollment.

### 3.2 Enrollment — aucune modification

Le flux d'enrollment est identique : l'app lit `DEVICE_ID_UUID` (→ `espUID`) et `MQTT_BASE_UUID` (→ `topic_prefix` = `"devices/<chipId>"`) via BLE, puis appelle `POST /esp-devices` avec ces valeurs.

### 3.3 Affichage devices

**Modification requise :** l'app doit distinguer les device types pour afficher les bonnes informations. Actuellement les apps affichent `soundHistoryJSON` et un graphique de niveau sonore — pour un HumanSensor, le `last_db` représente `presence` (0.0 ou 1.0).

**Approche recommandée :** utiliser l'endpoint `GET /esp-devices/:id/meta` qui retourne `device_type.name` + `available_fields`. Adapter l'affichage selon le type :

```
device_type.name == "SoundSense" → afficher graphique niveau sonore
device_type.name == "HumanSensor" → afficher indicateur présence + distance
```

L'endpoint `/meta` est déjà implémenté (`fetchDeviceMeta` dans `APIClient.swift`).

---

## 4. Ordre d'implémentation recommandé

| # | Étape | Durée estimée | Impact |
|---|-------|--------------|--------|
| 1 | Migration DB 048 (device_type + frame + champs) | 30 min | Backend prêt |
| 2 | Firmware : copier NVS + BLE + OTA + reset_button depuis SoundSense | 1h | Structure en place |
| 3 | Firmware : créer globals.h/cpp + config.h | 1h | Compilation |
| 4 | Firmware : mqtt_mgr.cpp adapté (topics + payload HumanSensor) | 2h | Publication MQTT |
| 5 | Firmware : adapter main.cpp (boot + loop) | 2h | Firmware complet |
| 6 | Apps iOS/Android : modifier filtre préfixe BLE | 30 min | Enrollment fonctionnel |
| 7 | Apps iOS/Android : affichage conditionnel par device_type | 3-4h | UX complète |

---

## 5. Points d'attention techniques

| Sujet | Détail |
|-------|--------|
| **chipId 12 chars** | `macToId()` produit 12 chars hex depuis `ESP.getEfuseMac()`. Format identique SoundSense — voir `utils.cpp` : `snprintf("%08X%08X",...).substring(4)` |
| **BLE + WiFi coexistence** | Même contrainte que SoundSense : `wifiEnableCoexSleep()` requis pendant BLE actif. `BLEDevice::deinit(true)` obligatoire avant handshake TLS (libère ~50KB heap) |
| **Heap TLS** | Ne pas tenter reconnexion MQTT si `ESP.getMaxAllocHeap() < 44000` — seuil copié du SoundSense |
| **Trame UART continue** | Le LD2410C émet des trames en continu. Ne pas publier en MQTT à chaque trame — uniquement sur changement de `presence` + heartbeat 60s |
| **`presence` = entier 0/1** | Pas de boolean JSON — le moteur de règles du backend compare numériquement (`ruleMatches(value, "==", 1, null)`) |
| **OTA HMAC** | La clé `OTA_HMAC_KEY` dans `platformio.ini` doit correspondre à `OTA_HMAC_KEY` dans `.env.prod` du backend |
| **Pas de device simulé** | Ne pas créer de capteur HumanSensor simulé à l'inscription (contrairement à SoundSense) — la présence physique ne se simule pas de façon utile |
| **Version platformio** | SoundSense utilise `espressif32@6.10.0`, firmware HumanSensor actuel utilise `6.5.0` — aligner sur `6.10.0` pour cohérence |

# ESP32-C3 HumanSensor v2

Firmware de production pour le capteur de présence humaine **HLK-LD2410C** sur **Adafruit QT Py ESP32-C3**, intégré dans XamIoT v2.

**Statut :** À développer  
**Cahier des charges :** `ESP32-C3-HumanSensor/_docs/2026-04-15_cahier_charges_integration_xamiot_v2.md`  
**Firmware prototype (v1):** `ESP32-C3-HumanSensor/` — lecture WiFi HTTP fonctionnelle, sans MQTT ni BLE

---

## Principe

Ce firmware est architecturalement identique au SoundSense (`ESP32-C3-Sensor_v2/`).  
La majorité du code est à **copier tel quel** depuis SoundSense — seuls changent :
- Le nom BLE (`HUMAN-SENSOR-` au lieu de `SOUND-SENSOR-`)
- Le type de device (`HumanSensor`)
- Le payload MQTT (données LD2410C)
- La logique de lecture capteur (parseur UART → remplace I2S/audio)

---

## Structure cible des fichiers

```
ESP32-C3-HumanSensor_v2/
├── platformio.ini
├── partitions/
│   └── huge_app.csv
└── src/
    ├── config.h          ← À créer (voir ci-dessous)
    ├── globals.h         ← Copier de SoundSense, retirer variables audio
    ├── globals.cpp       ← Idem
    ├── main.cpp          ← Adapter : remplacer audio par parseur LD2410C
    ├── app_state.h       ← Copier depuis ESP32-C3-HumanSensor/src/ (déjà correct)
    ├── nvs_store.h/cpp   ← Copier depuis SoundSense (identique)
    ├── wifi_mgr.h/cpp    ← Copier depuis SoundSense (identique)
    ├── ble.h/cpp         ← Copier depuis SoundSense (identique)
    ├── mqtt_mgr.h/cpp    ← Adapter depuis SoundSense (topics + payload LD2410C)
    ├── ota_mgr.h/cpp     ← Copier depuis SoundSense (identique)
    ├── reset_button.h/cpp← Copier depuis SoundSense (identique)
    ├── web_ui.h/cpp      ← Copier depuis ESP32-C3-HumanSensor/src/ (déjà correct)
    ├── wifi_mgr.h/cpp    ← Copier depuis ESP32-C3-HumanSensor/src/ (déjà correct)
    ├── utils.h/cpp       ← Copier depuis SoundSense (macToId, blinkConfirm)
    └── config.cpp        ← Certificat ISRG Root X1 PEM (copier de SoundSense)
```

---

## Checklist d'implémentation

### 1. Prérequis backend (à faire en premier)
- [ ] Appliquer migration `XamIoT_Api_v2/db/048_humansensor_device_type.sql` sur DEV et PROD
- [ ] Vérifier en back-office que le device_type "HumanSensor" apparaît avec ses champs

### 2. Fichiers à copier depuis SoundSense SANS modification
- [ ] `nvs_store.h/cpp` — NVS namespaces "wifi", "wifi_bak", "mqtt" identiques
- [ ] `ble.h/cpp` — UUIDs BLE identiques (seul BLE_NAME_PREFIX change dans config.h)
- [ ] `ota_mgr.h/cpp` — OTA via MQTT cmd/ota + HMAC-SHA256
- [ ] `reset_button.h/cpp` — appui court BLE, appui 5s factory reset
- [ ] `utils.h/cpp` — `macToId()`, `blinkConfirm()`
- [ ] `config.cpp` — certificat ISRG Root X1 PEM (TLS Let's Encrypt)

### 3. Fichiers à copier depuis ESP32-C3-HumanSensor/src/ SANS modification
- [ ] `app_state.h` — struct AppState LD2410C (déjà correcte)
- [ ] `web_ui.h/cpp` — serveur HTTP port 80, routes /, /status, /dump
- [ ] `wifi_mgr.h/cpp` — smart connect, BSSID lock, watchdog (retirer credentials hardcodés)

### 4. `config.h` — à créer
```cpp
#define FW_VERSION          "1.0.0"
#define DEVICE_TYPE_NAME    "HumanSensor"
#define BLE_NAME_PREFIX     "HUMAN-SENSOR-"
#define BLE_ACTIVE_TIMEOUT_MS 300000UL  // 5 min

// UUIDs BLE — IDENTIQUES au SoundSense
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

// GPIO (Qt Py ESP32-C3 + LD2410C)
#define LD_RX_PIN    20    // RX1 ← TX du LD2410C
#define LD_TX_PIN    21    // TX1 → RX du LD2410C (optionnel)
#define LD_OUT_PIN   10    // OUT digital LD2410C (HIGH = présence)
#define LD_BAUD      256000

// Bouton + LED
#define BOOT_BTN_PIN      9
#define LED_PIN           8
#define LED_ACTIVE_LOW    1
#define RESET_BTN_HOLD_MS 5000

// Publication MQTT
#define PUB_HEARTBEAT_MS   60000UL  // heartbeat toutes les 60s
#define PUB_MAX_PER_MIN    15

#ifndef OTA_HMAC_KEY
#define OTA_HMAC_KEY "CHANGE_ME_BEFORE_PRODUCTION"
#endif

extern const char ISRG_ROOT_X1_PEM[] PROGMEM;
```

### 5. `mqtt_mgr.cpp` — à adapter depuis SoundSense
Topics (identiques, seul DEVICE_TYPE_NAME change) :
```cpp
MQTT_BASE           = String("devices/") + g_chipId;
MQTT_TOPIC_STATUS   = MQTT_BASE + "/status";
MQTT_TOPIC_AVAIL    = MQTT_BASE + "/availability";
MQTT_TOPIC_CMD_OTA  = MQTT_BASE + "/cmd/ota";
MQTT_TOPIC_CMD_REBOOT = MQTT_BASE + "/cmd/reboot";
MQTT_TOPIC_CMD_RESET  = MQTT_BASE + "/cmd/reset_mqtt";
```

Payload à publier sur `mqttPublishStatus()` :
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
> `"presence"` = entier 0 ou 1 (pas boolean JSON)  
> `"device_type"` obligatoire pour l'auto-détection backend

Politique de publication :
- Publier immédiatement sur **changement de `presence`** (0→1 ou 1→0)
- Heartbeat toutes les **60s** (keep-alive + last_seen)
- Rate limit : 15 publications/minute max
- Ne PAS publier à chaque trame UART (le LD2410C émet en continu)

### 6. `main.cpp` — à adapter depuis SoundSense
- Remplacer `startI2S()` + `initGoertzel()` + `audioService()` par le démarrage UART LD2410C + `uart_service()`
- Conserver le bloc boot entier (watchdog, BLE enrollment, NVS, reconnexion MQTT)
- Ajouter la politique de publication MQTT basée sur changement de `g_appState.presence`

### 7. Apps iOS/Android — modification requise
- **iOS** `BLEManager.swift` : modifier `kTargetNamePrefix = "SOUND-SENSOR"` pour accepter aussi `"HUMAN-SENSOR"`
- **Android** : même modification dans le filtre BLE scan
- Affichage conditionnel dans DeviceDetailView selon `device_type.name`

---

## Points d'attention

| Sujet | Détail |
|-------|--------|
| **BLE + WiFi** | `wifiEnableCoexSleep()` requis pendant BLE actif. `BLEDevice::deinit(true)` après réception credentials MQTT (libère ~50KB heap) |
| **Heap TLS** | Attendre `ESP.getMaxAllocHeap() >= 44000` avant tentative connexion MQTT TLS |
| **UART 256000 baud** | Non standard — utiliser un câble court (< 30 cm) |
| **OTA_HMAC_KEY** | Changer dans `platformio.ini` avant build prod. Même clé que le backend `.env.prod` |
| **`presence` = 0/1** | Pas de boolean JSON — le moteur de règles backend compare numériquement |
| **Partition** | `huge_app.csv` — même table que SoundSense, nécessaire pour BLE + MQTT + OTA |

---

## Références

- Datasheet LD2410C : `ESP32-C3-HumanSensor/_docs/HLK LD2410C Life Presence Sensor Module Data Sheet V1.00.pdf`
- Firmware prototype v1 : `ESP32-C3-HumanSensor/src/`
- Cahier des charges complet : `ESP32-C3-HumanSensor/_docs/2026-04-15_cahier_charges_integration_xamiot_v2.md`
- SoundSense (modèle à suivre) : `ESP32-C3-Sensor_v2/src/`

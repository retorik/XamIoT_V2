#pragma once
#include <Arduino.h>

// ===== Version firmware / OTA =====
#ifndef FW_VERSION
#define FW_VERSION "2.5.0"      // ↩️ à incrémenter à chaque build
#endif

// ===== Type de device — doit correspondre au nom dans device_types (DB) =====
#define DEVICE_TYPE_NAME "SoundSense"

// OTA HMAC-SHA256 — doit correspondre à OTA_HMAC_KEY dans .env.prod du backend
// ⚠️ Définir dans platformio.ini build_flags: -DOTA_HMAC_KEY=’"votre_secret"’
#ifndef OTA_HMAC_KEY
#define OTA_HMAC_KEY "CHANGE_ME_BEFORE_PRODUCTION"
#endif

// === Reset bouton ===
#define RESET_BTN_PIN            9      // Qt Py ESP32-C3 : BOOT sur IO9
#define RESET_BTN_ACTIVE_LOW     1      // BOOT tire à GND quand pressé
#define RESET_BTN_HOLD_MS        5000   // 5s de maintien → effacement WiFi+MQTT + reboot
#define RESET_BTN_DEBOUNCE_MS    40     // anti-rebond

// === BLE ===
// Appui court (<5s) sur BOOT → active BLE pendant BLE_ACTIVE_TIMEOUT_MS
// BLE s’arrête aussi dès que WiFi+MQTT sont connectés
#define BLE_ACTIVE_TIMEOUT_MS    300000UL  // 5 minutes


// ===== Nom BLE =====
#define BLE_NAME_PREFIX "SOUND-SENSOR-"

// ===== UUIDs BLE =====
#define SERVICE_WIFI_UUID  "4fafc201-1fb5-459e-8fcc-c5c9c331914c"
#define WIFI_SSID_UUID     "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define WIFI_PASS_UUID     "cba1d466-3d7c-4382-8098-edbded2ef9e0"
#define WIFI_STATUS_UUID   "5e3b1f9e-2d8a-4a1f-8c3d-9e7f1a3b5c7d"

#define WIFI_DIAG_SCAN_ON_FAIL 1   // 0/1 : scan RSSI MyBox sur échec

#ifndef WIFI_DIAG_VERBOSE
#define WIFI_DIAG_VERBOSE 1   // 0 = logs wifi sobres, 1 = logs wifi détaillés
#endif

#define SERVICE_MQTT_UUID  "9f4b9d01-7c7c-4f82-a7d7-1f2aeee10001"
#define MQTT_HOST_UUID     "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0001"
#define MQTT_PORT_UUID     "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0002"
#define MQTT_USER_UUID     "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0003"
#define MQTT_PASS_UUID     "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0004"
#define MQTT_STATUS_UUID   "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0005"
#define MQTT_BASE_UUID     "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb1005"
#define DEVICE_ID_UUID     "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb1006"

// ===== Bouton Boot + LED =====
#define BOOT_BTN_PIN   9
#define LED_PIN        8
#define LED_ACTIVE_LOW 1   // LED s'allume sur LOW

// ===== I2S / Micro =====
#include <driver/i2s.h>
#define SAMPLE_WINDOW_MS 30
const float DBFS_MIN = -90.0f;
const float DBFS_MAX = 0.0f;

#define I2S_BCLK_PIN 5
#define I2S_LRCK_PIN 6
#define I2S_DIN_PIN  4
#define I2S_SAMPLE_RATE 44100
#define I2S_BITS I2S_BITS_PER_SAMPLE_32BIT
#define I2S_CHANNEL_CFG I2S_CHANNEL_FMT_ONLY_LEFT

// ===== MQTT défauts =====
// Pas de valeurs par défaut — configuration obligatoire via BLE
#include <stdint.h>

// ===== Visualisation avancée (historique 60s + bandes fréquentielles) =====
#define HIST60_SIZE      60
#define NUM_FFT_BANDS    8
#define FFT_EWMA_ALPHA   0.35f

// ===== Fenêtres / publication =====
#ifndef SND_AV_SECONDS
#define SND_AV_SECONDS 5
#endif
#define SND_AVG_SECONDS SND_AV_SECONDS

#ifndef SND_PERIODIC_PUB_MS
#define SND_PERIODIC_PUB_MS 10000UL
#endif
#ifndef SND_CHANGE_THRESHOLD_PCT
#define SND_CHANGE_THRESHOLD_PCT 10
#endif
#ifndef SND_MIN_PUB_INTERVAL_MS
#define SND_MIN_PUB_INTERVAL_MS 1000UL
#endif
#ifndef EWMA_ALPHA_PCT
#define EWMA_ALPHA_PCT 0.25f
#endif
#ifndef EWMA_ALPHA_DB
#define EWMA_ALPHA_DB 0.25f
#endif
#ifndef QUANTIZE_STEP_PCT
#define QUANTIZE_STEP_PCT 3
#endif
#ifndef BURST_THRESHOLD_PCT
#define BURST_THRESHOLD_PCT 80
#endif
#ifndef PUB_MAX_PER_MIN
#define PUB_MAX_PER_MIN 30
#endif

// Certificat ISRG Root X1 (Let's Encrypt) — stocké en PROGMEM
extern const char ISRG_ROOT_X1_PEM[] PROGMEM;

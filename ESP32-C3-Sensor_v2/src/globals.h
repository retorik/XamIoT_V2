#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>

#include "config.h"

// Fwd-decl BLE classes pour éviter d'inclure les headers BLE partout
class BLEServer; class BLEService; class BLECharacteristic;

// -------- MQTT client objets --------
extern WiFiClientSecure g_netSecure;
extern PubSubClient g_mqtt;
extern bool g_mqttReady;
extern bool g_useTls;

// -------- Topics / ID --------
extern char g_chipId[17];
extern char g_hostname[32];          // "SOUND-SENSOR-XXXXXXXXXXXX"
extern String MQTT_BASE, MQTT_TOPIC_STATUS, MQTT_TOPIC_AVAIL, MQTT_TOPIC_CMD_REBOOT, MQTT_TOPIC_CMD_OTA, MQTT_TOPIC_CMD_RESET;
extern String HA_DISCOVERY_SENSOR;

// -------- Web / NVS / WiFi --------
extern WebServer server;
extern bool wifiConnected;
extern unsigned long lastWiFiCheck;
extern Preferences prefs;
extern String g_ssid, g_pass;
extern String pending_ssid, pending_pass;
extern bool have_pending;

extern int g_lastDiscReason;
extern bool g_hostnameSet;
extern volatile bool g_wifiBusyConnect;

// Flags différés
extern volatile bool g_needWebServerStart;
extern volatile bool g_needMqttReconnect;

// -------- Mesure & agrégation --------
extern volatile uint16_t g_soundLevel;
extern volatile uint8_t  g_soundPct;
extern unsigned long g_winStart;

struct SndBucket {
  uint32_t sumPct = 0;
  uint32_t count = 0;
  uint8_t  minPct = 255;
  uint8_t  maxPct = 0;
  float    sumDb = 0.0f;
};

extern SndBucket g_ring[SND_AVG_SECONDS];
extern int g_ringIndex;
extern uint32_t g_curSumPct;
extern uint32_t g_curCount;
extern uint8_t  g_curMinPct;
extern uint8_t  g_curMaxPct;
extern float    g_curSumDb;
extern unsigned long g_curBucketStart;

extern uint8_t g_soundPctAvg;
extern uint8_t g_soundPctMin;
extern uint8_t g_soundPctMax;
extern float   g_dbfsAvg;

extern float g_ewmaPct;
extern float g_ewmaDbfs;

extern unsigned long g_lastPublishMs;
extern unsigned long g_nextPeriodicAt;
extern uint8_t g_lastPublishedPct;
extern unsigned long g_rateWindowStartMs;
extern uint16_t g_sentThisMinute;

extern int32_t cal_offset;
extern float cal_noise_rms;
extern float cal_gain;

// -------- BLE objets --------
extern BLEServer* pServer;
extern BLEService* pService;
extern BLEService* pServiceMqtt;
extern BLECharacteristic* pSsidChar;
extern BLECharacteristic* pPassChar;
extern BLECharacteristic* pStatusChar;
extern BLECharacteristic* pMqttHostChar;
extern BLECharacteristic* pMqttPortChar;
extern BLECharacteristic* pMqttUserChar;
extern BLECharacteristic* pMqttPassChar;
extern BLECharacteristic* pMqttConfigChar;
extern BLECharacteristic* pMqttBaseChar;
extern BLECharacteristic* pDeviceIdChar;
extern BLECharacteristic* pMqttStatusChar;

// -------- MQTT staging --------
extern volatile bool g_mqttConnecting;
extern unsigned long g_mqttNextTryAt;
extern unsigned long g_mqttBackoffMs;

extern String st_mqtt_host;
extern uint16_t st_mqtt_port;
extern String st_mqtt_user;
extern String st_mqtt_pass;
extern bool st_set_host, st_set_port, st_set_user, st_set_pass;
extern unsigned long g_mqttCoalesceUntil;

// -------- BLE WiFi inbox --------
extern volatile bool ble_wifi_dirty;
extern volatile bool ble_wifi_ssid_ready;
extern volatile bool ble_wifi_pass_ready;
extern volatile bool ble_wifi_processing;
extern String ble_wifi_ssid_inbox;
extern String ble_wifi_pass_inbox;

// -------- MQTT settings (NVS) --------
extern String mqtt_host;
extern uint16_t mqtt_port;
extern String mqtt_user;
extern String mqtt_pass;

// -------- BLE lifecycle --------
extern volatile bool g_bleShortPressRequest;  // mis à true par reset_button sur appui court
extern unsigned long g_bleActivatedAt;        // timestamp d'activation BLE (pour timeout 5min)

// -------- Visualisation avancée --------
extern uint8_t  g_history60[HIST60_SIZE];       // historique 60s du soundPctAvg
extern int8_t   g_histDB60[HIST60_SIZE];         // historique 60s du niveau dBFS (-90..0)
extern uint8_t  g_histPeakFreq60[HIST60_SIZE];  // historique 60s de l'indice de bande dominante
extern uint8_t  g_hist60Idx;                    // prochain index d'écriture (circulaire)
extern uint8_t  g_fftBands[NUM_FFT_BANDS];      // niveaux EWMA courants par bande (0-100)

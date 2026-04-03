#include "globals.h"
#include <Preferences.h>

// MQTT
WiFiClientSecure g_netSecure;
PubSubClient g_mqtt(g_netSecure);
bool g_mqttReady = false;
bool g_useTls = false;

// Topics / ID
char g_chipId[17]    = {0};
char g_hostname[32]  = {0};     // Hostname commun WiFi/OTA/BLE
String MQTT_BASE, MQTT_TOPIC_STATUS, MQTT_TOPIC_AVAIL, MQTT_TOPIC_CMD_REBOOT, MQTT_TOPIC_CMD_OTA, MQTT_TOPIC_CMD_RESET;
String HA_DISCOVERY_SENSOR;

// Web / WiFi / NVS
WebServer server(80);
bool wifiConnected = false;
unsigned long lastWiFiCheck = 0;
String g_ssid, g_pass;
String pending_ssid, pending_pass;
bool have_pending = false;
Preferences prefs;
int g_lastDiscReason = -1;
bool g_hostnameSet = false;
volatile bool g_wifiBusyConnect = false;

volatile bool g_needWebServerStart = false;
volatile bool g_needMqttReconnect   = false;

// Mesure
volatile uint16_t g_soundLevel = 0;
volatile uint8_t  g_soundPct   = 0;
unsigned long g_winStart = 0;

SndBucket g_ring[SND_AVG_SECONDS];
int g_ringIndex = 0;
uint32_t g_curSumPct = 0;
uint32_t g_curCount = 0;
uint8_t  g_curMinPct = 255;
uint8_t  g_curMaxPct = 0;
float    g_curSumDb  = 0.0f;
unsigned long g_curBucketStart = 0;

uint8_t g_soundPctAvg = 0;
uint8_t g_soundPctMin = 0;
uint8_t g_soundPctMax = 0;
float   g_dbfsAvg = -90.0f;

float g_ewmaPct = 0.0f;
float g_ewmaDbfs = -90.0f;

unsigned long g_lastPublishMs = 0;
unsigned long g_nextPeriodicAt = 0;
uint8_t g_lastPublishedPct = 255;
unsigned long g_rateWindowStartMs = 0;
uint16_t g_sentThisMinute = 0;

int32_t cal_offset = 0;
float cal_noise_rms = 1.0f;
float cal_gain = 1.0f;

// BLE
BLEServer* pServer = nullptr;
BLEService* pService = nullptr;
BLEService* pServiceMqtt = nullptr;
BLECharacteristic* pSsidChar = nullptr;
BLECharacteristic* pPassChar = nullptr;
BLECharacteristic* pStatusChar = nullptr;
BLECharacteristic* pMqttHostChar = nullptr;
BLECharacteristic* pMqttPortChar = nullptr;
BLECharacteristic* pMqttUserChar = nullptr;
BLECharacteristic* pMqttPassChar = nullptr;
BLECharacteristic* pMqttConfigChar = nullptr;
BLECharacteristic* pMqttBaseChar = nullptr;
BLECharacteristic* pDeviceIdChar = nullptr;
BLECharacteristic* pMqttStatusChar = nullptr;

// MQTT staging
volatile bool g_mqttConnecting = false;
unsigned long g_mqttNextTryAt = 0;
unsigned long g_mqttBackoffMs = 500;

String st_mqtt_host;
uint16_t st_mqtt_port = 0;
String st_mqtt_user;
String st_mqtt_pass;
bool st_set_host = false, st_set_port = false, st_set_user = false, st_set_pass = false;
unsigned long g_mqttCoalesceUntil = 0;

// BLE WiFi inbox
volatile bool ble_wifi_dirty = false;
volatile bool ble_wifi_ssid_ready = false;
volatile bool ble_wifi_pass_ready = false;
volatile bool ble_wifi_processing = false;
String ble_wifi_ssid_inbox;
String ble_wifi_pass_inbox;

// MQTT settings
String mqtt_host;
uint16_t mqtt_port;
String mqtt_user;
String mqtt_pass;

// BLE lifecycle
volatile bool g_bleShortPressRequest = false;
unsigned long g_bleActivatedAt       = 0;

// Visualisation avancée
uint8_t g_history60[HIST60_SIZE]      = {0};
int8_t  g_histDB60[HIST60_SIZE]       = {0};
uint8_t g_histPeakFreq60[HIST60_SIZE] = {0};
uint8_t g_hist60Idx                   = 0;
uint8_t g_fftBands[NUM_FFT_BANDS]     = {0};

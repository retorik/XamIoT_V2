// --- Globals ---
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <string.h>
#include <WiFiClientSecure.h>

// === I2S & maths pour le micro numérique ===
#include <driver/i2s.h>
#include <math.h>

// === MQTT client objets ===
static WiFiClientSecure g_netSecure;  // Client unifié (TLS ou non)
static PubSubClient g_mqtt(g_netSecure);
static bool g_mqttReady = false;
static bool g_useTls = false;

// ⚠️ Certificat racine ISRG Root X1 (Let's Encrypt)
static const char ISRG_ROOT_X1_PEM[] PROGMEM = R"PEM(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)PEM";

// ===================== Déclarations =====================
void startBLE();
void startWebServer();
void tryConnectFromStored();
void resetStoredCredentials();

static void blePushFullStatus();
static String macToId(uint64_t mac);
void checkTripleResetAtBoot();
void tripleResetWindowService();
void loadCredentials(String& ssid, String& pass);
void saveCredentials(const String& ssid, const String& pass);

void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info);
void setBleStatus(const String& s, bool notify = true);

void startMQTT();
void mqttLoop();
void mqttReconnectIfNeeded();
void mqttPublishStatus(bool force = false);
void mqttOnMessage(char* topic, byte* payload, unsigned int len);
void mqttPublishDiscovery();
void mqttApplyServerFromSettings();

static bool connectToSsid(const String& ssid, const String& pass);

// ===================== Config ===========================
#define BLE_NAME_PREFIX "SOUND-SENSOR-"

// Service principal (Wi-Fi + Status)
#define SERVICE_WIFI_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914c"
#define WIFI_SSID_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define WIFI_PASS_UUID "cba1d466-3d7c-4382-8098-edbded2ef9e0"
#define WIFI_STATUS_UUID "5e3b1f9e-2d8a-4a1f-8c3d-9e7f1a3b5c7d"

// Service MQTT
#define SERVICE_MQTT_UUID "9f4b9d01-7c7c-4f82-a7d7-1f2aeee10001"
#define MQTT_HOST_UUID "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0001"
#define MQTT_PORT_UUID "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0002"
#define MQTT_USER_UUID "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0003"
#define MQTT_PASS_UUID "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0004"
#define MQTT_STATUS_UUID "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0005"
#define MQTT_BASE_UUID "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb1005"
#define DEVICE_ID_UUID "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb1006"

// LED (confirmation triple-reset)
#define LED_PIN 8
#define LED_ACTIVE_LOW 1

// Micro I2S
#define SAMPLE_WINDOW_MS 30
const float DBFS_MIN = -90.0f;
const float DBFS_MAX = 0.0f;

#define I2S_BCLK_PIN 5
#define I2S_LRCK_PIN 6
#define I2S_DIN_PIN 4
#define I2S_SAMPLE_RATE 16000
#define I2S_BITS I2S_BITS_PER_SAMPLE_32BIT
#define I2S_CHANNEL_CFG I2S_CHANNEL_FMT_ONLY_LEFT

// ===================== CONFIG MQTT ======================
String mqtt_host_default = "mqtt.xamiot.com";
uint16_t mqtt_port_default = 8883;
String mqtt_user_default = "mosquser";
String mqtt_pass_default = "XxxxxxxxX";

String mqtt_host;
uint16_t mqtt_port;
String mqtt_user;
String mqtt_pass;

char g_chipId[17] = {0};
String MQTT_BASE, MQTT_TOPIC_STATUS, MQTT_TOPIC_AVAIL, MQTT_TOPIC_CMD_REBOOT;
String HA_DISCOVERY_SENSOR;

// ===================== État global =======================
WebServer server(80);
bool wifiConnected = false;
unsigned long lastWiFiCheck = 0;
Preferences prefs;

String g_ssid, g_pass;
String pending_ssid, pending_pass;
bool have_pending = false;

// Boîte aux lettres BLE Wi-Fi
volatile bool ble_wifi_dirty = false;
volatile bool ble_wifi_ssid_ready = false;
volatile bool ble_wifi_pass_ready = false;
volatile bool ble_wifi_processing = false; // Mutex simple
String ble_wifi_ssid_inbox;
String ble_wifi_pass_inbox;

// DEBUG Wi-Fi
int g_lastDiscReason = -1;
bool g_hostnameSet = false;
volatile bool g_wifiBusyConnect = false;

// ====== FLAGS POUR DIFFÉRER LES APPELS RÉSEAU ======
volatile bool g_needWebServerStart = false;
volatile bool g_needMqttReconnect = false;

// ====== Mesure & agrégation ======
volatile uint16_t g_soundLevel = 0;
volatile uint8_t g_soundPct = 0;
unsigned long g_winStart = 0;

#ifndef SND_AVG_SECONDS
#define SND_AVG_SECONDS 5
#endif

#ifndef SND_PERIODIC_PUB_MS
#define SND_PERIODIC_PUB_MS 10000UL // 10s entre publications auto
#endif

#ifndef SND_CHANGE_THRESHOLD_PCT
#define SND_CHANGE_THRESHOLD_PCT 10  // 10% de variation pour publier
#endif

#ifndef SND_MIN_PUB_INTERVAL_MS
#define SND_MIN_PUB_INTERVAL_MS 1000UL // 1s minimum entre 2 publications
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
#define BURST_THRESHOLD_PCT 80 // 80% pour déclencher burst
#endif

#ifndef PUB_MAX_PER_MIN
#define PUB_MAX_PER_MIN 20
#endif

struct SndBucket {
    uint32_t sumPct = 0;
    uint32_t count = 0;
    uint8_t minPct = 255;
    uint8_t maxPct = 0;
    double sumDb = 0.0;
};

SndBucket g_ring[SND_AVG_SECONDS];
int g_ringIndex = 0;
uint32_t g_curSumPct = 0;
uint32_t g_curCount = 0;
uint8_t g_curMinPct = 255;
uint8_t g_curMaxPct = 0;
double g_curSumDb = 0.0;
unsigned long g_curBucketStart = 0;

uint8_t g_soundPctAvg = 0;
uint8_t g_soundPctMin = 0;
uint8_t g_soundPctMax = 0;
double g_dbfsAvg = -90.0;

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

// BLE objets
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

// ===== MQTT staging & reconnect gating =====
volatile bool g_mqttConnecting = false;
unsigned long g_mqttNextTryAt = 0;
unsigned long g_mqttBackoffMs = 500;

String st_mqtt_host;
uint16_t st_mqtt_port = 0;
String st_mqtt_user;
String st_mqtt_pass;
bool st_set_host = false, st_set_port = false, st_set_user = false, st_set_pass = false;
unsigned long g_mqttCoalesceUntil = 0;

// ===================== HTML =====================
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'><title>ESP32 Sound Sensor</title>
<style>body{font-family:Arial,Helvetica,sans-serif;text-align:center;margin:20px}.status{margin:15px auto;max-width:460px;padding:10px;border-radius:6px}.connected{background:#d4edda}.disconnected{background:#f8d7da}.bar{height:14px;background:#eee;border-radius:7px;overflow:hidden;margin-top:6px}.bar>span{display:block;height:100%;background:#4caf50;width:0%;transition:width .2s ease}small{color:#666}</style>
</head><body>
<h1>ESP32 Sound Sensor</h1>
<div class='status' id='wifiStatus'>WiFi: Déconnecté</div>
<div class='status' id='soundBox'>
  <div><strong>Niveau sonore (EWMA)</strong>: <span id='soundText'>0%</span></div>
  <div class='bar'><span id='soundBar'></span></div>
  <small>Fenêtre: <span id='win'>--</span> s — Min/Max: <span id='mm'>--</span></small>
</div>
<script>
function updateStatus(){fetch('/status').then(r=>r.json()).then(d=>{
  const ws=document.getElementById('wifiStatus');ws.textContent='WiFi: '+(d.wifiConnected?d.ip:'Déconnecté');
  ws.className='status '+(d.wifiConnected?'connected':'disconnected');
  const p=Math.max(0,Math.min(100,d.soundPct||0));
  document.getElementById('soundText').textContent=p+'%';
  document.getElementById('soundBar').style.width=p+'%';
  document.getElementById('win').textContent=d.windowSec||'?';
  document.getElementById('mm').textContent=(d.soundPct_min??'?')+' / '+(d.soundPct_max??'?');
}).catch(()=>{});}
setInterval(updateStatus,500);window.onload=updateStatus;
</script>
</body></html>
)rawliteral";

// ===================== NVS helpers ======================
void loadCredentials(String& ssid, String& pass) {
    prefs.begin("wifi", true);
    ssid = prefs.getString("ssid", "");
    pass = prefs.getString("pass", "");
    prefs.end();
    Serial.printf("[NVS] SSID=\"%s\" (%d), PASS len=%d\n", ssid.c_str(), ssid.length(), pass.length());
}

void saveCredentials(const String& ssid, const String& pass) {
    prefs.begin("wifi", false);
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    prefs.end();
    Serial.printf("[NVS] Sauvé SSID=\"%s\" (%d), PASS len=%d\n", ssid.c_str(), ssid.length(), pass.length());
}

void loadMqttSettings() {
    prefs.begin("mqtt", true);
    mqtt_host = prefs.getString("host", mqtt_host_default);
    mqtt_port = prefs.getUShort("port", mqtt_port_default);
    mqtt_user = prefs.getString("user", mqtt_user_default);
    mqtt_pass = prefs.getString("pass", mqtt_pass_default);
    prefs.end();
    Serial.printf("[NVS] MQTT host=\"%s\" port=%u user=\"%s\" pass_len=%d\n",
                  mqtt_host.c_str(), mqtt_port, mqtt_user.c_str(), (int)mqtt_pass.length());
}

void saveMqttSettings(const String& hostIn, uint16_t portIn, const String& userIn, const String& passIn) {
    String host = hostIn;
    host.trim();
    String user = userIn;
    user.trim();
    String pass = passIn;
    pass.trim();
    
    prefs.begin("mqtt", false);
    prefs.putString("host", host);
    prefs.putUShort("port", portIn);
    prefs.putString("user", user);
    prefs.putString("pass", pass);
    prefs.end();
    
    mqtt_host = host;
    mqtt_port = portIn;
    mqtt_user = user;
    mqtt_pass = pass;
    
    Serial.printf("[NVS] MQTT SAVED host=\"%s\" port=%u user=\"%s\" pass_len=%d\n",
                  mqtt_host.c_str(), mqtt_port, mqtt_user.c_str(), (int)mqtt_pass.length());
}

// ===================== Web Server =======================
void startWebServer() {
    static bool started = false;
    if (started) return;
    
    server.on("/", [](){ 
        server.send_P(200, "text/html", INDEX_HTML); 
    });
    
    server.on("/status", []() {
        String json = "{";
        json += "\"wifiConnected\":" + String(wifiConnected ? "true" : "false") + ",";
        json += "\"ip\":\"" + String(wifiConnected ? WiFi.localIP().toString() : "") + "\",";
        json += "\"soundPct\":" + String((int)round(g_ewmaPct)) + ",";
        json += "\"soundPct_avg\":" + String(g_soundPctAvg) + ",";
        json += "\"soundPct_min\":" + String(g_soundPctMin) + ",";
        json += "\"soundPct_max\":" + String(g_soundPctMax) + ",";
        json += "\"windowSec\":" + String(SND_AVG_SECONDS) + ",";
        json += "\"dbfsAvg\":" + String((int)round(g_dbfsAvg)) + ",";
        json += "\"dbfsEwma\":" + String((int)round(g_ewmaDbfs)) + ",";
        json += "\"soundLevel\":" + String((uint16_t)round(g_ewmaPct * 40.95));
        json += "}";
        server.send(200, "application/json", json);
    });
    
    server.on("/mqtt", [](){ 
        String host = server.hasArg("host") ? server.arg("host") : mqtt_host;
        String user = server.hasArg("user") ? server.arg("user") : mqtt_user;
        String pass = server.hasArg("pass") ? server.arg("pass") : mqtt_pass;
        uint16_t port = server.hasArg("port") ? (uint16_t)server.arg("port").toInt() : mqtt_port;
        
        if (!server.hasArg("host") && !server.hasArg("port") && !server.hasArg("user") && !server.hasArg("pass")) {
            String help = "Usage: /mqtt?host=IP|DNS&port=1883|8883&user=xxx&pass=yyy\n";
            help += "Actuel: host=" + mqtt_host + " port=" + String(mqtt_port) + " user=" + mqtt_user + " pass_len=" + String(mqtt_pass.length()) + "\n";
            server.send(200, "text/plain", help);
            return;
        }
        
        saveMqttSettings(host, port, user, pass);
        
        if (wifiConnected) {
            if (g_mqtt.connected()) g_mqtt.disconnect();
            mqttApplyServerFromSettings();
            mqttReconnectIfNeeded();
            mqttPublishStatus(true);
        }
        
        String json = "{\"ok\":true,\"host\":\"" + mqtt_host + "\",\"port\":" + String(mqtt_port) + 
                      ",\"user\":\"" + mqtt_user + "\",\"pass_len\":" + String(mqtt_pass.length()) + "}";
        server.send(200, "application/json", json);
    });
    
    server.on("/wifi-scan", [](){ 
        int n = WiFi.scanNetworks(false, true);
        String out = "[\n";
        int maxN = (n < 0) ? 0 : min(n, 15);
        for (int i = 0; i < maxN; ++i) {
            out += " {\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + String(WiFi.RSSI(i)) + 
                   ",\"channel\":" + String(WiFi.channel(i)) + ",\"enc\":" + String((int)WiFi.encryptionType(i)) + "}";
            if (i != maxN-1) out += ",\n";
        }
        out += "\n]";
        server.send(200, "application/json", out);
    });
    
    server.on("/wifi-reason", [](){ 
        String out = "{\"reason\":" + String(g_lastDiscReason) + "}";
        server.send(200, "application/json", out);
    });
    
    server.begin();
    Serial.println("Serveur web démarré");
    started = true;
}

// ===================== WiFi events ======================
void setBleStatus(const String& s, bool notify) {
    if (!pStatusChar) return;
    pStatusChar->setValue(s.c_str());
    if (notify) pStatusChar->notify();
}

void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
    switch (event) {
        case ARDUINO_EVENT_WIFI_STA_CONNECTED:
            Serial.println("WiFi CONNECTED (association)");
            setBleStatus("Connecté (association)", true);
            break;
            
        case ARDUINO_EVENT_WIFI_STA_GOT_IP:
            wifiConnected = true;
            g_wifiBusyConnect = false;
            g_lastDiscReason = -1;
            Serial.printf("WiFi GOT_IP: %s\n", WiFi.localIP().toString().c_str());
            setBleStatus("Connecté: " + WiFi.localIP().toString(), true);
            
            // ✅ NE PAS appeler directement ici, juste signaler
            g_needWebServerStart = true;
            g_needMqttReconnect = true;
            
            if (have_pending) {
                g_ssid = pending_ssid;
                g_pass = pending_pass;
                saveCredentials(g_ssid, g_pass);
                have_pending = false;
                pending_ssid = "";
                pending_pass = "";
            }
            break;
            
        case ARDUINO_EVENT_WIFI_STA_DISCONNECTED: {
            wifiConnected = false;
            g_wifiBusyConnect = false;
            int reason = (int)info.wifi_sta_disconnected.reason;
            g_lastDiscReason = reason;
            Serial.printf("WiFi DISCONNECTED, reason=%d\n", reason);
            setBleStatus("Déconnecté (r=" + String(reason) + ")", true);
            // ✅ Ne rien faire ici - le watchdog dans loop() gère la reconnexion
            break;
        }
        
        default:
            break;
    }
}

// ===================== BLE callbacks ====================
class CredWriteCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* c) override {
        if (!c) return;
        String v = String(c->getValue().c_str());
        v.trim();
        
        if (c == pSsidChar) {
            ble_wifi_ssid_inbox = v;
            ble_wifi_ssid_ready = true;
            Serial.printf("[BLE/WIFI] SSID reçu (len=%d)\n", v.length());
            c->setValue("");
            setBleStatus("SSID reçu", true);
        } else if (c == pPassChar) {
            ble_wifi_pass_inbox = v;
            ble_wifi_pass_ready = true;
            Serial.printf("[BLE/WIFI] PASS reçu (len=%d)\n", v.length());
            c->setValue("");
            setBleStatus("PASS reçu", true);
        }
        
        // Déclencher le traitement seulement quand SSID ET PASS sont reçus
        if (ble_wifi_ssid_ready && ble_wifi_pass_ready) {
            ble_wifi_dirty = true;
        }
    }
};

class MqttWriteCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* c) override {
        if (!c) return;
        String v = String(c->getValue().c_str());
        v.trim();
        c->setValue("");
        
        if (c == pMqttHostChar) {
            st_mqtt_host = v;
            st_set_host = true;
        } else if (c == pMqttPortChar) {
            uint32_t p = v.toInt();
            if (p > 0 && p < 65536) {
                st_mqtt_port = (uint16_t)p;
                st_set_port = true;
            }
        } else if (c == pMqttUserChar) {
            st_mqtt_user = v;
            st_set_user = true;
        } else if (c == pMqttPassChar) {
            st_mqtt_pass = v;
            st_set_pass = true;
        }
        
        g_mqttCoalesceUntil = millis() + 300;
        setBleStatus("MQTT reçu (staging)", true);
    }
};

class MyServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* ) override {
        Serial.println("BLE connecté");
        blePushFullStatus();
    }
    void onDisconnect(BLEServer* s) override {
        Serial.println("BLE déconnecté");
        s->startAdvertising();
    }
};

class MqttConfigWriteCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* c) override {
        String v = String(c->getValue().c_str());
        v.trim();
        c->setValue("");
        
        int p1 = v.indexOf('|');
        int p2 = v.indexOf('|', p1 + 1);
        int p3 = v.indexOf('|', p2 + 1);
        
        if (p1 > 0 && p2 > p1 && p3 > p2) {
            st_mqtt_host = v.substring(0, p1);
            st_set_host = true;
            
            uint32_t p = v.substring(p1 + 1, p2).toInt();
            if (p > 0 && p < 65536) {
                st_mqtt_port = (uint16_t)p;
                st_set_port = true;
            }
            
            st_mqtt_user = v.substring(p2 + 1, p3);
            st_set_user = true;
            st_mqtt_pass = v.substring(p3 + 1);
            st_set_pass = true;
            
            g_mqttCoalesceUntil = millis() + 100;
            setBleStatus("MQTT reçu (CFG staging)", true);
        } else {
            setBleStatus("Format MQTT invalide (host|port|user|pass)", true);
        }
    }
};

static void blePushFullStatus() {
    if (!pStatusChar) return;
    
    String s = "WiFi:";
    if (wifiConnected) 
        s += " " + WiFi.localIP().toString();
    else 
        s += " Déconnecté";
    
    pStatusChar->setValue(s.c_str());
    pStatusChar->notify();
    
    String t = "MQTT:";
    if (g_mqttReady && g_mqtt.connected()) 
        t += " on " + mqtt_host + ":" + String(mqtt_port);
    else 
        t += " déconnecté*";
    
    if (pMqttStatusChar) {
        pMqttStatusChar->setValue(t.c_str());
        pMqttStatusChar->notify();
    }
}

// ===================== BLE Setup ========================
void startBLE() {
    String bleName = String(BLE_NAME_PREFIX) + g_chipId;
    BLEDevice::init(bleName.c_str());
    BLEDevice::setMTU(185);
    
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());
    
    // Service Wi-Fi
    pService = pServer->createService(SERVICE_WIFI_UUID);
    
    pSsidChar = pService->createCharacteristic(
        WIFI_SSID_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
    pSsidChar->setCallbacks(new CredWriteCallbacks());
    
    pPassChar = pService->createCharacteristic(
        WIFI_PASS_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
    pPassChar->setCallbacks(new CredWriteCallbacks());
    
    pStatusChar = pService->createCharacteristic(
        WIFI_STATUS_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
    pStatusChar->setValue("Déconnecté !");
    pStatusChar->addDescriptor(new BLE2902());
    
    // Service MQTT
    pServiceMqtt = pServer->createService(SERVICE_MQTT_UUID);
    
    pMqttHostChar = pServiceMqtt->createCharacteristic(
        MQTT_HOST_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE);
    pMqttHostChar->setCallbacks(new MqttWriteCallbacks());
    
    pMqttPortChar = pServiceMqtt->createCharacteristic(
        MQTT_PORT_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE);
    pMqttPortChar->setCallbacks(new MqttWriteCallbacks());
    
    pMqttUserChar = pServiceMqtt->createCharacteristic(
        MQTT_USER_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE);
    pMqttUserChar->setCallbacks(new MqttWriteCallbacks());
    
    pMqttPassChar = pServiceMqtt->createCharacteristic(
        MQTT_PASS_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
    pMqttPassChar->setCallbacks(new MqttWriteCallbacks());
    
    pMqttBaseChar = pServiceMqtt->createCharacteristic(
        MQTT_BASE_UUID,
        BLECharacteristic::PROPERTY_READ);
    pMqttBaseChar->setValue(MQTT_BASE.c_str());
    
    pDeviceIdChar = pServiceMqtt->createCharacteristic(
        DEVICE_ID_UUID,
        BLECharacteristic::PROPERTY_READ);
    pDeviceIdChar->setValue(g_chipId);
    
    pMqttStatusChar = pServiceMqtt->createCharacteristic(
        MQTT_STATUS_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
    pMqttStatusChar->setValue("Déconnecté !");
    pMqttStatusChar->addDescriptor(new BLE2902());
    
    if (pMqttHostChar) pMqttHostChar->setValue(mqtt_host.c_str());
    if (pMqttPortChar) {
        char buf[8];
        snprintf(buf, sizeof(buf), "%u", mqtt_port);
        pMqttPortChar->setValue(buf);
    }
    if (pMqttUserChar) pMqttUserChar->setValue(mqtt_user.c_str());
    
    pService->start();
    pServiceMqtt->start();
    
    BLEAdvertising* adv = BLEDevice::getAdvertising();
    adv->addServiceUUID(SERVICE_WIFI_UUID);
    adv->addServiceUUID(SERVICE_MQTT_UUID);
    adv->setScanResponse(true);
    adv->start();
    
    Serial.printf("BLE prêt: \"%s\" (2 services : WiFi + MQTT)\n", bleName.c_str());
}

// ===================== Connexion Wi-Fi ===================
static bool connectToSsid(const String& ssid, const String& pass) {
    if (ssid.isEmpty() || pass.isEmpty()) {
        Serial.println("[WiFi] SSID/PASS vide → pas de tentative");
        return false;
    }
    
    if (!g_hostnameSet) {
        String hn = String("ESP32C3-") + g_chipId;
        WiFi.setHostname(hn.c_str());
        g_hostnameSet = true;
    }
    
    if (g_wifiBusyConnect) {
        Serial.println("[WiFi] Tentative déjà en cours → skip");
        return false;
    }
    
    esp_wifi_disconnect();
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(true);
    esp_wifi_set_ps(WIFI_PS_MIN_MODEM);
    WiFi.setAutoConnect(true);
    WiFi.setAutoReconnect(false);
    WiFi.persistent(true);
    
    g_wifiBusyConnect = true;
    Serial.printf("[WiFi] Connexion sur \"%s\"...\n", ssid.c_str());
    WiFi.begin(ssid.c_str(), pass.c_str());
    
    return true;
}

void tryConnectFromStored() {
    loadCredentials(g_ssid, g_pass);
    loadMqttSettings();
    
    if (!g_ssid.isEmpty()) {
        Serial.printf("Boot: tentative sur \"%s\"...\n", g_ssid.c_str());
        setBleStatus("Connexion...", true);
        connectToSsid(g_ssid, g_pass);
    } else {
        Serial.println("Boot: aucun identifiant WiFi enregistré");
        setBleStatus("Déconnecté", false);
    }
}

// ====== LED blink (confirmation reset) ======
void blinkConfirm(uint8_t n) {
    pinMode(LED_PIN, OUTPUT);
#if LED_ACTIVE_LOW
    for (uint8_t i = 0; i < n; i++) {
        digitalWrite(LED_PIN, LOW);
        delay(120);
        digitalWrite(LED_PIN, HIGH);
        delay(120);
    }
#else
    for (uint8_t i = 0; i < n; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(120);
        digitalWrite(LED_PIN, LOW);
        delay(120);
    }
#endif
}

// Triple-reset
#define NVS_TR_KEYSPACE "trst"
#define NVS_TR_COUNT_KEY "cnt"
const uint32_t TRIPLE_RESET_WINDOW_MS = 4000;
bool g_tripleResetClearedThisBoot = false;
uint32_t g_bootMillis = 0;

void resetStoredCredentials() {
    Serial.println("[RESET] Effacement des identifiants WiFi...");
    prefs.begin("wifi", false);
    prefs.remove("ssid");
    prefs.remove("pass");
    prefs.end();
    
    g_ssid = "";
    g_pass = "";
    WiFi.setAutoReconnect(false);
    WiFi.setAutoConnect(false);
    WiFi.disconnect(true);
    delay(200);
    wifiConnected = false;
    
    Serial.println("[RESET] Réinitialisation des paramètres MQTT aux valeurs par défaut...");
    prefs.begin("mqtt", false);
    prefs.putString("host", mqtt_host_default);
    prefs.putUShort("port", mqtt_port_default);
    prefs.putString("user", mqtt_user_default);
    prefs.putString("pass", mqtt_pass_default);
    prefs.end();
    
    mqtt_host = mqtt_host_default;
    mqtt_port = mqtt_port_default;
    mqtt_user = mqtt_user_default;
    mqtt_pass = mqtt_pass_default;
    
    if (pMqttHostChar) pMqttHostChar->setValue(mqtt_host.c_str());
    if (pMqttPortChar) {
        char buf[8];
        snprintf(buf, sizeof(buf), "%u", mqtt_port);
        pMqttPortChar->setValue(buf);
    }
    if (pMqttUserChar) pMqttUserChar->setValue(mqtt_user.c_str());
    
    if (g_mqtt.connected()) g_mqtt.disconnect();
    mqttApplyServerFromSettings();
    g_mqttNextTryAt = 0;
    g_mqttBackoffMs = 500;
    
    setBleStatus("Identifiants effacés + MQTT défauts", true);
    blinkConfirm(6);
    Serial.println("[RESET] OK. Reconfigurer le Wi-Fi via BLE.");
}

void checkTripleResetAtBoot() {
    g_bootMillis = millis();
    prefs.begin(NVS_TR_KEYSPACE, false);
    uint8_t cnt = prefs.getUChar(NVS_TR_COUNT_KEY, 0);
    cnt++;
    prefs.putUChar(NVS_TR_COUNT_KEY, cnt);
    prefs.end();
    
    Serial.printf("[TRST] Compteur de resets: %u\n", cnt);
    
    if (cnt >= 3) {
        Serial.println("[TRST] Triple reset -> effacement identifiants WiFi + reset MQTT");
        resetStoredCredentials();
        prefs.begin(NVS_TR_KEYSPACE, false);
        prefs.putUChar(NVS_TR_COUNT_KEY, 0);
        prefs.end();
        g_tripleResetClearedThisBoot = true;
    } else {
        g_tripleResetClearedThisBoot = false;
    }
}

void tripleResetWindowService() {
    if (!g_tripleResetClearedThisBoot && (millis() - g_bootMillis) > TRIPLE_RESET_WINDOW_MS) {
        prefs.begin(NVS_TR_KEYSPACE, false);
        prefs.putUChar(NVS_TR_COUNT_KEY, 0);
        prefs.end();
        g_tripleResetClearedThisBoot = true;
        Serial.println("[TRST] Fenêtre expirée, compteur remis à 0");
    }
}

// ===================== MQTT =============================
static bool isIPv4Literal(const String& h) {
    if (h.length() < 7 || h.length() > 15) return false;
    int dots = 0;
    for (char c : h) {
        if (c == '.') dots++;
        else if (c < '0' || c > '9') return false;
    }
    return dots == 3;
}

static String macToId(uint64_t mac) {
    char id[17];
    snprintf(id, sizeof(id), "%08X%08X", (uint32_t)(mac >> 32), (uint32_t)(mac & 0xFFFFFFFF));
    return String(id).substring(4);
}

void mqttApplyServerFromSettings() {
    bool wantTls = (mqtt_port == 8883);
    
    // Fermeture propre de la connexion existante
    if (g_mqtt.connected()) {
        g_mqtt.disconnect();
        delay(50);
    }
    g_netSecure.stop(); // Ferme tous les sockets
    delay(50);
    
    if (wantTls) {
        if (!isIPv4Literal(mqtt_host)) {
            g_netSecure.setCACert(ISRG_ROOT_X1_PEM);
        } else {
            Serial.println("[MQTT/TLS] Host est une IP → pas de SNI, disable verify.");
        }
        g_netSecure.setInsecure(); // Désactiver pour vérif stricte
        g_netSecure.setTimeout(5);
    } else {
        g_netSecure.stop(); // Ferme les connexions TLS
    }
    
    g_useTls = wantTls;
    g_mqtt.setServer(mqtt_host.c_str(), mqtt_port);
    g_mqtt.setCallback(mqttOnMessage);
    g_mqttReady = true;
}

void startMQTT() {
    String id = macToId(ESP.getEfuseMac());
    id.toCharArray(g_chipId, sizeof(g_chipId));
    
    MQTT_BASE = String("devices/") + g_chipId;
    MQTT_TOPIC_STATUS = MQTT_BASE + "/status";
    MQTT_TOPIC_AVAIL = MQTT_BASE + "/availability";
    MQTT_TOPIC_CMD_REBOOT = MQTT_BASE + "/cmd/reboot";
    HA_DISCOVERY_SENSOR = String("homeassistant/sensor/") + g_chipId + "/sound/config";
    
    mqttApplyServerFromSettings();
    g_mqtt.setKeepAlive(30);
    g_mqtt.setSocketTimeout(5);
    g_mqtt.setBufferSize(1024);
    
    if (pMqttBaseChar) pMqttBaseChar->setValue(MQTT_BASE.c_str());
    if (pDeviceIdChar) pDeviceIdChar->setValue(g_chipId);
    
    mqttReconnectIfNeeded();
}

void mqttPublishDiscovery() {
    if (!g_mqtt.connected()) return;
    
    String deviceJson = String("{") +
        "\"identifiers\":[\"esp32c3-" + String(g_chipId) + "\"]," +
        "\"manufacturer\":\"Retorik\",\"model\":\"ESP32-C3 Micro\",\"sw_version\":\"1.3.1\"}";
    
    String sn = "{";
    sn += "\"name\":\"ESP32C3 Sound %\",\"uniq_id\":\"" + String(g_chipId) + "_sound\",";
    sn += "\"stat_t\":\"" + MQTT_TOPIC_STATUS + "\",\"val_tpl\":\"{{ value_json.soundPct }}\",";
    sn += "\"unit_of_meas\":\"%\",\"state_class\":\"measurement\",";
    sn += "\"avty_t\":\"" + MQTT_TOPIC_AVAIL + "\",\"pl_avail\":\"online\",\"pl_not_avail\":\"offline\",";
    sn += "\"dev\":" + deviceJson + "}";
    
    g_mqtt.publish(HA_DISCOVERY_SENSOR.c_str(), sn.c_str(), true);
}

void mqttReconnectIfNeeded() {
    if (!wifiConnected || g_mqtt.connected() || g_mqttConnecting) return;
    
    unsigned long now = millis();
    if (now < g_mqttNextTryAt) return;
    
    // Nettoyage complet avant reconnexion
    g_netSecure.stop();
    delay(100);
    
    // Reconfigurer le client
    if (g_useTls) {
        if (!isIPv4Literal(mqtt_host)) {
            g_netSecure.setCACert(ISRG_ROOT_X1_PEM);
        }
        g_netSecure.setInsecure();
        g_netSecure.setTimeout(5);
    }
    
    String clientId = String("ESP32C3-") + g_chipId;
    Serial.printf("[MQTT] Connexion à %s:%u ... (user='%s', pass_len=%d)\n",
                  mqtt_host.c_str(), mqtt_port, mqtt_user.c_str(), (int)mqtt_pass.length());
    
    g_mqttConnecting = true;
    bool ok = false;
    
    if (mqtt_user.length() > 0 && mqtt_pass.length() > 0) {
        ok = g_mqtt.connect(clientId.c_str(), mqtt_user.c_str(), mqtt_pass.c_str(),
                           MQTT_TOPIC_AVAIL.c_str(), 0, true, "offline");
    } else {
        Serial.println("[MQTT] Identifiants incomplets -> tentative SANS auth");
        ok = g_mqtt.connect(clientId.c_str(), MQTT_TOPIC_AVAIL.c_str(), 0, true, "offline");
    }
    
    g_mqttConnecting = false;
    
    if (ok) {
        Serial.println("[MQTT] Connecté");
        setBleStatus("MQTT connecté: " + mqtt_host + ":" + String(mqtt_port), true);
        
        g_mqtt.publish(MQTT_TOPIC_AVAIL.c_str(), "online", true);
        g_mqtt.subscribe(MQTT_TOPIC_CMD_REBOOT.c_str());
        
        mqttPublishDiscovery();
        mqttPublishStatus(true); // Envoi immédiat à la connexion
        
        g_mqttBackoffMs = 500;
        g_mqttNextTryAt = 0;
        
        // Ne réinitialiser le timer périodique que si c'est la première connexion
        if (g_nextPeriodicAt == 0) {
            g_nextPeriodicAt = millis() + SND_PERIODIC_PUB_MS;
        }
        
        g_rateWindowStartMs = millis();
        g_sentThisMinute = 0;
    } else {
        int rc = g_mqtt.state();
        Serial.printf("[MQTT] Connexion échouée, rc=%d\n", rc);
        setBleStatus("MQTT échec rc=" + String(rc), true);
        
        g_mqttNextTryAt = now + g_mqttBackoffMs;
        g_mqttBackoffMs = min(g_mqttBackoffMs * 2, 20000UL);
    }
}

void mqttOnMessage(char* topic, byte* payload, unsigned int len) {
    String t = topic;
    String msg;
    msg.reserve(len);
    for (unsigned int i = 0; i < len; ++i) msg += (char)payload[i];
    msg.trim();
    msg.toLowerCase();
    
    if (t == MQTT_TOPIC_CMD_REBOOT) {
        if (msg == "now") {
            g_mqtt.publish(MQTT_TOPIC_AVAIL.c_str(), "offline", true);
            delay(200);
            ESP.restart();
        }
        return;
    }
}

void mqttPublishStatus(bool /*force*/) {
    if (!g_mqtt.connected()) return;
    
    unsigned long now = millis();
    if (now - g_rateWindowStartMs >= 60000UL) {
        g_rateWindowStartMs = now;
        g_sentThisMinute = 0;
    }
    
    if (g_sentThisMinute >= PUB_MAX_PER_MIN) {
        Serial.println("[MQTT] Rate-limit: publication ignorée");
        return;
    }
    
    String json = "{";
    json += "\"ip\":\"" + String(wifiConnected ? WiFi.localIP().toString() : "") + "\",";
    json += "\"soundPct\":" + String((int)round(g_ewmaPct)) + ",";
    json += "\"soundPct_avg\":" + String(g_soundPctAvg) + ",";
    json += "\"soundPct_min\":" + String(g_soundPctMin) + ",";
    json += "\"soundPct_max\":" + String(g_soundPctMax) + ",";
    json += "\"windowSec\":" + String(SND_AVG_SECONDS) + ",";
    json += "\"dbfsAvg\":" + String((int)round(g_dbfsAvg)) + ",";
    json += "\"dbfsEwma\":" + String((int)round(g_ewmaDbfs)) + ",";
    json += "\"soundLevel\":" + String((uint16_t)round(g_ewmaPct * 40.95)) + ",";
    json += "\"uptime\":" + String(millis() / 1000);
    json += "}";
    
    g_mqtt.publish(MQTT_TOPIC_STATUS.c_str(), json.c_str(), true);
    g_sentThisMinute++;
}

// ===================== Staging BLE → MQTT ===============
static void processBleMqttInbox() {
    if (g_mqttCoalesceUntil == 0) return;
    if ((long)(millis() - g_mqttCoalesceUntil) < 0) return;
    
    String newHost = st_set_host ? st_mqtt_host : mqtt_host;
    uint16_t newPort = st_set_port ? st_mqtt_port : mqtt_port;
    String newUser = st_set_user ? st_mqtt_user : mqtt_user;
    String newPass = st_set_pass ? st_mqtt_pass : mqtt_pass;
    
    saveMqttSettings(newHost, newPort, newUser, newPass);
    mqttApplyServerFromSettings();
    
    g_mqttNextTryAt = 0;
    g_mqttBackoffMs = 500;
    g_mqttCoalesceUntil = 0;
    st_set_host = st_set_port = st_set_user = st_set_pass = false;
    
    setBleStatus("MQTT appliqué (RAM+NVS) — reconnexion…", true);
}

// ===================== I2S =====================
static void startI2S() {
    i2s_config_t cfg = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = I2S_SAMPLE_RATE,
        .bits_per_sample = I2S_BITS,
        .channel_format = I2S_CHANNEL_CFG,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = 0,
        .dma_buf_count = 6,
        .dma_buf_len = 256,
        .use_apll = false,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0
    };
    
    i2s_pin_config_t pins = {
        .bck_io_num = I2S_BCLK_PIN,
        .ws_io_num = I2S_LRCK_PIN,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = I2S_DIN_PIN
    };
    
    i2s_driver_install(I2S_NUM_0, &cfg, 0, NULL);
    i2s_set_pin(I2S_NUM_0, &pins);
    i2s_set_clk(I2S_NUM_0, I2S_SAMPLE_RATE, I2S_BITS, I2S_CHANNEL_MONO);
}

// ===================== setup / loop =====================
void setup() {
    Serial.begin(115200);
    
    pinMode(LED_PIN, OUTPUT);
#if LED_ACTIVE_LOW
    digitalWrite(LED_PIN, HIGH); // éteint
#else
    digitalWrite(LED_PIN, LOW);
#endif
    
    // Pré-calcule l'ID pour le nom BLE
    String idEarly = macToId(ESP.getEfuseMac());
    idEarly.toCharArray(g_chipId, sizeof(g_chipId));
    MQTT_BASE = String("devices/") + g_chipId;
    
    checkTripleResetAtBoot();
    
    WiFi.onEvent(onWiFiEvent);
    loadMqttSettings();
    
    startI2S();
    startBLE();
    startMQTT();
    tryConnectFromStored();
    
    g_curBucketStart = millis();
    g_nextPeriodicAt = millis() + SND_PERIODIC_PUB_MS; // Premier envoi dans 10s
    g_rateWindowStartMs = millis();
    g_sentThisMinute = 0;
    g_lastPublishMs = millis(); // Initialiser pour éviter envoi immédiat
    g_lastPublishedPct = 0; // Valeur initiale
}

static inline uint8_t quantizePct(uint8_t v) {
    const uint8_t step = QUANTIZE_STEP_PCT;
    if (step <= 1) return v;
    
    int q = ((int)v + step / 2) / step;
    q *= step;
    if (q > 100) q = 100;
    if (q < 0) q = 0;
    return (uint8_t)q;
}

static void processBleWifiInbox() {
    if (!ble_wifi_dirty) return;
    
    // Verrouiller pour éviter corruption pendant traitement
    if (ble_wifi_processing) {
        Serial.println("[BLE/WIFI] Traitement déjà en cours, skip");
        return;
    }
    
    ble_wifi_processing = true; // Lock
    
    // Vérifier que SSID et PASS sont bien disponibles
    if (!ble_wifi_ssid_ready || !ble_wifi_pass_ready) {
        Serial.println("[BLE/WIFI] Identifiants incomplets, attente...");
        ble_wifi_processing = false;
        return;
    }
    
    // Copie atomique IMMÉDIATE avec allocation manuelle pour éviter bugs String
    char ssid_buffer[64] = {0};
    char pass_buffer[128] = {0};
    
    strncpy(ssid_buffer, ble_wifi_ssid_inbox.c_str(), sizeof(ssid_buffer) - 1);
    strncpy(pass_buffer, ble_wifi_pass_inbox.c_str(), sizeof(pass_buffer) - 1);
    
    String new_ssid = String(ssid_buffer);
    String new_pass = String(pass_buffer);
    
    // Log AVANT nettoyage pour debug
    Serial.printf("[BLE/WIFI] Copie atomique: SSID=\"%s\" (%d), PASS len=%d\n",
                 new_ssid.c_str(), new_ssid.length(), new_pass.length());
    
    // Nettoyer immédiatement les buffers BLE
    ble_wifi_ssid_inbox = "";
    ble_wifi_pass_inbox = "";
    ble_wifi_dirty = false;
    ble_wifi_ssid_ready = false;
    ble_wifi_pass_ready = false;
    
    // Validation
    if (new_ssid.isEmpty()) {
        Serial.println("[BLE/WIFI] ERREUR: SSID vide après copie");
        setBleStatus("Erreur: SSID vide", true);
        ble_wifi_processing = false;
        return;
    }
    
    if (new_pass.isEmpty()) {
        Serial.println("[BLE/WIFI] ERREUR: PASS vide après copie");
        setBleStatus("Erreur: PASS vide", true);
        ble_wifi_processing = false;
        return;
    }
    
    // Vérification longueur mot de passe
    if (new_pass.length() < 8) {
        Serial.printf("[BLE/WIFI] ERREUR: Mot de passe trop court (%d < 8)\n", new_pass.length());
        setBleStatus("Mot de passe trop court (min 8)", true);
        ble_wifi_processing = false;
        return;
    }
    
    // Marquer comme cible courante
    have_pending = true;
    pending_ssid = new_ssid;
    pending_pass = new_pass;
    g_ssid = new_ssid;
    g_pass = new_pass;
    
    Serial.printf("[BLE/WIFI] Identifiants validés: SSID=\"%s\" (%d), PASS len=%d\n",
                 g_ssid.c_str(), g_ssid.length(), g_pass.length());
    
    // Fermer proprement MQTT avant de couper WiFi
    if (g_mqtt.connected()) {
        Serial.println("[BLE/WIFI] Déconnexion MQTT avant switch WiFi...");
        g_mqtt.disconnect();
        delay(100);
    }
    g_netSecure.stop(); // Ferme les sockets SSL
    delay(50);
    
    // Forcer déconnexion propre
    g_wifiBusyConnect = false;
    g_mqttConnecting = false; // Reset flag MQTT aussi
    WiFi.disconnect(true, true);
    delay(300);
    
    setBleStatus("Connexion...", true);
    Serial.printf("[BLE/WIFI] SWITCH → \"%s\" (pass_len=%d)\n", 
                 g_ssid.c_str(), g_pass.length());
    
    connectToSsid(g_ssid, g_pass);
    
    ble_wifi_processing = false; // Unlock
}

static void recomputeWindowStats() {
    uint32_t totalSum = 0;
    uint32_t totalCnt = 0;
    uint8_t wmin = 255, wmax = 0;
    double totalDb = 0.0;
    
    for (int i = 0; i < SND_AVG_SECONDS; i++) {
        if (g_ring[i].count == 0) continue;
        
        totalSum += g_ring[i].sumPct;
        totalCnt += g_ring[i].count;
        
        if (g_ring[i].minPct < wmin) wmin = g_ring[i].minPct;
        if (g_ring[i].maxPct > wmax) wmax = g_ring[i].maxPct;
        
        totalDb += g_ring[i].sumDb;
    }
    
    if (totalCnt > 0) {
        g_soundPctAvg = quantizePct((uint8_t)round((double)totalSum / (double)totalCnt));
        g_dbfsAvg = totalDb / (double)totalCnt;
        g_soundPctMin = (wmin == 255) ? 0 : wmin;
        g_soundPctMax = wmax;
    } else {
        g_soundPctAvg = 0;
        g_dbfsAvg = -90.0;
        g_soundPctMin = 0;
        g_soundPctMax = 0;
    }
}

void loop() {
    // ✅ Traiter les événements WiFi différés EN PREMIER
    if (g_needWebServerStart) {
        g_needWebServerStart = false;
        startWebServer();
    }
    
    if (g_needMqttReconnect) {
        g_needMqttReconnect = false;
        mqttApplyServerFromSettings();
        mqttReconnectIfNeeded();
        mqttPublishStatus(true);
    }
    
    if (wifiConnected) server.handleClient();
    
    processBleWifiInbox();
    processBleMqttInbox();
    
    // ----- Lecture I2S et calcul % instantané -----
    if (g_winStart == 0) g_winStart = millis();
    
    static int32_t buf[256];
    size_t nbytes = 0;
    i2s_read(I2S_NUM_0, buf, sizeof(buf), &nbytes, pdMS_TO_TICKS(20));
    
    if (nbytes > 0) {
        size_t n = nbytes / sizeof(buf[0]);
        double sumSquares = 0.0;
        
        for (size_t i = 0; i < n; i++) {
            int32_t s32 = buf[i];
            int16_t s16 = s32 >> 14;
            double norm = (double)s16 / 32768.0;
            sumSquares += norm * norm;
        }
        
        if (millis() - g_winStart >= SAMPLE_WINDOW_MS) {
            const float NOISE_FLOOR_DBFS = -65.0f;
            const float NOISE_DEADBAND_DB = 2.0f;
            
            double rms = sqrt(sumSquares / (double)max((size_t)1, n));
            double db = 20.0 * log10(rms + 1e-9);
            
            uint8_t pct = 0;
            if (db <= NOISE_FLOOR_DBFS + NOISE_DEADBAND_DB) {
                pct = 0;
            } else {
                if (db > DBFS_MAX) db = DBFS_MAX;
                float pctf = (float)((db - NOISE_FLOOR_DBFS) * 100.0 / (DBFS_MAX - NOISE_FLOOR_DBFS));
                if (pctf < 0) pctf = 0;
                if (pctf > 100) pctf = 100;
                pct = (uint8_t)round(pctf);
            }
            
            g_soundPct = pct;
            g_soundLevel = (uint16_t)round(pct * 40.95);
            
            // EWMA
            g_ewmaPct = (1.0f - EWMA_ALPHA_PCT) * g_ewmaPct + EWMA_ALPHA_PCT * (float)pct;
            g_ewmaDbfs = (1.0f - EWMA_ALPHA_DB) * g_ewmaDbfs + EWMA_ALPHA_DB * (float)db;
            
            // Agrégation bucket courant
            g_curSumPct += pct;
            g_curSumDb += db;
            g_curCount += 1;
            if (pct < g_curMinPct) g_curMinPct = pct;
            if (pct > g_curMaxPct) g_curMaxPct = pct;
            
            g_winStart = millis();
        }
    }
    
    // Roulement de bucket chaque seconde
    unsigned long now = millis();
    if (now - g_curBucketStart >= 1000UL) {
        g_ring[g_ringIndex].sumPct = g_curSumPct;
        g_ring[g_ringIndex].sumDb = g_curSumDb;
        g_ring[g_ringIndex].count = g_curCount;
        g_ring[g_ringIndex].minPct = (g_curMinPct == 255) ? 0 : g_curMinPct;
        g_ring[g_ringIndex].maxPct = g_curMaxPct;
        
        g_ringIndex = (g_ringIndex + 1) % SND_AVG_SECONDS;
        g_ring[g_ringIndex] = SndBucket();
        
        g_curSumPct = 0;
        g_curCount = 0;
        g_curMinPct = 255;
        g_curMaxPct = 0;
        g_curSumDb = 0.0;
        g_curBucketStart = now;
        
        recomputeWindowStats();
    }
    
    // Watchdog Wi-Fi (toutes les 30 s)
    if (now - lastWiFiCheck > 30000) {
        lastWiFiCheck = now;
        
        if (WiFi.status() != WL_CONNECTED) {
            if (wifiConnected) {
                wifiConnected = false;
                setBleStatus("Déconnecté", true);
                Serial.println("WiFi perdu (watchdog)");
            }
            
            if (!g_ssid.isEmpty() && !g_wifiBusyConnect) {
                Serial.println("[WiFi] Watchdog → relance propre");
                connectToSsid(g_ssid, g_pass);
            }
        }
    }
    
    tripleResetWindowService();
    mqttLoop();
    
    // Politique de publication (EWMA + periodic + burst)
    if (g_mqtt.connected()) {
        bool shouldPublish = false;
        bool isPeriodicPub = false;
        
        // Périodique (toutes les 10s, indépendant des autres publications)
        if ((long)(now - g_nextPeriodicAt) >= 0) {
            shouldPublish = true;
            isPeriodicPub = true;
            g_nextPeriodicAt = now + SND_PERIODIC_PUB_MS;
        }
        
        // Variation significative sur EWMA (seulement si pas déjà publié récemment)
        uint8_t ewma_q = quantizePct((uint8_t)round(g_ewmaPct));
        if (!shouldPublish && (now - g_lastPublishMs) >= SND_MIN_PUB_INTERVAL_MS) {
            uint8_t last = g_lastPublishedPct;
            uint8_t diff = (ewma_q > last) ? (ewma_q - last) : (last - ewma_q);
            
            if (diff >= SND_CHANGE_THRESHOLD_PCT) {
                shouldPublish = true;
                Serial.printf("[MQTT] Variation détectée: %d -> %d (delta=%d)\n", 
                             last, ewma_q, diff);
            }
        }
        
        // Burst instantané (pic soudain)
        if (!shouldPublish && 
            g_soundPct >= BURST_THRESHOLD_PCT && 
            (now - g_lastPublishMs) >= SND_MIN_PUB_INTERVAL_MS) {
            shouldPublish = true;
            Serial.printf("[MQTT] Burst détecté: %d%%\n", g_soundPct);
        }
        
        if (shouldPublish) {
            if (isPeriodicPub) {
                Serial.println("[MQTT] Publication périodique (10s)");
            }
            mqttPublishStatus(true);
            g_lastPublishMs = now;
            g_lastPublishedPct = ewma_q;
        }
    }
    
    delay(5);
}

void mqttLoop() {
    if (!wifiConnected) return;
    
    if (g_mqtt.connected()) {
        g_mqtt.loop();
    } else {
        mqttReconnectIfNeeded();
    }
}
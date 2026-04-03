#include "wifi_mgr.h"
#include "nvs_store.h"
#include "globals.h"
#include "config.h"
#include "mqtt_mgr.h"
#include "ble.h"
#include <esp_wifi.h>
#include "ota_mgr.h"

static uint32_t s_lastWifiAction = 0;

// SSID courant (MAJ à GOT_IP)
static String s_currentSsid;

// ================== Helpers DIAG ==================
static const char* wlStatusToStr(wl_status_t st) {
  switch (st) {
    case WL_NO_SHIELD:       return "NO_SHIELD";
    case WL_IDLE_STATUS:     return "IDLE";
    case WL_NO_SSID_AVAIL:   return "NO_SSID";
    case WL_SCAN_COMPLETED:  return "SCAN_DONE";
    case WL_CONNECTED:       return "CONNECTED";
    case WL_CONNECT_FAILED:  return "CONNECT_FAILED";
    case WL_CONNECTION_LOST: return "CONNECTION_LOST";
    case WL_DISCONNECTED:    return "DISCONNECTED";
    default:                 return "?";
  }
}

// On mappe au minimum ceux que tu vois dans tes logs.
// (Valeurs numériques pour éviter une dépendance fragile à des enums selon versions)
static const char* wifiDiscReasonToStr(int r) {
  switch (r) {
    case 2:  return "AUTH_EXPIRE";
    case 39: return "TIMEOUT";
    default: return "UNKNOWN";
  }
}

static void logWifiSnapshot(const char* tag, int reason = -1) {
#if WIFI_DIAG_VERBOSE
  wl_status_t st = WiFi.status();
  String ssid = WiFi.SSID();
  int rssi = WiFi.RSSI();
  int ch = WiFi.channel();
  String ip = WiFi.localIP().toString();

  Serial.printf("[WiFi][%s] WL=%d(%s) wifiConnected=%d ssid=\"%s\" rssi=%d ch=%d ip=%s",
                tag,
                (int)st, wlStatusToStr(st),
                wifiConnected ? 1 : 0,
                ssid.c_str(), rssi, ch, ip.c_str());

  if (reason >= 0) {
    Serial.printf(" reason=%d(%s)", reason, wifiDiscReasonToStr(reason));
  }
  Serial.println();
#endif
}

// ================== ÉVÉNEMENTS WiFi ==================
void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("WiFi CONNECTED (association)");
      scheduleBleStatus("Connecté (association)");
      logWifiSnapshot("STA_CONNECTED");
      break;

    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      wifiConnected = true;
      g_wifiBusyConnect = false;
      g_lastDiscReason = -1;

      s_currentSsid = WiFi.SSID();

      Serial.printf("WiFi GOT_IP: %s (SSID=\"%s\")\n",
                    WiFi.localIP().toString().c_str(), WiFi.SSID().c_str());

      scheduleBleStatus("Connecté: " + WiFi.localIP().toString());
      logWifiSnapshot("GOT_IP");

      // Démarrages différés (dans loop principale)
      g_needWebServerStart = true;
      g_needMqttReconnect  = true;
      break;

    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED: {
      wifiConnected = false;
      g_wifiBusyConnect = false;

      int reason = (int)info.wifi_sta_disconnected.reason;
      g_lastDiscReason = reason;

      Serial.printf("WiFi DISCONNECTED, reason=%d (%s)\n", reason, wifiDiscReasonToStr(reason));
      scheduleBleStatus("Déconnecté (r=" + String(reason) + ")");
      logWifiSnapshot("STA_DISCONNECTED", reason);
      break;
    }

    case ARDUINO_EVENT_WIFI_STA_LOST_IP:
      wifiConnected = false;
      Serial.println("WiFi LOST_IP");
      logWifiSnapshot("LOST_IP");
      break;

    default:
      break;
  }
}

// ================== Helpers ==================
static void prepareCoex() {
  // Une fois BLEDevice::init() appelé, le stack BT reste actif en mémoire.
  // WIFI_PS_MIN_MODEM est alors permanent : y revenir n'est jamais safe.
  if (isBleInitialized()) {
    WiFi.setSleep(true);
    esp_wifi_set_ps(WIFI_PS_MIN_MODEM);
  } else {
    WiFi.setSleep(false);
    esp_wifi_set_ps(WIFI_PS_NONE);
  }
}

void wifiEnableCoexSleep() {
  // Appelé quand BLE devient actif — modem-sleep requis pour la coexistence
  WiFi.setSleep(true);
  esp_wifi_set_ps(WIFI_PS_MIN_MODEM);
}


// ================== Connexion (boot) ==================
bool connectToSsid(const String& ssid, const String& pass) {
  if (ssid.isEmpty() || pass.length() < 8) {
    Serial.println("[WiFi] SSID/PASS invalides");
    return false;
  }

  WiFi.mode(WIFI_STA);
  prepareCoex();

  // Hostname commun WiFi/OTA/BLE si disponible
  if (g_hostname[0] != '\0') {
    WiFi.setHostname(g_hostname);
    Serial.printf("[WiFi] Hostname fixé à \"%s\"\n", g_hostname);
  }

  WiFi.persistent(false);
  WiFi.disconnect(false, false);
  delay(50);

  Serial.printf("Boot: tentative sur \"%s\"...\n", ssid.c_str());
  WiFi.begin(ssid.c_str(), pass.c_str());

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - t0) < 15000UL) {
    delay(100);
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    s_currentSsid = ssid;
    Serial.printf("[WiFi] Connecté: %s (RSSI=%d dBm)\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    logWifiSnapshot("BOOT_CONNECTED");
    return true;
  } else {
    Serial.println("[WiFi] Échec de connexion (timeout)");
    logWifiSnapshot("BOOT_TIMEOUT");
    return false;
  }
}

void tryConnectFromStored() {
  String s, p;
  loadCredentials(s, p);
  if (!s.isEmpty() && p.length() >= 8) {
    connectToSsid(s, p);
  } else {
    Serial.println("[WiFi] Aucun identifiant stocké valide.");
  }
}

String currentSsid() { return s_currentSsid; }

// ================== SWITCH Wi-Fi non bloquant ==================
enum SwitchPhase : uint8_t { SW_IDLE=0, SW_PREPARE, SW_BEGIN, SW_WAIT_IP };
static SwitchPhase s_phase = SW_IDLE;
static bool        s_switchRequested = false;
static String      s_reqSsid, s_reqPass;
static uint32_t    s_connectDeadline = 0;

// Switch en cours (interne à ce fichier)
static bool g_wifiSwitchInProgress = false;

// Demande de switch (appelée après saveCredentials)
void requestWifiSwitch(const String& ssid, const String& pass) {
  String ns = ssid; ns.trim();
  String np = pass; np.trim();
  if (ns.isEmpty() || np.length() < 8) {
    Serial.println("[WiFi] requestWifiSwitch: identifiants invalides");
    return;
  }
  s_reqSsid = ns;
  s_reqPass = np;
  s_switchRequested = true;
  s_phase = SW_IDLE;
  g_wifiSwitchInProgress = true;
  s_lastWifiAction = 0;
  Serial.printf("[WiFi] Switch demandé vers \"%s\"\n", s_reqSsid.c_str());
}

void wifiSwitchService() {
  if (otaIsRunning()) {
    // Ne touche pas au WiFi pendant une mise à jour OTA
    return;
  }

  if (!s_switchRequested) return;

  const uint32_t now = millis();

  // SW_BEGIN nécessite 200 ms après le disconnect (ESP32-C3 exige plus que 50 ms
  // pour que le stack WiFi libère proprement l'état d'authentification précédent).
  const uint32_t phaseMinDelay = (s_phase == SW_BEGIN) ? 200UL : 50UL;
  if (now - s_lastWifiAction < phaseMinDelay) return;

  switch (s_phase) {
    case SW_IDLE: {
      s_phase = SW_PREPARE;
      s_lastWifiAction = now;
      break;
    }

    case SW_PREPARE: {
      if (g_mqtt.connected()) {
        Serial.println("[WiFi] Prépare switch: déconnexion MQTT");
        g_mqtt.disconnect();
      }
      // flush avant stop pour libérer proprement le socket lwIP
      if (g_netSecure.connected()) g_netSecure.flush();
      g_netSecure.stop();
      WiFi.disconnect(false, false);
      s_phase = SW_BEGIN;
      s_lastWifiAction = now;
      break;
    }

    case SW_BEGIN: {
      WiFi.mode(WIFI_STA);
      // L’ESP32-C3 impose WIFI_PS_MIN_MODEM dès que BLE est initialisé (abort sinon).
      // prepareCoex() gère correctement les deux cas.
      prepareCoex();
      WiFi.persistent(false);

      Serial.printf("[WiFi] Connexion → \"%s\" (non bloquant)\n", s_reqSsid.c_str());
      WiFi.begin(s_reqSsid.c_str(), s_reqPass.c_str());

      s_connectDeadline = now + 15000UL;
      s_phase = SW_WAIT_IP;
      s_lastWifiAction = now;
      break;
    }

    case SW_WAIT_IP: {
      if (WiFi.status() == WL_CONNECTED) {
        wifiConnected = true;
        s_currentSsid = s_reqSsid;

        Serial.printf("[WiFi] Switch OK: %s (RSSI=%d dBm)\n",
                      WiFi.localIP().toString().c_str(), WiFi.RSSI());

        s_switchRequested = false;
        s_phase = SW_IDLE;
        g_wifiSwitchInProgress = false;

        // IMPORTANT: on ne déclenche plus MQTT ici.
        // L’événement GOT_IP déclenchera déjà g_needMqttReconnect / g_needWebServerStart.
        return;
      }

      if ((int32_t)(now - s_connectDeadline) >= 0) {
        Serial.println("[WiFi] Switch échec (timeout)");
        s_switchRequested = false;
        s_phase = SW_IDLE;
        g_wifiSwitchInProgress = false;
        return;
      }
      s_lastWifiAction = now;
      break;
    }
  }
}

// ================== Watchdog Wi-Fi ==================
void wifiWatchdogService() {
  if (otaIsRunning()) {
    // Pas de reconnexion automatique pendant OTA
    return;
  }

  const uint32_t now = millis();
  if (now - s_lastWifiAction < 2000UL) return;

  if (!wifiConnected && WiFi.status() != WL_CONNECTED && !g_wifiSwitchInProgress) {
    String s, p; loadCredentials(s, p);
    if (!s.isEmpty() && p.length() >= 8) {
      WiFi.disconnect(false, false);
      Serial.println("[WiFi] Watchdog: reconnexion via NVS…");
      requestWifiSwitch(s, p);   // non bloquant
    }
    // Pas de log si aucun credential — évite le spam toutes les 2s
    s_lastWifiAction = now;
  }
}
#include "wifi_mgr.h"
#include "app_state.h"

#include <WiFi.h>
#include <esp_wifi.h>
#include "esp_idf_version.h"

static String s_ssid, s_pass, s_host;
static bool   s_lowerTxPower = true;
static unsigned long s_lastWatchdog = 0;

AppState g; // définition (unique) ici

static const char* encNameShort(wifi_auth_mode_t e) {
  switch (e) {
    case WIFI_AUTH_OPEN: return "OPEN";
    case WIFI_AUTH_WEP: return "WEP";
    case WIFI_AUTH_WPA_PSK: return "WPA";
    case WIFI_AUTH_WPA2_PSK: return "WPA2";
    case WIFI_AUTH_WPA_WPA2_PSK: return "WPA/WPA2";
    case WIFI_AUTH_WPA3_PSK: return "WPA3";
    case WIFI_AUTH_WPA2_WPA3_PSK: return "WPA2/WPA3";
    default: return "?";
  }
}

const char* wifi_mgr::reasonToText(int r){
  switch (r) {
    case 1:  return "UNSPECIFIED";
    case 2:  return "AUTH_EXPIRE";
    case 15: return "4WAY_HANDSHAKE_TIMEOUT";
    case 200:return "BEACON_TIMEOUT";
    case 201:return "NO_AP_FOUND";
    case 202:return "AUTH_FAIL";
    case 204:return "HANDSHAKE_TIMEOUT";
    default: return "—";
  }
}

static void adviceForReason(int r){
  Serial.print("Conseil: ");
  switch (r) {
    case 201: Serial.println("SSID 2.4GHz visible/séparé, canaux 1..13, pas caché."); break;
    case 2:
    case 15:
    case 202:
    case 204: Serial.println("Force WPA2-PSK, désactive WPA3/Transition, PMF=optionnel."); break;
    default:  Serial.println("Vérifie SSID/pass, 2.4GHz actif, pas de filtrage MAC."); break;
  }
}

static void applyRadioPolicy() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(s_host.c_str());
  WiFi.setSleep(false);
  esp_wifi_set_ps(WIFI_PS_NONE);
  esp_wifi_set_country_code("FR", true);
#if defined(ESP_IDF_VERSION)
# if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(4,4,0)
  esp_wifi_disable_pmf_config(WIFI_IF_STA);
# endif
#endif
  if (s_lowerTxPower) WiFi.setTxPower(WIFI_POWER_8_5dBm);
  WiFi.persistent(false);
  WiFi.setAutoConnect(false);
  WiFi.setAutoReconnect(true);
}

void wifi_mgr::smartConnect(bool lockBssid) {
  Serial.printf("[WiFi] Scan des réseaux pour \"%s\"…\n", s_ssid.c_str());
  int n = WiFi.scanNetworks(false, true);
  int bestIdx=-1, bestRSSI=-999, bestChan=0;
  uint8_t bestBSSID[6]={0};
  for (int i=0;i<n;i++){
    Serial.printf("[WiFi]  SSID=\"%s\" RSSI=%ddBm CH=%d ENC=%s BSSID=%s\n",
      WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i),
      encNameShort(WiFi.encryptionType(i)), WiFi.BSSIDstr(i).c_str());
    if (WiFi.SSID(i)==s_ssid && WiFi.channel(i)<=13){
      if (WiFi.RSSI(i)>bestRSSI){
        bestRSSI=WiFi.RSSI(i); bestIdx=i; bestChan=WiFi.channel(i);
        memcpy(bestBSSID, WiFi.BSSID(i), 6);
      }
    }
  }
  if (bestIdx<0 || !lockBssid){
    if (bestIdx<0) Serial.println("[WiFi] SSID cible introuvable → tentative standard.");
    else Serial.println("[WiFi] Fallback sans lock BSSID.");
    WiFi.begin(s_ssid.c_str(), s_pass.c_str());
    return;
  }
  g.chosenBssid = String(String(bestBSSID[0], HEX));
  char b[20];
  snprintf(b,sizeof(b),"%02X:%02X:%02X:%02X:%02X:%02X",bestBSSID[0],bestBSSID[1],bestBSSID[2],bestBSSID[3],bestBSSID[4],bestBSSID[5]);
  g.chosenBssid = String(b);
  g.chosenChannel = bestChan;
  Serial.printf("[WiFi] Choix: CH=%d RSSI=%ddBm BSSID=%s\n", bestChan, bestRSSI, g.chosenBssid.c_str());
  WiFi.begin(s_ssid.c_str(), s_pass.c_str(), bestChan, bestBSSID, true);
}

static void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info){
  switch(event){
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("WiFi CONNECTED (association)");
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      g.wifiConnected=true; g.wifiConsecutiveFails=0; g.gotIpAt=millis();
      Serial.printf("WiFi GOT_IP: %s  RSSI=%d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
      g.needWebStart=true; g.wantUartStart=true;
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED: {
      g.wifiConnected=false;
      int r=(int)info.wifi_sta_disconnected.reason; g.wifiLastReason=r; g.wifiConsecutiveFails++;
      Serial.printf("WiFi DISCONNECTED, reason=%d (%s)\n", r, wifi_mgr::reasonToText(r));
      adviceForReason(r);
      break;
    }
    default: break;
  }
}

void wifi_mgr::begin(const char* ssid, const char* pass, const char* hostname, bool lowerTxPower) {
  s_ssid = ssid; s_pass = pass; s_host = hostname; s_lowerTxPower = lowerTxPower;
  WiFi.onEvent(onWiFiEvent);
  applyRadioPolicy();
}

void wifi_mgr::watchdog(uint32_t intervalMs){
  unsigned long now = millis();
  if (now - s_lastWatchdog < intervalMs) return;
  s_lastWatchdog = now;

  if (WiFi.status()!=WL_CONNECTED){
    Serial.println("[WiFi] Watchdog → relance propre");
    WiFi.disconnect(true,true);
    delay(200);
    applyRadioPolicy();
    bool noLock = (g.wifiConsecutiveFails>=2) || (g.wifiLastReason==201);
    smartConnect(!noLock);
  }
}

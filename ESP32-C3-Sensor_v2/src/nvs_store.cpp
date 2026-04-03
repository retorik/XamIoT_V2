// nvs_store.cpp
#include <Preferences.h>     // Pour le type Preferences
#include "nvs_store.h"
#include "globals.h"
#include "config.h"
#include "utils.h"
#include "mqtt_mgr.h"

#include <WiFi.h>
#include <esp_system.h>

// ========================= Helpers internes =========================
static void saveWifiPrimary(const String& ssid, const String& pass) {
  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
}

static void saveWifiBackup(const String& ssid, const String& pass) {
  prefs.begin("wifi_bak", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
}

// Helper: ne JAMAIS appeler getString si la clé n'existe pas (sinon log E NOT_FOUND)
static String prefGetStringSafe(Preferences& p, const char* key) {
  if (!p.isKey(key)) return String("");
  return p.getString(key, "");
}

static bool loadWifiPrimary(String& ssid, String& pass) {
  prefs.begin("wifi", true);
  ssid = prefGetStringSafe(prefs, "ssid");
  pass = prefGetStringSafe(prefs, "pass");
  prefs.end();
  return !ssid.isEmpty() && pass.length() >= 8;
}

static bool loadWifiBackup(String& ssid, String& pass) {
  prefs.begin("wifi_bak", true);
  ssid = prefGetStringSafe(prefs, "ssid");
  pass = prefGetStringSafe(prefs, "pass");
  prefs.end();
  return !ssid.isEmpty() && pass.length() >= 8;
}

/* ========================= NVS Wi-Fi ========================= */
void loadCredentials(String& ssid, String& pass) {
  // 1) essaie primaire
  if (loadWifiPrimary(ssid, pass)) {
    Serial.printf("[NVS] SSID=\"%s\" (%d), PASS len=%d\n",
                  ssid.c_str(), ssid.length(), pass.length());
    return;
  }
  // 2) sinon, essaie backup
  String bs, bp;
  if (loadWifiBackup(bs, bp)) {
    Serial.println("[NVS] Primaire vide → restauration depuis backup.");
    saveWifiPrimary(bs, bp);  // restaure le primaire
    ssid = bs; pass = bp;
    Serial.printf("[NVS] SSID=\"%s\" (%d), PASS len=%d\n",
                  ssid.c_str(), ssid.length(), pass.length());
    return;
  }
  // 3) rien trouvé — pas de log pour éviter le spam du watchdog
  ssid = ""; pass = "";
}

void saveCredentials(const String& ssidIn, const String& passIn) {
  String ssid = ssidIn; ssid.trim();
  String pass = passIn; pass.trim();
  if (ssid.isEmpty() || pass.length() < 8) {
    Serial.println("[NVS] ERREUR: Identifiants invalides, sauvegarde annulée");
    return;
  }

  // Écrit primaire + backup
  saveWifiPrimary(ssid, pass);
  saveWifiBackup(ssid, pass);

  // Vérif lecture
  String chkS, chkP;
  loadWifiPrimary(chkS, chkP);
  if (chkS == ssid && chkP == pass) {
    Serial.printf("[NVS] ✓ Sauvé et vérifié: SSID=\"%s\" (%d), PASS len=%d\n",
                  ssid.c_str(), ssid.length(), pass.length());
  } else {
    Serial.println("[NVS] ⚠️ CORRUPTION détectée après écriture (primaire).");
  }
}

/* ========================= NVS MQTT ========================= */
void loadMqttSettings() {
  prefs.begin("mqtt", true);
  mqtt_host = prefGetStringSafe(prefs, "host");
  mqtt_port = prefs.isKey("port") ? prefs.getUShort("port", 0) : 0;
  mqtt_user = prefGetStringSafe(prefs, "user");
  mqtt_pass = prefGetStringSafe(prefs, "pass");
  prefs.end();
  if (mqtt_host.isEmpty()) {
    Serial.println("[NVS] MQTT non configuré — en attente de configuration BLE");
  } else {
    Serial.printf("[NVS] MQTT host=\"%s\" port=%u user=\"%s\" pass_len=%d\n",
                  mqtt_host.c_str(), mqtt_port, mqtt_user.c_str(), (int)mqtt_pass.length());
  }
}

void saveMqttSettings(const String& hostIn, uint16_t portIn,
                      const String& userIn, const String& passIn) {
  String host = hostIn; host.trim();
  String user = userIn; user.trim();
  String pass = passIn; pass.trim();

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

/* ========================= Reset global ========================= */
void resetStoredCredentials() {
  Serial.println("[RESET] Effacement des identifiants WiFi + MQTT (factory)…");
  // NVS wifi (primaire + backup)
  prefs.begin("wifi", false);     prefs.clear(); prefs.end();
  prefs.begin("wifi_bak", false); prefs.clear(); prefs.end();

  // Efface la config Wi-Fi interne (optionnel, mais propre)
  WiFi.persistent(true);
  WiFi.disconnect(true, true);
  delay(200);
  WiFi.persistent(false);

  // MQTT — effacé complètement, reconfiguration via BLE requise
  prefs.begin("mqtt", false);
  prefs.clear();
  prefs.end();

  mqtt_host = "";
  mqtt_port = 0;
  mqtt_user = "";
  mqtt_pass = "";

  Serial.println("[RESET] OK. Reconfigurer via BLE/Web.");
}

#include "globals.h"
#include "config.h"
#include "ble.h"
#include "nvs_store.h"
#include "utils.h"
#include "mqtt_mgr.h"
#include "ota_mgr.h"
#include <esp_task_wdt.h>
#include <sys/socket.h>   // ::socket() / ::close() — workaround fd=0 ESP32


// Extraction d'une valeur string dans un JSON plat : {"key":"value"}
static String extractJsonString(const String& json, const String& key) {
  String needle = "\"" + key + "\":\"";
  int start = json.indexOf(needle);
  if (start < 0) return String();
  start += needle.length();
  int end = json.indexOf("\"", start);
  if (end < 0) return String();
  return json.substring(start, end);
}

static bool isIPv4Literal(const String& h) {
  if (h.length()<7 || h.length()>15) return false;
  int dots=0; for (char c: h){ if (c=='.') dots++; else if (c<'0'||c>'9') return false; }
  return dots==3;
}

void mqttApplyServerFromSettings() {
  bool wantTls = (mqtt_port == 8883);

  if (g_mqtt.connected()) { g_mqtt.disconnect(); delay(50); }
  g_netSecure.stop(); delay(50);

  if (wantTls) {
    if (!isIPv4Literal(mqtt_host)) {
      g_netSecure.setCACert(ISRG_ROOT_X1_PEM);
      Serial.println("[MQTT/TLS] Certificat ISRG Root X1 configuré");
    } else {
      Serial.println("[MQTT/TLS] Host est une IP → TLS sans vérif SNI");
      g_netSecure.setInsecure();
    }
    // setTimeout est appliqué dans mqttReconnectIfNeeded(), après création du socket.
    // L'appeler ici (sans socket actif) provoque setSocketOption(fd=0) → EBADF cosmétique.
  } else {
    g_netSecure.stop();
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
  MQTT_TOPIC_AVAIL  = MQTT_BASE + "/availability";
  MQTT_TOPIC_CMD_REBOOT = MQTT_BASE + "/cmd/reboot";
  MQTT_TOPIC_CMD_RESET  = MQTT_BASE + "/cmd/reset_mqtt";
  HA_DISCOVERY_SENSOR = String("homeassistant/sensor/") + g_chipId + "/sound/config";
  MQTT_TOPIC_CMD_OTA = MQTT_BASE + "/cmd/ota";

  mqttApplyServerFromSettings();
  g_mqtt.setKeepAlive(30);
  g_mqtt.setSocketTimeout(5);
  g_mqtt.setBufferSize(1024);
}

void mqttPublishDiscovery() {
  if (!g_mqtt.connected()) return;
  String deviceJson = String("{") +
    "\"identifiers\":[\"esp32c3-" + String(g_chipId) + "\"]," +
    "\"manufacturer\":\"Retorik\",\"model\":\"ESP32-C3 Micro\",\"sw_version\":\"" + FW_VERSION + "\"}";
  String sn = "{";
  sn += "\"name\":\"ESP32C3 Sound %\",\"uniq_id\":\"" + String(g_chipId) + "_sound\",";
  sn += "\"stat_t\":\"" + MQTT_TOPIC_STATUS + "\",\"val_tpl\":\"{{ value_json.soundPct }}\",";
  sn += "\"unit_of_meas\":\"%\",\"state_class\":\"measurement\",";
  sn += "\"avty_t\":\"" + MQTT_TOPIC_AVAIL + "\",\"pl_avail\":\"online\",\"pl_not_avail\":\"offline\",";
  sn += "\"dev\":" + deviceJson + "}";
  g_mqtt.publish(HA_DISCOVERY_SENSOR.c_str(), sn.c_str(), true);
}

static uint8_t s_mqttFailCount = 0;

void mqttReconnectIfNeeded() {
  if (!wifiConnected || g_mqtt.connected() || g_mqttConnecting) return;
  if (mqtt_host.isEmpty() || mqtt_port == 0 || mqtt_user.isEmpty() || mqtt_pass.isEmpty()) return;
  unsigned long now = millis();
  if (now < g_mqttNextTryAt) return;

  // Ne pas tenter un handshake TLS si le plus grand bloc libre est insuffisant.
  // Un handshake mbedTLS nécessite ~32KB contigus ; en dessous on attend.
  if (g_useTls && ESP.getMaxAllocHeap() < 44000) {
    Serial.printf("[MQTT] Heap contiguë %u B insuffisante pour TLS, attente 3s\n",
                  ESP.getMaxAllocHeap());
    g_mqttNextTryAt = now + 3000UL;
    return;
  }

  // Workaround bug ESP32 Arduino : lwIP réattribue fd=0 au nouveau socket TLS,
  // ce qui provoque des EBADF dans setsockopt() pendant stop(), setTimeout() et connect().
  // On brûle fd=0 ICI, avant stop(), pour que toutes les opérations qui suivent
  // (flush/stop/setTimeout/connect) obtiennent un fd ≥ 1.
  int dummyFd = g_useTls ? ::socket(AF_INET, SOCK_STREAM, 0) : -1;

  // Nettoyage complet du socket lwIP avant de recréer une session TLS.
  if (g_netSecure.connected() || g_netSecure.available()) g_netSecure.flush();
  g_netSecure.stop();
  esp_task_wdt_reset();
  delay(200);
  esp_task_wdt_reset();

  if (g_useTls) {
    if (!isIPv4Literal(mqtt_host)) {
      g_netSecure.setCACert(ISRG_ROOT_X1_PEM);
    } else {
      g_netSecure.setInsecure();
    }
    g_netSecure.setTimeout(3);
  }

  String clientId = String("ESP32C3-") + g_chipId;
  Serial.printf("[MQTT] Connexion à %s:%u ... (user='%s', pass_len=%d)\n",
                mqtt_host.c_str(), mqtt_port, mqtt_user.c_str(), (int)mqtt_pass.length());

  // Serial.printf("[MQTT] Connexion à %s:%u ... (user='%s', pass_len=%d, pass='%s')\n",
  //             mqtt_host.c_str(), mqtt_port,
  //             mqtt_user.c_str(),
  //             (int)mqtt_pass.length(),
  //             mqtt_pass.c_str());

  g_mqttConnecting = true;
  // g_mqtt.connect() peut bloquer jusqu'à ~10s (TLS handshake + timeout réseau).
  // On reset le task WDT juste avant pour éviter un déclenchement sur le loopTask.
  esp_task_wdt_reset();
  bool ok = false;
  if (mqtt_user.length()>0 && mqtt_pass.length()>0) {
    ok = g_mqtt.connect(clientId.c_str(),
                        mqtt_user.c_str(), mqtt_pass.c_str(),
                        MQTT_TOPIC_AVAIL.c_str(), 0, true, "offline");
  } else {
    Serial.println("[MQTT] Identifiants incomplets -> tentative SANS auth");
    ok = g_mqtt.connect(clientId.c_str(), MQTT_TOPIC_AVAIL.c_str(), 0, true, "offline");
  }
  g_mqttConnecting = false;
  if (dummyFd >= 0) { ::close(dummyFd); dummyFd = -1; }

  if (ok) {
    Serial.println("[MQTT] ✅ Connecté avec succès");
    Serial.printf("[MQTT]   → Broker: %s:%u\n", mqtt_host.c_str(), mqtt_port);
    Serial.printf("[MQTT]   → User: %s | TLS: %s\n", mqtt_user.c_str(), g_useTls ? "oui" : "non");
    s_mqttFailCount = 0;
    setBleStatus("MQTT connecté: " + mqtt_host + ":" + String(mqtt_port), true);
    g_mqtt.publish(MQTT_TOPIC_AVAIL.c_str(), "online", true);
    g_mqtt.subscribe(MQTT_TOPIC_CMD_REBOOT.c_str());
    g_mqtt.subscribe(MQTT_TOPIC_CMD_OTA.c_str());
    g_mqtt.subscribe(MQTT_TOPIC_CMD_RESET.c_str());

    mqttPublishDiscovery();
    mqttPublishStatus(true);
    g_mqttBackoffMs = 500; g_mqttNextTryAt = 0;
    if (g_nextPeriodicAt == 0) g_nextPeriodicAt = millis() + SND_PERIODIC_PUB_MS;
    g_rateWindowStartMs = millis(); g_sentThisMinute = 0;
  } else {
    int rc = g_mqtt.state();
    s_mqttFailCount++;
    Serial.printf("[MQTT] ❌ Connexion échouée, rc=%d (échec #%u/5)\n", rc, s_mqttFailCount);
    Serial.printf("[MQTT]   → rc=-4=TIMEOUT, rc=-2=CONNECT_FAIL, rc=4=BAD_CRED, rc=5=UNAUTHORIZED\n");
    Serial.printf("[MQTT]   → Broker: %s:%u | TLS: %s\n", mqtt_host.c_str(), mqtt_port, g_useTls ? "oui" : "non");
    setBleStatus("MQTT échec rc=" + String(rc), true);

    // rc=5 (UNAUTHORIZED) ou rc=4 (BAD_CREDENTIALS) : le serveur refuse explicitement
    // les credentials. Redémarrer ne changera rien. On compte les refus consécutifs
    // et on efface les credentials + démarre le BLE après 3 refus (évite faux positif
    // sur transitoire réseau ou redémarrage serveur).
    static uint8_t s_unauthorizedCount = 0;
    if (rc == 5 || rc == 4) {
      s_unauthorizedCount++;
      Serial.printf("[MQTT] 🔑 Credentials refusés (rc=%d) — refus #%u/3\n", rc, s_unauthorizedCount);
      if (s_unauthorizedCount >= 3) {
        Serial.println("[MQTT] 🔑 3 refus consécutifs → effacement MQTT + mode BLE");
        Serial.println("[MQTT]   → Le serveur refuse les credentials, re-enrollment nécessaire");
        mqtt_host = ""; mqtt_port = 0; mqtt_user = ""; mqtt_pass = "";
        Preferences prefs; prefs.begin("mqtt", false); prefs.clear(); prefs.end();
        s_unauthorizedCount = 0;
        delay(200);
        startBLE();
        g_bleActivatedAt = millis();  // reset timer pour le timeout 5min
        return;
      }
    } else {
      s_unauthorizedCount = 0; // reset si erreur différente (timeout réseau, etc.)
    }

    // Après 5 échecs consécutifs (timeout réseau), le stack TLS est probablement corrompu.
    // Un restart propre est le moyen le plus fiable de récupérer.
    if (s_mqttFailCount >= 5) {
      Serial.printf("[MQTT] ⚠️ %u échecs consécutifs → restart ESP32 (récupération TLS)\n", s_mqttFailCount);
      Serial.println("[MQTT]   → Astuce: maintenez BOOT 2s au redémarrage pour effacer MQTT");
      delay(200);
      ESP.restart();
    }

    g_mqttNextTryAt = now + g_mqttBackoffMs;
    Serial.printf("[MQTT]   → Prochaine tentative dans %lu ms (backoff)\n", g_mqttBackoffMs);
    g_mqttBackoffMs = min(g_mqttBackoffMs * 2, 20000UL);
  }
}

void mqttOnMessage(char* topic, byte* payload, unsigned int len) {
  String t = topic;

  String msg; msg.reserve(len);
  for (unsigned int i = 0; i < len; ++i) {
    msg += (char)payload[i];
  }
  String msgTrimmed = msg;
  msgTrimmed.trim();

  Serial.printf("[MQTT/MSG] Topic: %s | Len: %u | Payload: %s\n",
                topic, len, msgTrimmed.c_str());

  // Pour les commandes texte simples, on utilise une version lower-case
  String msgLower = msgTrimmed;
  msgLower.toLowerCase();

  // --- Commande reset_mqtt (envoyée par l'API avant suppression du device) ---
  if (t == MQTT_TOPIC_CMD_RESET) {
    Serial.println("╔══════════════════════════════════════════════════╗");
    Serial.println("║  [MQTT/RESET] Commande reset_mqtt reçue !       ║");
    Serial.println("╚══════════════════════════════════════════════════╝");
    Serial.println("[MQTT/RESET] → Envoi ACK au broker...");
    g_mqtt.publish((MQTT_BASE + "/cmd/reset_mqtt/ack").c_str(), "ok", false);
    delay(100);
    Serial.println("[MQTT/RESET] → Déconnexion MQTT...");
    g_mqtt.disconnect();
    Serial.println("[MQTT/RESET] → Effacement credentials MQTT en NVS...");
    mqtt_host = ""; mqtt_port = 0; mqtt_user = ""; mqtt_pass = "";
    Preferences prefs; prefs.begin("mqtt", false); prefs.clear(); prefs.end();
    Serial.println("[MQTT/RESET] → Credentials effacés. Démarrage BLE pour re-enrollment...");
    delay(200);
    startBLE();
    g_bleActivatedAt = millis();  // ← crucial : reset le timer pour éviter un arrêt immédiat par timeout
    Serial.println("[MQTT/RESET] ✅ BLE actif — en attente de nouvelles credentials (5 min)");
    return;
  }

  // --- Commande reboot ---
  if (t == MQTT_TOPIC_CMD_REBOOT) {
    if (msgLower == "now") {
      g_mqtt.publish(MQTT_TOPIC_AVAIL.c_str(), "offline", true);
      delay(200);
      ESP.restart();
    }
    return;
  }

  // --- Commande OTA : payload JSON {"cmd":"update","url":"...","version":"...","hmac":"..."} ---
  if (t == MQTT_TOPIC_CMD_OTA) {
    if (msgTrimmed.length() == 0) {
      Serial.println("[MQTT/OTA] Payload vide");
      return;
    }
    String url     = extractJsonString(msgTrimmed, "url");
    String hmac    = extractJsonString(msgTrimmed, "hmac");
    String version = extractJsonString(msgTrimmed, "version");

    if (url.isEmpty()) {
      Serial.println("[MQTT/OTA] Champ 'url' manquant, OTA ignoré");
      return;
    }
    if (hmac.isEmpty()) {
      Serial.println("[MQTT/OTA] Champ 'hmac' manquant, OTA refusé (sécurité)");
      return;
    }

    // Vérification de version : ignorer si déjà sur la version cible
    if (!version.isEmpty() && version == String(FW_VERSION)) {
      Serial.printf("[MQTT/OTA] Déjà sur la version %s — OTA ignoré, retain effacé\n", FW_VERSION);
      // Effacer le retain et notifier le serveur
      g_mqtt.publish(MQTT_TOPIC_CMD_OTA.c_str(), "", true);
      String otaTopic = String("devices/") + g_chipId + "/ota/status";
      g_mqtt.publish(otaTopic.c_str(),
        ("{\"status\":\"success\",\"version\":\"" + String(FW_VERSION) + "\"}").c_str());
      return;
    }

    Serial.printf("[MQTT/OTA] URL=%s\n", url.c_str());
    otaSetPending(url, hmac);
    return;
  }
}

void mqttPublishStatus(bool /*force*/) {
  if (!g_mqtt.connected()) return;

  unsigned long now = millis();
  if (now - g_rateWindowStartMs >= 60000UL) { g_rateWindowStartMs = now; g_sentThisMinute = 0; }
  if (g_sentThisMinute >= PUB_MAX_PER_MIN) { Serial.println("[MQTT] Rate-limit: publication ignorée"); return; }

  char ipStr[16] = "";
  if (wifiConnected) WiFi.localIP().toString().toCharArray(ipStr, sizeof(ipStr));

  char json[384];
  snprintf(json, sizeof(json),
    "{\"ip\":\"%s\","
    "\"soundPct\":%d,"
    "\"soundAvg\":%d,"
    "\"soundMin\":%d,"
    "\"soundMax\":%d,"
    "\"windowSec\":%d,"
    "\"dbfsAvg\":%d,"
    "\"dbfsEwma\":%d,"
    "\"soundLevel\":%u,"
    "\"uptime\":%lu,"
    "\"version\":\"%s\","
    "\"device_type\":\"%s\"}",
    ipStr,
    (int)round(g_ewmaPct),
    (int)round(g_soundPctAvg),
    (int)round(g_soundPctMin),
    (int)round(g_soundPctMax),
    SND_AVG_SECONDS,
    (int)round(g_dbfsAvg),
    (int)round(g_ewmaDbfs),
    (uint16_t)round(g_ewmaPct * 40.95),
    millis() / 1000,
    FW_VERSION,
    DEVICE_TYPE_NAME
  );
  g_mqtt.publish(MQTT_TOPIC_STATUS.c_str(), json, true);
  g_sentThisMinute++;
}

void mqttLoop() {
  if (!wifiConnected) return;
  if (g_mqtt.connected()) {
    // Reconnexion préventive : si le heap est trop fragmenté pour supporter
    // un futur handshake TLS, on déconnecte proprement maintenant.
    // Le heap récupère ~40KB à la déconnexion, permettant une reconnexion saine.
    if (g_useTls && ESP.getMaxAllocHeap() < 38000) {
      Serial.printf("[MQTT] Heap contiguë %u B — reconnexion préventive TLS\n",
                    ESP.getMaxAllocHeap());
      g_mqtt.publish(MQTT_TOPIC_AVAIL.c_str(), "offline", false);
      g_mqtt.disconnect();
    } else {
      g_mqtt.loop();
    }
  } else {
    mqttReconnectIfNeeded();
  }
}
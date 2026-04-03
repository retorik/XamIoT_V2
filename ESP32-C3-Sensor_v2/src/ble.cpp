#include "ble.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include "globals.h"
#include "config.h"
#include "wifi_mgr.h"
#include "nvs_store.h"
#include "mqtt_mgr.h"
#include "utils.h"

// ================= Scheduler de statut BLE =================
// (évite d'émettre des notifs BLE depuis des callbacks réseau)
static volatile bool s_bleStatusDirty = false;
static char          s_bleStatusBuf[96];

void scheduleBleStatus(const String& s) {
  size_t n = s.length();
  if (n >= sizeof(s_bleStatusBuf)) n = sizeof(s_bleStatusBuf) - 1;
  memcpy(s_bleStatusBuf, s.c_str(), n);
  s_bleStatusBuf[n] = '\0';
  s_bleStatusDirty = true;
}

void bleStatusService() {
  if (!s_bleStatusDirty) return;
  s_bleStatusDirty = false;
  if (pStatusChar) {
    pStatusChar->setValue(s_bleStatusBuf);
    pStatusChar->notify();
  }
}

// Statut immédiat (OK quand on est déjà dans le contexte BLE)
void setBleStatus(const String& s, bool notify) {
  if (!pStatusChar) return;
  pStatusChar->setValue(s.c_str());
  if (notify) pStatusChar->notify();
}

// ================= État BLE interne =================
static bool s_bleInitialized = false;
static bool s_bleActive      = false;

// ================= Prototypes locaux =================
class CredWriteCallbacks;
class MqttWriteCallbacks;
class MqttConfigWriteCallbacks;
class MyServerCallbacks;

void blePushFullStatus();

// ================= Callbacks BLE =====================
class CredWriteCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    if (!c) return;
    String v = String(c->getValue().c_str()); v.trim();

    if (c == pSsidChar) {
      ble_wifi_ssid_inbox = v; ble_wifi_ssid_ready = true;
      Serial.printf("[BLE/WIFI] SSID reçu (len=%d)\n", v.length());
      c->setValue(""); setBleStatus("SSID reçu", true);
    } else if (c == pPassChar) {
      ble_wifi_pass_inbox = v; ble_wifi_pass_ready = true;
      Serial.printf("[BLE/WIFI] PASS reçu (len=%d)\n", v.length());
      c->setValue(""); setBleStatus("PASS reçu", true);
    }

    if (ble_wifi_ssid_ready && ble_wifi_pass_ready) ble_wifi_dirty = true;
  }
};

class MqttWriteCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    if (!c) return;
    String v = String(c->getValue().c_str()); v.trim();
    c->setValue("");
    if (c == pMqttHostChar) { st_mqtt_host = v; st_set_host = true; }
    else if (c == pMqttPortChar) { uint32_t p = v.toInt(); if (p>0 && p<65536){ st_mqtt_port=(uint16_t)p; st_set_port=true; } }
    else if (c == pMqttUserChar) { st_mqtt_user = v; st_set_user = true; }
    else if (c == pMqttPassChar) { st_mqtt_pass = v; st_set_pass = true; }
    g_mqttCoalesceUntil = millis() + 300;
    setBleStatus("MQTT reçu (staging)", true);
  }
};

class MqttConfigWriteCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String v = String(c->getValue().c_str()); v.trim();
    c->setValue("");
    int p1=v.indexOf('|'); int p2=v.indexOf('|',p1+1); int p3=v.indexOf('|',p2+1);
    if (p1>0 && p2>p1 && p3>p2) {
      st_mqtt_host = v.substring(0,p1); st_set_host = true;
      uint32_t p = v.substring(p1+1,p2).toInt(); if (p>0 && p<65536){ st_mqtt_port=(uint16_t)p; st_set_port=true; }
      st_mqtt_user = v.substring(p2+1,p3); st_set_user = true;
      st_mqtt_pass = v.substring(p3+1);    st_set_pass = true;
      g_mqttCoalesceUntil = millis() + 100;
      setBleStatus("MQTT reçu (CFG staging)", true);
    } else {
      setBleStatus("Format MQTT invalide (host|port|user|pass)", true);
    }
  }
};

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { Serial.println("BLE connecté"); blePushFullStatus(); }
  void onDisconnect(BLEServer* s) override {
    Serial.println("BLE déconnecté");
    // Ne relance l'advertising que si on est encore dans la fenêtre active
    if (s_bleActive) {
      s->startAdvertising();
    }
  }
};

// ================= Exposés BLE =======================
void blePushFullStatus() {
  if (!pStatusChar) return;

  String s = "WiFi:";
  s += (wifiConnected ? (" " + WiFi.localIP().toString()) : " Déconnecté");
  pStatusChar->setValue(s.c_str());
  pStatusChar->notify();

  String t = "MQTT:";
  if (g_mqttReady && g_mqtt.connected()) t += " on " + mqtt_host + ":" + String(mqtt_port);
  else t += " déconnecté*";
  if (pMqttStatusChar) { pMqttStatusChar->setValue(t.c_str()); pMqttStatusChar->notify(); }
}

void startBLE() {
  String bleName = String(BLE_NAME_PREFIX) + g_chipId;
  BLEDevice::init(bleName.c_str());
  BLEDevice::setMTU(185);

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Service Wi-Fi
  pService = pServer->createService(SERVICE_WIFI_UUID);
  pSsidChar   = pService->createCharacteristic(WIFI_SSID_UUID,  BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  pPassChar   = pService->createCharacteristic(WIFI_PASS_UUID,  BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  pStatusChar = pService->createCharacteristic(WIFI_STATUS_UUID,BLECharacteristic::PROPERTY_READ  | BLECharacteristic::PROPERTY_NOTIFY);
  pSsidChar->setCallbacks(new CredWriteCallbacks());
  pPassChar->setCallbacks(new CredWriteCallbacks());
  pStatusChar->setValue("Déconnecté !"); pStatusChar->addDescriptor(new BLE2902());

  // Service MQTT
  pServiceMqtt   = pServer->createService(SERVICE_MQTT_UUID);
  pMqttHostChar  = pServiceMqtt->createCharacteristic(MQTT_HOST_UUID,  BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE);
  pMqttPortChar  = pServiceMqtt->createCharacteristic(MQTT_PORT_UUID,  BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE);
  pMqttUserChar  = pServiceMqtt->createCharacteristic(MQTT_USER_UUID,  BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE);
  pMqttPassChar  = pServiceMqtt->createCharacteristic(MQTT_PASS_UUID,  BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  pMqttBaseChar  = pServiceMqtt->createCharacteristic(MQTT_BASE_UUID,  BLECharacteristic::PROPERTY_READ);
  pDeviceIdChar  = pServiceMqtt->createCharacteristic(DEVICE_ID_UUID,  BLECharacteristic::PROPERTY_READ);
  pMqttStatusChar= pServiceMqtt->createCharacteristic(MQTT_STATUS_UUID,BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);

  pMqttHostChar->setCallbacks(new MqttWriteCallbacks());
  pMqttPortChar->setCallbacks(new MqttWriteCallbacks());
  pMqttUserChar->setCallbacks(new MqttWriteCallbacks());
  pMqttPassChar->setCallbacks(new MqttWriteCallbacks());
  pMqttConfigChar = nullptr; // optionnel

  pMqttBaseChar->setValue(MQTT_BASE.c_str());
  pDeviceIdChar->setValue(g_chipId);
  pMqttStatusChar->setValue("Déconnecté !"); pMqttStatusChar->addDescriptor(new BLE2902());

  if (pMqttHostChar) pMqttHostChar->setValue(mqtt_host.c_str());
  if (pMqttPortChar) { char buf[8]; snprintf(buf, sizeof(buf), "%u", mqtt_port); pMqttPortChar->setValue(buf); }
  if (pMqttUserChar) pMqttUserChar->setValue(mqtt_user.c_str());

  pService->start();
  pServiceMqtt->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_WIFI_UUID);
  adv->addServiceUUID(SERVICE_MQTT_UUID);
  adv->setScanResponse(true);
  adv->start();

  s_bleInitialized = true;
  s_bleActive      = true;
  Serial.printf("[BLE] Démarré: \"%s\"\n", bleName.c_str());
}

// ================= Gestion cycle de vie =================

bool isBleActive() {
  return s_bleActive;
}

bool isBleInitialized() {
  return s_bleInitialized;
}

void stopBLE() {
  if (!s_bleInitialized || !s_bleActive) return;
  BLEDevice::getAdvertising()->stop();
  s_bleActive = false;
  // NE PAS appeler wifiDisableCoexSleep() ici :
  // le stack BT reste actif après init, WIFI_PS_MIN_MODEM est permanent
  Serial.println("[BLE] Publicité arrêtée");
}

void activateBLE() {
  wifiEnableCoexSleep();  // modem-sleep requis pour la coexistence BLE+WiFi
  if (!s_bleInitialized) {
    // Première activation : init complète
    startBLE();
    return;
  }
  // Réactivation : mise à jour des valeurs courantes + relance advertising
  if (pMqttHostChar) pMqttHostChar->setValue(mqtt_host.c_str());
  if (pMqttUserChar) pMqttUserChar->setValue(mqtt_user.c_str());
  if (pMqttBaseChar) pMqttBaseChar->setValue(MQTT_BASE.c_str());
  if (pDeviceIdChar) pDeviceIdChar->setValue(g_chipId);
  s_bleActive = true;
  BLEDevice::startAdvertising();
  Serial.println("[BLE] Publicité relancée");
}

// ================= Inboxes BLE ========================
void processBleWifiInbox() {
  if (!ble_wifi_dirty) return;
  if (ble_wifi_processing) { Serial.println("[BLE/WIFI] Traitement déjà en cours, skip"); return; }
  ble_wifi_processing = true;

  if (!ble_wifi_ssid_ready || !ble_wifi_pass_ready) {
    Serial.println("[BLE/WIFI] Identifiants incomplets, attente...");
    ble_wifi_processing = false; return;
  }

  static char ssid_buf[64]; static char pass_buf[128];
  memset(ssid_buf,0,sizeof(ssid_buf)); memset(pass_buf,0,sizeof(pass_buf));
  strncpy(ssid_buf, ble_wifi_ssid_inbox.c_str(), sizeof(ssid_buf)-1);
  strncpy(pass_buf, ble_wifi_pass_inbox.c_str(), sizeof(pass_buf)-1);
  String new_ssid(ssid_buf); String new_pass(pass_buf);

  ble_wifi_ssid_inbox = ""; ble_wifi_pass_inbox = "";
  ble_wifi_dirty=false; ble_wifi_ssid_ready=false; ble_wifi_pass_ready=false;

  Serial.printf("[BLE/WIFI] Copie sécurisée: SSID=\"%s\" (%d), PASS len=%d\n",
               new_ssid.c_str(), new_ssid.length(), new_pass.length());

  if (new_ssid.isEmpty() || new_pass.length()<8) {
    Serial.println("[BLE/WIFI] ERREUR: Identifiants invalides");
    setBleStatus("Erreur: identifiants invalides", true);
    ble_wifi_processing=false; return;
  }

  saveCredentials(new_ssid, new_pass);
  g_ssid=new_ssid; g_pass=new_pass; have_pending=false;

  // Utilise le switch non-bloquant (évite WiFi deinit/reinit avec BLE actif)
  // SW_PREPARE gère la déconnexion MQTT/TLS, SW_BEGIN appelle prepareCoex()
  g_wifiBusyConnect = false; g_mqttConnecting = false;
  scheduleBleStatus("Connexion...");
  Serial.printf("[BLE/WIFI] Connexion → \"%s\"\n", g_ssid.c_str());
  requestWifiSwitch(g_ssid, g_pass);

  ble_wifi_processing=false;
}

void processBleMqttInbox() {
  if (g_mqttCoalesceUntil == 0) return;
  if ((long)(millis() - g_mqttCoalesceUntil) < 0) return;

  String newHost = st_set_host ? st_mqtt_host : mqtt_host;
  uint16_t newPort = st_set_port ? st_mqtt_port : mqtt_port;
  String newUser = st_set_user ? st_mqtt_user : mqtt_user;
  String newPass = st_set_pass ? st_mqtt_pass : mqtt_pass;

  saveMqttSettings(newHost, newPort, newUser, newPass);
  mqttApplyServerFromSettings();
  g_mqttNextTryAt = 0; g_mqttBackoffMs = 500;
  g_mqttCoalesceUntil = 0;
  st_set_host = st_set_port = st_set_user = st_set_pass = false;

  // Désactiver le stack BLE complet avant la reconnexion MQTT.
  // Sans ça : le handshake TLS se fait avec le stack BLE encore chargé (~50 KB),
  // ce qui fragmente le heap (largest → ~9 KB) et bloque toute reconnexion
  // ultérieure (seuil 44 KB jamais atteint → boucle infinie).
  // BLEDevice::deinit() libère ~50 KB ; le heap revient à ~70 KB contigus.
  if (s_bleInitialized) {
    if (s_bleActive) {
      BLEDevice::getAdvertising()->stop();
      s_bleActive = false;
    }
    // Null les pointeurs globaux AVANT deinit pour éviter tout use-after-free
    pStatusChar = pSsidChar = pPassChar = nullptr;
    pMqttHostChar = pMqttPortChar = pMqttUserChar = pMqttPassChar = nullptr;
    pMqttConfigChar = pMqttBaseChar = pDeviceIdChar = pMqttStatusChar = nullptr;
    pService = pServiceMqtt = nullptr;
    pServer = nullptr;
    BLEDevice::deinit(true);
    s_bleInitialized = false;
    delay(500);  // consolidation heap avant TLS
    Serial.printf("[BLE→MQTT] Stack BLE libéré — heap: free=%u, largest=%u\n",
                  ESP.getFreeHeap(), ESP.getMaxAllocHeap());
  }
}

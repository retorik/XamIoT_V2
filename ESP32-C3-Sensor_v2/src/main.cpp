#include <Arduino.h>
#include "globals.h"
#include "config.h"
#include "utils.h"
#include "nvs_store.h"
#include "wifi_mgr.h"
#include "web_ui.h"
#include "ble.h"
#include "mqtt_mgr.h"
#include "audio.h"
#include "reset_button.h"
#include "ota_mgr.h"

// --- Safety / diagnostics ---
#include <esp_task_wdt.h>      // watchdog de tâche
#include <esp_system.h>        // esp_reset_reason()
#include "esp_heap_caps.h"     // heap_caps_get_free_size()

// ====== SAFETY TUNABLES ======
#ifndef WDT_TIMEOUT_SEC
// 30s : couvre la tentative de connexion WiFi (max 15s) + marges réseau
#define WDT_TIMEOUT_SEC 30
#endif

#ifndef MIN_HEAP_SOFT_RESTART
#define MIN_HEAP_SOFT_RESTART (18*1024)   // log sous 18 KB (redémarrage optionnel)
#endif

#ifndef SAFETY_AUTO_REBOOT_ON_LOW_HEAP
#define SAFETY_AUTO_REBOOT_ON_LOW_HEAP 0  // 1 => reboot auto si heap trop basse
#endif

static unsigned long g_lastHeapLog = 0;

// --- BOOT long-press detection state ---
static bool     g_resetArmed       = false;
static bool     g_resetDone        = false;
static uint32_t g_btnDownAt        = 0;
static uint32_t g_btnLastSampleAt  = 0;

void setup() {
  Serial.begin(115200);
  delay(500);  // ← laisse le temps au moniteur de se reconnecter après le reboot

  Serial.println();
  Serial.println("=== Boot SoundSense ===");
  Serial.printf("[INFO] SketchSize=%u bytes\n", (unsigned)ESP.getSketchSize());
  Serial.printf("[INFO] FreeSketchSpace=%u bytes\n", (unsigned)ESP.getFreeSketchSpace());
  if (ESP.getFreeSketchSpace() <= ESP.getSketchSize()) {
    Serial.println("[WARN] OTA impossible: pas assez de place libre pour le nouveau firmware !");
  }

  resetButtonInit();

  pinMode(BOOT_BTN_PIN, INPUT_PULLUP);
  Serial.printf("[RESET] Maintenez le bouton BOOT %lu ms pour réinitialiser WiFi+MQTT\n",
                (unsigned long)RESET_BTN_HOLD_MS);


  pinMode(LED_PIN, OUTPUT);
  #if LED_ACTIVE_LOW
    digitalWrite(LED_PIN, HIGH);
  #else
    digitalWrite(LED_PIN, LOW);
  #endif
  // Pré-calcule l'ID pour BLE / topics
  String idEarly = macToId(ESP.getEfuseMac());
  idEarly.toCharArray(g_chipId, sizeof(g_chipId));
  MQTT_BASE = String("devices/") + g_chipId;

  // Hostname commun WiFi / OTA / BLE : "SOUND-SENSOR-<chipId>"
  String host = String(BLE_NAME_PREFIX) + String(g_chipId);
  host.toCharArray(g_hostname, sizeof(g_hostname));
  Serial.printf("[BOOT] Hostname: %s\n", g_hostname);

  // ===== Boot diagnostics : motif de reset
  esp_reset_reason_t rr = esp_reset_reason();
  Serial.printf("[BOOT] Reset reason = %d\n", (int)rr);
  // 1=POWERON, 2=EXT, 3=SW, 4=PANIC, 5=INT_WDT, 6=TASK_WDT, 7=RTC_WDT, 8=DEEPSLEEP, 9=BROWNOUT...

  // Watchdog de tâche : reboot automatique si loop() se fige > WDT_TIMEOUT_SEC
  if (esp_task_wdt_init(WDT_TIMEOUT_SEC, true) == ESP_OK) {
    Serial.printf("[WDT] init %ds OK\n", WDT_TIMEOUT_SEC);
  } else {
    Serial.println("[WDT] init déjà fait (non bloquant)");
  }
  esp_task_wdt_add(NULL);

  WiFi.onEvent(onWiFiEvent);
  loadMqttSettings();

  // ── Détection bouton BOOT au démarrage : reset MQTT uniquement ──
  // Si le bouton BOOT (GPIO 9) est maintenu ~2s au démarrage,
  // on efface UNIQUEMENT les credentials MQTT (WiFi conservé)
  // et on active le BLE pour permettre un re-enrollment.
  // Distinct du factory reset (5s maintenu APRÈS boot = WiFi + MQTT effacés).
  {
    bool bootBtnMqttReset = false;
    if (digitalRead(BOOT_BTN_PIN) == LOW) {
      Serial.println("╔══════════════════════════════════════════════════╗");
      Serial.println("║  [BOOT] Bouton BOOT détecté au démarrage !      ║");
      Serial.println("║  Maintenez 2s pour effacer MQTT uniquement...   ║");
      Serial.println("╚══════════════════════════════════════════════════╝");

      unsigned long start = millis();
      // Attend 2s en vérifiant que le bouton reste enfoncé
      while (digitalRead(BOOT_BTN_PIN) == LOW && (millis() - start) < 2000) {
        delay(50);
      }

      if (digitalRead(BOOT_BTN_PIN) == LOW) {
        // Bouton toujours enfoncé après 2s → reset MQTT confirmé
        Serial.println("[BOOT] ✅ Maintien 2s confirmé → EFFACEMENT MQTT");
        Serial.println("[BOOT]   → Effacement NVS namespace 'mqtt'...");
        Preferences p;
        p.begin("mqtt", false);
        p.clear();
        p.end();
        mqtt_host = ""; mqtt_port = 0; mqtt_user = ""; mqtt_pass = "";
        Serial.println("[BOOT]   → Credentials MQTT effacés (WiFi conservé)");
        Serial.println("[BOOT]   → Activation BLE pour re-enrollment...");
        bootBtnMqttReset = true;

        // Attend le relâchement pour ne pas déclencher le factory reset (5s)
        Serial.println("[BOOT]   → Relâchez le bouton maintenant...");
        while (digitalRead(BOOT_BTN_PIN) == LOW) { delay(50); }
        Serial.println("[BOOT]   → Bouton relâché ✅");
      } else {
        Serial.println("[BOOT] Bouton relâché avant 2s → démarrage normal");
      }
    }

    otaSetup();
    startI2S();
    initGoertzel();

    if (bootBtnMqttReset) {
      // Mode re-enrollment : BLE actif, pas de MQTT
      Serial.println("[BOOT] 🔵 Mode re-enrollment BLE (MQTT effacé, WiFi conservé)");
      activateBLE();
      g_bleActivatedAt = millis();
    } else {
      // Démarrage normal
      startMQTT();
    }
  }

  tryConnectFromStored();

  g_curBucketStart = millis();
  g_nextPeriodicAt = millis() + SND_PERIODIC_PUB_MS;
  g_rateWindowStartMs = millis();
  g_sentThisMinute = 0;
  g_lastPublishMs = millis();
  g_lastPublishedPct = 0;
}

void loop() {
  esp_task_wdt_reset();
  
  // Toujours donner une chance à OTA de traiter le réseau
  otaLoop();

  // Si une OTA est en cours, on bascule en mode "minimal"
  if (otaIsRunning()) {
    if (wifiConnected) {
      server.handleClient();   // la page web peut rester accessible pendant OTA
    }

    delay(5);
    return;  // ⬅️ on ne fait rien d'autre pendant la mise à jour
  }

  // 3) Mode normal (aucune OTA en cours)
  bleStatusService();
  resetButtonService();

  // ── BLE : activation sur appui court ──
  if (g_bleShortPressRequest) {
    g_bleShortPressRequest = false;
    activateBLE();
    g_bleActivatedAt = millis();
    Serial.println("[BLE] Activé par appui court — fenêtre 5 min");
  }

  // ── BLE : arrêt automatique (WiFi+MQTT OK ou timeout 5 min) ──
  if (isBleActive()) {
    bool mqttOk   = g_mqtt.connected() && wifiConnected;
    bool timedOut = (millis() - g_bleActivatedAt) >= BLE_ACTIVE_TIMEOUT_MS;
    if (mqttOk || timedOut) {
      stopBLE();
      Serial.println(timedOut ? "[BLE] Arrêt: timeout 5 min" : "[BLE] Arrêt: WiFi+MQTT connectés");
    }
  }

  // ── LED : clignotement lent (~1 Hz) quand BLE actif ──
  {
    static unsigned long s_bleLedAt = 0;
    static bool          s_bleLedOn = false;
    unsigned long nowLed = millis();
    if (isBleActive()) {
      if (nowLed - s_bleLedAt >= 500) {
        s_bleLedAt = nowLed;
        s_bleLedOn = !s_bleLedOn;
        digitalWrite(LED_PIN, s_bleLedOn ? (LED_ACTIVE_LOW ? LOW : HIGH)
                                         : (LED_ACTIVE_LOW ? HIGH : LOW));
      }
    } else if (s_bleLedOn) {
      s_bleLedOn = false;
      digitalWrite(LED_PIN, LED_ACTIVE_LOW ? HIGH : LOW);  // LED éteinte
    }
  }

  // Événements WiFi / MQTT
  if (g_needWebServerStart) { g_needWebServerStart=false; startWebServer(); }
  if (g_needMqttReconnect)  { g_needMqttReconnect=false; mqttApplyServerFromSettings(); mqttReconnectIfNeeded(); mqttPublishStatus(true); }

  if (wifiConnected) {
    server.handleClient();
  }

  // Inboxes BLE
  processBleWifiInbox();
  processBleMqttInbox();

  // WiFi (mais bloqué si OTA en cours, cf. wifi_mgr.cpp)
  wifiSwitchService();
    // Audio / I2S
  audioService();
  wifiWatchdogService();

  // Politique de publication MQTT
  if (g_mqtt.connected()) {
    unsigned long now = millis();
    bool shouldPublish=false, isPeriodicPub=false;

    if ((long)(now - g_nextPeriodicAt) >= 0) {
      shouldPublish=true; isPeriodicPub=true; g_nextPeriodicAt = now + SND_PERIODIC_PUB_MS;
    }

    uint8_t ewma_q = quantizePct((uint8_t)round(g_ewmaPct));
    if (!shouldPublish && (now - g_lastPublishMs) >= SND_MIN_PUB_INTERVAL_MS) {
      uint8_t last = g_lastPublishedPct;
      uint8_t diff = (ewma_q > last) ? (ewma_q - last) : (last - ewma_q);
      if (diff >= SND_CHANGE_THRESHOLD_PCT) {
        shouldPublish=true;
        Serial.printf("[MQTT] Variation: %d -> %d (delta=%d)\n", last, ewma_q, diff);
      }
    }

    if (!shouldPublish && g_soundPct >= BURST_THRESHOLD_PCT && (now - g_lastPublishMs) >= SND_MIN_PUB_INTERVAL_MS) {
      shouldPublish = true; Serial.printf("[MQTT] Burst: %d%%\n", g_soundPct);
    }

    if (shouldPublish) {
      if (isPeriodicPub) Serial.println("[MQTT] Publication périodique (10s)");
      mqttPublishStatus(true);
      g_lastPublishMs = now;
      g_lastPublishedPct = ewma_q;
    }
  }

  mqttLoop();

  // Diag mémoire
  const unsigned long nowMs = millis();
  if (nowMs - g_lastHeapLog >= 2000UL) {
    g_lastHeapLog = nowMs;
    size_t heap_free = heap_caps_get_free_size(MALLOC_CAP_8BIT);
    size_t heap_largest = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
    Serial.printf("[HEAP] free=%u, largest=%u\n", (unsigned)heap_free, (unsigned)heap_largest);
#if SAFETY_AUTO_REBOOT_ON_LOW_HEAP
    if (heap_free < MIN_HEAP_SOFT_RESTART) {
      Serial.println("[HEAP] trop basse -> reboot soft");
      delay(100);
      ESP.restart();
    }
#endif
  }

  // Laisse respirer l’ordonnanceur
  delay(5);
}

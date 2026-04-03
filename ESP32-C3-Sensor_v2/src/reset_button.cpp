#include "reset_button.h"
#include "config.h"
#include "nvs_store.h"
#include "globals.h"

#include <WiFi.h>

// ================== Réglages ==================
#ifndef RESET_BTN_HOLD_MS
#define RESET_BTN_HOLD_MS 5000UL      // durée d'appui pour reset (effacement NVS + reboot)
#endif

#ifndef RESET_DEBOUNCE_MS
#define RESET_DEBOUNCE_MS 30UL        // anti-rebond
#endif

#ifndef RESET_ARMING_DELAY_MS
#define RESET_ARMING_DELAY_MS 1500UL  // ignore le bouton pendant 1,5s après boot
#endif

// Durée minimale d'appui pour être reconnu comme appui "intentionnel"
// (évite de déclencher BLE sur un simple effleurement)
#ifndef RESET_SHORT_PRESS_MIN_MS
#define RESET_SHORT_PRESS_MIN_MS 80UL
#endif

// On exige d'avoir vu le bouton "relâché" (HIGH) un court instant après l'arming
#ifndef RESET_REQUIRE_RELEASE_MS
#define RESET_REQUIRE_RELEASE_MS 600UL
#endif

#ifndef RESET_DEBUG
#define RESET_DEBUG 1
#endif

#ifndef LED_PIN
#define LED_PIN 255                // 255 = pas de LED gérée ici
#endif

#ifndef LED_ACTIVE_LOW
#define LED_ACTIVE_LOW 0
#endif

// ================== État interne ==================
enum RBState : uint8_t { RB_IDLE=0, RB_PRESSED, RB_WAIT_RELEASE };

static RBState  s_state            = RB_IDLE;

static bool     s_rawLast          = true;     // lecture brute précédente (INPUT_PULLUP => relâché = HIGH)
static bool     s_stable           = false;    // état débouncé (true = appuyé)
static bool     s_prevStable       = false;    // état débouncé précédent

static uint32_t s_lastEdgeMs       = 0;        // pour le debounce
static uint32_t s_pressStartMs     = 0;        // début d'appui (débouncé)
static uint32_t s_bootMs           = 0;        // référence boot pour l'arming delay

// "Priming" : a-t-on vu un état HIGH durable depuis l'arming ? (bouton relâché)
static bool     s_seenHighPrimed   = false;
static uint32_t s_highSinceMs      = 0;

// ===== Helpers =====
static inline bool readPressed() {
  // Bouton BOOT généralement à la masse quand appuyé => actif bas
  return digitalRead(BOOT_BTN_PIN) == LOW;
}

static inline void ledWrite(bool on) {
#if LED_PIN != 255
  digitalWrite(LED_PIN, (LED_ACTIVE_LOW ? !on : on));
#else
  (void)on;
#endif
}

static void blinkAndFactoryReset() {
  // Clignote UNIQUEMENT pendant le reset (exigence utilisateur)
#if LED_PIN != 255
  for (int i = 0; i < 10; ++i) {  // ~600 ms
    ledWrite((i & 1) != 0);
    delay(60);
  }
  ledWrite(false);
#endif

  // Met la stack Wi-Fi au calme puis efface NVS et redémarre
  WiFi.disconnect(true, true);
  delay(120);

  resetStoredCredentials();   // efface wifi primaire+backup et remet MQTT par défaut
  delay(120);

  ESP.restart();
}

// ================== API ==================
void resetButtonInit() {
  pinMode(BOOT_BTN_PIN, INPUT_PULLUP);

#if LED_PIN != 255
  pinMode(LED_PIN, OUTPUT);
  // LED éteinte par défaut
  ledWrite(false);
#endif

  s_state            = RB_IDLE;
  s_rawLast          = true;          // on force "relâché" au démarrage
  s_stable           = false;
  s_prevStable       = false;
  s_lastEdgeMs       = millis();
  s_pressStartMs     = 0;
  s_bootMs           = millis();

  s_seenHighPrimed   = false;
  s_highSinceMs      = 0;

  Serial.printf("[RESET] Maintenez le bouton BOOT %lu ms puis RELÂCHEZ pour réinitialiser WiFi+MQTT\n",
                (unsigned long)RESET_BTN_HOLD_MS);
#if RESET_DEBUG
  Serial.printf("[RESET] GPIO=%d, arming=%lums, debounce=%lums, needHigh=%lums\n",
                BOOT_BTN_PIN, (unsigned long)RESET_ARMING_DELAY_MS,
                (unsigned long)RESET_DEBOUNCE_MS, (unsigned long)RESET_REQUIRE_RELEASE_MS);
#endif
}

void resetButtonService() {
  const uint32_t now = millis();

  // 1) Arming delay : ignore le bouton pendant la phase de boot
  if ((now - s_bootMs) < RESET_ARMING_DELAY_MS) {
    return;
  }

  // 2) Lecture + debounce
  bool raw = readPressed();
  if (raw != s_rawLast) {
    s_rawLast = raw;
    s_lastEdgeMs = now;
  }
  bool stableNow = s_stable;
  if ((now - s_lastEdgeMs) >= RESET_DEBOUNCE_MS) {
    stableNow = raw;              // l'état est stabilisé
  }

  // 3) Priming : on doit avoir vu HIGH (relâché) pendant RESET_REQUIRE_RELEASE_MS
  if (!s_seenHighPrimed) {
    if (!stableNow) { // stableNow == false => bouton relâché (HIGH)
      if (s_highSinceMs == 0) s_highSinceMs = now;
      if ((now - s_highSinceMs) >= RESET_REQUIRE_RELEASE_MS) {
        s_seenHighPrimed = true;
#if RESET_DEBUG
        Serial.println("[RESET] Primed: bouton vu relâché (HIGH) suffisamment longtemps");
#endif
      }
    } else {
      // Encore LOW : reset le compteur d'observation HIGH
      s_highSinceMs = 0;
    }
    // Tant que non "primed", on ignore toute logique d'appui
    s_stable     = stableNow;
    s_prevStable = s_stable;
    return;
  }

  // 4) Détection de fronts et machine d'états
  if (stableNow != s_prevStable) {
#if RESET_DEBUG
    Serial.printf("[RESET] Edge: %s\n", stableNow ? "PRESSED(LOW)" : "RELEASED(HIGH)");
#endif
  }

  switch (s_state) {
    case RB_IDLE:
      // On démarre la mesure UNIQUEMENT sur front relâché -> appuyé
      if (s_prevStable == false && stableNow == true) {
        s_pressStartMs = now;
#if RESET_DEBUG
        Serial.println("[RESET] Press started");
#endif
        s_state = RB_PRESSED;
      }
      break;

    case RB_PRESSED:
      // Relâché avant le seuil → appui court = activation BLE
      if (stableNow == false) {
        uint32_t pressDuration = now - s_pressStartMs;
        if (pressDuration >= RESET_SHORT_PRESS_MIN_MS) {
          Serial.println("[RESET] Appui court → activation BLE");
          g_bleShortPressRequest = true;
        }
#if RESET_DEBUG
        else {
          Serial.printf("[RESET] Appui ignoré (trop court: %lums)\n", (unsigned long)pressDuration);
        }
#endif
        s_state = RB_IDLE;
        break;
      }
      // Seuil 5s atteint → attend le relâchement pour confirmer le reset
      if ((now - s_pressStartMs) >= RESET_BTN_HOLD_MS) {
        Serial.println("[RESET] Seuil 5s atteint. Relâchez pour confirmer l'effacement…");
        s_state = RB_WAIT_RELEASE;
      }
      break;

    case RB_WAIT_RELEASE:
      // Confirmation sur relâchement
      if (stableNow == false) {
        Serial.println("[RESET] Confirmation → effacement WiFi+MQTT + reboot…");
        blinkAndFactoryReset();
        // ne revient pas
      }
      break;
  }

  s_stable     = stableNow;
  s_prevStable = s_stable;
}

#pragma once
#include <Arduino.h>
#include <WiFi.h>

// Déclaration unique et cohérente (PAS volatile)
extern bool wifiConnected;

// Handler d'événements WiFi (utilisé par WiFi.onEvent(onWiFiEvent))
void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info);

// Connexion "boot" (bloquante ~15s), OK au démarrage uniquement
bool connectToSsid(const String& ssid, const String& pass);

// Essaie d'utiliser les identifiants NVS (primaire → backup)
void tryConnectFromStored();

// Watchdog WiFi conservatif (aucun effacement NVS ici)
void wifiWatchdogService();

// --- Orchestrateur de switch Wi-Fi (non bloquant) ---
// Appelé après avoir sauvé SSID/PASS (BLE, Web, etc.)
void requestWifiSwitch(const String& ssid, const String& pass);

// À appeler à chaque loop() (réalise le switch sans bloquer)
void wifiSwitchService();

// SSID courant connu (selon l’événement GOT_IP)
String currentSsid();

// Active le modem-sleep WiFi (requis dès que le stack BT est initialisé)
void wifiEnableCoexSleep();

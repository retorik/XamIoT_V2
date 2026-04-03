#pragma once
#include <Arduino.h>

// --- Cycle de vie BLE ---
// startBLE()    : initialise complètement le BLE (appelé par activateBLE si pas encore fait)
// activateBLE() : démarre la publicité — appui court sur BOOT depuis main.cpp
// stopBLE()     : arrête la publicité (timeout 5min ou WiFi+MQTT connectés)
// isBleActive() : true si le BLE est en train d'advertiser
void startBLE();
void activateBLE();
void stopBLE();
bool isBleActive();
bool isBleInitialized();  // true dès que BLEDevice::init() a été appelé (stack BT reste actif)

// --- Inboxes BLE ---
void processBleWifiInbox();
void processBleMqttInbox();

// --- Statuts BLE ---
void setBleStatus(const String& s, bool notify = true);
void scheduleBleStatus(const String& s);
void bleStatusService();
void blePushFullStatus();

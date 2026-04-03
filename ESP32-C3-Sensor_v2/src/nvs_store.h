// nvs_store.h
#pragma once
#include <Arduino.h>
#include <Preferences.h>

extern Preferences prefs;

void loadCredentials(String& ssid, String& pass);
void saveCredentials(const String& ssid, const String& pass);
void resetStoredCredentials();
void loadMqttSettings();
void saveMqttSettings(const String& hostIn, uint16_t portIn,
                      const String& userIn, const String& passIn);


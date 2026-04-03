#pragma once
#include <Arduino.h>

// Initialisation (appelé une fois dans setup())
void otaSetup();

// À appeler dans loop() — gère les retries OTA pendants
void otaLoop();

// true si une mise à jour est en cours (bloque le reste de loop)
bool otaIsRunning();

// Télécharge un firmware depuis `url`, vérifie le HMAC-SHA256 avec `expectedHmac`,
// installe et redémarre. Retourne false sans redémarrer en cas d'échec.
bool otaFromUrl(const char* url, const char* expectedHmac);

// Mémorise une commande OTA reçue via MQTT pour exécution dans otaLoop()
void otaSetPending(const String& url, const String& hmac);

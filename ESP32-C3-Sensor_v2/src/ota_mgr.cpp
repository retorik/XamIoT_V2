// ota_mgr.cpp — OTA uniquement via commande MQTT (ArduinoOTA supprimé)
#include "ota_mgr.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Update.h>
#include <mbedtls/md.h>
#include <esp_task_wdt.h>

#include "globals.h"
#include "config.h"
#include "wifi_mgr.h"

static bool   s_otaRunning  = false;

// OTA en attente
static bool          s_hasPending   = false;
static String        s_pendingUrl;
static String        s_pendingHmac;
static String        s_pendingError; // statut d'échec à publier dès que MQTT repasse online
static int           s_retryCount   = 0;
static unsigned long s_nextRetryAt  = 0;

static const int          OTA_MAX_RETRIES = 5;
static const unsigned long OTA_RETRY_MS   = 5UL * 60 * 1000; // 5 minutes

void otaSetup() {
  s_otaRunning = false;
}

void otaSetPending(const String& url, const String& hmac) {
  // Si même commande déjà en attente, ne pas réinitialiser le timer (évite la boucle sur retain)
  if (s_hasPending && s_pendingUrl == url && s_pendingHmac == hmac) {
    Serial.println("[OTA] Même commande déjà en attente, retain ignoré");
    return;
  }
  s_pendingUrl   = url;
  s_pendingHmac  = hmac;
  s_hasPending   = true;
  s_pendingError = "";
  s_retryCount   = 0;
  s_nextRetryAt  = millis(); // tentative immédiate
  Serial.println("[OTA] Commande mémorisée, tentative via otaLoop()");
}

void otaLoop() {
  String otaTopic = String("devices/") + g_chipId + "/ota/status";

  // Publier le statut d'échec précédent si MQTT vient de se reconnecter
  if (!s_pendingError.isEmpty() && g_mqtt.connected()) {
    char errJson[96];
    snprintf(errJson, sizeof(errJson), "{\"status\":\"failed\",\"error\":\"%s\"}", s_pendingError.c_str());
    g_mqtt.publish(otaTopic.c_str(), errJson);
    s_pendingError = "";
  }

  if (!s_hasPending || s_otaRunning) return;
  if (millis() < s_nextRetryAt) return;
  if (!g_mqtt.connected()) return; // attendre reconnexion MQTT avant de tenter

  s_otaRunning = true;
  s_retryCount++;
  Serial.printf("[OTA] Tentative %d/%d\n", s_retryCount, OTA_MAX_RETRIES);

  // Publier "downloading" pendant que MQTT est encore connecté
  char dlJson[64];
  snprintf(dlJson, sizeof(dlJson), "{\"status\":\"downloading\",\"progress\":0}");
  g_mqtt.publish(otaTopic.c_str(), dlJson);
  g_mqtt.loop(); // flush avant que otaFromUrl ne coupe MQTT

  bool ok = otaFromUrl(s_pendingUrl.c_str(), s_pendingHmac.c_str());
  // ok=true → ESP.restart() appelé, on n'arrive jamais ici

  s_otaRunning = false;

  if (s_retryCount >= OTA_MAX_RETRIES) {
    s_hasPending   = false;
    s_pendingError = "max_retries_reached";
    Serial.printf("[OTA] Abandon après %d tentatives\n", OTA_MAX_RETRIES);
  } else {
    s_pendingError = String("attempt_") + s_retryCount + "_failed";
    s_nextRetryAt  = millis() + OTA_RETRY_MS;
    Serial.printf("[OTA] Echec tentative %d, retry dans 5 min\n", s_retryCount);
  }
}

bool otaIsRunning() {
  return s_otaRunning;
}

// Parse une URL http(s) du type "https://host[:port]/path"
static bool parseHttpUrl(const char* url,
                         bool &isHttps,
                         String &host,
                         uint16_t &port,
                         String &path) {
  if (!url || !url[0]) return false;

  String s(url); s.trim();

  int schemeIdx = s.indexOf("://");
  if (schemeIdx < 0) return false;

  String scheme = s.substring(0, schemeIdx);
  String rest   = s.substring(schemeIdx + 3);
  scheme.toLowerCase();

  if (scheme == "https")      { isHttps = true;  port = 443; }
  else if (scheme == "http")  { isHttps = false; port = 80;  }
  else return false;

  int slashIdx = rest.indexOf('/');
  if (slashIdx < 0) { host = rest; path = "/"; }
  else              { host = rest.substring(0, slashIdx); path = rest.substring(slashIdx); }

  int colonIdx = host.indexOf(':');
  if (colonIdx > 0) {
    int p = host.substring(colonIdx + 1).toInt();
    if (p > 0 && p < 65536) port = (uint16_t)p;
    host = host.substring(0, colonIdx);
  }

  return host.length() > 0;
}

/**
 * Télécharge un firmware depuis `url`, vérifie son HMAC-SHA256 (clé OTA_HMAC_KEY)
 * et l'installe. Redémarre si succès. Retourne false en cas d'échec (ne revient pas en cas de succès).
 */
bool otaFromUrl(const char* url, const char* expectedHmac) {
  if (!url || !url[0]) {
    Serial.println("[OTA] URL vide");
    return false;
  }
  if (!expectedHmac || !expectedHmac[0]) {
    Serial.println("[OTA] HMAC manquant, OTA refusé");
    return false;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[OTA] WiFi non connecté");
    return false;
  }

  Serial.println();
  Serial.println("========== OTA ==========");
  Serial.printf("[OTA] URL : %s\n", url);

  bool isHttps = false;
  String host, path;
  uint16_t port = 0;

  if (!parseHttpUrl(url, isHttps, host, port, path)) {
    Serial.println("[OTA] URL invalide");
    return false;
  }
  Serial.printf("[OTA] host=%s port=%u path=%s https=%d\n",
                host.c_str(), port, path.c_str(), isHttps ? 1 : 0);

  // Libère la RAM TLS MQTT avant d'ouvrir une nouvelle connexion TLS
  if (isHttps) {
    if (g_mqtt.connected()) g_mqtt.disconnect();
    g_netSecure.stop();
    delay(100);
  }

  // Les clients doivent être déclarés à ce scope pour rester valides
  // pendant toute la durée de http.GET() / lecture du flux.
  // Les déclarer dans le bloc if les détruirait avant http.GET() → dangling ref.
  WiFiClientSecure secureClient;
  WiFiClient       plainClient;
  HTTPClient http;
  bool okBegin = false;

  if (isHttps) {
    secureClient.setCACert(ISRG_ROOT_X1_PEM);
    secureClient.setTimeout(15);
    okBegin = http.begin(secureClient, host, port, path, true);
  } else {
    plainClient.setTimeout(15);
    okBegin = http.begin(plainClient, String(url));
  }

  if (!okBegin) {
    Serial.println("[OTA] http.begin() échoué");
    return false;
  }

  int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    Serial.printf("[OTA] GET échoué, code=%d\n", httpCode);
    http.end();
    return false;
  }

  int contentLength = http.getSize();
  if (contentLength > 0)  Serial.printf("[OTA] Taille firmware : %d octets\n", contentLength);
  else                    Serial.println("[OTA] Taille inconnue (chunked?)");

  bool canBegin = (contentLength > 0)
    ? Update.begin(contentLength)
    : Update.begin(UPDATE_SIZE_UNKNOWN);

  if (!canBegin) {
    Serial.println("[OTA] Update.begin() échoué");
    Update.printError(Serial);
    http.end();
    return false;
  }

  // Initialisation du contexte HMAC-SHA256
  mbedtls_md_context_t hmacCtx;
  mbedtls_md_init(&hmacCtx);
  const mbedtls_md_info_t* mdInfo = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  const char* hmacKey = OTA_HMAC_KEY;

  if (mbedtls_md_setup(&hmacCtx, mdInfo, 1) != 0 ||
      mbedtls_md_hmac_starts(&hmacCtx,
                             (const uint8_t*)hmacKey,
                             strlen(hmacKey)) != 0) {
    Serial.println("[OTA] Erreur init HMAC");
    mbedtls_md_free(&hmacCtx);
    http.end();
    return false;
  }

  Serial.println("[OTA] Téléchargement...");
  WiFiClient* stream = http.getStreamPtr();
  size_t written = 0;

  const size_t bufSize = 1024;
  uint8_t buf[bufSize];

  while (http.connected() &&
         (contentLength > 0 ? (int)written < contentLength : true)) {
    size_t avail = stream->available();
    if (!avail) { delay(1); continue; }
    if (avail > bufSize) avail = bufSize;

    int readLen = stream->readBytes(buf, avail);
    if (readLen <= 0) {
      Serial.println("[OTA] Erreur lecture flux");
      break;
    }

    Update.write(buf, readLen);
    mbedtls_md_hmac_update(&hmacCtx, buf, readLen);
    written += readLen;
    esp_task_wdt_reset();  // empêche le WDT de rebouter pendant le téléchargement

    if (contentLength > 0) {
      int pct = (int)((written * 100ULL) / contentLength);
      static int lastPct = -1;
      if (pct != lastPct) { lastPct = pct; Serial.printf("[OTA] %d%%\n", pct); }
    }
  }

  Serial.printf("[OTA] Reçus : %u octets\n", (unsigned)written);

  // Finalise et vérifie le HMAC
  uint8_t hmacResult[32];
  mbedtls_md_hmac_finish(&hmacCtx, hmacResult);
  mbedtls_md_free(&hmacCtx);

  char computedHex[65] = {0};
  for (int i = 0; i < 32; i++) snprintf(computedHex + i*2, 3, "%02x", hmacResult[i]);

  String expected = String(expectedHmac);
  expected.toLowerCase();

  if (String(computedHex) != expected) {
    Serial.printf("[OTA] HMAC INVALIDE!\n  calculé : %s\n  attendu : %s\n",
                  computedHex, expected.c_str());
    Update.abort();
    http.end();
    return false;
  }
  Serial.println("[OTA] HMAC vérifié ✓");

  if (!Update.end()) {
    Serial.println("[OTA] Update.end() échoué");
    Update.printError(Serial);
    http.end();
    return false;
  }

  http.end();

  if (!Update.isFinished()) {
    Serial.println("[OTA] Update non terminé correctement");
    return false;
  }

  Serial.println("[OTA] Succès — redémarrage...");
  Serial.println("=========================");
  s_otaRunning = false;
  // Déconnexion propre avant restart pour éviter que le stack WiFi
  // soit dans un état corrompu après RTC_SW_SYS_RST (AUTH_EXPIRE en boucle).
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  delay(500);
  ESP.restart();
  return true;
}

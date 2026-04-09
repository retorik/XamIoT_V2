# Audit — Double broker MQTT sur ESP32-C3 Sensor v2

**Date** : 2026-04-09  
**Firmware** : `ESP32-C3-Sensor_v2` — v2.5.0  
**Statut** : Audit uniquement, aucune modification réalisée

---

## Contexte

Évaluation de la faisabilité d'envoyer les données MQTT vers deux serveurs (deux URLs + deux jeux de credentials distincts) depuis le firmware SoundSense.

---

## Architecture actuelle

- **Un seul client** : `PubSubClient g_mqtt` + `WiFiClientSecure g_netSecure` (`globals.h:15-16`)
- **Un seul jeu de credentials** en NVS : namespace `"mqtt"` → clés `host`, `port`, `user`, `pass` (`nvs_store.cpp:96-108`)
- **Publication** : `mqttPublishStatus()` publie sur `MQTT_TOPIC_STATUS` via `g_mqtt.publish()` — vers un seul broker
- **Topics** calculés une seule fois dans `startMQTT()` à partir du chip ID (`mqtt_mgr.cpp:59-65`)

---

## Points critiques identifiés

### 1. Heap TLS — contrainte principale

Le firmware surveille activement la mémoire disponible (`mqtt_mgr.cpp:97-100` et `345-350`) :

```cpp
if (g_useTls && ESP.getMaxAllocHeap() < 44000) { /* refuse reconnexion */ }
if (g_useTls && ESP.getMaxAllocHeap() < 38000) { /* déconnexion préventive */ }
```

Un handshake TLS mbedTLS nécessite ~32-40 KB de bloc contigu. Deux sessions TLS simultanées actives demanderaient ~64-80 KB — ce qui dépasse ce que l'ESP32-C3 peut garantir après fragmentation du heap. C'est le point bloquant principal pour une implémentation naïve.

### 2. BLE — 6 nouvelles caractéristiques

Chaque config MQTT = 5 caractéristiques BLE (host, port, user, pass, status + base). Un second broker nécessiterait 6 nouveaux UUIDs + 6 nouvelles `BLECharacteristic*` en globals, et une extension du service BLE MQTT (`SERVICE_MQTT_UUID`).

### 3. Reconnect logic — statics non partageables

Dans `mqttReconnectIfNeeded()`, deux compteurs sont des `static` locaux (`mqtt_mgr.cpp:87` et `180`) :

```cpp
static uint8_t s_mqttFailCount = 0;
static uint8_t s_unauthorizedCount = 0;
```

Avec deux brokers, ces compteurs seraient mélangés. Il faudrait les séparer (une instance de fonction par broker, ou les passer en paramètre).

### 4. NVS — extensible sans difficulté

Un second namespace `"mqtt2"` avec les mêmes clés (`host`, `port`, `user`, `pass`) est trivial à ajouter dans `nvs_store.cpp`. Pas de contrainte NVS.

### 5. OTA — collision potentielle

Les commandes OTA arrivent via MQTT (`devices/{chipId}/cmd/ota`). Si les deux brokers peuvent envoyer des commandes OTA simultanément, il faudrait gérer les doublons et la priorité.

### 6. Ce qui est transparent

- Les topics (`devices/{chipId}/status`, etc.) sont identiques pour les deux brokers — aucun changement
- `mqttPublishStatus()` publie les mêmes données — simple à appeler deux fois
- Le rate-limiting (`g_sentThisMinute`) serait à décider (compté globalement ou par broker)

---

## Faisabilité par mode d'implémentation

| Mode | Faisabilité | Risque heap |
|------|-------------|-------------|
| Deux connexions TLS simultanées persistantes | Possible mais très risqué — fragmentation heap → boucles reconnexion ou crashes | Critique |
| Connexion séquentielle (broker 1 → publish → broker 2 → publish) | Faisable, mais un broker est toujours en retard | Modéré |
| Primaire TLS persistant + secondaire plain MQTT (port 1883) | Le plus réaliste : TLS pour XamIoT, plain pour le second | Faible |
| Bridge Mosquitto côté serveur | Zéro changement firmware — le broker relaye lui-même | Nul |

---

## Recommandation si implémentation future

La piste **bridge Mosquitto côté serveur** est la plus sûre (aucun risque firmware, aucune modification BLE). À envisager en priorité si le second broker est sous notre contrôle.

Si le second broker est externe (ex: Home Assistant), la piste **primaire TLS + secondaire plain MQTT** est la plus réaliste côté firmware.

---

## Fichiers clés concernés

| Fichier | Impact |
|---------|--------|
| `src/mqtt_mgr.cpp` | Reconnect, publish, loop — tout à dupliquer |
| `src/mqtt_mgr.h` | Nouvelles fonctions à déclarer |
| `src/globals.h` | Nouveaux objets PubSubClient, WiFiClientSecure, variables credentials |
| `src/nvs_store.cpp` | Nouveau namespace `"mqtt2"` |
| `src/nvs_store.h` | Nouvelles fonctions load/save MQTT2 |
| `src/ble.cpp` | 6 nouvelles BLE characteristics |
| `src/config.h` | 6 nouveaux UUIDs BLE |

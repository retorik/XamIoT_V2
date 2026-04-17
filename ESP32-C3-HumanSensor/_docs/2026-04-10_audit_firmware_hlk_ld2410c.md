# Audit Firmware — ESP32-C3 + HLK-LD2410C (Human Presence Sensor)

**Date :** 2026-04-10  
**Auteur :** Session Claude Code  
**Matériel :** Adafruit QT Py ESP32-C3 + module radar HLK-LD2410C  
**Base de code :** `ESP32-C3-HumanSensor/` (état : prototype fonctionnel WiFi)

---

## 1. Matériel

### HLK-LD2410C — Caractéristiques clés
| Paramètre | Valeur |
|-----------|--------|
| Technologie | FMCW 24 GHz millimétrique |
| Portée | 0,75 m – 6 m |
| Angle de détection | ±60° |
| Gates de distance | 8 × 0,75 m (configurable par gate) |
| Sensibilité par gate | 0–255 (mouvement) + 0–255 (statique) |
| États de sortie | Mouvement / Statique / Les deux / Aucun |
| Broche OUT | HIGH = présence détectée |
| UART | 256000 baud, 8N1 |
| BLE embarqué | Oui (app HLKRadar, UUID propriétaires) |
| Alimentation | DC 5V, ~79 mA en fonctionnement |
| IO level | 3,3V |

### Adafruit QT Py ESP32-C3 — Câblage
| Signal | Broche ESP32-C3 |
|--------|----------------|
| RX (← TX LD2410C) | GPIO 20 (UART1) |
| TX (→ RX LD2410C) | GPIO 21 (UART1, optionnel) |
| OUT digital | GPIO 10 |
| Alimentation | 5V / GND |

---

## 2. Architecture du firmware actuel

### Fichiers source
| Fichier | Rôle |
|---------|------|
| `src/main.cpp` (351 lignes) | Boucle principale, parseur UART, calibration |
| `src/app_state.h` (49 lignes) | Struct `AppState` — tous les champs LD2410C |
| `src/wifi_mgr.cpp` (140 lignes) | Smart connect WiFi, BSSID lock, watchdog 20s |
| `src/web_ui.cpp` (159 lignes) | Serveur HTTP port 80, routes /, /status, /dump |
| `_docs/Human_Sensor_Wifi_ok.rtf` | Variante expérimentale avec `Preferences.h` (config persistée en NVS) |

### Dépendances `platformio.ini`
- Platform : `espressif32 @ 6.5.0`
- Board : `adafruit_qtpy_esp32c3`
- Framework : `arduino`
- **Aucune dépendance MQTT, OTA, BLE** dans le firmware actuel

### Flux de données
```
LD2410C --[UART 256000]-> Ring buffer 8KB -> Parseur trame -> AppState
                                                                    |
                                   OUT GPIO 10 ──> lecture directe (HIGH/LOW)
                                                                    |
                                                         Serveur HTTP /status (JSON)
                                                         Heartbeat Série 2s
```

### Parseur de trames UART
- Synchronisation sur marqueur `F8 F7 F6 F5 F4 F3 F2 F1` (8 octets)
- Structure payload : `marker(01/02 AA)` + `STATE(1)` + `MOVING_DIST(2)` + `MOVING_ENERGY(1)` + `STATIC_DIST(2)` + `STATIC_ENERGY(1)` + `TARGET_DIST(2)`
- Validation CRC16 (2 octets fin de trame)

### Calibration adaptative
- Filtre EMA (alpha=0,12/0,15) sur le bruit de fond et la distance baseline
- Hystérésis dual-threshold : +5 pour activer, +1 pour désactiver
- Grace period 2s pour l'absence (évite les faux négatifs)

### Endpoint HTTP `/status` (JSON retourné)
```json
{
  "presence": true,
  "state": "moving",
  "moving_dist_cm": 120,
  "moving_energy": 85,
  "static_dist_cm": 0,
  "static_energy": 0,
  "target_dist_cm": 120,
  "out_pin": 1,
  "uptime_s": 3600
}
```

---

## 3. Points forts

- **Parseur robuste** : ring buffer 8KB, synchronisation par marqueur, CRC validé — pas de perte de trame
- **Calibration adaptative** : EMA + hystérésis évite les faux positifs/négatifs en environnement bruité
- **WiFi stable** : BSSID lock, WPA2-PSK forcé, PMF désactivé, watchdog 20s, reconnexion automatique
- **Code clair** : bien découpé en fichiers séparés (state, wifi, web), lisible
- **Variante NVS** : le fichier RTF montre une version avec config WiFi persistée via `Preferences.h` (non intégrée dans la version principale)

---

## 4. Lacunes pour une intégration XamIoT

| Lacune | Impact | Priorité |
|--------|--------|----------|
| **Pas de MQTT** | Le capteur ne publie rien — pipeline alertes XamIoT inaccessible | Critique |
| **WiFi credentials en dur** (`#define WIFI_SSID`) | Impossibilité de déployer sans recompiler | Critique |
| **Pas de BLE enrollment** | Impossible d'enrollement depuis app iOS/Android comme les SoundSense | Élevée |
| **Pas d'OTA** | Mise à jour firmware = câble USB obligatoire | Élevée |
| **Pas d'authentification MQTT** | Sécurité insuffisante pour prod | Élevée |
| **Pas d'`esp_uid` unique** | Pas d'identifiant device pour XamIoT | Moyenne |
| **Sensibilité non configurable à distance** | Paramètres LD2410C (gates, seuils) non exposés via API | Basse |

---

## 5. Synthèse

Le firmware est un **prototype fonctionnel de lecture WiFi** — il lit correctement les données du LD2410C et les expose via HTTP. Il n'est **pas intégrable en l'état** dans XamIoT : il lui manque MQTT, l'enrollment BLE, et une configuration dynamique du WiFi.

L'architecture existante (parseur, calibration, struct AppState) est **réutilisable telle quelle** — seule la couche réseau (HTTP → MQTT + BLE) est à construire.

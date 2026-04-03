# XamIoT v2 — URLs & endpoints

## Serveurs

| Composant | Production | Debug VPS (5 taps logo) |
|---|---|---|
| API | `https://api.xamiot.com` | `https://apixam.holiceo.com` |
| Admin UI | *(non déployé)* | `https://xamiot.holiceo.com` |
| MQTT (externe, TLS) | `mqtt.xamiot.com:8883` | `mqtt.holiceo.com:8883` |
| MQTT (LAN VPS, plain) | `192.168.1.6:1883` | `192.168.1.6:1883` |
| VPS SSH | `ssh jeremy@ecrimoi.com` | — |

> **Debug VPS** = VPS local `192.168.1.6`, accessible depuis l'extérieur via NAT.
> Le mode debug est activé par **5 taps sur le logo/titre** dans l'écran de connexion (iOS et Android).

---

## Sélection prod / debug dans les apps

### iOS — `ServerConfig.swift`
```swift
static let production = "https://api.xamiot.com"
static let local      = "https://apixam.holiceo.com"
```
Stocké dans `UserDefaults` (clé `xamiot_server_url`). Par défaut : production.

### Android — `ServerConfig.kt`
```kotlin
const val PRODUCTION = "https://api.xamiot.com/"
const val LOCAL      = "https://apixam.holiceo.com/"
```
Stocké dans `SharedPreferences`. Par défaut : production.

---

## MQTT — poussé par BLE lors de l'enrollment

Les valeurs suivantes sont écrites sur l'ESP32 via BLE au moment de l'enrollment :

| Mode | HOST | PORT | TLS |
|---|---|---|---|
| Production | `mqtt.xamiot.com` | `8883` | Oui (ISRG Root X1) |
| Debug VPS | `mqtt.holiceo.com` | `8883` | Oui (ISRG Root X1) |

Le choix est automatique selon le `ServerConfig` actif dans l'app.

> Le MQTT LAN (`192.168.1.6:1883`) est réservé aux tests directs sur le réseau local VPS
> et n'est jamais poussé par BLE.

---

## ESP32 — valeurs par défaut (`config.cpp`)

```cpp
String   mqtt_host_default = "mqtt.xamiot.com";
uint16_t mqtt_port_default = 8883;
```

Ces valeurs sont utilisées si aucune valeur n'a été provisionnée via BLE (NVS vide).
Le certificat ISRG Root X1 est embarqué en PROGMEM → Let's Encrypt natif.

---

## Infrastructure VPS (`192.168.1.6` / `ecrimoi.com`)

| Dossier | Contenu |
|---|---|
| `/home/jeremy/XamIoT_v2/api/` | API Node.js + `.env.prod` |
| `/home/jeremy/XamIoT_v2/mosquitto/` | Mosquitto + `.env.prod` |

| Container Docker | Réseau(x) | Port exposé |
|---|---|---|
| `xamiot-api` | `proxy` + `backend` | 3000 (interne) |
| `xamiot-mosquitto` | `proxy` + `backend` | `1883` (LAN) + `8883` via Traefik TCP |
| `xamiot-admin-ui` | `proxy` | 80 (interne) |
| `xamiot-postgres` | `backend` | non exposé |

### Traefik
- Image : `traefik:v3.6.7`
- Certresolver : `le` (Let's Encrypt TLS-ALPN-01)
- Entrypoint HTTPS : `websecure` (443)
- Entrypoint MQTTS : `mqtts` (8883) — TCP router avec `HostSNI`

---

## PostgreSQL

- Container : `xamiot-postgres` (PostgreSQL 16 Alpine)
- Alias réseau : `postgres` (sur réseau `backend`)
- Base v2 : `xamiot_v2` / user : `xamiot_v2_user`
- Connexion : `postgresql://xamiot_v2_user:<password>@postgres:5432/xamiot_v2`

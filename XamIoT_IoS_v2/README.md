# XamIoT SoundSense — iOS v2

Application iOS Swift/SwiftUI pour la plateforme XamIoT. Permet l'enrôlement BLE des appareils ESP32, la réception de notifications push APNs et la consultation des alertes.

## Prérequis

- Xcode 15+
- iOS 16+ (simulateur ou device physique)
- Compte développeur Apple (pour les push APNs sur device réel)

## Installation

Ouvrir `XamIoT SoundSense.xcodeproj` dans Xcode. Les dépendances sont gérées via Swift Package Manager (SPM) et téléchargées automatiquement à l'ouverture.

## Configuration

La configuration serveur (URL API, URL MQTT, mode local/prod) se gère via `ServerConfig`. L'activation du mode local s'effectue par 5 taps successifs sur le logo dans l'écran de connexion.

Les paramètres APNs (sandbox ou production) sont stockés dans `UserDefaults` via la clé `apns_isSandbox`.

## Build et soumission App Store

1. Sélectionner le scheme `XamIoT SoundSense` + destination `Any iOS Device`.
2. `Product > Archive`.
3. Distribuer via Xcode Organizer (App Store Connect ou TestFlight).

## Architecture

```
XamIoT SoundSense/
  APIClient.swift              — Client HTTP : registerMobileDevice (sandbox, model, os_version, timezone)
  MobileDeviceRegistrar.swift  — Enregistrement appareil mobile à l'API (model via sysctl hw.machine, timezone, sandbox depuis UserDefaults)
  ServerConfig.swift           — URL API + MQTT selon mode local/prod
  ...
```

## Enregistrement appareil mobile

Lors de la connexion, l'app enregistre automatiquement l'appareil auprès de l'API avec :

| Champ | Source |
|---|---|
| `platform` | `"iOS"` |
| `apns_token` | Token APNs reçu lors de l'inscription aux notifications |
| `sandbox` | `UserDefaults["apns_isSandbox"]` |
| `model` | `sysctl hw.machine` (ex: `iPhone14,5`) |
| `os_version` | `"iOS \(UIDevice.current.systemVersion)"` |
| `timezone` | `TimeZone.current.identifier` |

## Tests

- Tests unitaires : `XamIoT SoundSenseTests` (XCTest)
- Tests UI : `XamIoT SoundSenseUITests` (XCUITest)

```bash
# Via Xcode
Product > Test (⌘U)
```

## Variables de configuration

Toutes les URLs et paramètres de connexion passent par `ServerConfig` — jamais en dur dans le code.

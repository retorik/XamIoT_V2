# XamIoT SoundSense — Android v2

Application Android Kotlin/Jetpack Compose pour la plateforme XamIoT. Permet l'enrôlement BLE des appareils ESP32, la réception de notifications push Firebase (FCM) et la consultation des alertes.

## Prérequis

- Android Studio Hedgehog ou supérieur
- Android 8.0+ (API 26)
- Compte Firebase (pour les notifications FCM)

## Installation

Ouvrir le dossier racine dans Android Studio. Les dépendances Gradle sont téléchargées automatiquement.

## Configuration

La configuration serveur (URL API, URL MQTT, mode local/prod) se gère via `ServerConfig`. L'activation du mode local s'effectue par 5 taps successifs sur le logo dans l'écran de connexion.

Le mode sandbox est automatiquement dérivé de `BuildConfig.DEBUG` (sandbox si build de debug, production si release).

## Build et déploiement

```bash
# Debug (sandbox)
./gradlew assembleDebug

# Release (production)
./gradlew assembleRelease
```

Signer le release avec le keystore configuré dans `gradle.properties` (ne jamais committer le keystore ni ses mots de passe).

## Architecture

```
app/src/main/java/com/xamiot/soundsense/
  data/
    remote/
      dto/
        RegisterMobileDeviceRequest.kt  — DTO POST /devices (fcm_token, sandbox, model, os_version, timezone)
    repository/
      MobileDeviceRepository.kt        — Enregistrement appareil mobile à l'API
  ble/                                 — Gestion BLE (enrôlement ESP32)
  push/                                — Réception notifications FCM
  ui/                                  — Composables Jetpack Compose
  MainActivity.kt
  MyApplication.kt
```

## Enregistrement appareil mobile

Lors de la connexion, l'app enregistre automatiquement l'appareil auprès de l'API avec :

| Champ | Source |
|---|---|
| `platform` | `"Android"` |
| `fcm_token` | Token FCM Firebase |
| `sandbox` | `BuildConfig.DEBUG` |
| `model` | `Build.MODEL` |
| `os_version` | `"Android ${Build.VERSION.RELEASE}"` |
| `timezone` | `TimeZone.getDefault().id` |

L'enregistrement n'a lieu que si le token FCM a changé depuis le dernier enregistrement (vérification via `TokenManager.shouldRegisterMobileDevice`).

## Tests

- Tests unitaires : `app/src/test/` (JUnit)
- Tests UI : `app/src/androidTest/` (Espresso)

```bash
./gradlew test              # unitaires
./gradlew connectedAndroidTest  # UI (device/émulateur requis)
```

## Variables de configuration

Toutes les URLs et paramètres passent par `ServerConfig` et `BuildConfig` — jamais en dur dans le code. Ne jamais committer `google-services.json` contenant des clés Firebase de production.

# Enrôlement capteur — Suivi iOS → Android

**Date de rédaction :** 2026-04-02  
**Version iOS de référence :** refactor livré dans cette session (post v2.4.1)  
**Objectif :** aligner l'app Android sur les changements UX/fonctionnels réalisés sur iOS, sans avoir à répéter les décisions déjà prises.

---

## 1. Récapitulatif des changements iOS (source de vérité)

### 1.1 Flux d'enrôlement — bouton unique "Créer le capteur"

**Avant (iOS)** : deux boutons distincts
- "Configurer le Wi-Fi" → poussait les creds Wi-Fi via BLE
- "Créer le capteur" → appelait l'API puis poussait les creds MQTT via BLE

**Après (iOS)** : un seul bouton "Créer le capteur" qui enchaîne tout en une coroutine async :

```
1. Génère le MQTT password (SecRandom 32 chars)
2. Sauvegarde les creds Wi-Fi localement (WifiCredentialsStore)
3. Pousse Wi-Fi via BLE (pushWiFi)
4. Attend wifiConnected == true (polling 250 ms, timeout 15 s)
   → si timeout → affiche erreur "Connexion Wi-Fi échouée"
5. Appelle l'API POST /devices (espUID, name, topic_prefix, mqttPassword)
   → si erreur API → affiche erreur, ne pousse pas MQTT
6. Pousse les creds MQTT via BLE (pushMqttCredentials)
7. Attend 1,5 s (délai BLE)
8. Ferme la sheet, injecte le device créé dans la liste locale (SwiftData)
```

**Bouton désactivé** (`isCreating == true`) pendant toute la durée du flux → impossible de double-soumettre.

**Sheet non fermable** avec `.interactiveDismissDisabled(isCreating)` pendant la création.

### 1.2 Champs UX modifiés

| Champ | Avant | Après |
|-------|-------|-------|
| "ESP UID" / "Device UID" | Affiché avec label "ESP UID" | Label renommé **"UID"** |
| "Topic prefix" | Affiché dans le formulaire | **Masqué de l'UI** — gardé dans le modèle et envoyé à l'API |
| Bouton Annuler | Texte "Cancel" / "Annuler" | Icône **✕** (xmark.circle.fill) en top-trailing |
| Bouton Sauvegarder | Présent en toolbar (mode édition) | **Supprimé** — remplacé par un seul bouton en bas |

### 1.3 Bar chart sonore dans la liste des devices

- Chaque ligne device affiche un **bar chart** de 30 barres verticales représentant les 30 dernières mesures sonores (`soundPct` 0–100).
- Chaque barre est colorée par **interpolation HSB continue** : vert (hue 120°, valeur 0 %) → rouge (hue 0°, valeur 100 %). Pas de seuils fixes — le dégradé est proportionnel à la valeur.
- Rendu via `Canvas` pour les performances (pas de sous-vues).
- Placeholder en pointillés si `soundHistory.isEmpty()`.
- **Source des données :** `GET /esp-devices` retourne directement un champ `sound_history: [Double]` (30 dernières valeurs `soundPct` depuis `mqtt_raw_logs`, ordonnées chronologiquement). L'app l'injecte via `setSoundHistory(dto.sound_history)` à chaque refresh — **aucun buffer local ni accumulation** nécessaire.
- **Android n'a pas encore cet affichage** — voir section 3.5.

### 1.4 Dialogue de suppression centré (ConfirmDeleteDialog)

- Remplacement du `confirmationDialog` / `AlertDialog` par une modale custom centrée à l'écran.
- Fond semi-transparent noir, carte blanche arrondie, bouton rouge "Supprimer" + bouton gris "Annuler".

---

## 2. État actuel de l'Android (EnrollDeviceActivity)

Le code Android (`ui/enroll/EnrollDeviceActivity.kt`) a **le flux en deux boutons** (Push Wi-Fi + Create Device). Il faut le migrer vers le flux bouton unique.

### Ce qui existe déjà côté Android (à conserver)

- `BleProvisioningManager` avec `pushWifi()`, `pushMqttCredentials()`, `state.value.wifiConnected`
- `generateMqttPassword()` sur `BleProvisioningManager`
- `WifiCredentialsStore` — sauvegarde/restaure SSID+pass
- `canCreate()` — validation : `wifiConnected && espUid.isNotBlank() && topicPrefix.isNotBlank() && name.isNotBlank()`
- `isCreating` — flag anti-double-soumission
- `delay(1500)` après `pushMqttCredentials()` avant de `finish()`

### Ce qui n'est pas encore aligné sur iOS

1. **Deux boutons** (`btnPushWifi` + `btnCreate`) → à fusionner en un seul
2. **`tvTopicPrefix` affiché** dans l'écran → à masquer (le champ dans le layout XML)
3. **Label "ESP UID"** → renommer en **"UID"** dans les strings.xml / layout
4. **Attente active de `wifiConnected`** : actuellement l'utilisateur doit cliquer sur "Push Wi-Fi" puis attendre manuellement avant de cliquer "Create". Le bouton unique doit intégrer une boucle d'attente.
5. **Bouton fermeture** : toolbar close icon déjà présent (✓) — vérifier qu'il n'est pas un texte "Annuler"

---

## 3. Travaux à réaliser sur Android

### 3.1 Fusion des boutons (priorité 1)

**Fichier :** `ui/enroll/EnrollDeviceActivity.kt`  
**Layout :** `res/layout/activity_enroll_device.xml`

- Supprimer `btnPushWifi` du layout et de l'Activity.
- Renommer `btnCreate` (ou garder l'id) → action : `createSensor()`.
- Logique `createSensor()` (à implémenter dans `lifecycleScope.launch`) :

```kotlin
private fun createSensor() {
    val ssid = etSsid.text?.toString().orEmpty().trim()
    val wifiPass = etWifiPass.text?.toString().orEmpty()
    val name = etDeviceName.text?.toString().orEmpty().trim()

    if (ssid.isBlank()) { showError("SSID vide"); return }
    if (name.isBlank()) { showError("Nom du capteur vide"); return }

    val mqttPass = ble.generateMqttPassword()
    mqttPassword = mqttPass
    isCreating = true
    updateButtons()

    lifecycleScope.launch {
        try {
            // 1. Sauvegarde locale Wi-Fi
            WifiCredentialsStore.save(applicationContext, ssid, wifiPass)

            // 2. Push Wi-Fi via BLE
            tvStep.text = "Envoi Wi-Fi…"
            ble.pushWifi(ssid, wifiPass)

            // 3. Attente wifiConnected (timeout 15 s)
            tvStep.text = "Connexion Wi-Fi…"
            val connected = waitForWifiConnected(timeoutMs = 15_000)
            if (!connected) {
                showError("Connexion Wi-Fi échouée (timeout 15 s)")
                return@launch
            }

            // 4. Appel API création device
            tvStep.text = "Création du capteur…"
            val authHeader = tokenManager.getAuthHeader()
            if (authHeader.isNullOrBlank()) { showError("Session expirée"); return@launch }

            val s = ble.state.value
            val resp = ApiClient.apiService.createEspDevice(
                authorization = authHeader,
                request = CreateEspDeviceRequest(
                    espUid = s.espUid,
                    name = name,
                    topicPrefix = s.topicPrefix,
                    mqttPassword = mqttPass
                )
            )

            if (!resp.isSuccessful) {
                val err = resp.errorBody()?.string()?.take(300).orEmpty()
                showError("Échec API (${resp.code()}): ${err.ifBlank { "Erreur serveur" }}")
                return@launch
            }

            // 5. Push MQTT credentials
            tvStep.text = "Configuration MQTT…"
            val mqttHost = if (ServerConfig.isLocal(applicationContext))
                "mqtt.holiceo.com" else "mqtt.xamiot.com"
            ble.pushMqttCredentials(s.espUid, mqttPass, mqttHost, "8883")
            delay(1500)

            // 6. Succès
            setResult(RESULT_OK)
            finish()

        } catch (e: Throwable) {
            showError("Erreur : ${e.message}")
        } finally {
            isCreating = false
            updateButtons()
        }
    }
}

private suspend fun waitForWifiConnected(timeoutMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
        if (ble.state.value.wifiConnected) return true
        delay(250)
    }
    return false
}
```

### 3.2 Masquer `topic_prefix` dans l'UI

**Layout :** `res/layout/activity_enroll_device.xml`  
→ Passer `tvTopicPrefix` (et son label) en `visibility="gone"`.  
Le champ reste accessible via `ble.state.value.topicPrefix` pour l'API.

### 3.3 Renommer "ESP UID" → "UID"

**Fichier :** `res/values/strings.xml` (et `res/values-fr/strings.xml` si présent)  
→ Trouver la string `esp_uid` ou équivalente → remplacer par `"UID"`.

### 3.4 Validation du bouton unique

Remplacer `canCreate()` par une validation couvrant le cas "avant push Wi-Fi" :

```kotlin
private fun canCreateSensor(): Boolean {
    val nameOk = etDeviceName.text?.toString().orEmpty().trim().isNotBlank()
    val ssidOk = etSsid.text?.toString().orEmpty().trim().isNotBlank()
    val bleReady = ble.state.value.selected != null && ble.state.value.espUid.isNotBlank()
    return nameOk && ssidOk && bleReady && !isCreating
}
```

### 3.5 Bar chart sonore dans la liste des devices (priorité 2)

**Source des données :**  
`GET /esp-devices` retourne un champ `sound_history` (tableau JSON de Doubles) pour chaque device. Aucun buffer local ni accumulation : l'app injecte directement la valeur reçue de l'API à chaque refresh.

**Mise à jour du modèle :**  
`DeviceDTO.kt` → ajouter `val soundHistory: List<Double> = emptyList()` désérialisé depuis `sound_history` :

```kotlin
data class DeviceDTO(
    val id: String,
    val espUid: String,
    val name: String,
    val topicPrefix: String,
    val lastSeen: String?,
    val lastDb: Double?,
    @SerializedName("sound_history") val soundHistory: List<Double> = emptyList()
)
```

**Vue bar chart (`SoundBarChart`) :**  
Créer un `View` custom (ou `@Composable`) dessinant sur `Canvas` :
- 30 barres verticales (largeur = `(totalWidth - 29 * 1dp) / 30`, espace inter-barre = 1dp)
- Hauteur de chaque barre proportionnelle à `soundPct / 100`
- Couleur par interpolation HSB continue : `hue = 120° × (1 - pct/100)` → vert à 0 %, rouge à 100 %
- Saturation 82 %, Brightness 88 % (cohérent avec iOS)
- Placeholder en pointillés si `soundHistory.isEmpty()`

Hauteur cible : `28dp`.

**Exemple de calcul couleur (Kotlin) :**
```kotlin
fun barColor(pct: Float): Int {
    val hue = 120f * (1f - pct.coerceIn(0f, 1f))
    return android.graphics.Color.HSVToColor(floatArrayOf(hue, 0.82f, 0.88f))
}
```

### 3.6 AlertDialog centré (priorité 3)

Remplacer les `AlertDialog.Builder` de suppression par un `Dialog` Jetpack Compose custom (ou un `MaterialAlertDialogBuilder` avec layout custom) centré à l'écran, avec :
- Icône poubelle rouge
- Titre + message
- Bouton gris "Annuler" + bouton rouge "Supprimer"

---

## 4. Checklist de validation post-implémentation Android

- [ ] Bouton unique "Créer le capteur" — un seul tap démarre le flux complet
- [ ] Double-soumission impossible (bouton désactivé pendant `isCreating`)
- [ ] WiFi timeout 15 s → message d'erreur clair affiché (pas de crash)
- [ ] Erreur API après WiFi ok → message affiché, MQTT **non** poussé
- [ ] `topic_prefix` absent de l'UI, présent dans le payload API
- [ ] Label "UID" (plus "ESP UID" ni "Device UID")
- [ ] Fermeture écran via icône ✕ (pas un texte "Annuler")
- [ ] Sparkline visible dans la liste des devices (30 dernières mesures)
- [ ] Dialogue suppression centré, style cohérent avec iOS
- [ ] Tests unitaires : `canCreateSensor()`, `waitForWifiConnected()` (mock BLE state)

---

## 5. Contraintes à ne pas oublier

- `topic_prefix` est généré côté ESP32 et transmis via BLE (`ble.state.value.topicPrefix`). Il ne doit **jamais** être null au moment de l'appel API — si vide, afficher une erreur BLE.
- Le `mqttPassword` doit être généré **dans le flux** (pas au clic d'un bouton Wi-Fi qui n'existe plus).
- `pushMqttCredentials` doit être appelé **après** confirmation succès API uniquement (sinon l'ESP se connecte au broker sans être enregistré en base).
- Sur Android API < 31, la permission `ACCESS_FINE_LOCATION` est requise pour le scan BLE. Sur API ≥ 31 : `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT`. Cette logique est déjà en place dans `ensurePermissionsAndBluetooth()` — ne pas modifier.

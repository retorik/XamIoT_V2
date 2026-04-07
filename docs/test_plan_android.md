# Plan de tests — XamIoT Android

Version app : v2  
Environnements : Production (`api.xamiot.com`) + Dev (`apixam.holiceo.com`)  
Framework de test : JUnit (unitaire), Espresso (UI), tests manuels sur device

---

## 1. Authentification

### TC-AND-AUTH-01 — Connexion valide
**Préconditions :** compte existant et activé  
**Étapes :**
1. Ouvrir l'app
2. Saisir email et mot de passe valides
3. Taper "Se connecter"

**Résultat attendu :** token JWT stocké via TokenManager (SharedPreferences), redirection vers MainActivity

---

### TC-AND-AUTH-02 — Connexion avec mauvais mot de passe
**Étapes :**
1. Saisir email valide + mot de passe incorrect
2. Taper "Se connecter"

**Résultat attendu :** message d'erreur affiché, pas de navigation

---

### TC-AND-AUTH-03 — Persistance de session
**Étapes :**
1. Se connecter
2. Fermer l'app complètement
3. Rouvrir l'app

**Résultat attendu :** utilisateur toujours connecté, MainActivity affichée directement

---

### TC-AND-AUTH-04 — Déconnexion
**Étapes :**
1. Menu → Déconnexion
2. Confirmer

**Résultat attendu :** token supprimé, retour à LoginActivity, données locales effacées

---

### TC-AND-AUTH-05 — Mot de passe oublié
**Étapes :**
1. Taper "Mot de passe oublié" sur l'écran de login
2. Saisir l'email
3. Valider

**Résultat attendu :** email de réinitialisation reçu, message de confirmation affiché

---

### TC-AND-AUTH-06 — Création de compte
**Étapes :**
1. Taper "Créer un compte"
2. Remplir email, mot de passe (+ confirmation), prénom, nom, téléphone avec indicatif pays
3. Valider

**Résultat attendu :** email de confirmation envoyé, message affiché

---

### TC-AND-AUTH-07 — Permission notifications (Android 13+)
**Étapes :**
1. Se connecter pour la première fois sur Android 13+

**Résultat attendu :** dialogue système de permission `POST_NOTIFICATIONS` affiché

---

### TC-AND-AUTH-08 — Sélecteur de serveur (easter egg)
**Étapes :**
1. Sur l'écran de login, taper 5 fois sur le logo
2. Changer de serveur

**Résultat attendu :** serveur persisté en SharedPreferences, appels API sur le bon serveur après redémarrage

---

## 2. Enrôlement BLE

### TC-AND-BLE-01 — Permissions BLE
**Préconditions :** première utilisation  
**Étapes :**
1. Taper le FAB "+" dans MainActivity

**Résultat attendu :** dialogue de permission Bluetooth + localisation affiché (BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION)

---

### TC-AND-BLE-02 — Scan des capteurs
**Préconditions :** permissions accordées, Bluetooth activé, capteur SoundSense alimenté  
**Étapes :**
1. Lancer l'enrôlement

**Résultat attendu :** capteur "SOUND-SENSOR-xxx" apparaît dans le spinner, auto-sélection du premier trouvé

---

### TC-AND-BLE-03 — Enrôlement complet
**Étapes :**
1. Sélectionner ou laisser l'auto-sélection du capteur
2. Saisir SSID et mot de passe WiFi
3. Valider
4. Attendre le statut WiFi positif
5. Saisir un nom pour le capteur
6. Confirmer

**Résultat attendu :**
- États BLE : IDLE → SCANNING → CONNECTING → DISCOVERING → READING_INFO → SENDING_WIFI → WAITING_WIFI → SENDING_MQTT → READY_TO_CREATE → SUCCESS
- Credentials MQTT (host, port, user, pass) envoyés via BLE
- Capteur créé sur l'API
- Retour à MainActivity avec le capteur visible

---

### TC-AND-BLE-04 — WiFi incorrect
**Étapes :**
1. Saisir un SSID/mot de passe WiFi incorrect

**Résultat attendu :** timeout (15s), état ERROR affiché, option de réessayer disponible (canRetry = true)

---

### TC-AND-BLE-05 — Bluetooth désactivé
**Étapes :**
1. Désactiver le Bluetooth
2. Tenter d'ajouter un capteur

**Résultat attendu :** dialogue système pour activer le Bluetooth, ou message explicite

---

### TC-AND-BLE-06 — Déconnexion BLE pendant l'enrôlement
**Étapes :**
1. Lancer l'enrôlement
2. Éloigner le capteur pendant la phase SENDING_MQTT

**Résultat attendu :** état ERROR, message affiché, pas de capteur créé en doublon sur l'API

---

### TC-AND-BLE-07 — Auto-sélection désactivée
**Étapes :**
1. Plusieurs capteurs en range
2. Toucher le spinner pour sélectionner manuellement

**Résultat attendu :** auto-sélection annulée, utilisateur peut choisir manuellement dans la liste

---

## 3. Données capteur et MQTT

### TC-AND-MQTT-01 — Affichage liste capteurs
**Préconditions :** au moins un capteur enrôlé et connecté au MQTT  
**Étapes :**
1. Ouvrir MainActivity

**Résultat attendu :** chaque capteur affiche nom, statut de dernière alerte, temps relatif depuis dernière activité

---

### TC-AND-MQTT-02 — Mise à jour temps relatif
**Étapes :**
1. Observer la liste pendant quelques secondes

**Résultat attendu :** les temps relatifs ("il y a 2s", "il y a 1min") se mettent à jour toutes les secondes via le time ticker

---

### TC-AND-MQTT-03 — Rafraîchissement automatique
**Étapes :**
1. Activer l'auto-refresh via le menu
2. Attendre 10 secondes

**Résultat attendu :** données rechargées automatiquement, icône menu indique l'état actif

---

### TC-AND-MQTT-04 — Rafraîchissement manuel
**Étapes :**
1. Menu → Rafraîchir

**Résultat attendu :** appel API immédiat, liste mise à jour

---

### TC-AND-MQTT-05 — Capteur hors ligne
**Étapes :**
1. Éteindre un capteur
2. Consulter la liste

**Résultat attendu :** dernière valeur affichée avec temps relatif exact, pas de crash

---

## 4. Règles d'alerte

### TC-AND-RULES-01 — Création d'une règle depuis un template
**Étapes :**
1. Ouvrir le détail d'un capteur (DeviceDetailActivity)
2. Taper "Ajouter une règle"
3. Sélectionner un template dans RuleCreateBottomSheet
4. Configurer opérateur, seuil (stepper + saisie), cooldown, label utilisateur
5. Activer et sauvegarder

**Résultat attendu :** règle créée via `POST /esp-rules`, visible dans la liste du capteur

---

### TC-AND-RULES-02 — Seuil hors limites
**Étapes :**
1. Créer une règle
2. Tenter de dépasser field_max via le stepper ou la saisie directe

**Résultat attendu :** seuil bloqué à field_min / field_max

---

### TC-AND-RULES-03 — Cooldown inférieur au minimum
**Étapes :**
1. Tenter de saisir un cooldown < cooldown_min_sec

**Résultat attendu :** cooldown bloqué à cooldown_min_sec

---

### TC-AND-RULES-04 — Activation / désactivation d'une règle
**Étapes :**
1. Dans la liste des règles, basculer le toggle

**Résultat attendu :** `PATCH /esp-rules/{id}` avec enabled mis à jour, UI reflète le changement

---

### TC-AND-RULES-05 — Édition d'une règle existante
**Étapes :**
1. Taper sur une règle
2. Modifier seuil, cooldown, label
3. Sauvegarder

**Résultat attendu :** modifications persistées via PATCH sur l'API

---

### TC-AND-RULES-06 — Suppression d'une règle
**Étapes :**
1. Glisser la règle vers la gauche
2. Confirmer la suppression

**Résultat attendu :** `DELETE /esp-rules/{id}`, règle retirée de la liste

---

## 5. Gestion des capteurs

### TC-AND-DEV-01 — Suppression d'un capteur
**Étapes :**
1. Glisser le capteur vers la gauche dans MainActivity
2. Confirmer la suppression

**Résultat attendu :** `DELETE /esp-devices/{id}`, capteur retiré de la liste

---

### TC-AND-DEV-02 — Détail d'un capteur
**Étapes :**
1. Taper sur un capteur dans la liste

**Résultat attendu :** DeviceDetailActivity affiche : infos capteur, liste des règles, historique des alertes

---

### TC-AND-DEV-03 — Chargement parallèle des alertes
**Préconditions :** plusieurs capteurs en liste  
**Étapes :**
1. Ouvrir MainActivity

**Résultat attendu :** les dernières alertes de chaque capteur sont chargées en parallèle (awaitAll), pas de blocage UI

---

## 6. Notifications push

### TC-AND-NOTIF-01 — Enregistrement token FCM
**Étapes :**
1. Se connecter à l'app

**Résultat attendu :** token FCM enregistré via `POST /devices` (RegisterMobileDeviceRequest)

---

### TC-AND-NOTIF-02 — Réception d'une alerte en foreground
**Préconditions :** règle active, capteur déclenche le seuil  
**Étapes :**
1. Garder l'app ouverte

**Résultat attendu :** notification système affichée via NotificationHelper (avec son et vibration), canal créé si Android 8+

---

### TC-AND-NOTIF-03 — Réception d'une alerte en background
**Étapes :**
1. Mettre l'app en arrière-plan ou fermer l'app
2. Le capteur déclenche une alerte

**Résultat attendu :** notification reçue dans la barre de statut, tap ouvre l'app

---

### TC-AND-NOTIF-04 — Renouvellement token FCM
**Étapes :**
1. Simuler un renouvellement de token FCM (onNewToken)

**Résultat attendu :** nouveau token enregistré localement + envoyé à l'API si utilisateur connecté

---

### TC-AND-NOTIF-05 — Canal de notification (Android 8+)
**Étapes :**
1. Vérifier dans Paramètres système → Notifications → XamIoT

**Résultat attendu :** canal d'alerte visible avec son et vibration configurés

---

## 7. Paramètres et configuration

### TC-AND-CFG-01 — Suppression de compte
**Étapes :**
1. Menu → Supprimer le compte
2. Saisir l'email dans le dialogue de confirmation
3. Confirmer

**Résultat attendu :** `DELETE /me` avec corps `{"confirm": "DELETE"}`, bouton désactivé pendant l'opération, retour à LoginActivity

---

### TC-AND-CFG-02 — Mémorisation credentials WiFi
**Étapes :**
1. Enrôler un capteur avec un SSID/mot de passe
2. Lancer un second enrôlement

**Résultat attendu :** SSID et mot de passe pré-remplis via WifiCredentialsStore

---

### TC-AND-CFG-03 — Auto-refresh s'arrête en background
**Étapes :**
1. Activer l'auto-refresh
2. Mettre l'app en arrière-plan
3. Revenir sur l'app

**Résultat attendu :** auto-refresh stoppé en background (onStop), redémarré en foreground (onStart)

---

## 8. Tests de robustesse

### TC-AND-ROB-01 — Perte réseau pendant l'utilisation
**Étapes :**
1. Passer en mode avion pendant que l'app est ouverte

**Résultat attendu :** erreur réseau affichée via ApiError.toUserMessage(), pas de crash

---

### TC-AND-ROB-02 — Token expiré
**Étapes :**
1. Laisser le token expirer
2. Effectuer une action API

**Résultat attendu :** code HTTP 401 détecté, redirection vers LoginActivity

---

### TC-AND-ROB-03 — Rotation écran pendant l'enrôlement
**Étapes :**
1. Lancer l'enrôlement BLE
2. Faire pivoter le téléphone

**Résultat attendu :** état BLE préservé via ViewModel (StateFlow), pas de réinitialisation de l'enrôlement

---

### TC-AND-ROB-04 — Permission BLE refusée
**Étapes :**
1. Refuser les permissions Bluetooth lors du premier lancement
2. Tenter d'ajouter un capteur

**Résultat attendu :** message explicite, invitation à aller dans les paramètres système

---

### TC-AND-ROB-05 — Chargement simultané (device meta + rules + alerts)
**Étapes :**
1. Ouvrir DeviceDetailActivity sur un capteur avec plusieurs règles et alertes

**Résultat attendu :** chargement sans blocage UI, ViewModel gère les états Loading/Success/Error correctement

---

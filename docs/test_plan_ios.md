# Plan de tests — XamIoT iOS

Version app : v2  
Environnements : Production (`api.xamiot.com`) + Dev (`apixam.holiceo.com`)  
Framework de test : XCTest (unitaire), XCUITest (UI), tests manuels sur device

---

## 1. Authentification

### TC-IOS-AUTH-01 — Connexion valide
**Préconditions :** compte existant et activé  
**Étapes :**
1. Ouvrir l'app
2. Saisir email et mot de passe valides
3. Taper "Se connecter"

**Résultat attendu :** token JWT stocké en Keychain, redirection vers la liste des capteurs

---

### TC-IOS-AUTH-02 — Connexion avec mauvais mot de passe
**Étapes :**
1. Saisir email valide + mot de passe incorrect
2. Taper "Se connecter"

**Résultat attendu :** message d'erreur affiché, pas de navigation

---

### TC-IOS-AUTH-03 — Persistance de session
**Étapes :**
1. Se connecter
2. Fermer l'app complètement
3. Rouvrir l'app

**Résultat attendu :** utilisateur toujours connecté, pas de nouvel écran de login

---

### TC-IOS-AUTH-04 — Déconnexion
**Étapes :**
1. Aller dans les paramètres
2. Taper "Se déconnecter"
3. Confirmer

**Résultat attendu :** token supprimé du Keychain, retour à l'écran de login, WiFi credentials effacés

---

### TC-IOS-AUTH-05 — Mot de passe oublié
**Étapes :**
1. Sur l'écran de login, taper "Mot de passe oublié"
2. Saisir l'email
3. Valider

**Résultat attendu :** email de réinitialisation reçu, message de confirmation affiché

---

### TC-IOS-AUTH-06 — Création de compte
**Étapes :**
1. Taper "Créer un compte"
2. Remplir email, mot de passe, prénom, nom, téléphone avec indicatif pays
3. Valider

**Résultat attendu :** email de confirmation envoyé, message affiché

---

### TC-IOS-AUTH-07 — Sélecteur de serveur (easter egg)
**Étapes :**
1. Sur l'écran de login, taper 5 fois sur le titre
2. Changer de serveur

**Résultat attendu :** le serveur sélectionné est persisté, les appels API pointent vers le bon serveur

---

## 2. Enrôlement BLE

### TC-IOS-BLE-01 — Scan des capteurs
**Préconditions :** Bluetooth activé, un capteur SoundSense alimenté et non enrôlé  
**Étapes :**
1. Taper "+" pour ajouter un capteur
2. Observer la liste des périphériques BLE

**Résultat attendu :** le capteur apparaît avec son nom (préfixe "SOUND-SENSOR")

---

### TC-IOS-BLE-02 — Enrôlement complet
**Étapes :**
1. Sélectionner le capteur dans la liste
2. Saisir SSID et mot de passe WiFi
3. Valider la connexion WiFi
4. Saisir un nom pour le capteur
5. Confirmer la création

**Résultat attendu :**
- WiFi provisionné via GATT
- Statut WiFi passe à positif (got_ip / connected)
- Credentials MQTT (host, port, user, pass) envoyés via BLE
- Capteur créé sur l'API
- Capteur visible dans la liste

---

### TC-IOS-BLE-03 — WiFi incorrect
**Étapes :**
1. Lancer l'enrôlement avec un SSID/mot de passe WiFi incorrect

**Résultat attendu :** statut WiFi passe en négatif après timeout, message d'erreur affiché, possibilité de réessayer

---

### TC-IOS-BLE-04 — Bluetooth désactivé
**Étapes :**
1. Désactiver le Bluetooth
2. Tenter d'ajouter un capteur

**Résultat attendu :** message demandant d'activer le Bluetooth

---

### TC-IOS-BLE-05 — Timeout WiFi
**Étapes :**
1. Lancer l'enrôlement avec un réseau WiFi hors portée

**Résultat attendu :** timeout au bout de 10 secondes, message d'erreur, option de réessayer

---

### TC-IOS-BLE-06 — Déconnexion BLE pendant l'enrôlement
**Étapes :**
1. Lancer l'enrôlement
2. Éloigner le capteur pendant la phase WiFi

**Résultat attendu :** erreur affichée, état cohérent, pas de capteur créé en doublon sur l'API

---

## 3. Données capteur et MQTT

### TC-IOS-MQTT-01 — Affichage liste capteurs
**Préconditions :** au moins un capteur enrôlé et connecté au MQTT  
**Étapes :**
1. Ouvrir la liste des capteurs

**Résultat attendu :** chaque capteur affiche le dernier niveau sonore (dB), le temps relatif depuis la dernière mesure, et le sparkline

---

### TC-IOS-MQTT-02 — Rafraîchissement automatique
**Étapes :**
1. Activer l'auto-refresh (toggle)
2. Attendre 10 secondes

**Résultat attendu :** les données sont mises à jour automatiquement toutes les 10 secondes

---

### TC-IOS-MQTT-03 — Retour au premier plan
**Étapes :**
1. Mettre l'app en arrière-plan
2. Revenir sur l'app

**Résultat attendu :** données rafraîchies automatiquement au retour

---

### TC-IOS-MQTT-04 — Capteur hors ligne
**Préconditions :** capteur éteint ou déconnecté  
**Étapes :**
1. Consulter la liste

**Résultat attendu :** le temps relatif "last seen" reflète la dernière connexion réelle, pas de crash

---

## 4. Règles d'alerte

### TC-IOS-RULES-01 — Création d'une règle depuis un template
**Étapes :**
1. Aller sur le détail d'un capteur
2. Taper "Ajouter une règle"
3. Sélectionner un template
4. Configurer opérateur, seuil, cooldown, label
5. Activer et sauvegarder

**Résultat attendu :** règle créée via API, visible dans la liste du capteur

---

### TC-IOS-RULES-02 — Seuil hors limites
**Étapes :**
1. Créer une règle
2. Saisir un seuil inférieur au minimum ou supérieur au maximum du template

**Résultat attendu :** seuil bloqué aux bornes min/max, pas d'envoi hors limites

---

### TC-IOS-RULES-03 — Cooldown inférieur au minimum
**Étapes :**
1. Tenter de saisir un cooldown inférieur à `cooldown_min_sec`

**Résultat attendu :** cooldown bloqué à la valeur minimale

---

### TC-IOS-RULES-04 — Activation / désactivation d'une règle
**Étapes :**
1. Dans la liste des règles, basculer le toggle d'activation

**Résultat attendu :** état mis à jour via PATCH sur l'API, toggle reflète le nouvel état

---

### TC-IOS-RULES-05 — Édition d'une règle existante
**Étapes :**
1. Taper sur une règle existante
2. Modifier le seuil et le cooldown
3. Sauvegarder

**Résultat attendu :** modifications persistées sur l'API

---

### TC-IOS-RULES-06 — Suppression d'une règle
**Étapes :**
1. Glisser la règle vers la gauche
2. Confirmer la suppression

**Résultat attendu :** règle supprimée sur l'API, disparaît de la liste

---

## 5. Gestion des capteurs

### TC-IOS-DEV-01 — Édition du nom d'un capteur
**Étapes :**
1. Glisser le capteur → Modifier
2. Changer le nom
3. Sauvegarder

**Résultat attendu :** nom mis à jour sur l'API et en local (SwiftData)

---

### TC-IOS-DEV-02 — Suppression d'un capteur
**Étapes :**
1. Glisser le capteur → Supprimer
2. Confirmer

**Résultat attendu :** capteur supprimé sur l'API, retiré de la liste

---

### TC-IOS-DEV-03 — Persistance locale (SwiftData)
**Étapes :**
1. Enrôler un capteur
2. Passer en mode avion
3. Rouvrir l'app

**Résultat attendu :** capteurs toujours visibles (données locales), pas de crash

---

## 6. Notifications push

### TC-IOS-NOTIF-01 — Autorisation notifications
**Étapes :**
1. Premier lancement de l'app
2. Accepter les notifications

**Résultat attendu :** token APNs enregistré via API (`POST /devices`)

---

### TC-IOS-NOTIF-02 — Réception en foreground
**Préconditions :** une règle d'alerte active, le capteur déclenche un seuil  
**Étapes :**
1. Garder l'app ouverte

**Résultat attendu :** bannière affichée, payload loggé en local (SwiftData), badge incrémenté

---

### TC-IOS-NOTIF-03 — Réception en background
**Étapes :**
1. Mettre l'app en arrière-plan
2. Le capteur déclenche une alerte

**Résultat attendu :** notification système reçue, payload capturé silencieusement

---

### TC-IOS-NOTIF-04 — Réinitialisation du badge
**Étapes :**
1. Revenir sur l'app après avoir reçu des notifications

**Résultat attendu :** badge remis à 0 via `POST /me/badge/reset`

---

### TC-IOS-NOTIF-05 — Résumé notification sur la liste
**Étapes :**
1. Déclencher une alerte sur un capteur
2. Consulter la liste des capteurs

**Résultat attendu :** la ligne du capteur affiche "Alerte Il y a Xs"

---

## 7. Paramètres et configuration

### TC-IOS-CFG-01 — Suppression de compte
**Étapes :**
1. Aller dans les paramètres
2. Taper "Supprimer mon compte"
3. Saisir l'email de confirmation
4. Confirmer

**Résultat attendu :** compte supprimé via API, retour à l'écran de login

---

### TC-IOS-CFG-02 — Mémorisation credentials WiFi
**Étapes :**
1. Enrôler un capteur avec un SSID/mot de passe WiFi
2. Lancer un second enrôlement

**Résultat attendu :** SSID et mot de passe pré-remplis

---

## 8. Tests de robustesse

### TC-IOS-ROB-01 — Perte réseau pendant l'utilisation
**Étapes :**
1. Passer en mode avion pendant que l'app est ouverte

**Résultat attendu :** message d'erreur réseau affiché, pas de crash, récupération au retour du réseau

---

### TC-IOS-ROB-02 — Token expiré
**Étapes :**
1. Laisser l'app inactive suffisamment longtemps pour expirer le token
2. Tenter une action API

**Résultat attendu :** redirection vers l'écran de login

---

### TC-IOS-ROB-03 — Rafraîchissement manuel
**Étapes :**
1. Tirer vers le bas sur la liste des capteurs (pull-to-refresh)

**Résultat attendu :** données rechargées depuis l'API

---

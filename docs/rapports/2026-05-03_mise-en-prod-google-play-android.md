# Mise en production Google Play — XamIoT SoundSense Android

**Date** : 2026-05-03
**App** : XamIoT SoundSense (`com.xamiot.soundsense`)
**Build** : `versionCode=3 / versionName=1.2.0`
**AAB** : `XamIoT_Android_v2/app/release/app-release.aab` (~6 Mo)
**Statut** : demande de publication en production soumise à Google après test fermé de 14 jours (12 testeurs).

---

## Contexte

Premier déploiement sur Google Play Store. Compte Play Console créé après novembre 2023, donc soumis à l'obligation de **test fermé préalable** (12 testeurs minimum, 14 jours minimum) avant d'accéder à la production.

Le test fermé a été mené sur la track **alpha** avec un seul build (`versionCode=3`) — aucun nouveau build n'a été uploadé pendant la durée du test, par choix volontaire pour garantir que la version publiée soit strictement identique à celle validée par les testeurs.

---

## Réponses au questionnaire de revue Google Play

Réponses calibrées (≤ 300 caractères chacune sauf mention contraire) saisies dans le formulaire "Demander à publier en production".

### 1. Recrutement des testeurs

> 12 testeurs recrutés via une communauté de développeurs Android dédiée au beta-test. Pour pallier l'absence de capteur physique, j'ai mis à disposition un simulateur web et un plan de test détaillé sur https://xamiot.com/test-android (BLE, notifications FCM, règles d'alerte).

**276 / 300 caractères**

### 2. Recueil des retours

> Retours centralisés via une application interne dédiée au feedback testeurs (vs emails dispersés), permettant relances individuelles. Le portail client (https://portail.xamiot.com/support) reste disponible pour les remontées techniques.

**240 caractères**

### 3. Engagement des testeurs

> Engagement stimulé via 3 leviers : plan de test public (https://xamiot.com/test-android), simulateur web pour testeurs sans capteur physique, et app interne de feedback. Relances individuelles régulières. La plupart des testeurs sont restés actifs sur les 14 jours, retours qualitatifs collectés.

**297 / 300 caractères**

### 4. Résumé des commentaires + méthode de collecte

> Recueillis via une app interne dédiée au feedback testeurs et le portail support (https://portail.xamiot.com/support). Retours majoritairement positifs : aucun bug bloquant, suggestions ergonomiques mineures (libellés, UX) et demandes de nouvelles fonctionnalités versées au backlog 1.3+.

**290 / 300 caractères**

### 5. Modifications apportées suite au test fermé

> Build versionCode=3 conservé sur toute la durée du test : la version publiée est strictement identique à celle validée par les testeurs. Aucun bug bloquant détecté. Retours non bloquants (suggestions UX, demandes fonctionnelles) versés au backlog produit pour traitement dans les versions ultérieures.

**294 / 300 caractères**

### 6. Décision de mise en production

> Décision basée sur 4 critères : (1) aucun bug bloquant sur 14 jours de test, (2) chemins critiques validés (enrôlement BLE, FCM, règles d'alerte), (3) retours testeurs majoritairement positifs, (4) infrastructure backend déjà opérationnelle en production avec monitoring actif.

**280 / 300 caractères**

### 7. Public cible

> Application destinée aux clients XamIoT équipés de capteurs SoundSense (détection sonore connectée). Elle leur permet d'enrôler leurs capteurs via Bluetooth, de configurer des règles d'alerte personnalisées et de recevoir des notifications en temps réel sur les événements acoustiques détectés.

**295 / 300 caractères**

### 8. Valeur ajoutée pour les utilisateurs

> L'app apporte une surveillance acoustique 24/7 sans intervention humaine : tranquillité d'esprit, réaction immédiate aux événements détectés (intrusion, bris, alarme), et gestion centralisée multi-capteurs avec règles d'alerte adaptées à chaque contexte d'usage.

**257 / 300 caractères**

---

## Notes de version (release production 1.2.0)

### Français
> Première version publique de XamIoT SoundSense : surveillance acoustique connectée — enrôlement Bluetooth, alertes en temps réel, gestion multi-capteurs.

**152 / 500 caractères**

### English
> Initial public release of XamIoT SoundSense: connected acoustic monitoring — Bluetooth onboarding, real-time alerts, multi-sensor management.

**142 / 500 caractères**

---

## Navigation Play Console — chemins utiles (version 2026)

| Section recherchée | Chemin |
|---|---|
| Accès à l'application (credentials testeur Google + instructions de test) | **Surveiller et améliorer** → **Règles et programmes** → **Contenu de l'application** → onglet **"Traitée"** → faire défiler la liste des 10 déclarations → ligne **"Accès à l'application"** → bouton **"Gérer"**. Chemin alternatif via le **Tableau de bord** (encadré "Configurer votre application" en bas, utile si l'interface évolue). |
| Sécurité des données | **Surveiller et améliorer** → **Règles et programmes** → **Contenu de l'application** → "Sécurité des données" |
| Fiche du Store (description, captures, icône) | **Accroître le nombre d'utilisateurs** → **Présence sur Google Play** → **Fiche principale du Store** |
| Tests fermés (track alpha) | **Tester et publier** → **Tests** → **Tests fermés** → canal `alpha` |
| Production | **Tester et publier** → **Production** |
| Demander à publier en production | **Tableau de bord** → bouton "Demander à publier en production" |
| Paramètres avancés | **Tester et publier** → **Paramètres avancés** (onglets : Disponibilité, Facteurs de forme, etc. — ne contient PAS "Accès à l'application") |

---

## Compte testeur Google Play

- **Identifiant** : `android1@xamiot.com`
- **Mot de passe** : stocké hors repo (gestionnaire de mots de passe)
- **Synchronisation requise** : si modification du mot de passe dans la Play Console, synchroniser côté backend XamIoT (admin → utilisateurs) — sinon Google ne pourra pas se connecter et la review échouera.

> ⚠️ Le mot de passe saisi dans la Play Console est masqué en lecture (`••••••••`) — non récupérable. En cas de perte, le seul recours est de définir un nouveau mot de passe et de le synchroniser des deux côtés.

---

## Promotion build alpha → production

⚠️ **Ne pas réuploader un nouveau AAB pour la production.** Utiliser le bouton **"Promouvoir la version"** depuis le track alpha vers la production. Cela garantit à Google que le bytecode publié est strictement identique à celui testé pendant 14 jours (le `versionCode=3` reste inchangé).

---

## Délais de revue

- **Réponse Google au questionnaire de revue** : généralement 2 à 7 jours, jusqu'à 14 jours.
- **Première revue d'app en production** : 1 à 7 jours supplémentaires une fois la version soumise.

---

## Liens utiles

- Plan de test public : https://xamiot.com/test-android
- Portail client (support) : https://portail.xamiot.com/support
- Repo GitHub : https://github.com/retorik/XamIoT_V2

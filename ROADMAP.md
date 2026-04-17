# ROADMAP — XamIoT v2

## En cours

_(rien en cours)_

## Prévu

- Intégration Stripe live (connexion compte Stripe, webhooks prod)
- Emails transactionnels (confirmation commande, expédition, facture)
- Gestion stock automatique (décrément à la commande, alerte seuil bas)
- Dashboard portail client (suivi commandes enrichi, tracking colis)
- Intégration HumanSensor (HLK-LD2410C) — firmware v2 (`ESP32-C3-HumanSensor_v2/`), migration DB 048, modification filtre BLE apps iOS/Android

## Backlog

- Multi-devises (EUR, USD, GBP)
- Système de coupons/promotions
- Facturation PDF automatique
- App mobile : consultation commandes
- Analytics boutique (conversion, panier moyen)
- Apps iOS/Android : badge "Démo" sur le device simulé (champ `is_simulated` déjà retourné par l'API)

## Réalisé

### 2026-04-17
- Audit firmware HLK-LD2410C : `ESP32-C3-HumanSensor/_docs/2026-04-10_audit_firmware_hlk_ld2410c.md`
- Cahier des charges intégration XamIoT (v2, basé sur lecture code réel) : `ESP32-C3-HumanSensor/_docs/2026-04-15_cahier_charges_integration_xamiot_v2.md`
- Dossier `ESP32-C3-HumanSensor_v2/` créé — structure PlatformIO, README checklist d'implémentation complète
- Déploiement simulateur SoundSense sur PROD (ecrimoi.com) — migrations 046+047 appliquées, API + portail rebuildés

### 2026-04-10
- Simulateur SoundSense : création automatique d'un capteur démo à l'inscription (DEV uniquement)
  - DB : colonne `is_simulated` + index (migration 046), association type SoundSense (migration 047)
  - API : `POST /esp-devices/:id/simulate` et `/simulate/reset`, pipeline alertes complet (`evaluateAlertRules`)
  - Portail client : badge "Démo", couleurs violettes, panneau simulateur (slider + boutons)
  - Suppression compte : lien sur la page login, rate limit dédié (`deletionLimiter` 5 req/h), config back-office
- Audit simulateur : `docs/audits/2026-04-10_audit_simulateur_device_xamiot.md`

### 2026-04-06
- Portail client : internationalisation complète (FR/EN/ES) — toutes les pages (devices, device detail, notifications, alertes, support, commandes, adresses)
- Portail client : page de login traduite (FR/EN/ES) + sélecteur de langue visible dès la connexion
- Portail client : correction bug langue — changement de langue mis à jour immédiatement sans rechargement (event `langchange`)
- Back-office : StyleEditor — ajout couleurs "Texte normal" et "Texte au survol" dans les couleurs de marque
- Back-office : correction bug duplication pages CMS — le contenu (translations[]) est maintenant copié correctement

### 2026-04-03
- Refonte complète boutique : auth site, panier, checkout avec adresses, pays ISO 3166-1, calcul frais/taxes dynamique
- Back-office : gestion pays & livraison, picker média produits
- Portail client nettoyé (suivi uniquement, plus de boutique)
- Tests unitaires : validation adresses, calcul frais, logique panier (37 tests)
- Monorepo GitHub initialisé (retorik/XamIoT_V2)

### 2026-04-02
- Firmware ESP32-C3 v2.2.5 : fix WDT, BLE enrollment, suppression valeurs MQTT par défaut
- Back-office : renommer trames MQTT, cache nginx
- API : rules engine, audit middleware, Stripe lazy-init

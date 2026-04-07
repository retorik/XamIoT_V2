# ROADMAP — XamIoT v2

## En cours

_(rien en cours)_

## Prévu

- Intégration Stripe live (connexion compte Stripe, webhooks prod)
- Emails transactionnels (confirmation commande, expédition, facture)
- Gestion stock automatique (décrément à la commande, alerte seuil bas)
- Dashboard portail client (suivi commandes enrichi, tracking colis)

## Backlog

- Multi-devises (EUR, USD, GBP)
- Système de coupons/promotions
- Facturation PDF automatique
- App mobile : consultation commandes
- Analytics boutique (conversion, panier moyen)

## Réalisé

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

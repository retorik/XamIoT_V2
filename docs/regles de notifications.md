# Règles de notifications — Audit et implémentation

> Document rédigé lors de la session d'implémentation (2026-04-05)

---

## 1. Architecture — 4 systèmes indépendants

La gestion des notifications XamIoT est organisée en **4 systèmes totalement séparés**, sans aucune dépendance entre eux.

| Système | Nom | Déclencheur | Table(s) DB | Fichier(s) |
|---------|-----|------------|------------|-----------|
| **1** | Règles périphériques | Seuil MQTT (utilisateur) | `alert_rules`, `alert_state`, `alert_log` | `mqttWorker.js` |
| **2** | Notifications transactionnelles | Événements métier | `auto_notif_templates`, `auto_notif_log` | `notifDispatcher.js` |
| **3** | Règles système | Capteur seuil / perte connexion | `sys_notif_rules`, `sys_notif_conditions`, `sys_notif_state`, `sys_notif_log` | `sysNotifEngine.js` |
| **4** | Notifications planifiées | Date/heure, récurrence | `scheduled_notifs` | `scheduledNotifWorker.js` |

> ⚠️ **Règle absolue** : Le Système 1 (alert_rules/alert_log) est la propriété des utilisateurs finaux et ne doit **jamais** être modifié par les systèmes 2, 3 ou 4.

---

## 2. Système 1 — Règles périphériques utilisateur (inchangé)

**Déjà existant avant cette session. NON MODIFIÉ.**

- Configuré par l'utilisateur final depuis les apps iOS/Android
- Évalué dans `mqttWorker.js` à chaque message MQTT
- Notifications push uniquement (APNS + FCM)
- Tables : `alert_rules`, `alert_state`, `alert_log`

---

## 3. Système 2 — Notifications transactionnelles automatiques

### Principe

Chaque événement métier déclenche un `dispatch(eventKey, userId, vars, opts)` qui :
1. Charge le template depuis `auto_notif_templates` (clé primaire = `event_key`)
2. Substitue les variables `{variable}` dans les templates
3. Envoie push (APNS/FCM) et/ou email selon les canaux activés
4. Logue le résultat dans `auto_notif_log`

**Ne jette jamais d'exception** — les erreurs sont loggées, l'appel `.catch(() => {})` protège le flux métier.

### Événements configurés (18 au total)

| event_key | Déclencheur | Variables disponibles |
|-----------|------------|----------------------|
| `account_created` | Inscription | `{first_name}` `{last_name}` `{email}` `{activation_url}` |
| `account_activated` | Activation compte | `{first_name}` `{email}` `{login_url}` |
| `password_reset` | Demande reset MDP | `{first_name}` `{email}` `{reset_url}` `{expires_in}` |
| `password_changed` | MDP modifié | `{first_name}` `{email}` |
| `mobile_enrolled` | Nouveau mobile enrôlé | `{first_name}` `{device_name}` `{platform}` `{model}` `{app_version}` |
| `esp_enrolled` | Nouveau périphérique IoT enrôlé | `{first_name}` `{esp_name}` `{esp_uid}` |
| `order_confirmed` | Commande payée (Stripe webhook) | `{first_name}` `{order_num}` `{total}` `{items_count}` |
| `order_status_changed` | Changement statut commande | `{first_name}` `{order_num}` `{total}` `{status_from}` `{status_to}` |
| `order_shipped` | Commande expédiée | `{first_name}` `{order_num}` `{tracking_number}` `{carrier}` |
| `ticket_created` | Nouveau ticket support | `{ticket_id}` `{subject}` `{category}` (→ admins) |
| `ticket_replied_by_admin` | Réponse admin au ticket | `{ticket_id}` `{subject}` `{body_preview}` |
| `ticket_status_changed` | Changement statut ticket | `{ticket_id}` `{subject}` `{status_to}` |
| `rma_created` | Nouvelle demande RMA | `{rma_id}` `{product_sku}` `{reason}` |
| `rma_status_changed` | Changement statut RMA | `{rma_id}` `{product_sku}` `{status_to}` |
| `ota_available` | Nouveau firmware OTA créé | `{version}` `{name}` `{description}` (→ admins) |
| `ota_triggered` | OTA déclenché sur un device | `{version}` `{esp_name}` |
| `ota_success` | OTA réussi | `{esp_name}` `{version}` |
| `ota_failed` | OTA échoué (abandon final) | `{esp_name}` `{version}` `{error}` |

### Points de dispatch dans le code

| Fichier | Événement | Ligne approximative |
|---------|-----------|---------------------|
| `auth.js` | `account_created`, `account_activated`, `password_reset`, `password_changed` | signup(), activate(), requestPasswordReset(), resetPasswordWithToken() |
| `app.js` | `mobile_enrolled`, `esp_enrolled` | POST /devices, POST /esp-devices |
| `ordersRouter.js` | `order_confirmed`, `order_status_changed`, `order_shipped` | Stripe webhook, PATCH /admin/orders/:id |
| `ticketsRouter.js` | `ticket_created`, `ticket_replied_by_admin`, `ticket_status_changed`, `rma_created`, `rma_status_changed` | Routes tickets et RMA |
| `adminRoutes.js` | `ota_available`, `ota_triggered` | POST /admin/ota, POST /admin/ota/:id/trigger |
| `mqttWorker.js` | `ota_success`, `ota_failed` | Traitement topic `devices/*/ota/status` |

### Gestion adminOnly

Certains événements notifient les admins (pas les utilisateurs) :
- `ticket_created` → admins
- `ota_available` → admins
- `rma_created` → admins ET utilisateur (deux dispatch)

Le paramètre `adminOnly: true` dans `opts` active la résolution des destinataires admin.

### Administration UI

**Back-office → Notifications → Envoi auto → Templates auto**

Chaque template peut être :
- Activé/désactivé canal par canal (push, email)
- Personnalisé : titre push, corps push, sujet email, corps email (éditeur TipTap)

---

## 4. Système 3 — Règles système (admin)

### Principe

Règles configurées par l'admin pour déclencher des notifications sur :
- **sensor_threshold** : seuil sur un champ du payload MQTT, avec conditions ET/OU
- **device_offline** : device silencieux depuis N secondes
- **device_online** : device revenu en ligne
- **device_silence** : variante de offline avec label différent

### Flux d'évaluation

```
Message MQTT reçu
  └─► mqttWorker.js
        ├─► onDeviceActivity() → sysNotifEngine.js  (retour en ligne ?)
        └─► evaluateSensorRules() → sysNotifEngine.js  (seuils capteur)

Cron toutes les 60s (app.js)
  └─► checkOfflineDevices() → sysNotifEngine.js  (hors-ligne / silence)
```

### Structure des conditions

```json
{
  "trigger_type": "sensor_threshold",
  "logic_op": "AND",
  "conditions": [
    { "field": "soundPct", "op": ">", "threshold_num": 80 },
    { "field": "temp", "op": ">=", "threshold_num": 30 }
  ]
}
```

Opérateurs disponibles : `>`, `>=`, `<`, `<=`, `==`, `!=`, `contains`, `notcontains`

### Cooldown anti-spam

- Paramètre `cooldown_sec` par règle (défaut 300s)
- État stocké dans `sys_notif_state` (par règle × device)
- Pour offline : une seule notification par transition online→offline (puis cooldown pour ré-notification)

### Variables template disponibles

```
{device_name}  {esp_uid}  {rule_name}  {trigger_label}  {silent_minutes}  {threshold_minutes}
+ tous les champs du payload MQTT (ex: {soundPct}, {temp})
```

### Administration UI

**Back-office → Notifications → Envoi auto → Règles système**

---

## 5. Système 4 — Notifications planifiées

### Principe

L'admin planifie une notification push et/ou email pour :
- Une date/heure fixe (unique)
- Une récurrence (daily, weekly, monthly) avec date de fin optionnelle

### Ciblage des destinataires

Filtres cumulables :
- `filter_user_ids` : liste explicite d'UUIDs utilisateurs
- `filter_device_type_id` : utilisateurs possédant un device de ce type
- `filter_mobile_platform` : `iOS` | `Android` | tous
- `filter_has_push` : uniquement les utilisateurs avec token push actif

### Exécution

Worker `runScheduledNotifs()` appelé toutes les 60 secondes depuis `app.js`. Max 20 notifications exécutées par tick (anti-saturation).

### Cycle de vie d'une notification

```
pending → sent (envoi réussi, pas de récurrence)
pending → pending (récurrence, next_run_at recalculé)
pending → error (erreur d'envoi)
pending → cancelled (annulation manuelle)
```

### Administration UI

**Back-office → Notifications → Envoi auto → Planifiés**

Éditeur email riche (TipTap) pour `email_html`.

---

## 6. Infrastructure de notification

### Canaux disponibles

| Canal | Fichier | Description |
|-------|---------|-------------|
| Push iOS | `apns.js` | HTTP/2 + JWT ES256, tokens APNS |
| Push Android | `fcm.js` | Firebase Admin SDK |
| Email | `smtp.js` | Nodemailer, configurable via env |

### Gestion des tokens invalides

Quand APNS retourne 410 (token expiré) ou 400/BadDeviceToken, ou quand FCM signale `disableDevice`, la colonne `is_active` du device est automatiquement mise à `false` — il ne recevra plus de push jusqu'à reconnexion de l'app.

### Logging

Chaque tentative d'envoi est loguée :
- `auto_notif_log` : Système 2 (événements transactionnels)
- `sys_notif_log` : Système 3 (règles système)

Journaux consultables depuis le back-office → Notifications → Envoi auto → Journaux.

---

## 7. Migrations DB

| Migration | Contenu |
|-----------|---------|
| `037_auto_notif.sql` | `auto_notif_templates` (18 seeds) + `auto_notif_log` |
| `038_sys_notif.sql` | `sys_notif_rules` + `sys_notif_conditions` + `sys_notif_state` + `sys_notif_log` |
| `039_scheduled_notifs.sql` | `scheduled_notifs` |

---

## 8. Routes API

Toutes les routes admin sont protégées par `requireAuth` + `requireAdmin`.

### Système 2 — Templates

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/admin/notif/auto-templates` | Liste tous les templates |
| GET | `/admin/notif/auto-templates/:event_key` | Détail |
| PATCH | `/admin/notif/auto-templates/:event_key` | Mise à jour |
| GET | `/admin/notif/auto-log` | Journal (paginé, filtrable) |

### Système 3 — Règles système

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/admin/notif/sys-rules` | Liste (avec conditions) |
| GET | `/admin/notif/sys-rules/:id` | Détail |
| POST | `/admin/notif/sys-rules` | Créer |
| PATCH | `/admin/notif/sys-rules/:id` | Modifier + remplacer conditions |
| DELETE | `/admin/notif/sys-rules/:id` | Supprimer |
| GET | `/admin/notif/sys-log` | Journal (paginé, filtrable) |

### Système 4 — Planifiées

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/admin/notif/scheduled` | Liste |
| GET | `/admin/notif/scheduled/:id` | Détail |
| POST | `/admin/notif/scheduled` | Créer |
| PATCH | `/admin/notif/scheduled/:id` | Modifier |
| DELETE | `/admin/notif/scheduled/:id` | Supprimer |
| POST | `/admin/notif/scheduled/:id/cancel` | Annuler |

---

## 9. Variables d'environnement requises

| Variable | Système | Description |
|----------|---------|-------------|
| `JWT_SECRET` | Auth | Clé de signature JWT |
| `SMTP_*` | 2, 4 | Configuration SMTP (voir smtp.js) |
| `APNS_*` | 2, 3, 4 | Configuration APNS iOS |
| `FCM_*` | 2, 3, 4 | Configuration FCM Android |

---

## 10. Décisions d'architecture

### Pourquoi 4 systèmes séparés ?

Le Système 1 (alert_rules) est utilisateur et ne doit pas être contrôlé par l'admin. Les trois autres systèmes sont admin-only et ont des déclencheurs fondamentalement différents (événement métier vs. condition capteur vs. date).

### Pourquoi ne pas réutiliser alert_rules pour les règles système ?

`alert_rules` est lié 1:1 à un `esp_id` et appartient à l'utilisateur. Les `sys_notif_rules` peuvent cibler N devices (par type) et sont gérées par l'admin. Les logiques de cooldown et de logging sont différentes.

### Pourquoi `ruleMatches` est-il inline dans sysNotifEngine.js ?

Pour éviter la dépendance circulaire : `mqttWorker.js` importe `sysNotifEngine.js`, qui ne peut donc pas importer `mqttWorker.js`. La fonction est courte et stable.

### Comportement de `dispatch()` si le template n'existe pas

`dispatch()` log "Pas de template pour X — skip" et retourne silencieusement. Aucune exception ne remonte.

---

*Document généré lors de la session de développement du 2026-04-05*

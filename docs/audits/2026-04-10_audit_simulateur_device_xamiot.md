# Audit de faisabilité — Simulateur de device XamIoT

**Date** : 2026-04-10  
**Auteur** : Audit automatisé Claude Sonnet 4.6  
**Périmètre** : Lecture seule — aucun fichier applicatif modifié  
**Objectif** : Évaluer la faisabilité d'un device simulé créé automatiquement au signup, visible dans les apps mobiles et le portail client, pilotable uniquement par API.

---

## 1. Résumé exécutif

Le concept de "simulateur de device" est **faisable techniquement** sans réécriture majeure du backend. La table `esp_devices` existante peut accueillir un device simulé avec un minimum d'adaptations. La logique de signup actuelle est simple et sans transaction — y injecter la création du device simulé est possible mais requiert d'être soigneux sur la gestion des erreurs (ne pas bloquer l'inscription si la création du device échoue).

Les **principaux défis** sont :
1. L'unicité de `esp_uid` est une contrainte `UNIQUE NOT NULL` en DB — le format `simxxxxxx` doit garantir cette unicité.
2. Le champ `mqtt_password_hash` est `NOT NULL` implicite dans le code de création actuel — un device simulé ne doit pas avoir de crédentiels MQTT réels.
3. Les apps iOS et Android associent le concept de "device en ligne" à `last_seen < 5 min` — un device simulé sera systématiquement affiché "hors ligne" sans injection de données.
4. Le portail client et les apps mobiles affichent `sound_history` depuis `mqtt_raw_logs` — un device simulé ne génèrera aucune donnée sans simulation active.
5. Aucune colonne `is_simulated` n'existe à ce jour — une migration DB est obligatoire.

**Recommandation résumée** : approche viable, mais requiert une migration DB, une adaptation du code signup, et une réflexion produit sur ce que voit l'utilisateur en l'absence de vraies données.

---

## 2. État des lieux — structure backend et modèles de données

### Table `users` (init.sql)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | uuid | PK, gen_random_uuid() |
| `email` | citext | UNIQUE NOT NULL |
| `pass_hash` | text | NOT NULL |
| `first_name` | text | nullable |
| `last_name` | text | nullable |
| `phone` | text | nullable |
| `is_active` | boolean | DEFAULT false |
| `activated_at` | timestamptz | nullable |
| `is_admin` | boolean | DEFAULT false |
| `created_at` | timestamptz | DEFAULT now() |

### Table `esp_devices` (init.sql + migrations 003, 009, 019)

| Colonne | Type | Contrainte | Migration |
|---|---|---|---|
| `id` | uuid | PK | init |
| `user_id` | uuid | FK users ON DELETE CASCADE | init |
| `esp_uid` | text | **UNIQUE NOT NULL** | init |
| `name` | text | nullable | init |
| `topic_prefix` | text | **NOT NULL** | init |
| `mqtt_password_hash` | text | nullable | init |
| `mqtt_enabled` | boolean | DEFAULT true | init |
| `is_superuser` | boolean | DEFAULT false | init |
| `last_seen` | timestamptz | nullable | init |
| `last_db` | double precision | nullable | init |
| `created_at` | timestamptz | DEFAULT now() | init |
| `device_type_id` | uuid | FK device_types nullable | 003 |
| `fw_version` | text | nullable | 009 |

**Colonnes absentes** : `is_simulated`, `simulated_data`, `sim_mode` — aucune notion de simulation n'existe dans le schéma actuel.

### Table `alert_rules` (init.sql + migrations 012, 013)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | uuid | PK |
| `esp_id` | uuid | FK esp_devices ON DELETE CASCADE |
| `field` | text | NOT NULL |
| `op` | text | NOT NULL, CHECK enum |
| `threshold_num` | double precision | nullable |
| `threshold_str` | text | nullable |
| `enabled` | boolean | DEFAULT true |
| `cooldown_sec` | integer | DEFAULT 60 |
| `user_label` | text | nullable (migration 012) |
| `template_id` | uuid | FK alert_rule_templates nullable (012) |
| `created_at` | timestamptz | DEFAULT now() |

### Table `alert_log` (init.sql + migrations 019, 020)

| Colonne | Type | Notes |
|---|---|---|
| `id` | bigint | nextval |
| `rule_id` | uuid | FK alert_rules ON DELETE CASCADE |
| `device_id` | text | esp_uid (legacy, texte) |
| `esp_id` | uuid | FK esp_devices ON DELETE CASCADE (migration 019) |
| `sent_at` | timestamptz | NOT NULL |
| `channel` | text | - |
| `status` | text | - |
| `payload` | jsonb | - |
| `error` | text | - |

### Autres tables pertinentes

- **`device_types`** : types de devices IoT (ex: `ESP32-SoundSense`). Un device simulé pourra référencer ce type.
- **`alert_rule_templates`** : templates de règles associés à un `device_type_id`. Utilisés par les apps mobiles pour construire l'UI de création de règle. Colonne `cooldown_min_sec` (renommée depuis `cooldown_sec` en migration 011). L'opérateur `op` est nullable depuis migration 013 (c'est l'utilisateur qui le choisit).
- **`mqtt_raw_logs`** : logs bruts MQTT. Un device simulé n'en génèrera aucun sans mécanisme actif.
- **`audit_logs`** : journal d'actions. Toute création de device simulé devrait y être tracée.

---

## 3. Logique de signup — où se passe la création utilisateur

### Flux actuel (`src/auth.js`, fonction `signup`)

```
POST /auth/signup (app.js:162)
  → authLimiter (rate limiting)
  → validation email + password
  → signup(email, password, firstName, lastName, phone)
      → argon2.hash(password)
      → INSERT INTO users ... RETURNING id, email
      → activationToken(user)
      → dispatch('account_created', ...) [async, non-bloquant]
  → audit_logs INSERT [async, non-bloquant via .catch()]
  → res.status(201).json({ ok, user_id, email_sent, activation_url })
```

**Points clés** :
- **Aucune transaction SQL** dans le signup — l'insertion utilisateur est une requête autonome.
- **Aucun hook post-signup** — il n'existe pas de mécanisme d'extension prévu (pas de hook, pas d'event system).
- Le `dispatch('account_created')` est un appel `.catch(() => {})` — il ne bloque pas et n'interrompt pas le signup si la notification échoue.
- Le compte est créé avec `is_active = false` — l'utilisateur doit activer son compte par email avant de pouvoir se connecter.

**Conséquence pour le simulateur** : la création du device simulé devra être injectée **après** l'INSERT utilisateur, avec la même philosophie non-bloquante (un échec de création du device simulé ne doit pas faire échouer l'inscription).

### Fonction `activate` (`src/auth.js`)

L'activation passe `is_active = true`. C'est un moment alternatif possible pour créer le device simulé (à l'activation plutôt qu'à l'inscription). L'avantage : l'`user_id` est confirmé actif. L'inconvénient : l'utilisateur peut voir l'app sans device si l'activation tarde.

---

## 4. Logique de création d'un ESP/device — champs obligatoires réels

### Via `POST /esp-devices` (app.js:472)

**Champs obligatoires côté API** :
- `esp_uid` : obligatoire, UNIQUE
- `topic_prefix` : obligatoire
- `mqtt_password` : obligatoire pour un **nouveau** device (non existant)

**Champs optionnels** :
- `name` : peut être null → affiche `esp_uid` par défaut dans les apps

**Insert SQL effectif** :
```sql
INSERT INTO esp_devices(user_id, esp_uid, name, topic_prefix, mqtt_password_hash, mqtt_enabled)
VALUES($1, $2, $3, $4, $5, true)
RETURNING id, esp_uid, name, topic_prefix, last_seen, last_db
```

**Colonnes non définies à la création** : `last_seen` (null), `last_db` (null), `device_type_id` (null → assigné par `mqttWorker` au premier message MQTT), `fw_version` (null).

### Device simulé — contraintes spécifiques

Pour créer un device simulé en contournant la validation API :
- `esp_uid` : format `simxxxxxx` — générer avec `crypto.randomBytes(3).toString('hex')` → `sim` + 6 hex = 9 chars, ex: `simfa3c19`. Garantit l'unicité.
- `topic_prefix` : peut être une valeur fictive, ex: `sim/fa3c19`.
- `mqtt_password_hash` : **⚠️ la colonne est nullable en DB** mais le code API exige `mqtt_password` pour tout nouveau device. Un device simulé créé directement en DB (ou via une fonction interne) peut avoir `mqtt_password_hash = NULL` et `mqtt_enabled = false`.
- `device_type_id` : peut référencer le type `ESP32-SoundSense` existant pour bénéficier des templates de règles.

---

## 5. Faisabilité du simulateur — analyse

### Device sans MQTT réel — possible ?

**Oui.** La table `esp_devices` ne requiert pas de connexion MQTT active. `last_seen` et `last_db` sont nullable. Le device existe en DB et est retourné par `GET /esp-devices` sans condition sur l'activité MQTT.

Le champ `mqtt_enabled` peut être mis à `false` pour indiquer qu'aucune connexion MQTT ne doit être attendue. `mqtt_password_hash` peut être `NULL` (la colonne l'accepte en DB, même si le code API l'exige pour les enrollements normaux).

### Nommage `simxxxxxx`

Le format est viable. Générer 3 bytes aléatoires en hex donne 6 caractères (`000000` à `ffffff`), soit 16 millions de combinaisons possibles. Suffisant. Le préfixe `sim` permet une identification facile en DB.

**⚠️ Point à vérifier** : aucune contrainte CHECK ou pattern n'existe sur `esp_uid` — le format `simxxxxxx` est une convention applicative, pas une contrainte DB. Il faudra s'assurer que les utilisateurs ne peuvent pas créer manuellement un device avec ce préfixe via l'app mobile (risque de collision avec un device simulé d'un autre user).

### Stockage du caractère simulé

Il n'existe **aucune colonne** permettant de distinguer un device simulé d'un device réel. C'est le **point bloquant n°1** : une migration est obligatoire, quelle que soit l'option architecturale choisie.

---

## 6. Options d'architecture

### Option A — Flag `is_simulated` sur `esp_devices`

Ajouter une colonne `is_simulated BOOLEAN DEFAULT false` à `esp_devices`.

**Avantages** :
- Migration minimale (1 colonne).
- Transparent pour tout le code existant (DEFAULT false).
- Facile à filtrer côté API et portail.
- Permet d'identifier les devices simulés dans les statistiques admin.

**Inconvénients** :
- Le device simulé partage exactement la même structure qu'un device réel — risque de confusion si une donnée fictive se retrouve dans `last_db`.
- Impossible d'empêcher facilement que des règles d'alerte simulées déclenchent de vraies notifications push si le worker MQTT analyse les données simulées.
- Demande un filtrage explicite dans chaque requête qui ne doit pas traiter les devices simulés comme des devices réels (OTA, MQTT broker, stats).

**Complexité** : faible (backend) / faible (mobile et portail si le flag est exposé dans l'API).

**Recommandée comme point de départ.**

---

### Option B — Type de device distinct (`device_type_id` → type "Simulé")

Créer un type `ESP32-Simulator` dans `device_types` et l'assigner aux devices simulés.

**Avantages** :
- Réutilise l'infrastructure existante de `device_types`.
- L'UI des apps mobiles (qui utilise `/esp-devices/:id/meta`) recevrait automatiquement des templates de règles adaptés au simulateur.
- Permet de définir des champs simulés via `mqtt_frame_fields` sans modifier la structure principale.

**Inconvénients** :
- Le type de device ne distingue pas "simulé" de "réel" — un device réel pourrait se voir assigner le type "Simulateur" par erreur.
- Ne résout pas le problème de distinction logique entre device simulé et device réel.
- Ne dispense pas d'une colonne `is_simulated` ou équivalent.

**Complexité** : moyenne (nécessite quand même un flag ou un pattern sur `esp_uid`).

---

### Option C — Couche séparée (table dédiée `simulated_devices`)

Créer une table `simulated_devices` distincte de `esp_devices`.

**Avantages** :
- Isolation complète des données simulées.
- Pas de risque de pollution des vraies données.
- Peut avoir une structure optimisée (pas de `mqtt_password_hash`, pas de `topic_prefix`).

**Inconvénients** :
- Rupture totale avec l'architecture existante.
- Toutes les requêtes API utilisant `esp_devices` devront être dupliquées ou refactorisées (UNION ou routage conditionnel).
- Les apps mobiles et le portail utilisent le même endpoint `/esp-devices` — il faudrait soit unifier les résultats via une vue SQL, soit modifier les apps.
- Coût de maintenance élevé : deux tables à synchroniser si le schéma évolue.

**Complexité** : élevée. Déconseillée.

---

### Option D — Flag `esp_uid` préfixé comme convention implicite (sans migration)

Pas de colonne supplémentaire : le préfixe `sim` dans `esp_uid` identifie le device simulé.

**Avantages** :
- Aucune migration.
- Fonctionne immédiatement.

**Inconvénients** :
- Fragilité : une simple requête `SELECT * FROM esp_devices WHERE esp_uid LIKE 'sim%'` est une convention non garantie.
- Risque qu'un vrai device ait un `esp_uid` commençant par `sim` (peu probable mais non exclu).
- Impossible à documenter proprement en schéma DB.
- Difficile à exposer dans les APIs (le flag `is_simulated` doit être calculé à la volée).

**Complexité** : nulle en DB, mais technique debt élevée. Déconseillée pour une feature pérenne.

---

### Recommandation architecturale

**Option A (flag `is_simulated`) + type `ESP32-Simulator` (Option B)** combinées :
- 1 colonne `is_simulated BOOLEAN DEFAULT false` sur `esp_devices`.
- 1 entrée dans `device_types` pour "ESP32-Simulator" avec ses propres templates de règles.
- Les deux informations sont complémentaires : le flag garantit l'identification logique, le type donne accès aux métadonnées pour les apps mobiles.

---

## 7. Analyse code détaillée — où injecter la création auto

### Point d'injection recommandé

**Dans `src/auth.js`, fonction `signup`**, après l'INSERT utilisateur :

```javascript
// Après : const user = rows[0];
// Ajouter (non-bloquant) :
createSimulatedDevice(user.id).catch(err => 
  console.error('[SIMULATOR] Échec création device simulé:', err.message)
);
```

La fonction `createSimulatedDevice` serait une nouvelle fonction dans un fichier dédié (`src/simulatorService.js`) :
- Génère un `esp_uid` de type `simxxxxxx` (unique via vérification ou UUIDv4 tronqué).
- Insère dans `esp_devices` avec `is_simulated=true`, `mqtt_enabled=false`, `mqtt_password_hash=null`, `device_type_id` → type "ESP32-Simulator".
- Crée la règle d'alerte par défaut.
- Insère dans `audit_logs`.

**⚠️ Attention** : le `user_id` est disponible immédiatement après l'INSERT, mais le compte n'est pas encore activé (`is_active=false`). Le device sera visible dès la connexion de l'utilisateur, après activation.

### Champs minimaux pour l'app mobile (iOS et Android)

L'app iOS (`APIClient.swift`, `DeviceDTO`) attend :
- `id` : string UUID
- `esp_uid` : string
- `name` : string (optionnel, fallback sur `esp_uid`)
- `topic_prefix` : string
- `last_seen` : string ISO8601 nullable
- `last_db` : Double nullable
- `sound_history` : `[Double]` (peut être `[]`)

L'app Android (`DeviceDTO.kt`) attend les mêmes champs. Le simulateur fonctionnera avec `last_seen=null`, `last_db=null`, `sound_history=[]`.

**⚠️ Point à vérifier** : `isOnline()` sur Android retourne `false` si `lastSeen == null`. Le device simulé sera donc toujours affiché "hors ligne" dans les apps. C'est acceptable pour un MVP mais peut nuire à l'expérience utilisateur.

### Champs minimaux pour le portail client

`GET /esp-devices` retourne : `id`, `esp_uid`, `name`, `topic_prefix`, `last_seen`, `last_db`, `sound_history` (calculé depuis `mqtt_raw_logs`).

Le portail affiche :
- Nom du device ou `esp_uid`.
- `last_seen` formaté.
- `last_db` via `LevelBadge`.
- `sound_history` via `MiniSparkline` (affiche `—` si vide).

Un device simulé sans aucune donnée affichera un nom, une sparkline vide et aucune activité — acceptable mais vide.

---

## 8. Données simulées — quelles données minimales pour que les écrans aient quelque chose à afficher

### Mode statique (MVP)
Aucune donnée injectée. Le device simulé apparaît dans la liste avec son nom, une sparkline vide, `last_seen` null. L'utilisateur voit qu'il existe un device mais qu'il n'a pas encore de données. Adapté pour démontrer la navigation dans l'app.

### Mode manuel (via API)
Un endpoint `POST /esp-devices/:id/simulate` permettrait d'injecter une mesure fictive dans `mqtt_raw_logs` sans passer par MQTT. Cela alimenterait `sound_history` et mettrait à jour `last_db` et `last_seen`.

### Mode automatique (cron/timer)
Un worker côté API génèrerait périodiquement des mesures pour les devices simulés. Complexité élevée, hors scope MVP.

**Valeurs minimales utiles pour un MVP statique** :
- `last_db` : une valeur fixe (ex: 42) pour que le portail affiche un badge coloré.
- `last_seen` : `now()` à la création pour que le device apparaisse "en ligne" pendant 5 minutes après la création.
- `sound_history` : laisser vide (`[]`) — les écrans le gèrent proprement.

**⚠️ Point à vérifier** : si `last_seen` est mis à `now()` à la création, le device sera "en ligne" pendant 5 minutes puis basculera "hors ligne" — risque de confusion si l'utilisateur ouvre l'app pendant ce laps de temps.

---

## 9. Règle d'alerte par défaut

### Moment de création
La règle par défaut doit être créée **en même temps que le device simulé**, dans la même transaction ou le même bloc non-bloquant.

### Paramètres recommandés

Sur la base des templates existants (`006_rule_templates.sql`) pour `ESP32-SoundSense` :

| Paramètre | Valeur suggérée |
|---|---|
| `field` | `soundPct` |
| `op` | `>` |
| `threshold_num` | `70` |
| `cooldown_sec` | `60` |
| `enabled` | `true` |
| `user_label` | `Alerte bruit élevé (démo)` |
| `template_id` | ID du template "Bruit élevé" si disponible |

### Unicité
Il n'existe pas de mécanisme d'unicité des règles (aucun `UNIQUE` sur `esp_id + field + op`). Aucune contrainte DB n'empêche la création de plusieurs règles identiques. La règle "par défaut" est une règle normale — elle peut être supprimée ou modifiée par l'utilisateur.

**⚠️ Point à vérifier** : si le signup est appelé plusieurs fois (bug ou retry), le device simulé et sa règle seraient créés plusieurs fois. Un mécanisme de déduplication (ex: vérifier si l'utilisateur a déjà un device simulé avant d'en créer un) est nécessaire.

### Distinction avec les règles utilisateur
Il n'existe pas de colonne permettant de distinguer une règle "système/défaut" d'une règle créée par l'utilisateur. Si une telle distinction est souhaitée, une colonne `is_default BOOLEAN DEFAULT false` sur `alert_rules` serait nécessaire.

---

## 10. Impacts UX/produit

### Ce que voit un nouvel utilisateur (premier login après activation)

1. Dashboard : 1 capteur IoT affiché ("Mon capteur de démo" ou similaire), sparkline vide, badge de niveau (si `last_db` est pré-rempli).
2. Liste des devices : 1 device simulé visible, affiché comme hors ligne (si `last_seen = null`).
3. Détail du device : 1 règle d'alerte par défaut visible, possibilité de la modifier ou supprimer.

**Risque** : l'utilisateur peut confondre le device simulé avec un vrai device et tenter de l'assigner à un capteur physique via BLE → le workflow d'enrollment échouera ou créera un conflit.

**Mitigation** : afficher un badge visuel "Démo" sur le device simulé dans les apps et le portail.

### Ce que voit un ancien utilisateur (migration)

Les utilisateurs existants n'auront pas de device simulé (la création auto est au signup). Pas d'impact sur les comptes existants.

### Risque de confusion

- Un utilisateur peut supprimer le device simulé (l'API le permet, `DELETE /esp-devices/:id`). Après suppression, son compte sera vide de devices.
- Un utilisateur peut nommer son device simulé de la même façon qu'un vrai device → confusion lors de l'enrollment BLE.
- Si des alertes simulées sont générées (mode automatique), elles enverront des notifications push réelles → risque de spam.

---

## 11. Impacts sécurité et exploitation

### Abus API

Le signup est protégé par `authLimiter`. Cependant, si un attaquant crée massivement des comptes (même avec rate limiting), chaque compte créerait automatiquement un device simulé → croissance non contrôlée de `esp_devices`.

**Mitigation** : le device simulé ne consomme pas de crédentiels MQTT, donc pas d'impact sur le broker. Seul l'espace DB est concerné. Les comptes non activés (et leurs devices) pourraient être nettoyés par un job de rétention.

### Confusion données simulées / données réelles

Si `mqtt_raw_logs` contient des données simulées, elles apparaîtront dans les statistiques admin (`summary`), les graphiques du portail, et potentiellement dans les alertes. Il est impératif que les données simulées soient identifiables ou exclues des statistiques.

**Mitigation** : le flag `is_simulated` sur `esp_devices` permet de filtrer. La requête `summary` dans `adminRoutes.js` compte `esp_devices WHERE user_id IS NOT NULL` — elle comptabiliserait les devices simulés. À corriger.

### Feature flag

Il est recommandé d'ajouter une clé dans `app_config` (table existante depuis migration 022) pour activer/désactiver la création automatique du device simulé sans redéploiement. Ex: `key = 'simulator_enabled'`, `value = 'true'`.

---

## 12. Base de données — tables concernées, colonnes manquantes, migrations probables

### Migrations obligatoires

| Migration | Table | Modification |
|---|---|---|
| Migration 046 | `esp_devices` | `ADD COLUMN is_simulated BOOLEAN DEFAULT false` |
| Migration 046 | `alert_rules` | `ADD COLUMN is_default BOOLEAN DEFAULT false` (optionnel) |
| Seed | `device_types` | INSERT type `ESP32-Simulator` (si option B retenue) |
| Seed | `app_config` | INSERT `simulator_enabled = 'true'` |

### Rétrocompatibilité

- `DEFAULT false` sur `is_simulated` → aucun impact sur les devices existants.
- Aucune contrainte `NOT NULL` ajoutée → pas de risque sur les données existantes.
- Les apps mobiles ignorent les champs inconnus (DTOs stricts côté Android Kotlin, `CodingKeys` explicite côté iOS Swift) → un champ `is_simulated` non mappé sera ignoré sans erreur.

### Index recommandé

```sql
CREATE INDEX IF NOT EXISTS idx_esp_devices_simulated ON esp_devices(is_simulated) WHERE is_simulated = true;
```

Permet de filtrer rapidement les devices simulés dans les requêtes admin et les jobs de nettoyage.

---

## 13. API à prévoir — endpoints futurs pour piloter la simulation

Les endpoints suivants seraient nécessaires pour une gestion complète du simulateur (sans code de production dans ce document) :

| Endpoint | Méthode | Description |
|---|---|---|
| `GET /esp-devices?simulated=true` | Extension du filtre existant | Lister uniquement les devices simulés |
| `POST /esp-devices/:id/simulate` | Nouveau | Injecter une mesure simulée manuellement (met à jour `last_db`, `last_seen`, `mqtt_raw_logs`) |
| `POST /esp-devices/:id/reset-simulated` | Nouveau | Remettre à zéro les données simulées du device |
| `GET /admin/esp-devices?is_simulated=true` | Extension du filtre admin | Vue admin des devices simulés |
| `GET /admin/stats/simulated` | Nouveau | Statistiques séparées (simulés vs réels) |

**⚠️ Point à vérifier** : le endpoint `POST /esp-devices` actuel exige `mqtt_password`. Il faudra une route interne ou un bypass pour la création du device simulé au signup, sans exposer ce bypass via l'API publique.

---

## 14. Portail client et App mobile — impacts spécifiques par composant

### Portail client (`XamIoT_Portal_v2`)

**Page `/devices`** (`app/(portal)/devices/page.tsx`) :
- Affiche tous les devices de `GET /esp-devices` — le simulateur y apparaîtra automatiquement.
- La sparkline (`MiniSparkline`) affiche `—` si `sound_history` est vide — géré.
- `LevelBadge` affiche `—` si `last_db` est null — géré.
- Il n'existe aucun indicateur visuel pour distinguer un device simulé. **Modification nécessaire** pour afficher un badge "Démo".

**Page `/alertes`** (`app/(portal)/alertes/page.tsx`) :
- Filtre les alertes par device via `GET /esp-alerts`. Un device simulé apparaîtra dans le sélecteur.
- Si aucune alerte simulée n'est générée, le filtrage retourne une liste vide — géré.

**Dashboard** (`app/(portal)/dashboard/page.tsx`) :
- Même interface `EspDevice` que `/devices` — comportement identique.
- Le compteur "Capteurs IoT" inclura le device simulé. **Risque de confusion** si l'utilisateur pense avoir 1 vrai capteur.

### App iOS (`XamIoT_IoS_v2`)

**`DevicesListView.swift`** :
- Affiche les devices depuis `GET /esp-devices`. Le device simulé apparaîtra.
- L'enrollment BLE (`BLEManager`) sera accessible pour le device simulé — l'utilisateur pourrait tenter un enrôlement sur le device simulé → comportement non défini.
- **Modification nécessaire** : griser ou masquer le bouton d'enrollment BLE si `is_simulated = true`.

**`DeviceDetailView.swift`** :
- Charge les règles et alertes du device. Fonctionnera avec le device simulé.
- La règle par défaut sera visible et modifiable.

**`Models.swift` (`ESPDevice`)** :
- Le modèle SwiftData ne contient pas de champ `isSimulated`. **Modification nécessaire** pour stocker et afficher le flag.

### App Android (`XamIoT_Android_v2`)

**`DeviceDTO.kt`** :
- Ne contient pas de champ `isSimulated`. **Modification nécessaire**.
- `isOnline()` retourne `false` si `lastSeen == null` — le device simulé sera systématiquement hors ligne.

**`ApiService.kt`** :
- `getDevices()` retourne `List<DeviceDTO>` depuis `GET esp-devices` — le simulateur y apparaîtra automatiquement.
- `createEspDevice()` requiert `mqttPassword` — ne peut pas être utilisé pour créer un device simulé depuis l'app.

---

## 15. Stratégie de mise en œuvre future — ordre des chantiers

### Phase 1 — Infrastructure DB (prérequis)
1. Migration 046 : `ADD COLUMN is_simulated BOOLEAN DEFAULT false` sur `esp_devices`.
2. (Optionnel) `ADD COLUMN is_default BOOLEAN DEFAULT false` sur `alert_rules`.
3. Seed `device_types` : INSERT type `ESP32-Simulator`.
4. Seed `app_config` : INSERT `simulator_enabled = 'true'`.

### Phase 2 — Backend (création automatique)
5. Créer `src/simulatorService.js` avec la fonction `createSimulatedDevice(userId)`.
6. Injecter l'appel dans `src/auth.js` → fonction `signup`, après l'INSERT utilisateur.
7. Exposer `is_simulated` dans les réponses de `GET /esp-devices` et `GET /esp-devices/:id`.
8. Filtrer les devices simulés des statistiques admin (`summary`).
9. Ajouter `simulator_enabled` dans la vérification de `app_config` avant création.

### Phase 3 — Portail client
10. Ajouter un badge "Démo" sur les cards de devices simulés dans `/devices` et le dashboard.
11. Masquer ou adapter le message "Aucun appareil" si seul le device simulé existe.

### Phase 4 — Apps mobiles
12. **iOS** : ajouter `isSimulated: Bool` dans `ESPDevice` (SwiftData) et `APIClient.DeviceDTO`. Afficher un badge "Démo". Désactiver le workflow BLE pour les devices simulés.
13. **Android** : ajouter `isSimulated: Boolean` dans `DeviceDTO.kt`. Même adaptations visuelles.

### Phase 5 — Simulation de données (optionnel, post-MVP)
14. Endpoint `POST /esp-devices/:id/simulate`.
15. Worker de simulation automatique (cron côté API).

### Tests à prévoir
- Signup → vérifier création device simulé en DB.
- Signup en erreur → vérifier que l'absence du device simulé ne bloque pas l'inscription.
- Double signup → vérifier déduplication.
- Suppression utilisateur → vérifier cascade sur device simulé (FK existante).
- App mobile → vérifier affichage correct du badge "Démo".
- Portail → vérifier filtrage correct dans les alertes.

### Rollback
- La migration `is_simulated` est réversible (`DROP COLUMN IF EXISTS is_simulated`).
- Les devices simulés existants peuvent être supprimés via `DELETE FROM esp_devices WHERE is_simulated = true`.
- La feature flag `simulator_enabled = 'false'` dans `app_config` permet de désactiver sans redéploiement.

---

## 16. Conclusion décisionnelle

### Recommandation

**Le simulateur de device est techniquement faisable et recommandé** avec l'approche A+B (flag `is_simulated` + type dédié `ESP32-Simulator`).

### Points bloquants (sans lesquels l'implémentation ne peut pas démarrer)

1. **Migration DB obligatoire** : sans colonne `is_simulated`, aucune distinction fiable entre device simulé et device réel n'est possible. Migration minimale, sans risque de régression.

2. **`mqtt_password_hash` doit pouvoir être NULL** : la colonne l'accepte en DB mais le code API (`POST /esp-devices`) l'exige. La création du device simulé doit contourner la route API publique et insérer directement en DB via une fonction interne. Une route API publique sans mot de passe MQTT ne doit **pas** être créée (risque de sécurité).

3. **Données simulées vs notifications push réelles** : si la règle d'alerte par défaut est `enabled=true` sur un device simulé, et que des données simulées sont injectées ultérieurement, elles déclencheront de vraies notifications push. Soit la règle est créée avec `enabled=false`, soit le worker d'alerte doit filtrer les devices simulés.

### Prérequis techniques

- La fonction `createSimulatedDevice` doit être idempotente (ne pas créer un second device si un device simulé existe déjà pour cet utilisateur).
- Le flag `is_simulated` doit être exposé dans toutes les réponses API listant des devices.
- Les apps mobiles (iOS et Android) doivent être mises à jour pour gérer le nouveau champ.

### Complexité qualitative par bloc

| Bloc | Complexité | Risque |
|---|---|---|
| Migration DB | Faible | Très faible |
| Backend — création auto au signup | Faible | Faible (pattern non-bloquant existant) |
| Backend — filtrage simulés dans stats admin | Faible | Faible |
| Backend — endpoint simulation manuelle | Moyenne | Faible |
| Portail client — badge "Démo" | Faible | Nul |
| App iOS — champ `isSimulated` + UX | Moyenne | Faible |
| App Android — champ `isSimulated` + UX | Moyenne | Faible |
| Worker de simulation automatique | Élevée | Moyen (faux positifs alertes) |

### Ce qui est déconseillé

- Créer une route API publique `POST /esp-devices` sans mot de passe MQTT → risque de sécurité.
- Injecter `last_seen = now()` à la création sans avertir l'utilisateur → confusion "device en ligne".
- Utiliser uniquement le préfixe `esp_uid` comme identifiant (Option D) → dette technique.
- Activer la simulation automatique de données avant d'avoir filtré les devices simulés dans le worker d'alertes.

---

*Audit réalisé en lecture seule. Aucun fichier applicatif n'a été modifié.*  
*Sources consultées : migrations SQL 001–045, init.sql, migrate_full.sql, src/auth.js, src/app.js (partiel), src/adminRoutes.js (partiel), pages portail (devices, alertes, dashboard), ApiService.kt, DeviceDTO.kt, RuleDTO.kt, DeviceMetaDto.kt, CreateEspDeviceRequest.kt, APIClient.swift, Models.swift, DevicesListView.swift, DeviceDetailView.swift, SignupView.swift.*

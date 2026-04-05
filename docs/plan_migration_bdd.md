# Plan de migration BDD — XamIoT V1 (`notify`) → V2 (`xamiot_v2`)
> Rédigé le 2026-04-04

---

## 1. Résumé

| Élément | Source (V1) | Cible (V2) |
|---------|-------------|------------|
| Serveur PostgreSQL | `xamiot-postgres` (partagé) | **Même instance** |
| Base de données | `notify` | `xamiot_v2` (à créer) |
| Propriétaire | `xamiot` (superuser) | `xamiot_v2_user` (dédié, à créer) |
| Tables à migrer | 8 | 8 (avec transformations) |
| Nouvelles tables à initialiser | — | ~32 (vides ou seeded) |

**Le PostgreSQL partagé n'est pas déplacé. La base `notify` reste intacte pendant toute la migration.**

---

## 2. Schéma V1 complet (base `notify`)

### Tables et colonnes

#### `users` (21 lignes)
```
id           uuid PK
email        citext UNIQUE NOT NULL
pass_hash    text NOT NULL
created_at   timestamptz NOT NULL DEFAULT now()
is_active    boolean NOT NULL DEFAULT false
first_name   text
last_name    text
phone        text
activated_at timestamptz
is_admin     boolean NOT NULL DEFAULT false
```

#### `esp_devices` (7 lignes — dont 1 pseudo-device API)
```
id                 uuid PK
user_id            uuid FK→users ON DELETE CASCADE
esp_uid            text UNIQUE NOT NULL
name               text
topic_prefix       text NOT NULL DEFAULT ''
last_seen          timestamptz
last_db            double precision NOT NULL DEFAULT 0
mqtt_enabled       boolean NOT NULL DEFAULT true
mqtt_password_hash text
is_superuser       boolean NOT NULL DEFAULT false
```

#### `mobile_devices` (15 lignes — iOS + Android + Test)
```
id         uuid PK
user_id    uuid NOT NULL FK→users
platform   text NOT NULL DEFAULT 'iOS'   ← valeurs réelles: 'iOS', 'android', 'Test'
bundle_id  text NOT NULL
apns_token text NOT NULL UNIQUE          ← contient aussi les tokens FCM Android!
is_active  boolean NOT NULL DEFAULT true
created_at timestamptz NOT NULL DEFAULT now()
name       text
last_seen  timestamptz NOT NULL DEFAULT now()
sandbox    boolean NOT NULL DEFAULT false
```
⚠️ Colonne `apns_token` contient les tokens FCM Android (token long FCM-style).

#### `alert_rules` (6 lignes)
```
id            uuid PK
esp_id        uuid NOT NULL FK→esp_devices ON DELETE CASCADE
field         text NOT NULL
op            text NOT NULL
threshold_num double precision
threshold_str text
cooldown_sec  integer NOT NULL DEFAULT 120
enabled       boolean NOT NULL DEFAULT true
created_at    timestamptz NOT NULL DEFAULT now()
```
⚠️ Pas de `user_id` en V1 (dérivable via esp_devices.user_id).

#### `alert_log` (1 140 lignes)
```
id        bigint PK (séquence)
rule_id   uuid NOT NULL FK→alert_rules ON DELETE CASCADE
device_id text NOT NULL FK→esp_devices(esp_uid)
sent_at   timestamptz NOT NULL DEFAULT now()
channel   text
status    text
payload   jsonb
error     text
```
⚠️ Pas de colonne `esp_id` (UUID) en V1 — présente en V2.

#### `alert_state`
```
rule_id   uuid PK FK→alert_rules ON DELETE CASCADE
last_sent timestamptz
```

#### `user_badge`
```
user_id      uuid PK FK→users ON DELETE CASCADE
unread_count integer NOT NULL DEFAULT 0
updated_at   timestamptz NOT NULL DEFAULT now()
```

#### `password_resets`
```
id         uuid PK
user_id    uuid NOT NULL FK→users ON DELETE CASCADE
token_hash text NOT NULL
expires_at timestamptz NOT NULL
used_at    timestamptz
created_at timestamptz NOT NULL DEFAULT now()
```

---

## 3. Schéma V2 cible (base `xamiot_v2`)

Toutes les tables créées par `init.sql` + migrations `001` à `041`.

### Tables à données migrées depuis V1

| Table V2 | Source V1 | Transformations |
|----------|-----------|-----------------|
| `users` | `notify.users` | Aucune |
| `esp_devices` | `notify.esp_devices` | Ajouter `device_type_id`, `fw_version` NULL; `api_xamiot` → `is_superuser=true` |
| `mobile_devices` | `notify.mobile_devices` | Split `apns_token`→iOS / `fcm_token`→Android; normaliser `platform` |
| `alert_rules` | `notify.alert_rules` | Ajouter `user_id` (déduit de `esp_devices.user_id`) |
| `alert_log` | `notify.alert_log` | Ajouter `esp_id` (UUID, backfill depuis `esp_devices.esp_uid`) |
| `alert_state` | `notify.alert_state` | Aucune |
| `user_badge` | `notify.user_badge` | Aucune |
| `password_resets` | `notify.password_resets` | Aucune |

### Tables à initialiser vides (nouvelles en V2)
`orders`, `order_items`, `order_logs`, `products`, `product_translations`, `product_categories`, `product_category_translations`, `product_images`, `cms_pages`, `cms_page_translations`, `cms_media`, `support_tickets`, `ticket_messages`, `rma_requests`, `ota_updates`, `ota_deployments`, `manual_campaigns`, `audit_logs`, `user_addresses`

### Tables seedées automatiquement par les migrations
`device_types` (migration init), `alert_rule_templates` (migration 006/011), `countries` (migration 036/039/040), `app_config` (migration 022 + suivantes), `smtp_config`, `apns_config`, `fcm_config`, `rate_limit_config`, `retention_config`

---

## 4. Cartographie détaillée par table

### 4.1 `users` → `users` (aucune transformation)

| Colonne V1 | Colonne V2 | Transformation |
|------------|------------|----------------|
| `id` | `id` | Copie directe |
| `email` | `email` | Copie directe |
| `pass_hash` | `pass_hash` | Copie directe (argon2 compatible) |
| `created_at` | `created_at` | Copie directe |
| `is_active` | `is_active` | Copie directe |
| `first_name` | `first_name` | Copie directe |
| `last_name` | `last_name` | Copie directe |
| `phone` | `phone` | Copie directe |
| `activated_at` | `activated_at` | Copie directe |
| `is_admin` | `is_admin` | Copie directe |

**SQL :**
```sql
-- Connecté à la base xamiot_v2 (tables dans public, notify = foreign schema via postgres_fdw)
INSERT INTO public.users (id, email, pass_hash, created_at, is_active,
       first_name, last_name, phone, activated_at, is_admin)
SELECT id, email::text::citext, pass_hash, created_at, is_active,
       first_name, last_name, phone, activated_at, is_admin
FROM notify.users;
```

---

### 4.2 `esp_devices` → `esp_devices`

⚠️ **Cas particulier :** `api_xamiot` (esp_uid='api_xamiot', user=contact@xamiot.com) est le pseudo-device MQTT de l'API V1.
En V2, l'API utilise ses propres credentials MQTT (hors table esp_devices). Ce device **doit être migré** avec `is_superuser=true` pour maintenir la compatibilité MQTT pendant la transition, mais son `user_id` pointera vers l'utilisateur `contact@xamiot.com`.

| Colonne V1 | Colonne V2 | Transformation |
|------------|------------|----------------|
| `id` | `id` | Copie directe |
| `user_id` | `user_id` | Copie directe |
| `esp_uid` | `esp_uid` | Copie directe |
| `name` | `name` | Copie directe |
| `topic_prefix` | `topic_prefix` | Copie directe |
| `last_seen` | `last_seen` | Copie directe |
| `last_db` | `last_db` | Copie directe |
| `mqtt_enabled` | `mqtt_enabled` | Copie directe |
| `mqtt_password_hash` | `mqtt_password_hash` | Copie directe (bcrypt compatible) |
| `is_superuser` | `is_superuser` | Copie directe |
| *(absent)* | `device_type_id` | NULL → sera mis à jour manuellement après |
| *(absent)* | `fw_version` | NULL |

**SQL :**
```sql
INSERT INTO public.esp_devices
  (id, user_id, esp_uid, name, topic_prefix, last_seen, last_db,
   mqtt_enabled, mqtt_password_hash, is_superuser, device_type_id, fw_version)
SELECT
  id, user_id, esp_uid, name, topic_prefix, last_seen, last_db,
  mqtt_enabled, mqtt_password_hash, is_superuser, NULL, NULL
FROM notify.esp_devices;
```

Post-migration : associer le type 'ESP32-SoundSense' aux devices réels.
⚠️ La table `device_types` est peuplée par `003_mqtt_config_seed.sql` lors du déploiement normal — elle sera déjà alimentée en prod.
```sql
UPDATE public.esp_devices
SET device_type_id = (
  SELECT id FROM public.device_types WHERE name = 'ESP32-SoundSense' LIMIT 1
)
WHERE esp_uid != 'api_xamiot'
  AND device_type_id IS NULL;
```

---

### 4.3 `mobile_devices` → `mobile_devices`

⚠️ **Complexité principale.** En V1 :
- `apns_token` NOT NULL contient aussi les tokens FCM (Android)
- `platform` = 'iOS', 'android' (minuscule!), ou 'Test'
- Pas de `fcm_token` colonne

En V2 :
- `apns_token` nullable, réservé iOS
- `fcm_token` nullable, réservé Android
- `platform` CHECK IN ('iOS', 'Android') — majuscule obligatoire

**Règle de migration :**
- Si `platform = 'iOS'` ou `platform = 'Test'` → `apns_token = apns_token`, `fcm_token = NULL`, `platform = 'iOS'`
- Si `platform = 'android'` → `apns_token = NULL`, `fcm_token = apns_token`, `platform = 'Android'`

V2 ajoute des colonnes absentes en V1 : `model`, `os_version`, `app_version`, `app_build_number`, `timezone` → NULL.

**SQL :**
```sql
INSERT INTO public.mobile_devices
  (id, user_id, platform, bundle_id, apns_token, fcm_token,
   is_active, created_at, name, last_seen, sandbox,
   model, os_version, app_version, app_build_number, timezone)
SELECT
  id,
  user_id,
  CASE
    WHEN LOWER(platform) = 'android' THEN 'Android'
    ELSE 'iOS'
  END,
  bundle_id,
  CASE WHEN LOWER(platform) != 'android' THEN apns_token ELSE NULL END,
  CASE WHEN LOWER(platform) = 'android' THEN apns_token ELSE NULL END,
  is_active, created_at, name, last_seen, sandbox,
  NULL, NULL, NULL, NULL, NULL
FROM notify.mobile_devices;
```

---

### 4.4 `alert_rules` → `alert_rules`

⚠️ V2 n'a **pas** de colonne `user_id` dans `alert_rules` (vérifié sur schéma réel). Le user est dérivable via `esp_id → esp_devices.user_id`.
⚠️ V2 utilise `cooldown_sec` (identique à V1, pas `cooldown_min_sec` — l'audit initial était incorrect sur ce point).

| Colonne V1 | Colonne V2 | Transformation |
|------------|------------|----------------|
| `id` | `id` | Copie directe |
| `esp_id` | `esp_id` | Copie directe |
| `field` | `field` | Copie directe |
| `op` | `op` | Copie directe (valeurs OK: `>`, `>=`, etc.) |
| `threshold_num` | `threshold_num` | Copie directe |
| `threshold_str` | `threshold_str` | Copie directe |
| `cooldown_sec` | `cooldown_sec` | Copie directe |
| `enabled` | `enabled` | Copie directe |
| `created_at` | `created_at` | Copie directe |
| *(absent)* | `user_label` | NULL |
| *(absent)* | `template_id` | NULL |

**SQL :**
```sql
INSERT INTO public.alert_rules
  (id, esp_id, field, op, threshold_num, threshold_str,
   cooldown_sec, enabled, created_at, user_label, template_id)
SELECT
  r.id, r.esp_id, r.field, r.op,
  r.threshold_num, r.threshold_str, r.cooldown_sec,
  r.enabled, r.created_at, NULL, NULL
FROM notify.alert_rules r;
```

---

### 4.5 `alert_log` → `alert_log`

⚠️ V2 ajoute `esp_id` (UUID FK esp_devices.id). Backfill depuis `device_id` (esp_uid).
⚠️ V1 utilise une séquence bigint. V2 aussi → préserver les IDs.

**SQL :**
```sql
INSERT INTO public.alert_log
  (id, rule_id, device_id, sent_at, channel, status, payload, error, esp_id)
SELECT
  al.id, al.rule_id, al.device_id, al.sent_at,
  al.channel, al.status, al.payload, al.error,
  e.id  -- esp_id UUID backfill depuis esp_uid
FROM notify.alert_log al
LEFT JOIN notify.esp_devices e ON e.esp_uid = al.device_id;

-- Remettre la séquence au bon niveau
SELECT setval(
  pg_get_serial_sequence('alert_log', 'id'),
  COALESCE((SELECT MAX(id) FROM public.alert_log), 1)
);
```

---

### 4.6 `alert_state` → `alert_state` (aucune transformation)

```sql
INSERT INTO public.alert_state SELECT * FROM notify.alert_state;
```

---

### 4.7 `user_badge` → `user_badge` (aucune transformation)

```sql
INSERT INTO public.user_badge SELECT * FROM notify.user_badge;
```

---

### 4.8 `password_resets` → `password_resets` (aucune transformation)

```sql
INSERT INTO public.password_resets SELECT * FROM notify.password_resets;
```

---

## 5. Configurations à migrer (hors BDD)

### `apns_config`
Les clés APNs (APNS_TEAM_ID, APNS_KEY_ID, APNS_BUNDLE_ID) seront re-saisies via l'interface admin V2.
Le fichier `.p8` est dans `/home/jeremy/api/xamiot/secrets/AuthKey_GGGNLJ8269.p8` → à copier dans V2.

### `fcm_config`
Le fichier `firebase-service-account.json` dans `/home/jeremy/api/xamiot/secrets/` → à copier dans V2.

### `smtp_config`
SMTP déjà en place sur `mail.ecrimoi.com`. Les paramètres seront saisis via l'interface admin V2.

---

## 6. Données à conserver

| Table | Priorité |
|-------|----------|
| `users` | **Critique** — 21 comptes réels |
| `esp_devices` | **Critique** — 6 capteurs déployés chez clients |
| `mobile_devices` | **Important** — 14 appareils actifs (tokens push) |
| `alert_rules` | **Important** — 6 règles configurées par les clients |
| `alert_log` | **Secondaire** — 1 140 entrées d'historique |
| `alert_state` | **Secondaire** — état dernier envoi |
| `user_badge` | Bas |
| `password_resets` | Inutile (tokens expirés) — migrer quand même pour cohérence |

---

## 7. Données à ne pas migrer / orphelines

- **`api_xamiot` ESP device** : pseudo-device pour l'API MQTT V1. Migré avec `is_superuser=true`, mais ne correspond pas à un vrai capteur physique. À désactiver manuellement après bascule V2.
- **Tokens `password_resets` expirés** : seront migrés mais seront tous expirés à date — sans impact.
- **`mobile_devices.platform='Test'`** (1 entrée, `support@xamiot.com`) : migré comme iOS avec `sandbox=true`.

---

## 8. Ordre d'exécution de la migration

```
1. Créer l'utilisateur PostgreSQL xamiot_v2_user
2. Créer la base xamiot_v2 (owner: xamiot_v2_user)
3. Accorder les droits cross-base (notify → xamiot_v2 via dblink ou migration depuis le conteneur)
4. Exécuter init.sql dans xamiot_v2
5. Exécuter migrations 001 à 041 dans l'ordre
6. Vérifier que les tables V2 sont créées correctement
7. Migrer users (aucune dépendance)
8. Migrer esp_devices (dépend de users)
9. Migrer mobile_devices (dépend de users)
10. Migrer alert_rules (dépend de esp_devices)
11. Migrer alert_log (dépend de alert_rules + esp_devices)
12. Migrer alert_state (dépend de alert_rules)
13. Migrer user_badge (dépend de users)
14. Migrer password_resets (dépend de users)
15. Post-migration : update device_type_id sur esp_devices réels
16. Post-migration : update séquence alert_log
17. Vérifier comptages et intégrité
18. Saisir secrets APNs/FCM/SMTP via interface admin V2
```

---

## 9. Points de rollback

| Point | Rollback possible |
|-------|-------------------|
| Avant création de `xamiot_v2` | Rien à défaire |
| Après création de `xamiot_v2` | `DROP DATABASE xamiot_v2` |
| Après migration données | `DROP DATABASE xamiot_v2` (notify intact) |
| Après bascule Traefik (Étape 9) | Remettre les labels V1, relancer containers V1 |
| Après arrêt containers V1 | Relancer `docker compose up -d` dans chaque dossier V1 |

**La base `notify` ne sera jamais modifiée ni supprimée pendant la migration.**

---

## 10. Vérifications post-migration

```sql
-- Connecté à xamiot_v2 — comptages attendus (vérifiés en test le 2026-04-04)
SELECT 'users'          , COUNT(*) FROM users;           -- 21 ✅
SELECT 'esp_devices'    , COUNT(*) FROM esp_devices;     -- 7  ✅
SELECT 'mobile_devices' , COUNT(*) FROM mobile_devices;  -- 15 ✅
SELECT 'alert_rules'    , COUNT(*) FROM alert_rules;     -- 6  ✅
SELECT 'alert_log'      , COUNT(*) FROM alert_log;       -- 1140 ✅
SELECT 'alert_state'    , COUNT(*) FROM alert_state;     -- 6  ✅
SELECT 'user_badge'     , COUNT(*) FROM user_badge;      -- 9  ✅
SELECT 'password_resets', COUNT(*) FROM password_resets; -- 9  ✅

-- Intégrité : aucune règle orpheline
SELECT COUNT(*) FROM alert_rules r
LEFT JOIN esp_devices e ON e.id = r.esp_id
WHERE e.id IS NULL; -- doit être 0 ✅

-- Intégrité : aucun log orphelin
SELECT COUNT(*) FROM alert_log al
LEFT JOIN alert_rules r ON r.id = al.rule_id
WHERE r.id IS NULL AND al.rule_id IS NOT NULL; -- doit être 0 ✅

-- Tokens iOS/Android séparés
SELECT platform, COUNT(*) AS total, COUNT(apns_token) AS apns, COUNT(fcm_token) AS fcm
FROM mobile_devices GROUP BY platform;
-- iOS: 12 avec apns_token ✅ / Android: 3 avec fcm_token ✅

-- Aucun token en double
SELECT COUNT(*) FROM (SELECT apns_token FROM mobile_devices WHERE apns_token IS NOT NULL GROUP BY apns_token HAVING COUNT(*)>1) s; -- 0 ✅
SELECT COUNT(*) FROM (SELECT fcm_token  FROM mobile_devices WHERE fcm_token  IS NOT NULL GROUP BY fcm_token  HAVING COUNT(*)>1) s; -- 0 ✅

-- esp_id backfill alert_log (100% résolu en test)
SELECT COUNT(*)-COUNT(esp_id) AS sans_esp_id FROM alert_log; -- 0 ✅
```

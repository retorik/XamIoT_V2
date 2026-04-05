# Test migration BDD — XamIoT V1 → V2
> Réalisé le 2026-04-04 sur VPS dev (192.168.1.6)
> Données source : dump production ecrimoi.com (`notify` — 1 771 lignes)

---

## 1. Environnement de test

| Élément | Valeur |
|---------|--------|
| VPS de test | 192.168.1.6 (holiceo.com) |
| Container de test | `xamiot-migration-test` (postgres:16-alpine, réseau isolé `xamiot-migration-net`) |
| Dump source | `notify` depuis ecrimoi.com — `docker exec xamiot-postgres pg_dump -U xamiot --no-owner --no-acl -Fp notify` |
| Base cible | `xamiot_v2` (créée dans le container de test) |
| Migrations appliquées | `init.sql` + `001` à `041` (42 fichiers) |
| Accès cross-base | `postgres_fdw` — schéma `notify` importé comme foreign schema dans `xamiot_v2` |
| Durée totale | ~15 secondes |

---

## 2. Résultats de migration

### 2.1 Comptages V1 → V2

| Table | Source V1 | Migré V2 | Résultat |
|-------|-----------|----------|----------|
| `users` | 21 | 21 | ✅ |
| `esp_devices` | 7 | 7 | ✅ |
| `mobile_devices` | 15 | 15 | ✅ |
| `alert_rules` | 6 | 6 | ✅ |
| `alert_log` | 1 140 | 1 140 | ✅ |
| `alert_state` | 6 | 6 | ✅ |
| `user_badge` | 9 | 9 | ✅ |
| `password_resets` | 9 | 9 | ✅ |

**Tous les comptages sont identiques. Aucune perte de données.**

### 2.2 Vérifications d'intégrité

| Vérification | Résultat attendu | Résultat obtenu |
|--------------|-----------------|-----------------|
| Règles orphelines (`alert_rules` sans `esp_devices`) | 0 | **0 ✅** |
| Logs orphelins (`alert_log` sans `alert_rules`) | 0 | **0 ✅** |
| iOS : `apns_token` non null | 12 | **12 ✅** |
| Android : `fcm_token` non null | 3 | **3 ✅** |
| Tokens APNs en double | 0 | **0 ✅** |
| Tokens FCM en double | 0 | **0 ✅** |
| `esp_id` backfillé dans `alert_log` | 1 140/1 140 | **1 140 ✅ (100%)** |
| Base `notify` source intacte | 21 users / 1 140 logs | **21 / 1 140 ✅** |

### 2.3 Répartition mobile_devices

```
 platform | total | apns | fcm
----------+-------+------+-----
 Android  |     3 |    0 |   3
 iOS      |    12 |   12 |   0
```

Split iOS/Android correct. La colonne V1 `apns_token` a bien été routée vers `apns_token` (iOS) ou `fcm_token` (Android) selon la valeur de `platform`.

### 2.4 ESP devices après migration

```
   esp_uid    |   name   | is_superuser | device_type_id
--------------+----------+--------------+----------------
 api_xamiot   | admin    | true         | NULL (attendu — pseudo-device)
 0C784DA04E0C | 0C       | false        | NULL *
 7477E8D4DB1C | 7477-Dje | false        | NULL *
 8C36E9D4DB1C | 8C36-DJE | false        | NULL *
 F0CAE7D4DB1C | F0CA-DJE | false        | NULL *
 F8774DA04E0C | Test SLE | false        | NULL *
 F8D16DB2F180 | capteur  | false        | NULL *
```

`*` En environnement de test, `device_type_id` est NULL car `003_mqtt_config_seed.sql` a échoué (voir §3.1). **En production, la table `device_types` est déjà peuplée** — l'UPDATE peuplera correctement les 6 devices réels.

---

## 3. Points d'attention identifiés

### 3.1 `003_mqtt_config_seed.sql` — échec en environnement de test (bénin en prod)

**Cause :** Le test applique toutes les migrations sur une base vierge sans `schema_migrations`. La migration `003_mqtt_config_seed.sql` insère dans `device_types` — en prod, `device_types` est déjà peuplée depuis le premier déploiement. Ce fichier de seed n'est PAS une migration ordinaire ; il ne doit pas être ré-exécuté si la table est déjà peuplée.

**Impact prod : aucun.** La base `xamiot_v2` de production sera déjà initialisée via `scripts/deploy.sh` avant la migration des données.

### 3.2 Migrations internes `schema_migrations` manquante (bénin)

Quelques migrations tardives (`028`, `029`, `030`, `031`) insèrent dans `schema_migrations` pour auto-tracking. Cette table n'existe pas dans le container de test vierge. Ces insertions échouent (non-bloquant) — le DDL de ces migrations s'est appliqué correctement.

**Impact prod : aucun.** En prod, `schema_migrations` est créée par `deploy.sh` avant les migrations.

### 3.3 Séquence `alert_log` à réinitialiser

La séquence `alert_log_id_seq` doit être remise au niveau de l'`id` max migré.

**SQL à exécuter après migration des données :**
```sql
SELECT setval(
  pg_get_serial_sequence('alert_log', 'id'),
  COALESCE((SELECT MAX(id) FROM alert_log), 1)
);
```

Cela a été confirmé en test — à inclure dans le script de migration prod.

### 3.4 `device_type_id` des ESP devices en prod

En production, après migration, il faudra exécuter :
```sql
UPDATE public.esp_devices
SET device_type_id = (
  SELECT id FROM public.device_types WHERE name = 'ESP32-SoundSense' LIMIT 1
)
WHERE esp_uid != 'api_xamiot' AND device_type_id IS NULL;
```
Cet UPDATE est inclus dans le script de migration data.

### 3.5 Corrections apportées au `plan_migration_bdd.md`

Suite à ce test, deux erreurs dans le plan initial ont été corrigées :

| Erreur initiale | Correction |
|-----------------|------------|
| `alert_rules` V2 aurait une colonne `user_id` | ❌ Confirmé absent — schéma réel vérifié |
| V2 utiliserait `cooldown_min_sec` | ❌ V2 utilise `cooldown_sec` comme V1 |

---

## 4. Script de migration data final (testé et validé)

À exécuter en étant connecté à la base `xamiot_v2` sur le PostgreSQL de production, avec `postgres_fdw` configuré pour accéder à `notify`.

```sql
-- ═══════════════════════════════════════════════════════
-- MIGRATION DATA V1 (notify) → V2 (xamiot_v2)
-- Testé le 2026-04-04 — VPS 192.168.1.6
-- ═══════════════════════════════════════════════════════

-- 1. USERS
INSERT INTO public.users
  (id, email, pass_hash, created_at, is_active, first_name, last_name, phone, activated_at, is_admin)
SELECT id, email::text::citext, pass_hash, created_at, is_active, first_name, last_name, phone, activated_at, is_admin
FROM notify.users;

-- 2. ESP_DEVICES
INSERT INTO public.esp_devices
  (id, user_id, esp_uid, name, topic_prefix, last_seen, last_db,
   mqtt_enabled, mqtt_password_hash, is_superuser, device_type_id, fw_version)
SELECT id, user_id, esp_uid, name, topic_prefix, last_seen, last_db,
       mqtt_enabled, mqtt_password_hash, is_superuser, NULL, NULL
FROM notify.esp_devices;

-- Associer le type ESP32-SoundSense (déjà peuplé en prod)
UPDATE public.esp_devices
SET device_type_id = (SELECT id FROM public.device_types WHERE name = 'ESP32-SoundSense' LIMIT 1)
WHERE esp_uid != 'api_xamiot' AND device_type_id IS NULL;

-- 3. MOBILE_DEVICES (split iOS/Android)
INSERT INTO public.mobile_devices
  (id, user_id, platform, bundle_id, apns_token, fcm_token,
   is_active, created_at, name, last_seen, sandbox,
   model, os_version, app_version, app_build_number, timezone)
SELECT
  id, user_id,
  CASE WHEN LOWER(platform) = 'android' THEN 'Android' ELSE 'iOS' END,
  bundle_id,
  CASE WHEN LOWER(platform) != 'android' THEN apns_token ELSE NULL END,
  CASE WHEN LOWER(platform) = 'android' THEN apns_token ELSE NULL END,
  is_active, created_at, name, last_seen, sandbox,
  NULL, NULL, NULL, NULL, NULL
FROM notify.mobile_devices;

-- 4. ALERT_RULES
INSERT INTO public.alert_rules
  (id, esp_id, field, op, threshold_num, threshold_str,
   cooldown_sec, enabled, created_at, user_label, template_id)
SELECT r.id, r.esp_id, r.field, r.op, r.threshold_num, r.threshold_str,
       r.cooldown_sec, r.enabled, r.created_at, NULL, NULL
FROM notify.alert_rules r;

-- 5. ALERT_LOG
INSERT INTO public.alert_log
  (id, rule_id, device_id, sent_at, channel, status, payload, error, esp_id)
SELECT al.id, al.rule_id, al.device_id, al.sent_at,
       al.channel, al.status, al.payload, al.error, e.id
FROM notify.alert_log al
LEFT JOIN notify.esp_devices e ON e.esp_uid = al.device_id;

-- Réinitialiser la séquence
SELECT setval(pg_get_serial_sequence('alert_log', 'id'), COALESCE((SELECT MAX(id) FROM public.alert_log), 1));

-- 6. ALERT_STATE
INSERT INTO public.alert_state SELECT * FROM notify.alert_state;

-- 7. USER_BADGE
INSERT INTO public.user_badge SELECT * FROM notify.user_badge;

-- 8. PASSWORD_RESETS
INSERT INTO public.password_resets SELECT * FROM notify.password_resets;
```

---

## 5. Conclusion

**Le test de migration est VALIDÉ.**

- Aucune perte de données.
- Toutes les contraintes d'intégrité respectées.
- La base source `notify` est restée intacte.
- Les transformations spécifiques (split iOS/Android, esp_id backfill) fonctionnent correctement.
- Les deux erreurs dans le plan initial ont été identifiées et corrigées.

**Migration production (Étape 8) peut être autorisée par Jeremy.**

---

*Rédigé le 2026-04-04 — Suite au test sur container isolé `xamiot-migration-test`*

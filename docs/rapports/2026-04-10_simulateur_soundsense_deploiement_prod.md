# Simulateur SoundSense — Dossier de déploiement PROD

**Date de développement :** 2026-04-10  
**Statut :** Déployé sur DEV (holiceo.com) — **en attente de déploiement PROD (ecrimoi.com)**  
**Auteur :** Session Claude Code

---

## 1. Objectif de la fonctionnalité

Chaque nouvel utilisateur reçoit automatiquement à l'inscription un **capteur démo virtuel** de type SoundSense. Ce capteur est visible dans le portail client et permet de simuler des mesures sonores sans matériel physique.

Il est créé de façon **non-bloquante** : si la création échoue (ex. DB indisponible), l'inscription se déroule normalement — l'utilisateur peut s'inscrire sans problème.

---

## 2. Composants modifiés

### 2.1 API — `XamIoT_Api_v2`

#### `src/auth.js`

Ajout de la fonction `createSimulatedDevice(userId)` (avant `signup()`).  
Appelée non-bloquant via `.catch()` après l'INSERT de l'utilisateur dans `signup()`.

**Comportement :**
- Idempotente : si un device simulé existe déjà pour ce `user_id`, ne crée rien
- Cherche l'UUID du type `SoundSense` dans `device_types` par nom (robuste si l'UUID diffère entre DEV et PROD)
- Génère un `esp_uid` de la forme `simXXXXXX` (3 octets hex majuscules, ex : `simA3F8C2`)
- Insère dans `esp_devices` avec : `mqtt_password_hash=NULL`, `mqtt_enabled=false`, `is_simulated=true`, `device_type_id=<id_soundsense>`
- Crée une règle d'alerte par défaut désactivée (`soundPct > 80`, `enabled=false`, `user_label='Alerte sonore démo'`)

#### `src/app.js`

**`GET /esp-devices`**
- Ajout de `e.is_simulated` dans le SELECT
- Ordre : `ORDER BY e.is_simulated ASC, e.name NULLS LAST, e.esp_uid` (les vrais devices apparaissent en premier)

**`GET /esp-devices/:id`**
- Ajout de `e.is_simulated` dans le SELECT

**Deux nouveaux endpoints :**

```
POST /esp-devices/:id/simulate
  Auth : requireAuth + appLimiter
  Body : { soundPct: number (0-100), soundAvg?: number }
  Vérifie : is_simulated=true + user_id correspond
  Fetche : device complet (user_id, name, device_type_id, notif templates via JOIN device_types)
  Insère dans mqtt_raw_logs (topic: xamiot/{esp_uid}/data)
  Met à jour : last_seen=NOW(), last_db=soundPct
  Appelle : evaluateAlertRules() — même pipeline que les vraies trames MQTT (non-bloquant)
  Réponse : { ok: true, esp_uid, soundPct, soundAvg }

POST /esp-devices/:id/simulate/reset
  Auth : requireAuth + appLimiter
  Vérifie : is_simulated=true + user_id correspond
  Supprime tous les mqtt_raw_logs WHERE esp_uid=$1
  Met à jour : last_seen=NULL, last_db=NULL
  Réponse : { ok: true }
```

#### `src/mqttWorker.js`

Extraction de la logique d'évaluation des règles en une fonction exportée :

```js
export async function evaluateAlertRules(esp, obj, topic)
```

**Paramètres :**
- `esp` : `{ id, user_id, name, esp_uid, device_type_id, notif_title_tpl, notif_body_tpl }`
- `obj` : payload JSON parsé, ex. `{ soundPct: 85, soundAvg: 85 }`
- `topic` : topic MQTT, ex. `xamiot/simXXXXXX/data` (utilisé dans `alert_log`)

**Ce que fait la fonction (pipeline Système 1) :**
1. Charge les `alert_rules` actives du device
2. Récupère les `mobile_devices` actifs du user (iOS + Android)
3. Pour chaque règle : évalue `ruleMatches()`, vérifie le cooldown atomique (`alert_state`)
4. Si match + cooldown OK : construit le titre/corps via templates, envoie push (APNs + FCM), logue dans `alert_log`

Le worker MQTT l'appelle pour les vraies trames. Le endpoint `/simulate` l'appelle avec le même `esp` et le même payload — comportement identique.

---

### 2.2 Portail client — `XamIoT_Portal_v2`

#### `app/(portal)/devices/page.tsx`

- Interface `EspDevice` : ajout de `is_simulated: boolean`
- Traductions FR/EN/ES : ajout de `demo_badge` (`Démo` / `Demo`) et `no_data`
- Carte device : couleurs violettes pour les simulés, badge `Démo`, texte `no_data` si pas d'activité

#### `app/(portal)/devices/[id]/page.tsx`

- Interface `DeviceInfo` : ajout de `is_simulated: boolean`
- Traductions FR/EN/ES : `demo_badge`, `sim_title/desc/level/send/reset/...`
- En-tête device : icône et couleurs violettes pour les simulés, badge `Démo`
- **SimulatorPanel** (onglet Mesures, uniquement si `is_simulated=true`) :
  - Slider 0–100 avec retour couleur (vert < 60, amber 60–80, rouge > 80)
  - Bouton **Envoyer** → `POST /esp-devices/:id/simulate`
  - Bouton **Réinitialiser** → `POST /esp-devices/:id/simulate/reset`
  - Recharge automatique du device après chaque action

---

### 2.3 Migrations DB

| Fichier | Contenu | Statut DEV | À appliquer PROD |
|---------|---------|-----------|-----------------|
| `db/046_simulator_device.sql` | Ajout colonne `is_simulated BOOLEAN DEFAULT false` + index `idx_esp_simulated` sur `esp_devices` | ✅ Appliqué | ⬜ À faire |
| `db/047_simulator_device_type.sql` | Rattrappage : associe les devices simulés existants sans `device_type_id` au type SoundSense | ✅ Appliqué | ⬜ À faire |

---

## 3. Procédure de déploiement PROD (ecrimoi.com)

> ⚠️ Sur `ecrimoi.com` : toujours utiliser `docker-compose.ecrimoi.yml` (jamais `docker-compose.prod.yml`).  
> ⚠️ Container Postgres PROD : `xamiot-postgres`, superuser : `xamiot` (pas `postgres`).

### Étape 1 — Migrations DB PROD

```bash
# Depuis la machine locale :
scp /Users/jeremyfauvet/Dev_Claude/XamIoT/XamIoT_Api_v2/db/046_simulator_device.sql \
    jeremy@ecrimoi.com:/tmp/046_simulator_device.sql

scp /Users/jeremyfauvet/Dev_Claude/XamIoT/XamIoT_Api_v2/db/047_simulator_device_type.sql \
    jeremy@ecrimoi.com:/tmp/047_simulator_device_type.sql

# Sur ecrimoi.com :
ssh jeremy@ecrimoi.com

docker exec -i xamiot-postgres psql -U xamiot -d xamiot_v2 < /tmp/046_simulator_device.sql
docker exec -i xamiot-postgres psql -U xamiot -d xamiot_v2 < /tmp/047_simulator_device_type.sql
```

**Résultats attendus :**
```
ALTER TABLE
CREATE INDEX
UPDATE X      ← nombre de devices simulés existants rattrapés (probablement 0 en PROD initiale)
INSERT 0 1
```

### Étape 2 — Déploiement API PROD

```bash
rsync -avz --delete \
  --exclude='.git/' --exclude='node_modules/' --exclude='.env.*' \
  /Users/jeremyfauvet/Dev_Claude/XamIoT/XamIoT_Api_v2/ \
  jeremy@ecrimoi.com:/home/jeremy/XamIoT_v2/api/

ssh jeremy@ecrimoi.com \
  "cd /home/jeremy/XamIoT_v2/api && docker compose -f docker-compose.ecrimoi.yml up -d --build"
```

**Vérification :**
```bash
ssh jeremy@ecrimoi.com "docker logs --tail 20 xamiot-api 2>&1"
```
→ Aucune erreur `column does not exist` ou `ERR worker`.

### Étape 3 — Déploiement Portail client PROD

```bash
rsync -avz --delete \
  --exclude='.git/' --exclude='node_modules/' --exclude='.env.*' --exclude='.next/' \
  /Users/jeremyfauvet/Dev_Claude/XamIoT/XamIoT_Portal_v2/ \
  jeremy@ecrimoi.com:/home/jeremy/XamIoT_v2/portal/

ssh jeremy@ecrimoi.com \
  "cd /home/jeremy/XamIoT_v2/portal && docker compose -f docker-compose.ecrimoi.yml up -d --build"
```

**Vérification :**
```bash
ssh jeremy@ecrimoi.com "docker logs --tail 10 xamiot-portal 2>&1"
```
→ Build Next.js terminé sans erreur.

---

## 4. Checklist de vérification post-déploiement PROD

```
[ ] Migration 046 appliquée : colonne is_simulated présente dans esp_devices
[ ] Migration 047 appliquée : devices simulés existants ont device_type_id = SoundSense
[ ] API redémarrée sans erreur de colonne
[ ] Portail client rebuilé sans erreur Next.js
[ ] Créer un compte de test sur portail.xamiot.com
[ ] Vérifier que le device "Capteur démo" apparaît dans /devices avec le badge "Démo"
[ ] Cliquer sur le device → onglet Mesures → panneau simulateur visible
[ ] Envoyer une valeur (ex. 75) → vérifier que last_db = 75 et l'historique s'affiche
[ ] Réinitialiser → vérifier que last_db = null et sound_history = []
[ ] Activer la règle d'alerte du device démo depuis le portail
[ ] Envoyer une valeur > 80 → vérifier dans les logs API : "[INFO] rules actives: 1" + "[ALERT]"
[ ] Supprimer le compte de test (ou le garder pour démonstration)
```

---

## 5. Vérification DB directe (PROD)

```bash
# Vérifier que la colonne existe
docker exec xamiot-postgres psql -U xamiot -d xamiot_v2 -c \
  "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='esp_devices' AND column_name='is_simulated';"

# Vérifier les devices simulés et leur type
docker exec xamiot-postgres psql -U xamiot -d xamiot_v2 -c \
  "SELECT e.esp_uid, e.is_simulated, dt.name AS type_name
   FROM esp_devices e
   LEFT JOIN device_types dt ON dt.id = e.device_type_id
   WHERE e.is_simulated = true;"

# Vérifier les migrations enregistrées
docker exec xamiot-postgres psql -U xamiot -d xamiot_v2 -c \
  "SELECT version FROM schema_migrations WHERE version LIKE '04%' ORDER BY version;"
```

---

## 6. Rollback complet (si besoin)

> ⚠️ Détruit **toutes les données** des devices simulés (CASCADE sur alert_rules, alert_state, mqtt_raw_logs).  
> À n'exécuter que si on souhaite retirer complètement la fonctionnalité.

```bash
# DEV
scp /Users/jeremyfauvet/Dev_Claude/XamIoT/XamIoT_Api_v2/db/046_simulator_device_rollback.sql \
    jeremy@192.168.1.6:/tmp/
ssh jeremy@192.168.1.6 \
  "docker exec -i postgres psql -U postgres -d xamiot_v2 < /tmp/046_simulator_device_rollback.sql"

# PROD
scp /Users/jeremyfauvet/Dev_Claude/XamIoT/XamIoT_Api_v2/db/046_simulator_device_rollback.sql \
    jeremy@ecrimoi.com:/tmp/
ssh jeremy@ecrimoi.com \
  "docker exec -i xamiot-postgres psql -U xamiot -d xamiot_v2 < /tmp/046_simulator_device_rollback.sql"
```

Puis redéployer l'API et le portail avec le code antérieur aux migrations 046/047  
(avant commit `feat: simulateur soundsense`).

**Note :** La migration 047 n'a pas de rollback dédié — elle ne fait que mettre à jour `device_type_id`  
sur des lignes qui seront de toute façon supprimées par le rollback 046.

---

## 7. Points d'attention

| Sujet | Détail |
|-------|--------|
| **Pas de push MQTT** | Le device simulé a `mqtt_enabled=false`. Les mesures sont injectées directement en DB via l'endpoint `/simulate`, pas via MQTT. |
| **Alertes fonctionnelles** | `evaluateAlertRules()` est appelée après chaque injection — même pipeline exact que les vraies trames (cooldown, push APNs/FCM, `alert_log`). |
| **Type SoundSense** | Résolu par recherche par nom (`WHERE name='SoundSense'`), pas par UUID hardcodé — fonctionne même si l'UUID diffère entre DEV et PROD. |
| **Idempotence signup** | `createSimulatedDevice()` vérifie d'abord `SELECT ... WHERE user_id AND is_simulated=true`. Pas de doublon possible même si `signup()` est appelé deux fois. |
| **Règle d'alerte désactivée par défaut** | La règle `soundPct > 80` est créée avec `enabled=false` — pas de notification push surprise à l'inscription. L'utilisateur l'active manuellement depuis le portail. |
| **Ordre d'affichage** | `ORDER BY is_simulated ASC` → les vrais devices physiques apparaissent toujours avant le capteur démo. |
| **iOS / Android** | Le champ `is_simulated` est retourné par l'API mais les apps mobiles ne le gèrent pas encore visuellement (pas de badge Démo). Évolution future. |
| **Rate limit** | Les endpoints `/simulate` et `/simulate/reset` utilisent `appLimiter` (même limite que les autres appels applicatifs). Pas de limite dédiée. |

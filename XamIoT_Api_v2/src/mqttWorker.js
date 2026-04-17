// src/mqttWorker.js
import mqtt from 'mqtt';
import { q } from './db.js';
import { sendAPNS } from './apns.js';
import { sendFCM } from './fcm.js';
import { getMqttConfig, extractTopicSuffix, getFrameConfig, getAllFrameFields, getPrimaryField } from './mqttConfig.js';
import { dispatch } from './notifDispatcher.js';
import { evaluateSensorRules, onDeviceActivity } from './sysNotifEngine.js';

/* ------------------------- Helpers config/env ------------------------- */
function bool(v, dflt = false) {
  if (v == null) return dflt;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}
function int(v, dflt) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
}

const ALERT_KEEP_PER_DEVICE = int(process.env.ALERT_KEEP_PER_DEVICE, 500);

function buildMqttConfig() {
  const host = process.env.MQTT_HOST || 'mosquitto';
  const port = String(process.env.MQTT_PORT || '1883');
  const scheme = port === '8883' ? 'mqtts' : 'mqtt';
  const url = process.env.MQTT_URL || `${scheme}://${host}:${port}`;

  return {
    url,
    username: process.env.MQTT_USER ?? process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASS ?? process.env.MQTT_PASSWORD,
    subscribePattern: process.env.MQTT_SUBSCRIBE_PATTERN || 'devices/+/status',
    rejectUnauthorized:
      process.env.MQTT_TLS_REJECT_UNAUTHORIZED !== undefined
        ? bool(process.env.MQTT_TLS_REJECT_UNAUTHORIZED, true)
        : undefined,
    defaultCooldownSec: int(process.env.DEFAULT_RULE_COOLDOWN_SEC, 120),
  };
}

/* ---------------------- JSON utils / rules engine --------------------- */

/** Lit un champ de l'objet JSON de manière insensible à la casse. */
export function readField(obj, name) {
  if (!obj || typeof obj !== 'object') return undefined;
  const target = String(name || '').toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === target) return obj[k];
  }
  return undefined;
}

/** Évalue une règle (op + threshold) sur une valeur. Exportée pour les tests. */
export function ruleMatches(value, op, thresholdNum, thresholdStr) {
  const opNorm = (op || '').toString().toLowerCase();

  if (thresholdNum !== null && thresholdNum !== undefined) {
    const v = Number(value);
    if (!Number.isFinite(v)) return false;
    switch (opNorm) {
      case '>':  return v >  thresholdNum;
      case '>=': return v >= thresholdNum;
      case '<':  return v <  thresholdNum;
      case '<=': return v <= thresholdNum;
      case '==': return v === thresholdNum;
      case '!=': return v !== thresholdNum;
      default:   return false;
    }
  }

  const v = (value ?? '').toString().toLowerCase();
  const t = (thresholdStr ?? '').toString().toLowerCase();
  switch (opNorm) {
    case 'contains':    return v.includes(t);
    case 'notcontains': return !v.includes(t);
    case '==':          return v === t;
    case '!=':          return v !== t;
    default:            return false;
  }
}

/* ------------------------------ Template engine -------------------------
 * Variables supportées dans les templates : {device_name}, {field_name},
 * {field_label}, {unit}, {op}, {threshold}, {current_value}
 * ---------------------------------------------------------------------- */

/** @param {string} tpl @param {Record<string,string>} vars */
export function renderTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

/* ------------------------------ Fallback legacy -------------------------
 * Utilisé quand l'ESP n'a pas de device_type_id configuré.
 * Préserve le comportement exact de la v1 (champ soundPct uniquement).
 * ---------------------------------------------------------------------- */

const LEGACY_FIELD = 'soundPct';

/** Lit UNIQUEMENT soundPct (insensible à la casse). Retourne 0..100 ou null. */
function readSoundPct(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const key = Object.keys(obj).find(k => k.toLowerCase() === 'soundpct');
  if (!key) return null;
  const v = obj[key];
  let n = null;
  if (typeof v === 'number') {
    n = v;
  } else if (typeof v === 'string') {
    const s = v.trim().replace(',', '.');
    const m = s.match(/-?\d+(?:\.\d+)?/);
    if (m) n = parseFloat(m[0]);
  }
  if (!Number.isFinite(n)) return null;
  if (n < 0) n = 0;
  if (n > 100) n = 100;
  return n;
}

/* ------------------------------ Worker ------------------------------- */

/**
 * Extrait la valeur du champ primaire d'une trame en utilisant la config MQTT.
 * Retourne null si le champ est absent ou non numérique.
 * @param {object} obj - Payload JSON parsé
 * @param {import('./mqttConfig.js').FrameConfig} frameConfig
 * @returns {{ value: number|null, fieldName: string|null }}
 */
function extractPrimaryMetric(obj, frameConfig) {
  const primary = getPrimaryField(frameConfig);
  if (!primary) return { value: null, fieldName: null };

  const raw = readField(obj, primary.name);
  if (raw === undefined || raw === null) return { value: null, fieldName: primary.name };

  if (primary.data_type === 'number') {
    let n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
    if (!Number.isFinite(n)) return { value: null, fieldName: primary.name };
    // Clamp si bornes définies
    if (primary.min_value != null && n < primary.min_value) n = primary.min_value;
    if (primary.max_value != null && n > primary.max_value) n = primary.max_value;
    return { value: n, fieldName: primary.name };
  }

  return { value: null, fieldName: primary.name };
}

let _mqttClient = null;

/** Retourne le client MQTT actif (pour publish depuis les routes admin). */
export function getMqttClient() {
  return _mqttClient;
}

export function startWorker() {
  const cfg = buildMqttConfig();

  const mqttOpts = {
    username: cfg.username || undefined,
    password: cfg.password || undefined,
    reconnectPeriod: 2000,
    keepalive: 30,
  };
  if (cfg.url.startsWith('mqtts://') && cfg.rejectUnauthorized !== undefined) {
    mqttOpts.rejectUnauthorized = cfg.rejectUnauthorized;
  }

  console.log(
    '[WORKER] starting.',
    'MQTT_URL =', cfg.url,
    'user =', mqttOpts.username ? '(set)' : '(none)',
    'pattern =', cfg.subscribePattern
  );

  const client = mqtt.connect(cfg.url, mqttOpts);
  _mqttClient = client;

  client.on('connect', () => {
    console.log('[MQTT] connected', cfg.url, '→ subscribing:', cfg.subscribePattern);
    client.subscribe(cfg.subscribePattern, (err) => {
      if (err) console.error('[MQTT] subscribe error', err.message);
      else console.log('[MQTT] subscribe OK:', cfg.subscribePattern);
    });
    // Souscription aux statuts OTA
    client.subscribe('devices/+/ota/status', (err) => {
      if (!err) console.log('[MQTT] subscribe OK: devices/+/ota/status');
    });
  });

  client.on('error', (e) => console.error('[MQTT] error', e.message));

  client.on('message', async (topic, payload) => {
    const raw = payload?.toString?.() ?? '';
    console.log('\n--- [MSG]', topic, 'len=', raw.length, 'preview=', raw.slice(0, 200));

    try {
      // 1) Extraire chipid depuis devices/<chipid>/status
      const m = topic.match(/^devices\/([^/]+)\/status$/);

      // Log brut (best-effort, sans bloquer le traitement)
      const chipidForLog = m ? m[1] : null;
      q(
        `INSERT INTO mqtt_raw_logs (topic, payload, esp_uid, payload_size)
         VALUES ($1, $2, $3, $4)`,
        [topic, raw, chipidForLog, raw.length]
      ).catch(() => {}); // ignore si la table n'existe pas encore
      // Traitement OTA status
      const mOta = topic.match(/^devices\/([^/]+)\/ota\/status$/);
      if (mOta) {
        const chipid = mOta[1];
        let otaPayload;
        try { otaPayload = JSON.parse(raw); } catch { return; }
        // Détermine le statut DB : échec intermédiaire (retry) → reste 'triggered'
        const isRetryFailure = otaPayload.status === 'failed' &&
                               otaPayload.error !== 'max_retries_reached';
        const dbStatus = isRetryFailure ? 'triggered' : (otaPayload.status || 'downloading');
        await q(
          `UPDATE ota_deployments d
              SET status=$1,
                  progress=$2,
                  last_seen_at=now(),
                  fw_version_after=CASE WHEN $1='success' THEN $3 ELSE d.fw_version_after END,
                  error_msg=CASE WHEN $1='failed' THEN $4 ELSE d.error_msg END
            FROM esp_devices e
           WHERE e.esp_uid=$5 AND d.esp_id=e.id
             AND d.status IN ('triggered','downloading','flashing','pending')`,
          [
            dbStatus,
            otaPayload.progress ?? null,
            otaPayload.version || null,
            otaPayload.error   || null,
            chipid,
          ]
        ).catch(() => {});
        if (otaPayload.status === 'success' && otaPayload.version) {
          await q('UPDATE esp_devices SET fw_version=$1 WHERE esp_uid=$2', [otaPayload.version, chipid]).catch(() => {});
        }
        // Efface le retained cmd/ota dès que l'ESP répond (succès ou échec terminal)
        // pour éviter qu'il re-OTA après chaque redémarrage.
        const isTerminal = otaPayload.status === 'success' ||
                           (otaPayload.status === 'failed' && otaPayload.error === 'max_retries_reached');
        if (isTerminal) {
          // Efface le retain seulement en fin définitive (succès ou abandon)
          client.publish(`devices/${chipid}/cmd/ota`, '', { retain: true, qos: 1 });
        }
        if (otaPayload.status === 'downloading') {
          const pct = otaPayload.progress != null ? ` ${otaPayload.progress}%` : '';
          console.log(`[OTA] ${chipid} téléchargement en cours${pct}`);
        } else if (otaPayload.status === 'flashing') {
          console.log(`[OTA] ${chipid} flash en cours`);
        } else if (otaPayload.status === 'failed') {
          const err = otaPayload.error ?? '?';
          if (err === 'max_retries_reached') {
            console.error(`[OTA] ${chipid} ABANDON — max tentatives atteint, retain effacé`);
            // Notification — OTA échoué (propriétaire du device)
            const { rows: espRow } = await q('SELECT user_id, name FROM esp_devices WHERE esp_uid=$1', [chipid]).catch(() => ({ rows: [] }));
            if (espRow[0]?.user_id) {
              dispatch('ota_failed', espRow[0].user_id, {
                esp_name: espRow[0].name || chipid,
                version: otaPayload.version || '',
                error: err,
              }, { resourceType: 'esp_device', resourceId: chipid }).catch(() => {});
            }
          } else {
            console.warn(`[OTA] ${chipid} tentative échouée (${err}) — retry dans 5 min`);
          }
        } else if (otaPayload.status === 'success') {
          console.log(`[OTA] ${chipid} SUCCES — fw=${otaPayload.version ?? '?'} retain effacé`);
          // Notification — OTA réussi (propriétaire du device)
          const { rows: espRow } = await q('SELECT user_id, name FROM esp_devices WHERE esp_uid=$1', [chipid]).catch(() => ({ rows: [] }));
          if (espRow[0]?.user_id) {
            dispatch('ota_success', espRow[0].user_id, {
              esp_name: espRow[0].name || chipid,
              version: otaPayload.version || '',
            }, { resourceType: 'esp_device', resourceId: chipid }).catch(() => {});
          }
        }
        return;
      }

      if (!m) { console.log('[SKIP] topic non géré par le worker'); return; }
      const chipid = m[1];

      // 2) Parse JSON
      let obj;
      try { obj = JSON.parse(raw); }
      catch { console.warn('[SKIP] payload non-JSON'); return; }

      // 3) Map chipid -> esp_devices (via esp_uid), avec device_type_id + templates notif
      const { rows: espRows } = await q(
        `SELECT e.id, e.user_id, e.topic_prefix, e.name, e.device_type_id,
                dt.notif_title_tpl, dt.notif_body_tpl
           FROM esp_devices e
           LEFT JOIN device_types dt ON dt.id = e.device_type_id
          WHERE e.esp_uid = $1`,
        [chipid]
      );
      if (!espRows.length) { console.warn('[SKIP] ESP inconnu:', chipid); return; }
      const esp = espRows[0];
      const deviceName = (esp.name && String(esp.name).trim()) ? String(esp.name).trim() : chipid;
      console.log('[OK] ESP match id=', esp.id, 'user_id=', esp.user_id, 'type=', esp.device_type_id ?? 'non configuré');

      // Détection succès OTA via heartbeat : si la version reportée correspond à une OTA active, c'est un succès
      if (obj.version) {
        const { rows: activeOta } = await q(
          `SELECT d.id AS dep_id, o.version AS target_version
             FROM ota_deployments d
             JOIN ota_updates o ON o.id = d.ota_id
            WHERE d.esp_id=$1 AND d.status IN ('triggered','downloading','flashing','pending')`,
          [esp.id]
        ).catch(() => ({ rows: [] }));
        for (const dep of activeOta) {
          if (obj.version === dep.target_version) {
            await q(
              `UPDATE ota_deployments SET status='success', fw_version_after=$1, last_seen_at=now() WHERE id=$2`,
              [obj.version, dep.dep_id]
            ).catch(() => {});
            await q('UPDATE esp_devices SET fw_version=$1 WHERE id=$2', [obj.version, esp.id]).catch(() => {});
            client.publish(`devices/${chipid}/cmd/ota`, '', { retain: true, qos: 1 });
            console.log(`[OTA] ${chipid} SUCCES détecté via heartbeat fw=${obj.version} — retain effacé`);
          }
        }
      }

      // Auto-détection du type de device depuis le champ "device_type" du payload
      if (!esp.device_type_id) {
        const payloadTypeName = obj.device_type ?? obj.deviceType ?? null;
        if (payloadTypeName) {
          const { rows: dtRows } = await q(
            'SELECT id FROM device_types WHERE name ILIKE $1 LIMIT 1',
            [String(payloadTypeName).trim()]
          );
          if (dtRows.length) {
            esp.device_type_id = dtRows[0].id;
            await q('UPDATE esp_devices SET device_type_id=$1 WHERE id=$2', [esp.device_type_id, esp.id]);
            console.log(`[AUTO-TYPE] device_type_id assigné: ${esp.device_type_id} (${payloadTypeName})`);
          } else {
            console.warn(`[AUTO-TYPE] Type inconnu dans payload: "${payloadTypeName}" — ignoré`);
          }
        }
      }

      // 3a) Mise à jour fw_version depuis le payload si présente
      const fwVersion = (typeof obj.version === 'string' && obj.version.trim()) ? obj.version.trim() : null;
      if (fwVersion) {
        await q('UPDATE esp_devices SET fw_version = $1 WHERE id = $2', [fwVersion, esp.id]);
      }

      // 3b) Mise à jour last_seen / last_db
      if (esp.device_type_id) {
        // Chemin dynamique : utilise la config MQTT
        const mqttConfig = await getMqttConfig();
        const topicSuffix = extractTopicSuffix(topic); // "status"
        const frameConfig = getFrameConfig(mqttConfig, esp.device_type_id, topicSuffix);

        if (frameConfig) {
          const { value: primaryValue, fieldName } = extractPrimaryMetric(obj, frameConfig);
          if (primaryValue !== null) {
            await q('UPDATE esp_devices SET last_seen = NOW(), last_db = $2 WHERE id = $1', [esp.id, primaryValue]);
            console.log(`[INFO] last_seen & last_db mis à jour (champ=${fieldName}):`, primaryValue);
          } else {
            await q('UPDATE esp_devices SET last_seen = NOW() WHERE id = $1', [esp.id]);
            console.log('[INFO] last_seen mis à jour (champ primaire absent dans payload)');
          }
        } else {
          await q('UPDATE esp_devices SET last_seen = NOW() WHERE id = $1', [esp.id]);
          console.log('[INFO] last_seen mis à jour (aucune frame configurée pour suffix:', topicSuffix, ')');
        }
      } else {
        // Chemin legacy : soundPct uniquement
        const pct = readSoundPct(obj);
        if (pct !== null) {
          await q('UPDATE esp_devices SET last_seen = NOW(), last_db = $2 WHERE id = $1', [esp.id, pct]);
          console.log('[INFO] last_seen & last_db mis à jour (legacy soundPct):', pct, '%');
        } else {
          await q('UPDATE esp_devices SET last_seen = NOW() WHERE id = $1', [esp.id]);
          console.log('[INFO] last_seen mis à jour (legacy, soundPct absent)');
        }
      }

      // 3c) Sys 3 — activité device (détection retour en ligne)
      onDeviceActivity(esp.id, esp.user_id, esp.name, esp.esp_uid).catch(() => {});

      // 3d) Sys 3 — évaluation règles capteur système
      evaluateSensorRules(esp, obj).catch(() => {});

      // 4-7) Évaluation des règles et envoi push
      await evaluateAlertRules(esp, obj, topic);
    } catch (e) {
      console.error('[ERR worker]', e);
    }
  });

  return client;
}

/**
 * Évalue les alert_rules actives d'un device contre un payload JSON,
 * envoie les push notifications et logue dans alert_log.
 *
 * Utilisé par le worker MQTT (vraies trames) ET par l'endpoint /simulate.
 *
 * @param {object} esp - { id, user_id, name, esp_uid, device_type_id, notif_title_tpl, notif_body_tpl }
 * @param {object} obj - Payload JSON parsé, ex: { soundPct: 75, soundAvg: 70 }
 * @param {string} topic - Topic MQTT, ex: "xamiot/simXXXXXX/data" (utilisé dans alert_log)
 */
export async function evaluateAlertRules(esp, obj, topic) {
  const defaultCooldownSec = int(process.env.DEFAULT_RULE_COOLDOWN_SEC, 120);
  const deviceName = (esp.name && String(esp.name).trim()) ? String(esp.name).trim() : (esp.esp_uid || esp.id);
  const chipid = esp.esp_uid || esp.id;

  // 4) Charger règles actives (Système 1 — alert_rules)
  const { rows: rules } = await q(
    `SELECT r.id, r.field, r.op, r.threshold_num, r.threshold_str, r.cooldown_sec
       FROM alert_rules r
      WHERE r.esp_id = $1 AND r.enabled = true`,
    [esp.id]
  );
  console.log('[INFO] rules actives:', rules.length);
  if (!rules.length) return;

  // 5) Récupérer les mobiles actifs du user (iOS + Android)
  const { rows: devices } = await q(
    `SELECT id, apns_token, fcm_token, platform, COALESCE(sandbox, false) AS sandbox
       FROM mobile_devices
      WHERE user_id = $1
        AND is_active = true`,
    [esp.user_id]
  );
  console.log('[INFO] mobile devices actifs:', devices.length);
  if (!devices.length) return;

  // 6) Évaluer chaque règle
  for (const r of rules) {
    const fieldName = (r.field && r.field.trim()) ? r.field.trim() : LEGACY_FIELD;
    const value = readField(obj, fieldName);
    const cooldownSec = int(r.cooldown_sec, defaultCooldownSec);

    console.log(
      `  [R] id=${r.id} field=${fieldName} op=${r.op} thr=${r.threshold_num ?? r.threshold_str} value=`,
      value
    );

    if (value === undefined) {
      console.log(`    -> champ "${fieldName}" absent. Champs disponibles =`, Object.keys(obj));
      continue;
    }

    const isMatch = ruleMatches(value, r.op, r.threshold_num, r.threshold_str);
    console.log('    -> match?', isMatch);
    if (!isMatch) continue;

    // Cooldown atomique
    const { rows: claimed } = await q(
      `INSERT INTO alert_state(rule_id, last_sent) VALUES($1, NOW())
       ON CONFLICT (rule_id) DO UPDATE
         SET last_sent = NOW()
         WHERE alert_state.last_sent IS NULL
            OR alert_state.last_sent + ($2::int * INTERVAL '1 second') < NOW()
       RETURNING rule_id`,
      [r.id, cooldownSec]
    );
    if (!claimed.length) {
      console.log(`    -> cooldown actif (${cooldownSec}s), skip`);
      continue;
    }

    // Métadonnées du champ (label + unité)
    let fieldLabel = fieldName;
    let fieldUnit  = '';
    if (esp.device_type_id) {
      const mqttCfg = await getMqttConfig();
      const allFields = getAllFrameFields(mqttCfg, esp.device_type_id);
      const fieldMeta = allFields.find(f => f.name.toLowerCase() === fieldName.toLowerCase());
      if (fieldMeta) {
        fieldLabel = fieldMeta.label || fieldName;
        fieldUnit  = fieldMeta.unit  || '';
      }
    }

    const thresholdDisplay =
      (r.threshold_num != null && Number.isFinite(Number(r.threshold_num)))
        ? String(r.threshold_num)
        : String(r.threshold_str ?? '');

    const tplVars = {
      device_name:   deviceName,
      field_name:    fieldName,
      field_label:   fieldLabel,
      unit:          fieldUnit,
      op:            r.op,
      threshold:     thresholdDisplay,
      current_value: String(value),
    };

    const titleTpl = esp.notif_title_tpl || '{device_name} — Alerte !';
    const bodyTpl  = esp.notif_body_tpl  || '{field_label} {op} {threshold} {unit} — valeur : {current_value} {unit}';

    const title = renderTemplate(titleTpl, tplVars);
    const body  = renderTemplate(bodyTpl,  tplVars);
    const currentDisplayForBody = fieldUnit ? `${value} ${fieldUnit}` : String(value);

    console.log('    [ALERT] title =', title);
    console.log('    [ALERT] body  =', body);

    // 7) Badge
    const { rows: badgeRows } = await q(
      `WITH up AS (
         INSERT INTO user_badge(user_id, unread_count)
         VALUES ($1, 1)
         ON CONFLICT (user_id)
         DO UPDATE SET unread_count = user_badge.unread_count + 1,
                       updated_at   = now()
         RETURNING unread_count
       )
       SELECT unread_count FROM up`,
      [esp.user_id]
    );
    const badge = Number(badgeRows?.[0]?.unread_count || 1);

    const pushData = {
      badge, topic, chipid,
      device_name: deviceName,
      esp_id: esp.id,
      rule_id: r.id,
      field: fieldName,
      op: r.op,
      threshold_num: r.threshold_num,
      threshold_str: r.threshold_str,
      threshold_display: thresholdDisplay,
      current_value: value,
      current_display: currentDisplayForBody,
    };

    const pushResults = [];

    for (const d of devices) {
      const platform = String(d.platform || '').toLowerCase();
      const isAndroid = platform.includes('android');

      if (isAndroid) {
        const res = await sendFCM(d.fcm_token, title, body, pushData);
        console.log('    [FCM]', `device=${d.id}`, `ok=${res.ok}`,
          res.ok ? `messageId=${res.messageId}` : `code=${res.code} msg=${res.message}`);
        if (!res.ok && res.disableDevice) {
          await q('UPDATE mobile_devices SET is_active=false WHERE id=$1', [d.id]);
          console.warn('    [FCM] token invalidé → device désactivé', d.id);
        }
        pushResults.push({
          device_id: d.id, platform: d.platform, channel: 'fcm',
          ok: !!res.ok, messageId: res.messageId || null,
          code: res.code || null, message: res.message || null,
        });
      } else {
        const res = await sendAPNS(d.apns_token, title, body, pushData, { sandbox: !!d.sandbox });
        console.log('    [APNS]', `device=${d.id}`, `env=${res.env}`,
          `status=${res.status}`, `reason=${res.reason || 'none'}`, `apns-id=${res.apnsId || 'n/a'}`);
        if (res.status === 410 || (res.status === 400 && /BadDeviceToken/i.test(res.body || ''))) {
          await q('UPDATE mobile_devices SET is_active=false WHERE id=$1', [d.id]);
          console.warn('    [APNS] token invalidé → device désactivé', d.id);
        }
        pushResults.push({
          device_id: d.id, platform: d.platform, channel: 'apns',
          ok: res.status === 200, env: res.env, status: res.status,
          reason: res.reason || null, apnsId: res.apnsId || null,
        });
      }
    }

    // 7b) LOG alert_log
    const anyOk = pushResults.some(r0 => r0.ok);
    const status = anyOk ? 'sent' : 'failed';
    const error = anyOk
      ? null
      : pushResults
          .filter(r0 => !r0.ok)
          .map(r0 => `device=${r0.device_id} ${r0.channel} ${r0.code || r0.status || 'fail'} ${r0.message || r0.reason || ''}`.trim())
          .join(' | ')
          .slice(0, 2000);

    const alertPayload = {
      title, body,
      field: fieldName, op: r.op,
      threshold_num: r.threshold_num, threshold_str: r.threshold_str,
      threshold_display: thresholdDisplay,
      current_value: value, current_display: currentDisplayForBody,
      topic, chipid, device_name: deviceName,
      esp_id: esp.id, rule_id: r.id,
      push_results: pushResults,
    };

    await q(
      `INSERT INTO alert_log (rule_id, esp_id, device_id, channel, status, payload, error)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [r.id, esp.id, chipid, 'push', status, JSON.stringify(alertPayload), error]
    );
    console.log('    -> alert logged in alert_log:', body);

    // Rétention
    await q(
      `DELETE FROM alert_log al
        WHERE al.device_id = $1
          AND al.id NOT IN (
            SELECT id FROM alert_log
             WHERE device_id = $1
             ORDER BY sent_at DESC
             LIMIT $2
          )`,
      [chipid, ALERT_KEEP_PER_DEVICE]
    );
  }
}

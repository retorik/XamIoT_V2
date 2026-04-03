// src/mqttWorker.js
import mqtt from 'mqtt';
import { q } from './db.js';
import { sendAPNS } from './apns.js';

/* ------------------------- Helpers config/env ------------------------- */
function bool(v, dflt = false) {
  if (v == null) return dflt;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}
function int(v, dflt) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
}

// Nombre d'entrées d'historique à garder par device_id (chipid)
const ALERT_KEEP_PER_DEVICE = int(process.env.ALERT_KEEP_PER_DEVICE, 20);

function buildMqttConfig() {
  const host = process.env.MQTT_HOST || 'mosquitto';
  const port = String(process.env.MQTT_PORT || '1883');
  const scheme = port === '8883' ? 'mqtts' : 'mqtt';
  const url = process.env.MQTT_URL || `${scheme}://${host}:${port}`;

  return {
    url,
    // Accepte les deux variantes d’ENV : USER/PASS ou USERNAME/PASSWORD
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
function readField(obj, name) {
  if (!obj || typeof obj !== 'object') return undefined;
  const target = String(name || '').toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === target) return obj[k];
  }
  return undefined;
}

function ruleMatches(value, op, thresholdNum, thresholdStr) {
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

/* ------------------------------ Worker ------------------------------- */

// Champ surveillé par défaut (moteur de règles)
const DEFAULT_RULE_FIELD = 'soundPct';

/** Lis UNIQUEMENT soundPct (insensible à la casse). Retourne 0..100 ou null */
function readSoundPct(obj) {
  if (!obj || typeof obj !== 'object') return null;

  // Cherche la clé "soundPct" sans tenir compte de la casse (évite soundPct_avg/min/max)
  const key = Object.keys(obj).find(k => k.toLowerCase() === 'soundpct');
  if (!key) return null;

  const v = obj[key];
  let n = null;

  if (typeof v === 'number') {
    n = v;
  } else if (typeof v === 'string') {
    const s = v.trim().replace(',', '.');     // support "11,5" ou "11.5" ou "11 %"
    const m = s.match(/-?\d+(?:\.\d+)?/);      // extrait la première valeur numérique
    if (m) n = parseFloat(m[0]);
  }

  if (!Number.isFinite(n)) return null;
  // clamp 0..100
  if (n < 0) n = 0;
  if (n > 100) n = 100;
  return n;
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

  client.on('connect', () => {
    console.log('[MQTT] connected', cfg.url, '→ subscribing:', cfg.subscribePattern);
    client.subscribe(cfg.subscribePattern, (err) => {
      if (err) console.error('[MQTT] subscribe error', err.message);
      else console.log('[MQTT] subscribe OK:', cfg.subscribePattern);
    });
  });

  client.on('error', (e) => console.error('[MQTT] error', e.message));

  client.on('message', async (topic, payload) => {
    const raw = payload?.toString?.() ?? '';
    console.log('\n--- [MSG]', topic, 'len=', raw.length, 'preview=', raw.slice(0, 200));

    try {
      // 1) Extraire chipid depuis devices/<chipid>/status
      const m = topic.match(/^devices\/([^/]+)\/status$/);
      if (!m) { console.log('[SKIP] topic non géré par le worker'); return; }
      const chipid = m[1];

      // 2) Parse JSON
      let obj;
      try { obj = JSON.parse(raw); }
      catch { console.warn('[SKIP] payload non-JSON'); return; }

      // 3) Map chipid -> esp_devices (via esp_uid)
      const { rows: espRows } = await q(
        'SELECT id, user_id, topic_prefix, name FROM esp_devices WHERE esp_uid = $1',
        [chipid]
      );
      if (!espRows.length) { console.warn('[SKIP] ESP inconnu:', chipid); return; }
      const esp = espRows[0];
      const deviceName = (esp.name && String(esp.name).trim()) ? String(esp.name).trim() : chipid;
      console.log('[OK] ESP match id=', esp.id, 'user_id=', esp.user_id, 'chipid=', chipid, 'name=', deviceName);

      // 3a) Mettre à jour last_seen / last_db à partir de soundPct UNIQUEMENT
      const pct = readSoundPct(obj);
      if (pct !== null) {
        await q('UPDATE esp_devices SET last_seen = NOW(), last_db = $2 WHERE id = $1', [esp.id, pct]);
        console.log('[INFO] last_seen & last_db mis à jour (via soundPct):', pct, '%');
      } else {
        await q('UPDATE esp_devices SET last_seen = NOW() WHERE id = $1', [esp.id]);
        const keys = Object.keys(obj || {});
        const sample = keys.slice(0, 8).map(k => `${k}=${JSON.stringify(obj[k])}`).join(', ');
        console.log('[INFO] last_seen mis à jour (soundPct absent). Champs vus =', keys, 'ex:', sample);
      }

      // 4) Charger règles actives + leur dernier envoi
      const { rows: rules } = await q(
        `SELECT r.id, r.field, r.op, r.threshold_num, r.threshold_str, r.cooldown_sec,
                a.last_sent
           FROM alert_rules r
      LEFT JOIN alert_state a ON a.rule_id = r.id
          WHERE r.esp_id = $1 AND r.enabled = true`,
        [esp.id]
      );
      console.log('[INFO] rules actives:', rules.length);
      if (!rules.length) return;

      // 5) Récupérer les mobiles APNs actifs du user (avec sandbox)
      const { rows: devices } = await q(
        `SELECT id, apns_token, COALESCE(sandbox, false) AS sandbox
           FROM mobile_devices
          WHERE user_id = $1
            AND is_active = true`,
        [esp.user_id]
      );
      console.log('[INFO] mobile devices actifs:', devices.length);
      if (!devices.length) return;

      const now = Date.now();

      // 6) Évaluer chaque règle
      for (const r of rules) {
        const fieldName = DEFAULT_RULE_FIELD; // 'soundPct' (forcé ici)
        const value = readField(obj, fieldName); // valeur % pour l'évaluation de la règle
        const cooldownSec = int(r.cooldown_sec, cfg.defaultCooldownSec);

        console.log(
          `  [R] id=${r.id} field=${fieldName} (raw=${r.field ?? 'default'}) op=${r.op} thr=${r.threshold_num ?? r.threshold_str} value=`,
          value
        );

        if (value === undefined) {
          console.log('    -> champ "soundPct" absent. Champs disponibles =', Object.keys(obj));
          continue;
        }

        // Cooldown
        if (r.last_sent) {
          const last = new Date(r.last_sent).getTime();
          if (Number.isFinite(last) && (now - last) < cooldownSec * 1000) {
            console.log(`    -> cooldown actif (${cooldownSec}s), skip`);
            continue;
          }
        }

        // Match ?
        const isMatch = ruleMatches(value, r.op, r.threshold_num, r.threshold_str);
        console.log('    -> match?', isMatch);
        if (!isMatch) continue;

        /* ---------- Construction Titre/Body demandés ---------- */
        // Seuil attendu sur SoundPct pour affichage (ex: "50%")
        const thresholdDisplay =
          (r.threshold_num != null && Number.isFinite(Number(r.threshold_num)))
            ? `${r.threshold_num}%`
            : String(r.threshold_str ?? '');

        // Valeur actuelle : reprendre EXACTEMENT celle de soundPct (comme avant), puis suffixe "xB"
        const currentDisplayForBody = `${value} xB`;

        const title = 'XamIoT SoundSense !';
        const body  = `Seuil > ${thresholdDisplay} avec ${currentDisplayForBody}. Périphérique : ${deviceName}.`;

        console.log('    [ALERT] title =', title);
        console.log('    [ALERT] body  =', body);

        // 7) Badge (compteur absolu non lu)
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

        // 7a) Envoi APNS (même titre/body, données enrichies pour debug/app)
        for (const d of devices) {
          const res = await sendAPNS(
            d.apns_token,
            title,
            body,
            {
              badge,                  // aps.badge
              topic,                  // topic MQTT d'origine
              chipid,                 // identifiant "humain"
              device_name: deviceName,
              esp_id: esp.id,         // identifiant interne
              rule_id: r.id,

              // Contexte règle
              field: fieldName,       // 'soundPct'
              op: r.op,
              threshold_num: r.threshold_num,
              threshold_str: r.threshold_str,
              threshold_display: thresholdDisplay,

              // Mesure actuelle (brute et display)
              current_value: value,
              current_display: currentDisplayForBody
            },
            { sandbox: !!d.sandbox }
          );

          console.log(
            '    [APNS]',
            `device=${d.id}`,
            `env=${res.env}`,
            `status=${res.status}`,
            `reason=${res.reason || 'none'}`,
            `apns-id=${res.apnsId || 'n/a'}`
          );

          // Enregistre le reason dans alert_log.error pour post-mortem (dernière alerte de ce device)
          if (res.status !== 200) {
            await q(
              `UPDATE alert_log
                  SET error = $1
                WHERE id = (
                  SELECT id FROM alert_log
                  WHERE device_id = $2
                  ORDER BY sent_at DESC
                  LIMIT 1
                )`,
              [res.reason || res.body || 'unknown', chipid]
            );
          }

          // Désactive le mobile device si token invalide
          if (
            res.status === 410 ||
            (res.status === 400 && /BadDeviceToken/i.test(res.body || ''))
          ) {
            await q('UPDATE mobile_devices SET is_active=false WHERE id=$1', [d.id]);
            console.warn('    [APNS] token invalidé → device désactivé', d.id);
          }
        }

        // 7b) LOG alert_log (payload enrichi + texte identique au body)
        const alertPayload = {
          title,
          body,

          // Contexte règle
          field: fieldName,
          op: r.op,
          threshold_num: r.threshold_num,
          threshold_str: r.threshold_str,
          threshold_display: thresholdDisplay,

          // Mesure actuelle (brute et display)
          current_value: value,
          current_display: currentDisplayForBody,

          // Transport / références
          topic,               // topic MQTT du message
          chipid,              // identifiant "humain"
          device_name: deviceName,
          esp_id: esp.id,
          rule_id: r.id,

          // aide au debug côté backoffice
          apns_env_per_device: devices.map((d) => ({
            device_id: d.id,
            sandbox: !!d.sandbox,
          })),
        };

        await q(
          `INSERT INTO alert_log (rule_id, device_id, channel, status, payload, error)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
          [ r.id, chipid, 'apns', 'sent', JSON.stringify(alertPayload), null ]
        );
        console.log('    -> alert logged in alert_log:', body);

        // Rétention: garder seulement N dernières par device_id (chipid)
        await q(
          `DELETE FROM alert_log al
            WHERE al.device_id = $1
              AND al.id NOT IN (
                SELECT id
                  FROM alert_log
                 WHERE device_id = $1
                 ORDER BY sent_at DESC
                 LIMIT $2
              )`,
          [ chipid, ALERT_KEEP_PER_DEVICE ]
        );
        console.log(`    -> retention applied for device ${chipid} (keep last ${ALERT_KEEP_PER_DEVICE})`);

        // 8) Upsert cooldown
        await q(
          `INSERT INTO alert_state(rule_id, last_sent) VALUES($1, NOW())
           ON CONFLICT (rule_id) DO UPDATE SET last_sent = EXCLUDED.last_sent`,
          [r.id]
        );
        console.log('    -> state updated (cooldown reset)');
      }
    } catch (e) {
      console.error('[ERR worker]', e);
    }
  });

  return client;
}

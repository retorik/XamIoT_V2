// src/sysNotifEngine.js
// Système 3 : Moteur de règles de notifications système (admin-defined)
// Indépendant du Système 1 (alert_rules) et du Système 2 (auto_notif_templates).

import { q } from './db.js';
import { sendAPNS } from './apns.js';
import { sendFCM } from './fcm.js';
import { createTransporter, buildFrom, isSmtpReady } from './smtp.js';

// Inline ruleMatches — évite la dépendance circulaire avec mqttWorker.js
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

// ─── Template engine ─────────────────────────────────────────────────────────

function renderTpl(tpl, vars) {
  if (!tpl) return '';
  return tpl.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v !== undefined && v !== null ? String(v) : `{${key}}`;
  });
}

// ─── Push helpers ─────────────────────────────────────────────────────────────

async function getMobileDevicesForUser(userId) {
  if (!userId) return [];
  const { rows } = await q(
    `SELECT id, apns_token, fcm_token, platform, COALESCE(sandbox, false) AS sandbox
       FROM mobile_devices
      WHERE user_id = $1 AND is_active = true
        AND (apns_token IS NOT NULL OR fcm_token IS NOT NULL)`,
    [userId]
  );
  return rows;
}

async function sendPushToDevices(devices, title, body, extraData = {}) {
  const results = [];
  for (const d of devices) {
    const platform = String(d.platform || '').toLowerCase();
    const isAndroid = platform.includes('android');
    if (isAndroid && d.fcm_token) {
      try {
        const { sendFCM: fcm } = await import('./fcm.js');
        const r = await fcm(d.fcm_token, title, body, extraData);
        if (!r.ok && r.disableDevice) {
          await q('UPDATE mobile_devices SET is_active=false WHERE id=$1', [d.id]).catch(() => {});
        }
        results.push({ device_id: d.id, channel: 'push_fcm', ok: !!r.ok, error: r.ok ? null : (r.message || null) });
      } catch (e) {
        results.push({ device_id: d.id, channel: 'push_fcm', ok: false, error: String(e?.message || e) });
      }
    } else if (!isAndroid && d.apns_token) {
      try {
        const { sendAPNS: apns } = await import('./apns.js');
        const r = await apns(d.apns_token, title, body, extraData, { sandbox: !!d.sandbox });
        if (r.status === 410 || (r.status === 400 && /BadDeviceToken/i.test(r.body || ''))) {
          await q('UPDATE mobile_devices SET is_active=false WHERE id=$1', [d.id]).catch(() => {});
        }
        results.push({ device_id: d.id, channel: 'push_apns', ok: r.status === 200, status: r.status, error: r.status !== 200 ? (r.reason || null) : null });
      } catch (e) {
        results.push({ device_id: d.id, channel: 'push_apns', ok: false, error: String(e?.message || e) });
      }
    }
  }
  return results;
}

async function sendEmailToUser(userId, subject, htmlBody) {
  if (!isSmtpReady()) return { ok: false, error: 'smtp_not_configured' };
  const { rows } = await q('SELECT email FROM users WHERE id=$1', [userId]);
  if (!rows[0]?.email) return { ok: false, error: 'user_email_not_found' };
  const transporter = await createTransporter();
  if (!transporter) return { ok: false, error: 'transporter_null' };
  try {
    await transporter.sendMail({
      from: buildFrom(),
      to: rows[0].email,
      subject,
      html: htmlBody,
      text: htmlBody.replace(/<[^>]+>/g, ''),
    });
    return { ok: true, to: rows[0].email };
  } catch (e) {
    return { ok: false, to: rows[0].email, error: String(e?.message || e) };
  }
}

// ─── Logger ───────────────────────────────────────────────────────────────────

async function log(ruleId, ruleName, triggerType, espId, userId, channel, recipient, status, triggerDetail, pushResult, error) {
  await q(
    `INSERT INTO sys_notif_log
       (rule_id, rule_name, trigger_type, esp_id, user_id, channel, recipient, status, trigger_detail, push_result, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)`,
    [
      ruleId || null, ruleName || null, triggerType,
      espId || null, userId || null,
      channel, recipient || null, status,
      triggerDetail ? JSON.stringify(triggerDetail) : null,
      pushResult ? JSON.stringify(pushResult) : null,
      error || null,
    ]
  ).catch(e => console.error('[SYS_NOTIF_LOG]', e.message));
}

// ─── Dispatch pour une règle + un device + un user ───────────────────────────

async function dispatchRule(rule, espId, userId, vars) {
  if (!userId) {
    await log(rule.id, rule.name, rule.trigger_type, espId, null, 'push_apns', null, 'skipped_no_recipient', vars, null, null);
    return;
  }

  // Push
  if (rule.channel_push) {
    const title = renderTpl(rule.push_title_tpl, vars);
    const body  = renderTpl(rule.push_body_tpl, vars);
    const devices = await getMobileDevicesForUser(userId);
    if (!devices.length) {
      await log(rule.id, rule.name, rule.trigger_type, espId, userId, 'push_apns', null, 'skipped_no_recipient', vars, null, null);
    } else {
      const pushResults = await sendPushToDevices(devices, title, body, { rule_id: rule.id, esp_id: espId });
      for (const r of pushResults) {
        await log(rule.id, rule.name, rule.trigger_type, espId, userId,
          r.channel, r.device_id,
          r.ok ? 'sent' : 'failed',
          vars, r, r.error || null
        );
        console.log(`[SYS_NOTIF][PUSH] rule=${rule.id} esp=${espId} device=${r.device_id} ${r.channel} ok=${r.ok}`);
      }
    }
  }

  // Email
  if (rule.channel_email && rule.email_subject_tpl && rule.email_html_tpl) {
    const subject  = renderTpl(rule.email_subject_tpl, vars);
    const htmlBody = renderTpl(rule.email_html_tpl, vars);
    if (!isSmtpReady()) {
      await log(rule.id, rule.name, rule.trigger_type, espId, userId, 'email', null, 'skipped_smtp_off', vars, null, null);
    } else {
      const r = await sendEmailToUser(userId, subject, htmlBody);
      await log(rule.id, rule.name, rule.trigger_type, espId, userId, 'email', r.to || null,
        r.ok ? 'sent' : 'failed', vars, null, r.error || null
      );
      console.log(`[SYS_NOTIF][EMAIL] rule=${rule.id} esp=${espId} to=${r.to} ok=${r.ok}${r.error ? ' err=' + r.error : ''}`);
    }
  }
}

// ─── Cooldown ─────────────────────────────────────────────────────────────────

async function isOnCooldown(ruleId, espId, cooldownSec) {
  const { rows } = await q(
    `SELECT last_notified FROM sys_notif_state WHERE rule_id=$1 AND esp_id=$2`,
    [ruleId, espId]
  );
  if (!rows.length || !rows[0].last_notified) return false;
  const elapsed = (Date.now() - new Date(rows[0].last_notified).getTime()) / 1000;
  return elapsed < cooldownSec;
}

async function updateCooldown(ruleId, espId) {
  await q(
    `INSERT INTO sys_notif_state (rule_id, esp_id, last_notified)
     VALUES ($1, $2, now())
     ON CONFLICT (rule_id, esp_id) DO UPDATE SET last_notified=now()`,
    [ruleId, espId]
  );
}

// ─── Chargement des règles actives ───────────────────────────────────────────

async function loadRulesForTrigger(triggerType) {
  const { rows } = await q(
    `SELECT r.*, COALESCE(
       json_agg(c ORDER BY c.sort_order) FILTER (WHERE c.id IS NOT NULL), '[]'
     ) AS conditions
       FROM sys_notif_rules r
       LEFT JOIN sys_notif_conditions c ON c.rule_id = r.id
      WHERE r.enabled = true AND r.trigger_type = $1
      GROUP BY r.id`,
    [triggerType]
  );
  return rows;
}

async function getDevicesForScope(rule) {
  let filter = '';
  const params = [];

  if (rule.scope_type === 'specific_device' && rule.scope_esp_id) {
    filter = 'WHERE e.id = $1';
    params.push(rule.scope_esp_id);
  } else if (rule.scope_type === 'device_type' && rule.scope_device_type_id) {
    filter = 'WHERE e.device_type_id = $1';
    params.push(rule.scope_device_type_id);
  }

  const { rows } = await q(
    `SELECT e.id, e.user_id, e.name, e.esp_uid, e.device_type_id, e.last_seen
       FROM esp_devices e
       ${filter}
      WHERE e.user_id IS NOT NULL`,
    params
  );
  return rows;
}

// ─── Évaluation des règles capteur (appelée depuis mqttWorker) ────────────────

/**
 * À appeler depuis mqttWorker.js après extraction des champs du message MQTT.
 * @param {object} esp - { id, user_id, name, esp_uid, device_type_id }
 * @param {Record<string, any>} fields - Valeurs du payload (ex: { soundPct: 72, temp: 23.5 })
 */
export async function evaluateSensorRules(esp, fields) {
  try {
    const rules = await loadRulesForTrigger('sensor_threshold');

    for (const rule of rules) {
      // Vérification du scope
      if (rule.scope_type === 'specific_device' && rule.scope_esp_id !== esp.id) continue;
      if (rule.scope_type === 'device_type' && rule.scope_device_type_id !== esp.device_type_id) continue;

      const conditions = rule.conditions || [];
      if (!conditions.length) continue;

      // Évaluation des conditions ET/OU
      const results = conditions.map(c => {
        const value = fields[c.field];
        if (value === undefined || value === null) return false;
        return ruleMatches(value, c.op, c.threshold_num, c.threshold_str);
      });

      const triggered = rule.logic_op === 'OR'
        ? results.some(Boolean)
        : results.every(Boolean);

      if (!triggered) continue;

      // Cooldown
      if (await isOnCooldown(rule.id, esp.id, rule.cooldown_sec)) {
        await log(rule.id, rule.name, 'sensor_threshold', esp.id, esp.user_id, 'push_apns', null, 'skipped_cooldown',
          { conditions: conditions.map((c, i) => ({ field: c.field, result: results[i] })), logic_op: rule.logic_op }, null, null);
        continue;
      }

      await updateCooldown(rule.id, esp.id);

      // Préparation des variables template
      const triggerCondition = conditions.find((c, i) => results[i]);
      const vars = {
        device_name: esp.name || esp.esp_uid,
        esp_uid: esp.esp_uid,
        rule_name: rule.name,
        trigger_label: triggerCondition
          ? `${triggerCondition.field} ${triggerCondition.op} ${triggerCondition.threshold_num ?? triggerCondition.threshold_str}`
          : rule.name,
        ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)])),
      };

      await dispatchRule(rule, esp.id, esp.user_id, vars);
    }
  } catch (e) {
    console.error('[SYS_NOTIF][SENSOR] Erreur:', e?.message || e);
  }
}

// ─── Mise à jour du statut online/offline par device ─────────────────────────

/**
 * À appeler depuis mqttWorker.js à chaque message MQTT reçu (device actif).
 * Détecte si un device revient en ligne après avoir été marqué offline.
 */
export async function onDeviceActivity(espId, userId, espName, espUid) {
  try {
    // Vérifier si le device était marqué offline
    const { rows: stateRows } = await q(
      `SELECT rule_id, is_offline FROM sys_notif_state
        WHERE esp_id = $1 AND is_offline = true`,
      [espId]
    );

    if (!stateRows.length) return;

    // Device de retour — charger les règles device_online
    const rules = await loadRulesForTrigger('device_online');

    for (const stateRow of stateRows) {
      // Marquer comme de nouveau en ligne
      await q(
        `UPDATE sys_notif_state
            SET is_offline=false, came_online_at=now()
          WHERE rule_id=$1 AND esp_id=$2`,
        [stateRow.rule_id, espId]
      );

      const rule = rules.find(r => r.id === stateRow.rule_id);
      if (!rule) continue;

      if (await isOnCooldown(rule.id, espId, rule.cooldown_sec)) continue;
      await updateCooldown(rule.id, espId);

      const vars = {
        device_name: espName || espUid,
        esp_uid: espUid,
        rule_name: rule.name,
        trigger_label: 'Périphérique de retour en ligne',
      };
      await dispatchRule(rule, espId, userId, vars);
    }
  } catch (e) {
    console.error('[SYS_NOTIF][ONLINE] Erreur:', e?.message || e);
  }
}

// ─── Vérification périodique hors-ligne ──────────────────────────────────────

/**
 * À appeler toutes les minutes via setInterval dans app.js.
 * Vérifie les devices silencieux/hors-ligne contre les règles système.
 */
export async function checkOfflineDevices() {
  try {
    const offlineRules  = await loadRulesForTrigger('device_offline');
    const silenceRules  = await loadRulesForTrigger('device_silence');

    for (const rule of [...offlineRules, ...silenceRules]) {
      const devices = await getDevicesForScope(rule);
      const thresholdMs = (rule.offline_threshold_sec || 300) * 1000;

      for (const esp of devices) {
        const lastSeen = esp.last_seen ? new Date(esp.last_seen).getTime() : 0;
        const silentMs = Date.now() - lastSeen;

        if (silentMs < thresholdMs) {
          // Device actif — si était offline, le marquer en ligne (géré par onDeviceActivity mais sécurité)
          continue;
        }

        // Device silencieux depuis au moins offline_threshold_sec
        const cooldown = await isOnCooldown(rule.id, esp.id, rule.cooldown_sec);
        if (cooldown) continue;

        // Vérifier si était déjà marqué offline (pour ne notifier qu'une fois)
        const { rows: stateRows } = await q(
          `SELECT is_offline, went_offline_at FROM sys_notif_state WHERE rule_id=$1 AND esp_id=$2`,
          [rule.id, esp.id]
        );
        const state = stateRows[0];

        if (!state) {
          // Première détection — créer l'état
          await q(
            `INSERT INTO sys_notif_state (rule_id, esp_id, is_offline, went_offline_at, last_notified)
             VALUES ($1, $2, true, now(), now())`,
            [rule.id, esp.id]
          );
        } else if (state.is_offline) {
          // Déjà notifié et encore offline — skip (cooldown gère la ré-notification)
          continue;
        } else {
          // Passe en offline
          await q(
            `UPDATE sys_notif_state SET is_offline=true, went_offline_at=now() WHERE rule_id=$1 AND esp_id=$2`,
            [rule.id, esp.id]
          );
        }

        await updateCooldown(rule.id, esp.id);

        const silentMin = Math.round(silentMs / 60000);
        const vars = {
          device_name: esp.name || esp.esp_uid,
          esp_uid: esp.esp_uid,
          rule_name: rule.name,
          trigger_label: rule.trigger_type === 'device_silence'
            ? `Silence depuis ${silentMin} min`
            : `Hors ligne depuis ${silentMin} min`,
          silent_minutes: String(silentMin),
          threshold_minutes: String(Math.round(thresholdMs / 60000)),
        };

        await dispatchRule(rule, esp.id, esp.user_id, vars);
      }
    }
  } catch (e) {
    console.error('[SYS_NOTIF][OFFLINE] Erreur:', e?.message || e);
  }
}

// src/notifDispatcher.js
// Système 2 : Dispatcher de notifications transactionnelles automatiques
// Appelé par auth.js, ordersRouter.js, ticketsRouter.js, app.js, adminRoutes.js, mqttWorker.js
// N'a AUCUN lien avec alert_rules / alert_log (Système 1 — règles périphériques utilisateur)

import { q } from './db.js';
import { sendAPNS } from './apns.js';
import { sendFCM } from './fcm.js';
import { createTransporter, buildFrom, isSmtpReady } from './smtp.js';

// ─── Libellés pour les statuts ───────────────────────────────────────────────

const ORDER_STATUS_LABELS = {
  pending:    'En attente',
  paid:       'Payé',
  processing: 'En préparation',
  shipped:    'Expédié',
  delivered:  'Livré',
  cancelled:  'Annulé',
  refunded:   'Remboursé',
};

const TICKET_STATUS_LABELS = {
  open:        'Ouvert',
  in_progress: 'En cours',
  resolved:    'Résolu',
  closed:      'Fermé',
};

const RMA_STATUS_LABELS = {
  pending:   'En attente',
  approved:  'Approuvé',
  rejected:  'Refusé',
  received:  'Reçu',
  refunded:  'Remboursé',
  replaced:  'Remplacé',
};

export function getStatusLabel(type, status) {
  const map = { order: ORDER_STATUS_LABELS, ticket: TICKET_STATUS_LABELS, rma: RMA_STATUS_LABELS };
  return map[type]?.[status] || status;
}

// ─── Substitution de variables ────────────────────────────────────────────────

function renderTpl(tpl, vars) {
  if (!tpl) return '';
  return tpl.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v !== undefined && v !== null ? String(v) : `{${key}}`;
  });
}

// ─── Résolution des destinataires push ───────────────────────────────────────

async function getMobileDevices(userId) {
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

async function getAdminMobileDevices() {
  const { rows } = await q(
    `SELECT m.id, m.apns_token, m.fcm_token, m.platform, COALESCE(m.sandbox, false) AS sandbox
       FROM mobile_devices m
       JOIN users u ON u.id = m.user_id
      WHERE u.is_admin = true AND m.is_active = true
        AND (m.apns_token IS NOT NULL OR m.fcm_token IS NOT NULL)`
  );
  return rows;
}

async function getAdminEmails() {
  const { rows } = await q(
    `SELECT email FROM users WHERE is_admin = true AND is_active = true AND email IS NOT NULL`
  );
  return rows.map(r => r.email);
}

// ─── Envoi push ───────────────────────────────────────────────────────────────

async function sendPushToDevices(devices, title, body, extraData = {}) {
  const results = [];
  for (const d of devices) {
    const platform = String(d.platform || '').toLowerCase();
    const isAndroid = platform.includes('android');
    if (isAndroid && d.fcm_token) {
      try {
        const r = await sendFCM(d.fcm_token, title, body, extraData);
        if (!r.ok && r.disableDevice) {
          await q('UPDATE mobile_devices SET is_active=false WHERE id=$1', [d.id]).catch(() => {});
        }
        results.push({ device_id: d.id, channel: 'push_fcm', ok: !!r.ok, messageId: r.messageId || null, error: r.ok ? null : (r.message || null) });
      } catch (e) {
        results.push({ device_id: d.id, channel: 'push_fcm', ok: false, error: String(e?.message || e) });
      }
    } else if (!isAndroid && d.apns_token) {
      try {
        const r = await sendAPNS(d.apns_token, title, body, extraData, { sandbox: !!d.sandbox });
        if (r.status === 410 || (r.status === 400 && /BadDeviceToken/i.test(r.body || ''))) {
          await q('UPDATE mobile_devices SET is_active=false WHERE id=$1', [d.id]).catch(() => {});
        }
        results.push({ device_id: d.id, channel: 'push_apns', ok: r.status === 200, status: r.status, apnsId: r.apnsId || null, error: r.status !== 200 ? (r.reason || null) : null });
      } catch (e) {
        results.push({ device_id: d.id, channel: 'push_apns', ok: false, error: String(e?.message || e) });
      }
    }
  }
  return results;
}

// ─── Envoi email ──────────────────────────────────────────────────────────────

async function sendEmailTo(toAddresses, subject, htmlBody) {
  if (!isSmtpReady()) return { ok: false, error: 'smtp_not_configured' };
  const transporter = await createTransporter();
  if (!transporter) return { ok: false, error: 'transporter_null' };
  const results = [];
  for (const to of toAddresses) {
    try {
      await transporter.sendMail({ from: buildFrom(), to, subject, html: htmlBody, text: htmlBody.replace(/<[^>]+>/g, '') });
      results.push({ to, ok: true });
    } catch (e) {
      results.push({ to, ok: false, error: String(e?.message || e) });
    }
  }
  return results;
}

// ─── Logger ───────────────────────────────────────────────────────────────────

async function log(eventKey, userId, resourceType, resourceId, channel, recipient, status, pushResult, error, varsUsed) {
  await q(
    `INSERT INTO auto_notif_log
       (event_key, user_id, resource_type, resource_id, channel, recipient, status, push_result, error, vars_used)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb)`,
    [eventKey, userId || null, resourceType || null, resourceId || null, channel, recipient || null,
     status, pushResult ? JSON.stringify(pushResult) : null, error || null,
     varsUsed ? JSON.stringify(varsUsed) : null]
  ).catch(e => console.error('[AUTO_NOTIF_LOG] erreur:', e.message));
}

// ─── Point d'entrée principal ────────────────────────────────────────────────

/**
 * Dispatche une notification pour un événement métier.
 *
 * @param {string} eventKey - Clé de l'événement (ex: 'order_shipped')
 * @param {string|null} userId - UUID de l'utilisateur destinataire (null si admin)
 * @param {Record<string,string>} vars - Variables à substituer dans les templates
 * @param {object} opts
 * @param {string} [opts.resourceType] - Type de ressource (order, ticket, rma, esp_device...)
 * @param {string} [opts.resourceId]   - UUID de la ressource
 * @param {boolean} [opts.adminOnly]   - true = envoyer aux admins (tickets entrants, RMA...)
 */
export async function dispatch(eventKey, userId, vars = {}, opts = {}) {
  const { resourceType, resourceId, adminOnly = false } = opts;

  try {
    // 1. Charger le template
    const { rows } = await q(
      'SELECT * FROM auto_notif_templates WHERE event_key = $1',
      [eventKey]
    );
    if (!rows.length) {
      console.log(`[NOTIF] Pas de template pour "${eventKey}" — skip`);
      return;
    }
    const tpl = rows[0];

    // 2. Si désactivé sur tous les canaux, skip
    if (!tpl.push_enabled && !tpl.email_enabled) {
      console.log(`[NOTIF] "${eventKey}" désactivé — skip`);
      await log(eventKey, userId, resourceType, resourceId, 'push_apns', null, 'skipped_disabled', null, null, vars);
      return;
    }

    // ── Push ──────────────────────────────────────────────────────────
    if (tpl.push_enabled && tpl.push_title_tpl && tpl.push_body_tpl) {
      const title = renderTpl(tpl.push_title_tpl, vars);
      const body  = renderTpl(tpl.push_body_tpl, vars);
      const devices = adminOnly ? await getAdminMobileDevices() : await getMobileDevices(userId);

      if (!devices.length) {
        await log(eventKey, userId, resourceType, resourceId, 'push_apns', null, 'skipped_no_recipient', null, null, vars);
      } else {
        const pushResults = await sendPushToDevices(devices, title, body, { event: eventKey, resource_id: resourceId });
        for (const r of pushResults) {
          await log(eventKey, userId, resourceType, resourceId,
            r.channel, r.device_id,
            r.ok ? 'sent' : 'failed',
            r, r.error || null, vars
          );
          console.log(`[NOTIF][PUSH] ${eventKey} device=${r.device_id} ${r.channel} ok=${r.ok}`);
        }
      }
    }

    // ── Email ─────────────────────────────────────────────────────────
    if (tpl.email_enabled && tpl.email_subject_tpl && tpl.email_html_tpl) {
      const subject  = renderTpl(tpl.email_subject_tpl, vars);
      let htmlBody = renderTpl(tpl.email_html_tpl, vars);
      // Convertir les boutons CTA (span[data-cta-btn]) en liens email-compatibles
      htmlBody = htmlBody.replace(
        /<span[^>]*data-cta-btn="1"[^>]*data-href="([^"]*)"[^>]*data-label="([^"]*)"[^>]*data-color="([^"]*)"[^>]*>[^<]*<\/span>/g,
        (_, href, label, color) =>
          `<a href="${href}" style="display:inline-block;background:${color};color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-family:Arial,sans-serif;font-size:14px;">${label}</a>`
      );

      let toAddresses = [];
      if (adminOnly) {
        toAddresses = await getAdminEmails();
      } else if (userId) {
        const { rows: uRows } = await q('SELECT email FROM users WHERE id=$1', [userId]);
        if (uRows[0]?.email) toAddresses = [uRows[0].email];
      }

      if (!toAddresses.length) {
        await log(eventKey, userId, resourceType, resourceId, 'email', null, 'skipped_no_recipient', null, null, vars);
      } else if (!isSmtpReady()) {
        for (const to of toAddresses) {
          await log(eventKey, userId, resourceType, resourceId, 'email', to, 'skipped_smtp_off', null, null, vars);
        }
      } else {
        const emailResults = await sendEmailTo(toAddresses, subject, htmlBody);
        for (const r of emailResults) {
          await log(eventKey, userId, resourceType, resourceId, 'email', r.to,
            r.ok ? 'sent' : 'failed', null, r.error || null, vars
          );
          console.log(`[NOTIF][EMAIL] ${eventKey} to=${r.to} ok=${r.ok}${r.error ? ' err=' + r.error : ''}`);
        }
      }
    }
  } catch (e) {
    console.error(`[NOTIF] Erreur dispatch "${eventKey}":`, e?.message || e);
  }
}

// src/scheduledNotifWorker.js
// Système 4 : Exécution des notifications planifiées (scheduled_notifs)
// Appelé toutes les minutes via setInterval depuis app.js.

import { q } from './db.js';
import { sendAPNS } from './apns.js';
import { sendFCM } from './fcm.js';
import { createTransporter, buildFrom, isSmtpReady, recordSendOutcome } from './smtp.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderTpl(tpl, vars = {}) {
  if (!tpl) return '';
  return tpl.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v !== undefined && v !== null ? String(v) : `{${key}}`;
  });
}

function nextRecurrence(from, recurrence) {
  const d = new Date(from);
  switch (recurrence) {
    case 'daily':   d.setDate(d.getDate() + 1); break;
    case 'weekly':  d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    default: return null;
  }
  return d;
}

// ─── Résolution des destinataires ────────────────────────────────────────────

async function resolveRecipients(notif) {
  let where = 'WHERE m.is_active = true AND (m.apns_token IS NOT NULL OR m.fcm_token IS NOT NULL)';
  const params = [];
  let idx = 1;

  // Filtre par liste explicite d'utilisateurs
  if (notif.filter_user_ids?.length) {
    where += ` AND m.user_id = ANY($${idx++}::uuid[])`;
    params.push(notif.filter_user_ids);
  }

  // Filtre par type de device IoT (les utilisateurs qui ont un device de ce type)
  if (notif.filter_device_type_id) {
    where += ` AND m.user_id IN (
      SELECT DISTINCT user_id FROM esp_devices WHERE device_type_id = $${idx++}
    )`;
    params.push(notif.filter_device_type_id);
  }

  // Filtre par plateforme mobile
  if (notif.filter_mobile_platform) {
    where += ` AND m.platform ILIKE $${idx++}`;
    params.push(`%${notif.filter_mobile_platform}%`);
  }

  // Filtre has_push (déjà inclus dans le WHERE de base)
  // Si false → inclure aussi les users sans token push (email only)
  if (notif.filter_has_push === false) {
    // Pas de filtre push — email only
    where = where.replace('AND (m.apns_token IS NOT NULL OR m.fcm_token IS NOT NULL)', '');
  }

  const { rows: devices } = await q(
    `SELECT m.id, m.user_id, m.apns_token, m.fcm_token, m.platform,
            COALESCE(m.sandbox, false) AS sandbox
       FROM mobile_devices m
       ${where}`,
    params
  );

  // Pour email : on récupère les emails des utilisateurs uniques
  const userIds = [...new Set(devices.map(d => d.user_id))];
  let emailAddresses = [];
  if (notif.email_enabled && userIds.length) {
    const { rows: uRows } = await q(
      `SELECT id, email FROM users WHERE id = ANY($1::uuid[]) AND is_active = true AND email IS NOT NULL`,
      [userIds]
    );
    emailAddresses = uRows;
  }

  return { devices, emailAddresses };
}

// ─── Envoi ────────────────────────────────────────────────────────────────────

async function sendPushBatch(notifId, devices, title, body) {
  let sent = 0, failed = 0;
  for (const d of devices) {
    const platform = String(d.platform || '').toLowerCase();
    const isAndroid = platform.includes('android');
    try {
      if (isAndroid && d.fcm_token) {
        const { sendFCM: fcm } = await import('./fcm.js');
        const r = await fcm(d.fcm_token, title, body, { scheduled_notif_id: notifId });
        if (!r.ok && r.disableDevice) {
          await q('UPDATE mobile_devices SET is_active=false WHERE id=$1', [d.id]).catch(() => {});
        }
        r.ok ? sent++ : failed++;
        console.log(`[SCHEDULED][PUSH_FCM] notif=${notifId} device=${d.id} ok=${r.ok}`);
      } else if (!isAndroid && d.apns_token) {
        const { sendAPNS: apns } = await import('./apns.js');
        const r = await apns(d.apns_token, title, body, { scheduled_notif_id: notifId }, { sandbox: !!d.sandbox });
        if (r.status === 410 || (r.status === 400 && /BadDeviceToken/i.test(r.body || ''))) {
          await q('UPDATE mobile_devices SET is_active=false WHERE id=$1', [d.id]).catch(() => {});
        }
        r.status === 200 ? sent++ : failed++;
        console.log(`[SCHEDULED][PUSH_APNS] notif=${notifId} device=${d.id} status=${r.status}`);
      }
    } catch (e) {
      failed++;
      console.error(`[SCHEDULED][PUSH] notif=${notifId} device=${d.id} error:`, e?.message || e);
    }
  }
  return { sent, failed };
}

async function sendEmailBatch(notifId, emailAddresses, subject, html) {
  if (!isSmtpReady()) {
    console.log(`[SCHEDULED][EMAIL] SMTP non configuré — notif=${notifId} skip`);
    return { sent: 0, failed: 0 };
  }
  const transporter = await createTransporter();
  if (!transporter) return { sent: 0, failed: 0 };
  let sent = 0, failed = 0;
  for (const u of emailAddresses) {
    try {
      await transporter.sendMail({
        from: buildFrom(),
        to: u.email,
        subject,
        html,
        text: html.replace(/<[^>]+>/g, ''),
      });
      sent++;
      recordSendOutcome(true);
      console.log(`[SCHEDULED][EMAIL] notif=${notifId} to=${u.email} ok=true`);
    } catch (e) {
      failed++;
      recordSendOutcome(false, e);
      console.error(`[SCHEDULED][EMAIL] notif=${notifId} to=${u.email} error:`, e?.message || e);
    }
  }
  return { sent, failed };
}

// ─── Exécution d'une notification ────────────────────────────────────────────

async function executeNotif(notif) {
  console.log(`[SCHEDULED] Exécution notif id=${notif.id} name="${notif.name}"`);
  let totalSent = 0, totalFailed = 0, lastError = null;

  try {
    const { devices, emailAddresses } = await resolveRecipients(notif);

    // Push
    if (notif.push_enabled && notif.push_title && notif.push_body) {
      if (!devices.length) {
        console.log(`[SCHEDULED][PUSH] notif=${notif.id} — aucun destinataire push`);
      } else {
        const r = await sendPushBatch(notif.id, devices, notif.push_title, notif.push_body);
        totalSent += r.sent;
        totalFailed += r.failed;
      }
    }

    // Email
    if (notif.email_enabled && notif.email_subject && notif.email_html) {
      if (!emailAddresses.length) {
        console.log(`[SCHEDULED][EMAIL] notif=${notif.id} — aucun destinataire email`);
      } else {
        const r = await sendEmailBatch(notif.id, emailAddresses, notif.email_subject, notif.email_html);
        totalSent += r.sent;
        totalFailed += r.failed;
      }
    }
  } catch (e) {
    lastError = e?.message || String(e);
    console.error(`[SCHEDULED] Erreur exécution notif=${notif.id}:`, lastError);
  }

  // Calculer next_run_at si récurrence
  const now = new Date();
  const nextRun = notif.recurrence
    ? nextRecurrence(now, notif.recurrence)
    : null;

  const isExpired = nextRun && notif.recurrence_end_at && nextRun > new Date(notif.recurrence_end_at);
  const newStatus = lastError
    ? 'error'
    : (nextRun && !isExpired ? 'pending' : 'sent');

  await q(
    `UPDATE scheduled_notifs
        SET status=$1, last_run_at=now(), next_run_at=$2, run_count=run_count+1, last_error=$3, updated_at=now()
      WHERE id=$4`,
    [newStatus, (nextRun && !isExpired) ? nextRun.toISOString() : null, lastError || null, notif.id]
  );

  console.log(`[SCHEDULED] notif=${notif.id} status=${newStatus} sent=${totalSent} failed=${totalFailed} next=${nextRun?.toISOString() ?? 'none'}`);
}

// ─── Point d'entrée principal ────────────────────────────────────────────────

let isRunning = false;

/**
 * À appeler toutes les minutes depuis app.js via setInterval.
 * Pickup les notifications dont next_run_at <= now() (ou scheduled_at si premier run).
 */
export async function runScheduledNotifs() {
  if (isRunning) return; // évite les exécutions concurrentes
  isRunning = true;
  try {
    const { rows } = await q(
      `SELECT * FROM scheduled_notifs
        WHERE status = 'pending'
          AND (next_run_at IS NOT NULL AND next_run_at <= now()
            OR next_run_at IS NULL AND scheduled_at <= now())
        ORDER BY scheduled_at ASC
        LIMIT 20` // max 20 par tick pour éviter la saturation
    );

    for (const notif of rows) {
      await executeNotif(notif);
    }
  } catch (e) {
    console.error('[SCHEDULED] Erreur worker:', e?.message || e);
  } finally {
    isRunning = false;
  }
}

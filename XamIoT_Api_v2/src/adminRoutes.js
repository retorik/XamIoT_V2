// src/adminRoutes.js
import express from 'express';
import { q } from './db.js';
import { login, requireAuth } from './auth.js';
import { authLimiter as adminAuthLimiter, pollLimiter, reloadRateLimitConfig, getRateLimitConfig, getRateLimitLogs, getRateLimitStats, getIpTable, resetIpEntry, appLimiter } from './rateLimitManager.js';
import { reloadApnsConfig, sendAPNS, isApnsEnabled } from './apns.js';
import { reloadFcmConfig, isFcmReady, sendFCM } from './fcm.js';
import { reloadMqttConfig } from './mqttConfig.js';
import { reloadSmtpConfig, isSmtpReady, getSmtpConfig, createTransporter, buildFrom } from './smtp.js';
import { validateCampaignPayload, buildRecipientsFilter, aggregateSendResults } from './campaignService.js';
import { dispatch } from './notifDispatcher.js';
import { adminNotifRouter } from './adminNotifRouter.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const OTA_DIR   = process.env.OTA_DIR   || '/data/ota';
const MEDIA_DIR = process.env.MEDIA_DIR || '/data/media';

// Crée les répertoires si nécessaire (best-effort)
try { fs.mkdirSync(OTA_DIR,   { recursive: true }); } catch {}
try { fs.mkdirSync(MEDIA_DIR, { recursive: true }); } catch {}

// ── Multer — upload médias ──────────────────────────────────
const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const sub = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dir = path.join(MEDIA_DIR, sub);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const uuid = crypto.randomUUID();
    cb(null, `${uuid}${ext}`);
  },
});
const mediaUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 Mo
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','application/pdf','video/mp4'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const otaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, OTA_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});
const otaUpload = multer({
  storage: otaStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
});

export const adminRouter = express.Router();

/* =========================
 *  Endpoints publics admin
 * ========================= */

adminRouter.get('/health', (req, res) => res.json({ ok: true, scope: 'admin' }));

adminRouter.post('/login', adminAuthLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email_password_required' });
  try {
    const out = await login(email, password);
    const userId = out?.user?.id;
    const { rows } = await q(
      'SELECT COALESCE(is_admin,false) AS is_admin FROM users WHERE id=$1',
      [userId]
    );
    if (!rows?.[0]?.is_admin) return res.status(403).json({ error: 'admin_required' });
    res.json({ ...out, admin: true });
  } catch (e) {
    if (e?.message === 'account_inactive') return res.status(403).json({ error: 'account_inactive' });
    return res.status(401).json({ error: 'invalid_credentials' });
  }
});

/* =========================
 *  Middleware admin
 * ========================= */

async function requireAdmin(req, res, next) {
  try {
    const { rows } = await q(
      'SELECT COALESCE(is_admin,false) AS is_admin FROM users WHERE id=$1',
      [req.user.sub]
    );
    if (!rows?.[0]?.is_admin) return res.status(403).json({ error: 'admin_required' });
    return next();
  } catch (e) {
    console.error('[ADMIN] requireAdmin failed:', e);
    return res.status(500).json({ error: 'admin_check_failed' });
  }
}

adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);
adminRouter.use('/', adminNotifRouter);

/* =========================
 *  GET /admin/status
 * ========================= */

adminRouter.get('/status', pollLimiter, async (req, res, next) => {
  try {
    await q('SELECT 1');
    res.json({ api: 'ok', db: 'ok' });
  } catch (e) {
    res.json({ api: 'ok', db: 'error' });
  }
});

/* =========================
 *  GET /admin/me  — correction du bug bloquant
 * ========================= */

adminRouter.get('/me', async (req, res, next) => {
  try {
    const { rows } = await q(
      'SELECT id, email, first_name, last_name, COALESCE(is_admin,false) AS is_admin FROM users WHERE id=$1',
      [req.user.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'user_not_found' });
    res.json({ ...rows[0], admin: true });
  } catch (e) { next(e); }
});

/* =========================
 *  Summary / dashboard
 * ========================= */

adminRouter.get('/summary', async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT
        (SELECT count(*)::int FROM users)                                                                       AS users_total,
        (SELECT count(*)::int FROM users WHERE is_active=true)                                                 AS users_active,
        (SELECT count(*)::int FROM mobile_devices)                                                             AS mobiles_total,
        (SELECT count(*)::int FROM mobile_devices WHERE is_active=true)                                        AS mobiles_active,
        (SELECT count(*)::int FROM esp_devices WHERE user_id IS NOT NULL)                                      AS esp_total,
        (SELECT count(*)::int FROM alert_rules)                                                                AS rules_total,
        (SELECT count(*)::int FROM alert_rules WHERE enabled=true)                                             AS rules_active,
        (SELECT count(*)::int FROM alert_log)                                                                  AS alerts_total,
        (SELECT max(sent_at) FROM alert_log)                                                                   AS last_alert_at,
        (SELECT count(*)::int FROM support_tickets)                                                            AS tickets_total,
        (SELECT count(*)::int FROM support_tickets WHERE status IN ('open','in_progress'))                     AS tickets_open,
        (SELECT count(*)::int FROM rma_requests)                                                               AS rma_total,
        (SELECT count(*)::int FROM rma_requests WHERE status IN ('pending','approved','received'))              AS rma_open,
        (SELECT count(*)::int FROM orders)                                                                     AS orders_total,
        (SELECT count(*)::int FROM orders WHERE status IN ('pending','paid','processing','shipped'))            AS orders_active,
        (SELECT count(*)::int FROM orders WHERE status IN ('delivered','cancelled','refunded'))                 AS orders_done
    `);
    res.json(rows[0] || {});
  } catch (e) { next(e); }
});

/* =========================
 *  Users
 * ========================= */

adminRouter.get('/users', async (req, res, next) => {
  try {
    const { q: search, limit = '50', offset = '0' } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    const off = parseInt(offset, 10) || 0;
    const where = [];
    const params = [];
    let i = 1;
    if (search) {
      where.push(`(u.email ILIKE $${i} OR COALESCE(u.first_name,'') ILIKE $${i} OR COALESCE(u.last_name,'') ILIKE $${i} OR COALESCE(u.phone,'') ILIKE $${i})`);
      params.push(`%${search}%`);
      i += 1;
    }
    const sql = `
      SELECT
        u.id, u.email, u.first_name, u.last_name, u.phone,
        u.created_at, u.is_active, u.activated_at,
        COALESCE(u.is_admin,false) AS is_admin,
        COALESCE(ub.unread_count,0)::int AS unread_badge,
        (SELECT count(*)::int FROM mobile_devices m WHERE m.user_id=u.id) AS mobile_count,
        (SELECT count(*)::int FROM mobile_devices m WHERE m.user_id=u.id AND m.is_active=true) AS mobile_active_count,
        (SELECT max(m.last_seen) FROM mobile_devices m WHERE m.user_id=u.id) AS last_mobile_seen,
        (SELECT count(*)::int FROM esp_devices e WHERE e.user_id=u.id) AS esp_count,
        (SELECT max(e.last_seen) FROM esp_devices e WHERE e.user_id=u.id) AS last_esp_seen,
        (SELECT count(*)::int FROM alert_log al JOIN esp_devices e ON e.esp_uid=al.device_id WHERE e.user_id=u.id) AS alert_count,
        (SELECT max(al.sent_at) FROM alert_log al JOIN esp_devices e ON e.esp_uid=al.device_id WHERE e.user_id=u.id) AS last_alert_at
      FROM users u
      LEFT JOIN user_badge ub ON ub.user_id=u.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY u.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;
    params.push(lim, off);
    const { rows } = await q(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

adminRouter.get('/users/:id', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { rows: uRows } = await q(
      'SELECT id, email, first_name, last_name, phone, created_at, is_active, activated_at, COALESCE(is_admin,false) AS is_admin FROM users WHERE id=$1',
      [userId]
    );
    if (!uRows.length) return res.status(404).json({ error: 'user_not_found' });
    const user = uRows[0];
    const { rows: mobiles } = await q(
      'SELECT id, name, platform, bundle_id, apns_token, fcm_token, sandbox, model, os_version, timezone, app_version, app_build_number, is_active, created_at, last_seen FROM mobile_devices WHERE user_id=$1 ORDER BY last_seen DESC',
      [userId]
    );
    const { rows: esp } = await q(
      `SELECT e.id, e.esp_uid, e.name, e.topic_prefix, e.last_seen, e.last_db, e.mqtt_enabled, e.is_superuser,
              e.fw_version, e.device_type_id, dt.name AS device_type_name
         FROM esp_devices e
         LEFT JOIN device_types dt ON dt.id = e.device_type_id
        WHERE e.user_id=$1 ORDER BY e.name NULLS LAST, e.esp_uid`,
      [userId]
    );
    const { rows: rules } = await q(
      `SELECT r.*, e.esp_uid, e.name AS esp_name, s.last_sent
         FROM alert_rules r
         JOIN esp_devices e ON e.id=r.esp_id
    LEFT JOIN alert_state s ON s.rule_id=r.id
        WHERE e.user_id=$1
        ORDER BY r.created_at DESC`,
      [userId]
    );
    const { rows: alerts } = await q(
      `SELECT al.id, al.sent_at, al.channel, al.status, al.error, al.payload,
              al.rule_id, al.device_id AS esp_uid, e.id AS esp_id, e.name AS esp_name
         FROM alert_log al
         LEFT JOIN esp_devices e ON e.esp_uid=al.device_id
        WHERE e.user_id=$1
        ORDER BY al.sent_at DESC
        LIMIT 200`,
      [userId]
    );
    const { rows: badgeRows } = await q(
      'SELECT unread_count::int AS unread_count, updated_at FROM user_badge WHERE user_id=$1',
      [userId]
    );
    res.json({
      user,
      badge: badgeRows[0] || { unread_count: 0, updated_at: null },
      mobiles,
      esp_devices: esp,
      rules,
      alerts,
    });
  } catch (e) { next(e); }
});

/* =========================
 *  Admin : modifier un utilisateur
 * ========================= */

adminRouter.patch('/users/:id', async (req, res, next) => {
  try {
    const { first_name, last_name, email, phone, is_active, password } = req.body || {};
    const sets = [];
    const params = [];
    let i = 1;
    if (first_name !== undefined) { sets.push(`first_name=$${i++}`); params.push(first_name); }
    if (last_name  !== undefined) { sets.push(`last_name=$${i++}`);  params.push(last_name); }
    if (email      !== undefined) { sets.push(`email=$${i++}`);      params.push((email || '').trim().toLowerCase()); }
    if (phone      !== undefined) { sets.push(`phone=$${i++}`);      params.push(phone || null); }
    if (is_active  !== undefined) { sets.push(`is_active=$${i++}`);  params.push(Boolean(is_active)); }
    if (password) {
      const argon2 = (await import('argon2')).default;
      const pass_hash = await argon2.hash(password);
      sets.push(`pass_hash=$${i++}`); params.push(pass_hash);
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
    params.push(req.params.id);
    const { rows } = await q(
      `UPDATE users SET ${sets.join(', ')} WHERE id=$${i} RETURNING id,email,first_name,last_name,phone,is_active,is_admin,created_at,activated_at`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'user_not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

adminRouter.delete('/users/:id', async (req, res, next) => {
  try {
    const { rows: found } = await q('SELECT id, email FROM users WHERE id=$1', [req.params.id]);
    if (!found.length) return res.status(404).json({ error: 'user_not_found' });
    const target = found[0];

    // Cascade delete dans l'ordre des dépendances
    // esp_devices → cascade sur alert_rules → cascade sur alert_log + alert_state
    await q('DELETE FROM esp_devices WHERE user_id=$1', [target.id]);
    await q('DELETE FROM mobile_devices WHERE user_id=$1', [target.id]);
    await q('DELETE FROM user_addresses WHERE user_id=$1', [target.id]);
    await q('DELETE FROM user_badge WHERE user_id=$1', [target.id]);
    await q('DELETE FROM password_resets WHERE user_id=$1', [target.id]);
    await q('DELETE FROM users WHERE id=$1', [target.id]);

    q(`INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, 'DELETE', 'user', $3, $4, $5, $6)`,
      [req.user.sub, req.user.email, target.id,
       (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(),
       req.headers['user-agent'] || null,
       JSON.stringify({ deleted_email: target.email })]
    ).catch(err => console.error('[AUDIT] user delete error:', err.message));

    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* =========================
 *  ESP devices (global)
 * ========================= */

adminRouter.get('/esp-devices', async (req, res, next) => {
  try {
    const { user_id, q: search, limit = '100', offset = '0' } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 100, 500);
    const off = parseInt(offset, 10) || 0;
    const where = [];
    const params = [];
    let i = 1;
    if (user_id) { where.push(`e.user_id = $${i++}`); params.push(user_id); }
    if (search) {
      where.push(`(e.esp_uid ILIKE $${i} OR COALESCE(e.name,'') ILIKE $${i} OR u.email ILIKE $${i})`);
      params.push(`%${search}%`);
      i += 1;
    }
    const sql = `
      SELECT e.id, e.user_id, u.email AS user_email,
             e.esp_uid, e.name, e.topic_prefix,
             e.last_seen, e.last_db, e.mqtt_enabled, e.is_superuser,
             e.device_type_id, dt.name AS device_type_name, e.fw_version,
             (SELECT count(*)::int FROM alert_rules r WHERE r.esp_id=e.id) AS rule_count,
             (SELECT max(sent_at) FROM alert_log al WHERE al.device_id=e.esp_uid) AS last_alert_at
      FROM esp_devices e
      JOIN users u ON u.id=e.user_id
      LEFT JOIN device_types dt ON dt.id = e.device_type_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY e.last_seen DESC NULLS LAST, e.esp_uid
      LIMIT $${i} OFFSET $${i + 1}
    `;
    params.push(lim, off);
    const { rows } = await q(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

/* =========================
 *  Rules (global)
 * ========================= */

adminRouter.get('/rules', async (req, res, next) => {
  try {
    const { user_id, esp_id, enabled, limit = '200', offset = '0' } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 200, 500);
    const off = parseInt(offset, 10) || 0;
    const where = [];
    const params = [];
    let i = 1;
    if (user_id) { where.push(`e.user_id = $${i++}`); params.push(user_id); }
    if (esp_id)  { where.push(`r.esp_id  = $${i++}`); params.push(esp_id); }
    if (enabled === 'true' || enabled === 'false') { where.push(`r.enabled = $${i++}`); params.push(enabled === 'true'); }
    const sql = `
      SELECT r.*, s.last_sent,
             e.esp_uid, e.name AS esp_name, e.device_type_id,
             dt.name AS device_type_name,
             u.email AS user_email, u.id AS user_id,
             tpl.name AS template_name
      FROM alert_rules r
      JOIN esp_devices e ON e.id=r.esp_id
      JOIN users u ON u.id=e.user_id
      LEFT JOIN device_types dt ON dt.id = e.device_type_id
      LEFT JOIN alert_state s ON s.rule_id=r.id
      LEFT JOIN alert_rule_templates tpl ON tpl.id = r.template_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY r.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;
    params.push(lim, off);
    const { rows } = await q(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// Champs disponibles pour un ESP (depuis les trames inbound de son type de device)
adminRouter.get('/esp-devices/:id/available-fields', async (req, res, next) => {
  try {
    const { rows: espRows } = await q(
      'SELECT id, esp_uid, name, device_type_id FROM esp_devices WHERE id=$1',
      [req.params.id]
    );
    if (!espRows.length) return res.status(404).json({ error: 'not_found' });
    const esp = espRows[0];

    if (!esp.device_type_id) {
      // Legacy : retourne uniquement soundPct
      return res.json([
        { name: 'soundPct', label: 'Niveau sonore', data_type: 'number', unit: '%' },
      ]);
    }

    const { rows: fields } = await q(
      `SELECT DISTINCT ON (ff.name) ff.name, ff.label, ff.data_type, ff.unit, ff.min_value, ff.max_value, ff.sort_order
         FROM mqtt_frame_fields ff
         JOIN mqtt_frame_definitions fd ON fd.id = ff.frame_id
        WHERE fd.device_type_id = $1 AND fd.direction = 'inbound'
        ORDER BY ff.name, fd.topic_suffix, ff.sort_order`,
      [esp.device_type_id]
    );
    res.json(fields);
  } catch (e) { next(e); }
});

// Créer une règle (admin, sans vérification d'ownership utilisateur)
adminRouter.post('/rules', async (req, res, next) => {
  try {
    const { esp_id, field, op, threshold_num, threshold_str, cooldown_sec = 60, enabled = true, user_label } = req.body || {};
    if (!esp_id || !field || !op) return res.status(400).json({ error: 'missing_fields' });
    if (threshold_num == null && !threshold_str) return res.status(400).json({ error: 'threshold_required' });
    const { rows } = await q(
      `INSERT INTO alert_rules(esp_id, field, op, threshold_num, threshold_str, enabled, cooldown_sec, user_label)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [esp_id, field, op, threshold_num ?? null, threshold_str ?? null, Boolean(enabled), Number(cooldown_sec), user_label ?? null]
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// Modifier une règle (champ, op, seuil, cooldown, enabled, template_id)
adminRouter.patch('/rules/:id', async (req, res, next) => {
  try {
    const { field, op, threshold_num, threshold_str, cooldown_sec, enabled, template_id } = req.body || {};
    const sets = [];
    const params = [];
    let i = 1;
    if (field        !== undefined) { sets.push(`field=$${i++}`);         params.push(field); }
    if (op           !== undefined) { sets.push(`op=$${i++}`);            params.push(op); }
    if (threshold_num !== undefined){ sets.push(`threshold_num=$${i++}`); params.push(threshold_num ?? null); }
    if (threshold_str !== undefined){ sets.push(`threshold_str=$${i++}`); params.push(threshold_str ?? null); }
    if (cooldown_sec !== undefined) { sets.push(`cooldown_sec=$${i++}`);  params.push(Number(cooldown_sec)); }
    if (enabled      !== undefined) { sets.push(`enabled=$${i++}`);       params.push(Boolean(enabled)); }
    if (template_id  !== undefined) { sets.push(`template_id=$${i++}`);   params.push(template_id || null); }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
    params.push(req.params.id);
    const { rows } = await q(
      `UPDATE alert_rules SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// Supprimer une règle
adminRouter.delete('/rules/:id', async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM alert_rules WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* =========================
 *  Alerts / logs (global)
 * ========================= */

adminRouter.get('/alerts', async (req, res, next) => {
  try {
    const { user_id, esp_uid, rule_id, since, limit = '200', offset = '0' } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 200, 500);
    const off = parseInt(offset, 10) || 0;
    const where = [];
    const params = [];
    let i = 1;
    if (user_id) { where.push(`e.user_id = $${i++}`);      params.push(user_id); }
    if (esp_uid) { where.push(`al.device_id = $${i++}`);   params.push(esp_uid); }
    if (rule_id) { where.push(`al.rule_id = $${i++}`);     params.push(rule_id); }
    if (since)   { where.push(`al.sent_at >= $${i++}`);    params.push(new Date(since)); }
    const sql = `
      SELECT al.id, al.sent_at, al.channel, al.status, al.error, al.payload,
             al.rule_id, al.device_id AS esp_uid,
             e.id AS esp_id, e.name AS esp_name, e.user_id,
             u.email AS user_email,
             r.op, r.threshold_num, r.threshold_str, r.enabled AS rule_enabled, r.cooldown_sec
      FROM alert_log al
      LEFT JOIN esp_devices e ON e.esp_uid=al.device_id
      LEFT JOIN users u ON u.id=e.user_id
      LEFT JOIN alert_rules r ON r.id=al.rule_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY al.sent_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;
    params.push(lim, off);
    const { rows } = await q(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

adminRouter.delete('/alerts', async (req, res, next) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids_required' });
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rowCount } = await q(`DELETE FROM alert_log WHERE id IN (${placeholders})`, ids);
    res.json({ ok: true, deleted: rowCount });
  } catch (e) { next(e); }
});

/* =========================
 *  APNS config
 * ========================= */

adminRouter.get('/apns', pollLimiter, async (req, res, next) => {
  try {
    const { rows } = await q('SELECT team_id, key_id, bundle_id, apns_env, updated_at FROM apns_config WHERE id = 1 LIMIT 1');
    if (!rows.length) return res.json({ configured: false });
    res.json({ configured: true, ...rows[0] });
  } catch (e) { next(e); }
});

adminRouter.post('/apns', async (req, res, next) => {
  try {
    const { team_id, key_id, bundle_id, key_pem, apns_env } = req.body || {};
    if (!team_id || !key_id || !bundle_id || !key_pem) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const env = ['sandbox', 'production', 'both'].includes(apns_env) ? apns_env : 'sandbox';
    await q(
      `INSERT INTO apns_config (id, team_id, key_id, bundle_id, key_pem, apns_env, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE
         SET team_id=$1, key_id=$2, bundle_id=$3, key_pem=$4, apns_env=$5, updated_at=now()`,
      [team_id, key_id, bundle_id, key_pem, env]
    );
    await reloadApnsConfig();
    res.json({ ok: true, configured: true });
  } catch (e) { next(e); }
});

adminRouter.delete('/apns', async (req, res, next) => {
  try {
    await q('DELETE FROM apns_config WHERE id = 1');
    await reloadApnsConfig();
    res.json({ ok: true, configured: false });
  } catch (e) { next(e); }
});

/* =========================
 *  FCM config
 * ========================= */

adminRouter.get('/fcm', pollLimiter, async (req, res, next) => {
  try {
    const { rows } = await q('SELECT project_id, client_email, updated_at FROM fcm_config WHERE id=1 LIMIT 1');
    if (!rows.length) return res.json({ configured: false, ready: isFcmReady() });
    res.json({ configured: true, ready: isFcmReady(), ...rows[0] });
  } catch (e) { next(e); }
});

adminRouter.post('/fcm', async (req, res, next) => {
  try {
    const { service_account_json } = req.body || {};
    if (!service_account_json) return res.status(400).json({ error: 'service_account_json_required' });

    let sa;
    try { sa = typeof service_account_json === 'string' ? JSON.parse(service_account_json) : service_account_json; }
    catch { return res.status(400).json({ error: 'invalid_json' }); }

    const project_id   = sa.project_id;
    const client_email = sa.client_email;
    if (!project_id || !client_email || !sa.private_key) {
      return res.status(400).json({ error: 'invalid_service_account: missing project_id, client_email or private_key' });
    }

    await q(
      `INSERT INTO fcm_config (id, project_id, client_email, service_account_json, updated_at)
       VALUES (1, $1, $2, $3::jsonb, now())
       ON CONFLICT (id) DO UPDATE
         SET project_id=$1, client_email=$2, service_account_json=$3::jsonb, updated_at=now()`,
      [project_id, client_email, JSON.stringify(sa)]
    );
    await reloadFcmConfig();
    res.json({ ok: true, configured: true, ready: isFcmReady(), project_id, client_email });
  } catch (e) { next(e); }
});

adminRouter.delete('/fcm', async (req, res, next) => {
  try {
    await q('DELETE FROM fcm_config WHERE id=1');
    await reloadFcmConfig();
    res.json({ ok: true, configured: false });
  } catch (e) { next(e); }
});

/* =========================
 *  SMTP config
 * ========================= */

adminRouter.get('/smtp', pollLimiter, async (req, res, next) => {
  try {
    const c = getSmtpConfig();
    if (!c) return res.json({ configured: false, ready: false });
    res.json({
      configured: true,
      ready:      isSmtpReady(),
      host:       c.host,
      port:       c.port,
      secure:     c.secure,
      user_login: c.user_login || null,
      from_name:  c.from_name  || null,
      from_email: c.from_email,
      reply_to:   c.reply_to   || null,
      updated_at: c.updated_at || null,
    });
  } catch (e) { next(e); }
});

adminRouter.post('/smtp', async (req, res, next) => {
  try {
    const { host, port, secure, user_login, pass, from_name, from_email, reply_to } = req.body || {};
    if (!host || !from_email) return res.status(400).json({ error: 'host_and_from_email_required' });

    await q(
      `INSERT INTO smtp_config (id, host, port, secure, user_login, pass, from_name, from_email, reply_to, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (id) DO UPDATE
         SET host=$1, port=$2, secure=$3, user_login=$4,
             pass=CASE WHEN $5::text IS NULL THEN smtp_config.pass ELSE $5 END,
             from_name=$6, from_email=$7, reply_to=$8, updated_at=now()`,
      [
        host,
        Number(port) || 587,
        Boolean(secure),
        user_login  || null,
        pass        || null,
        from_name   || null,
        from_email,
        reply_to    || null,
      ]
    );
    await reloadSmtpConfig();
    res.json({ ok: true, configured: true, ready: isSmtpReady() });
  } catch (e) { next(e); }
});

adminRouter.post('/smtp/test', async (req, res, next) => {
  try {
    if (!isSmtpReady()) return res.status(400).json({ error: 'smtp_not_configured' });
    const { to } = req.body || {};
    if (!to) return res.status(400).json({ error: 'to_required' });

    const { createTransporter, buildFrom } = await import('./smtp.js');
    const transporter = await createTransporter();
    if (!transporter) return res.status(500).json({ error: 'transporter_creation_failed' });

    await transporter.sendMail({
      from:    buildFrom(),
      to,
      subject: '[XamIoT] Test SMTP',
      text:    'Ce message confirme que la configuration SMTP est fonctionnelle.',
    });
    res.json({ ok: true });
  } catch (e) {
    // Retourner un message d'erreur lisible plutôt qu'un admin_internal_error générique
    const msg = e?.message || '';
    let error = 'smtp_send_failed';
    let detail = msg;
    if (e?.code === 'ECONNREFUSED')  { error = 'smtp_connection_refused';  detail = `Connexion refusée sur ${e.address || ''}:${e.port || ''} — vérifiez l'hôte et le port.`; }
    else if (e?.code === 'ENOTFOUND')      { error = 'smtp_host_not_found';      detail = `Hôte SMTP introuvable : ${e.hostname || ''}. Vérifiez le nom du serveur.`; }
    else if (e?.code === 'ETIMEDOUT')      { error = 'smtp_timeout';             detail = 'Délai de connexion dépassé. Vérifiez l\'hôte, le port et le pare-feu.'; }
    else if (msg.includes('Invalid login') || msg.includes('535') || msg.includes('authentication')) {
      error = 'smtp_auth_failed'; detail = 'Authentification refusée. Vérifiez l\'identifiant et le mot de passe.';
    } else if (msg.includes('CERT') || msg.includes('certificate') || msg.includes('altnames')) {
      error = 'smtp_tls_error'; detail = `Erreur TLS : ${msg}`;
    }
    return res.status(502).json({ error, detail });
  }
});

adminRouter.delete('/smtp', async (req, res, next) => {
  try {
    await q('DELETE FROM smtp_config WHERE id=1');
    await reloadSmtpConfig();
    res.json({ ok: true, configured: false });
  } catch (e) { next(e); }
});

/* =========================
 *  Mobile Devices (admin)
 * ========================= */

adminRouter.get('/mobile-devices', async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT
        m.id, m.name, m.platform, m.bundle_id,
        m.apns_token, m.fcm_token,
        m.sandbox, m.model, m.os_version, m.timezone,
        m.app_version, m.app_build_number,
        m.is_active, m.created_at, m.last_seen,
        u.id AS user_id, u.email AS user_email,
        COALESCE(ub.unread_count, 0)::int AS unread_count
      FROM mobile_devices m
      LEFT JOIN users u ON u.id = m.user_id
      LEFT JOIN user_badge ub ON ub.user_id = m.user_id
      ORDER BY m.last_seen DESC NULLS LAST
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

adminRouter.delete('/mobile-devices/:id', async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM mobile_devices WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'device_not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* =========================
 *  Device Types
 * ========================= */

adminRouter.get('/device-types', async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT dt.*,
        (SELECT count(*)::int FROM mqtt_frame_definitions fd WHERE fd.device_type_id = dt.id) AS frame_count,
        (SELECT count(*)::int FROM mqtt_topic_patterns tp WHERE tp.device_type_id = dt.id)    AS pattern_count,
        (SELECT count(*)::int FROM esp_devices e WHERE e.device_type_id = dt.id)              AS esp_count
      FROM device_types dt
      ORDER BY dt.name
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

adminRouter.post('/device-types', async (req, res, next) => {
  try {
    const { name, description } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name_required' });
    const { rows } = await q(
      'INSERT INTO device_types (name, description) VALUES ($1, $2) RETURNING *',
      [name.trim(), description || null]
    );
    await reloadMqttConfig();
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

adminRouter.put('/device-types/:id', async (req, res, next) => {
  try {
    const { name, description, notif_title_tpl, notif_body_tpl } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name_required' });
    const { rows } = await q(
      `UPDATE device_types
          SET name=$1, description=$2, notif_title_tpl=$3, notif_body_tpl=$4
        WHERE id=$5 RETURNING *`,
      [name.trim(), description || null, notif_title_tpl || null, notif_body_tpl || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    await reloadMqttConfig();
    res.json(rows[0]);
  } catch (e) { next(e); }
});

adminRouter.delete('/device-types/:id', async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM device_types WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    await reloadMqttConfig();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* =========================
 *  MQTT Frame Definitions
 * ========================= */

adminRouter.get('/device-types/:typeId/frames', async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT fd.*,
        (SELECT count(*)::int FROM mqtt_frame_fields ff WHERE ff.frame_id = fd.id) AS field_count
      FROM mqtt_frame_definitions fd
      WHERE fd.device_type_id = $1
      ORDER BY fd.direction, fd.name
    `, [req.params.typeId]);
    res.json(rows);
  } catch (e) { next(e); }
});

adminRouter.post('/device-types/:typeId/frames', async (req, res, next) => {
  try {
    const { name, topic_suffix, direction, format, description } = req.body || {};
    if (!name?.trim() || !topic_suffix?.trim()) return res.status(400).json({ error: 'name_and_topic_suffix_required' });
    const dir = direction || 'inbound';
    const fmt = format || 'json';
    const { rows } = await q(
      `INSERT INTO mqtt_frame_definitions (device_type_id, name, topic_suffix, direction, format, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.typeId, name.trim(), topic_suffix.trim(), dir, fmt, description || null]
    );
    await reloadMqttConfig();
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

adminRouter.put('/frames/:id', async (req, res, next) => {
  try {
    const { name, topic_suffix, direction, format, description } = req.body || {};
    if (!name?.trim() || !topic_suffix?.trim()) return res.status(400).json({ error: 'name_and_topic_suffix_required' });
    const { rows } = await q(
      `UPDATE mqtt_frame_definitions
          SET name=$1, topic_suffix=$2, direction=$3, format=$4, description=$5
        WHERE id=$6 RETURNING *`,
      [name.trim(), topic_suffix.trim(), direction || 'inbound', format || 'json', description || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    await reloadMqttConfig();
    res.json(rows[0]);
  } catch (e) { next(e); }
});

adminRouter.delete('/frames/:id', async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM mqtt_frame_definitions WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    await reloadMqttConfig();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* =========================
 *  MQTT Frame Fields
 * ========================= */

adminRouter.get('/frames/:frameId/fields', async (req, res, next) => {
  try {
    const { rows } = await q(
      'SELECT * FROM mqtt_frame_fields WHERE frame_id=$1 ORDER BY sort_order, name',
      [req.params.frameId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

adminRouter.post('/frames/:frameId/fields', async (req, res, next) => {
  try {
    const { name, label, data_type, unit, min_value, max_value, is_primary_metric, description, sort_order } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name_required' });

    // Un seul champ primary par frame
    if (is_primary_metric) {
      await q('UPDATE mqtt_frame_fields SET is_primary_metric=false WHERE frame_id=$1', [req.params.frameId]);
    }

    const { rows } = await q(
      `INSERT INTO mqtt_frame_fields
         (frame_id, name, label, data_type, unit, min_value, max_value, is_primary_metric, description, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        req.params.frameId, name.trim(), label || null,
        data_type || 'number', unit || null,
        min_value ?? null, max_value ?? null,
        is_primary_metric ?? false, description || null, sort_order ?? 0,
      ]
    );
    await reloadMqttConfig();
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

adminRouter.put('/fields/:id', async (req, res, next) => {
  try {
    const { name, label, data_type, unit, min_value, max_value, is_primary_metric, description, sort_order } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name_required' });

    // Récupère frame_id pour contrainte unique primary
    const { rows: existing } = await q('SELECT frame_id FROM mqtt_frame_fields WHERE id=$1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'not_found' });

    if (is_primary_metric) {
      await q('UPDATE mqtt_frame_fields SET is_primary_metric=false WHERE frame_id=$1 AND id!=$2', [existing[0].frame_id, req.params.id]);
    }

    const { rows } = await q(
      `UPDATE mqtt_frame_fields
          SET name=$1, label=$2, data_type=$3, unit=$4,
              min_value=$5, max_value=$6, is_primary_metric=$7,
              description=$8, sort_order=$9
        WHERE id=$10 RETURNING *`,
      [
        name.trim(), label || null, data_type || 'number', unit || null,
        min_value ?? null, max_value ?? null,
        is_primary_metric ?? false, description || null, sort_order ?? 0,
        req.params.id,
      ]
    );
    await reloadMqttConfig();
    res.json(rows[0]);
  } catch (e) { next(e); }
});

adminRouter.delete('/fields/:id', async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM mqtt_frame_fields WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    await reloadMqttConfig();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* =========================
 *  Rule Templates (par type de device)
 * ========================= */

// Champs disponibles pour un type de device (depuis les trames inbound)
adminRouter.get('/device-types/:typeId/available-fields', async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT ff.name, ff.label, ff.data_type, ff.unit, ff.min_value, ff.max_value, ff.sort_order
         FROM mqtt_frame_fields ff
         JOIN mqtt_frame_definitions fd ON fd.id = ff.frame_id
        WHERE fd.device_type_id = $1 AND fd.direction = 'inbound'
        ORDER BY fd.topic_suffix, ff.sort_order, ff.name`,
      [req.params.typeId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

adminRouter.get('/device-types/:typeId/rule-templates', async (req, res, next) => {
  try {
    const { rows } = await q(
      'SELECT * FROM alert_rule_templates WHERE device_type_id=$1 ORDER BY sort_order, name',
      [req.params.typeId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

adminRouter.post('/device-types/:typeId/rule-templates', async (req, res, next) => {
  try {
    const { name, description, field, cooldown_min_sec, sort_order } = req.body || {};
    if (!name?.trim() || !field?.trim()) return res.status(400).json({ error: 'name_field_required' });
    const { rows } = await q(
      `INSERT INTO alert_rule_templates
         (device_type_id, name, description, field, cooldown_min_sec, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.typeId, name.trim(), description || null, field.trim(), cooldown_min_sec ?? 60, sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

adminRouter.put('/rule-templates/:id', async (req, res, next) => {
  try {
    const { name, description, field, cooldown_min_sec, sort_order } = req.body || {};
    if (!name?.trim() || !field?.trim()) return res.status(400).json({ error: 'name_field_required' });
    const { rows } = await q(
      `UPDATE alert_rule_templates
          SET name=$1, description=$2, field=$3, cooldown_min_sec=$4, sort_order=$5
        WHERE id=$6 RETURNING *`,
      [name.trim(), description || null, field.trim(), cooldown_min_sec ?? 60, sort_order ?? 0, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

adminRouter.delete('/rule-templates/:id', async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM alert_rule_templates WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* =========================
 *  Assign device type to ESP (admin)
 * ========================= */

// Renommer un ESP device (admin)
adminRouter.patch('/esp-devices/:id', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name_required' });
    const { rows } = await q(
      'UPDATE esp_devices SET name=$1 WHERE id=$2 RETURNING id, esp_uid, name',
      [name.trim(), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

adminRouter.patch('/esp-devices/:id/device-type', async (req, res, next) => {
  try {
    const { device_type_id } = req.body || {};
    const { rows } = await q(
      'UPDATE esp_devices SET device_type_id=$1 WHERE id=$2 RETURNING id, esp_uid, name, device_type_id',
      [device_type_id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/* =========================
 *  MQTT Topic Patterns
 * ========================= */

adminRouter.get('/device-types/:typeId/patterns', async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT tp.*, fd.name AS frame_name
      FROM mqtt_topic_patterns tp
      LEFT JOIN mqtt_frame_definitions fd ON fd.id = tp.frame_id
      WHERE tp.device_type_id = $1
      ORDER BY tp.pattern
    `, [req.params.typeId]);
    res.json(rows);
  } catch (e) { next(e); }
});

adminRouter.post('/device-types/:typeId/patterns', async (req, res, next) => {
  try {
    const { pattern, frame_id, description } = req.body || {};
    if (!pattern?.trim()) return res.status(400).json({ error: 'pattern_required' });
    const { rows } = await q(
      `INSERT INTO mqtt_topic_patterns (device_type_id, pattern, frame_id, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.typeId, pattern.trim(), frame_id || null, description || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

adminRouter.put('/patterns/:id', async (req, res, next) => {
  try {
    const { pattern, frame_id, description } = req.body || {};
    if (!pattern?.trim()) return res.status(400).json({ error: 'pattern_required' });
    const { rows } = await q(
      'UPDATE mqtt_topic_patterns SET pattern=$1, frame_id=$2, description=$3 WHERE id=$4 RETURNING *',
      [pattern.trim(), frame_id || null, description || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

adminRouter.delete('/patterns/:id', async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM mqtt_topic_patterns WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* =========================
 *  Diagnostic : parse simulé
 * ========================= */

adminRouter.post('/mqtt/parse-test', async (req, res, next) => {
  try {
    const { device_type_id, topic_suffix, payload_json } = req.body || {};
    if (!device_type_id || !topic_suffix || !payload_json)
      return res.status(400).json({ error: 'device_type_id_topic_suffix_payload_required' });

    let obj;
    try { obj = JSON.parse(payload_json); }
    catch { return res.status(400).json({ error: 'invalid_json' }); }

    const { rows: frameRows } = await q(`
      SELECT fd.*, array_agg(
        json_build_object(
          'name', ff.name, 'label', ff.label, 'data_type', ff.data_type,
          'unit', ff.unit, 'min_value', ff.min_value, 'max_value', ff.max_value,
          'is_primary_metric', ff.is_primary_metric
        ) ORDER BY ff.sort_order
      ) AS fields
      FROM mqtt_frame_definitions fd
      JOIN mqtt_frame_fields ff ON ff.frame_id = fd.id
      WHERE fd.device_type_id = $1 AND fd.topic_suffix = $2 AND fd.direction = 'inbound'
      GROUP BY fd.id
    `, [device_type_id, topic_suffix]);

    if (!frameRows.length) {
      return res.json({ found: false, message: 'Aucune trame configurée pour ce type + suffixe' });
    }

    const frame = frameRows[0];
    const extracted = {};
    for (const field of frame.fields) {
      const key = Object.keys(obj).find(k => k.toLowerCase() === field.name.toLowerCase());
      extracted[field.name] = key !== undefined ? obj[key] : undefined;
    }

    res.json({
      found: true,
      frame_name: frame.name,
      topic_suffix: frame.topic_suffix,
      extracted,
      raw_keys: Object.keys(obj),
    });
  } catch (e) { next(e); }
});

/* =========================
 *  MQTT Raw Logs
 * ========================= */

// GET /admin/mqtt-logs?limit=100&offset=0&q=<esp_uid ou topic>
adminRouter.get('/mqtt-logs', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit  || 100), 500);
    const offset = Number(req.query.offset || 0);
    const q_str  = (req.query.q || '').trim();

    const where      = q_str ? `AND (l.esp_uid ILIKE $3 OR l.topic ILIKE $3)` : '';
    const whereCount = q_str ? `AND (l.esp_uid ILIKE $1 OR l.topic ILIKE $1)` : '';
    const params     = q_str ? [limit, offset, `%${q_str}%`] : [limit, offset];

    const { rows } = await q(
      `SELECT l.id, l.received_at, l.topic, l.payload, l.esp_uid, l.payload_size,
              e.name AS esp_name
         FROM mqtt_raw_logs l
         LEFT JOIN esp_devices e ON e.id = l.esp_id
        WHERE 1=1 ${where}
        ORDER BY l.received_at DESC
        LIMIT $1 OFFSET $2`,
      params
    );

    const { rows: total } = await q(
      `SELECT count(*)::int AS total FROM mqtt_raw_logs l WHERE 1=1 ${whereCount}`,
      q_str ? [`%${q_str}%`] : []
    );

    res.json({ rows, total: total[0]?.total ?? 0, limit, offset });
  } catch (e) { next(e); }
});

adminRouter.delete('/mqtt-logs', async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM mqtt_raw_logs');
    res.json({ ok: true, deleted: rowCount });
  } catch (e) { next(e); }
});

/* =========================
 *  Stripe status
 * ========================= */

adminRouter.get('/stripe', async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT key, value FROM app_config WHERE key IN (
        'stripe_mode',
        'stripe_test_secret_key','stripe_test_webhook_secret','stripe_test_publishable_key',
        'stripe_live_secret_key','stripe_live_webhook_secret','stripe_live_publishable_key'
      )`
    );
    const db = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const activeMode = db.stripe_mode || 'test';

    const mkInfo = (prefix) => {
      const sk = db[`stripe_${prefix}_secret_key`] || '';
      const pk = db[`stripe_${prefix}_publishable_key`] || '';
      const wh = db[`stripe_${prefix}_webhook_secret`] || '';
      const configured = sk.startsWith('sk_live_') || sk.startsWith('sk_test_') || sk.startsWith('rk_');
      const pk_configured = pk.startsWith('pk_live_') || pk.startsWith('pk_test_');
      return {
        configured,
        key_hint: configured ? sk.slice(0, 8) + '…' : null,
        webhook_configured: !!(wh && wh.length > 4),
        publishable_configured: pk_configured,
        publishable_hint: pk_configured ? pk.slice(0, 8) + '…' : null,
      };
    };

    res.json({
      active_mode: activeMode,
      test: mkInfo('test'),
      live: mkInfo('live'),
    });
  } catch (e) { next(e); }
});

adminRouter.put('/stripe', async (req, res, next) => {
  try {
    const {
      mode,
      test_secret_key, test_webhook_secret, test_publishable_key,
      live_secret_key, live_webhook_secret, live_publishable_key,
    } = req.body || {};

    const upsert = async (key, val) => {
      await q(
        `INSERT INTO app_config (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()`,
        [key, val || null]
      );
    };

    if (mode === 'test' || mode === 'live') await upsert('stripe_mode', mode);
    if (test_secret_key !== undefined)      await upsert('stripe_test_secret_key', test_secret_key);
    if (test_webhook_secret !== undefined)  await upsert('stripe_test_webhook_secret', test_webhook_secret);
    if (test_publishable_key !== undefined) await upsert('stripe_test_publishable_key', test_publishable_key);
    if (live_secret_key !== undefined)      await upsert('stripe_live_secret_key', live_secret_key);
    if (live_webhook_secret !== undefined)  await upsert('stripe_live_webhook_secret', live_webhook_secret);
    if (live_publishable_key !== undefined) await upsert('stripe_live_publishable_key', live_publishable_key);

    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* =========================
 *  Retention config
 * ========================= */

adminRouter.get('/retention', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM retention_config ORDER BY log_type');
    res.json(rows);
  } catch (e) { next(e); }
});

adminRouter.put('/retention/:logType', async (req, res, next) => {
  try {
    const { retain_days, retain_count } = req.body || {};
    if (!retain_days || Number(retain_days) < 1)
      return res.status(400).json({ error: 'retain_days_must_be_positive' });
    const { rows } = await q(
      `INSERT INTO retention_config (log_type, retain_days, retain_count, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (log_type) DO UPDATE SET retain_days=$2, retain_count=$3, updated_at=now()
       RETURNING *`,
      [req.params.logType, Number(retain_days), retain_count != null ? Number(retain_count) : null]
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/* =========================
 *  OTA Updates
 * ========================= */

// Liste des mises à jour OTA
adminRouter.get('/ota', async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT o.*,
        dt.name AS device_type_name,
        (SELECT count(*)::int FROM ota_deployments d WHERE d.ota_id = o.id) AS target_count,
        (SELECT count(*)::int FROM ota_deployments d WHERE d.ota_id = o.id AND d.status='success') AS success_count,
        (SELECT count(*)::int FROM ota_deployments d WHERE d.ota_id = o.id AND d.status='failed')  AS failed_count
      FROM ota_updates o
      LEFT JOIN device_types dt ON dt.id = o.device_type_id
      ORDER BY o.created_at DESC
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

// Créer une mise à jour OTA (avec upload firmware)
adminRouter.post('/ota', otaUpload.single('firmware'), async (req, res, next) => {
  try {
    const { version, name, description, device_type_id, min_fw_version, scheduled_at, firmware_url } = req.body || {};
    if (!version?.trim() || !name?.trim()) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'version_and_name_required' });
    }

    // Mode URL externe (legacy) : pas de fichier uploadé
    if (firmware_url?.trim()) {
      const { rows } = await q(
        `INSERT INTO ota_updates
           (version, name, description, device_type_id, firmware_url,
            min_fw_version, scheduled_at, created_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
           CASE WHEN $7::timestamptz IS NOT NULL THEN 'scheduled' ELSE 'draft' END)
         RETURNING *`,
        [
          version.trim(), name.trim(), description || null,
          device_type_id || null,
          firmware_url.trim(),
          min_fw_version || null,
          scheduled_at || null,
          req.adminUser?.email || null,
        ]
      );
      dispatch('ota_available', null, {
        version: rows[0].version, name: rows[0].name || '',
        description: rows[0].description || '',
      }, { resourceType: 'ota_update', resourceId: rows[0].id, adminOnly: true }).catch(() => {});
      return res.status(201).json(rows[0]);
    }

    // Mode normal : upload fichier requis
    if (!req.file) return res.status(400).json({ error: 'firmware_file_or_url_required' });

    // Calcul MD5 + HMAC-SHA256
    const fileBuffer = fs.readFileSync(req.file.path);
    const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const hmacKey = process.env.OTA_HMAC_KEY;
    const hmacSha256 = (hmacKey && hmacKey.length > 0)
      ? crypto.createHmac('sha256', hmacKey).update(fileBuffer).digest('hex')
      : null;

    if (!hmacSha256) {
      fs.unlink(req.file.path, () => {});
      return res.status(500).json({ error: 'ota_hmac_key_not_configured' });
    }

    const { rows } = await q(
      `INSERT INTO ota_updates
         (version, name, description, device_type_id, firmware_file, firmware_size, md5,
          hmac_sha256, min_fw_version, scheduled_at, created_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
         CASE WHEN $10::timestamptz IS NOT NULL THEN 'scheduled' ELSE 'draft' END)
       RETURNING *`,
      [
        version.trim(), name.trim(), description || null,
        device_type_id || null,
        req.file.filename,
        req.file.size,
        md5,
        hmacSha256,
        min_fw_version || null,
        scheduled_at || null,
        req.adminUser?.email || null,
      ]
    );
    dispatch('ota_available', null, {
      version: rows[0].version, name: rows[0].name || '',
      description: rows[0].description || '',
    }, { resourceType: 'ota_update', resourceId: rows[0].id, adminOnly: true }).catch(() => {});
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// Détail d'une mise à jour OTA + liste des déploiements
adminRouter.get('/ota/:id', async (req, res, next) => {
  try {
    const { rows: ota } = await q(`
      SELECT o.*, dt.name AS device_type_name
      FROM ota_updates o
      LEFT JOIN device_types dt ON dt.id = o.device_type_id
      WHERE o.id = $1
    `, [req.params.id]);
    if (!ota.length) return res.status(404).json({ error: 'not_found' });

    const { rows: deployments } = await q(`
      SELECT d.*, e.esp_uid, e.name AS esp_name, e.fw_version AS current_fw_version
      FROM ota_deployments d
      JOIN esp_devices e ON e.id = d.esp_id
      WHERE d.ota_id = $1
      ORDER BY d.status, e.name
    `, [req.params.id]);

    res.json({ ...ota[0], deployments });
  } catch (e) { next(e); }
});

// Modifier statut / planification d'une OTA
adminRouter.patch('/ota/:id', async (req, res, next) => {
  try {
    const { status, scheduled_at, description } = req.body || {};
    const { rows } = await q(
      `UPDATE ota_updates
          SET status=COALESCE($1, status),
              scheduled_at=COALESCE($2::timestamptz, scheduled_at),
              description=COALESCE($3, description)
        WHERE id=$4 RETURNING *`,
      [status || null, scheduled_at || null, description || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// Supprimer une OTA (et son fichier firmware)
adminRouter.delete('/ota/:id', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT firmware_file FROM ota_updates WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    await q('DELETE FROM ota_updates WHERE id=$1', [req.params.id]);
    // Supprime le fichier (best-effort)
    try { fs.unlinkSync(path.join(OTA_DIR, rows[0].firmware_file)); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Télécharger le firmware
adminRouter.get('/ota/:id/download', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT firmware_file, version FROM ota_updates WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const filePath = path.join(OTA_DIR, rows[0].firmware_file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file_not_found' });
    res.download(filePath, `firmware_v${rows[0].version}${path.extname(rows[0].firmware_file)}`);
  } catch (e) { next(e); }
});

// Définir les devices cibles d'une OTA (remplace)
adminRouter.post('/ota/:id/targets', async (req, res, next) => {
  try {
    const { esp_ids } = req.body || {};
    if (!Array.isArray(esp_ids)) return res.status(400).json({ error: 'esp_ids_array_required' });

    // Vérifie que l'OTA existe
    const { rows: ota } = await q('SELECT id, status FROM ota_updates WHERE id=$1', [req.params.id]);
    if (!ota.length) return res.status(404).json({ error: 'not_found' });

    // Upsert : insert ceux qui n'existent pas, ignore les doublons
    for (const espId of esp_ids) {
      await q(
        `INSERT INTO ota_deployments (ota_id, esp_id) VALUES ($1, $2)
         ON CONFLICT (ota_id, esp_id) DO NOTHING`,
        [req.params.id, espId]
      );
    }
    // Retire les devices non dans la liste
    if (esp_ids.length > 0) {
      await q(
        `DELETE FROM ota_deployments WHERE ota_id=$1 AND esp_id != ALL($2::uuid[]) AND status='pending'`,
        [req.params.id, esp_ids]
      );
    } else {
      await q(`DELETE FROM ota_deployments WHERE ota_id=$1 AND status='pending'`, [req.params.id]);
    }

    const { rows: deps } = await q(
      'SELECT * FROM ota_deployments WHERE ota_id=$1',
      [req.params.id]
    );
    res.json(deps);
  } catch (e) { next(e); }
});

// Déclencher la mise à jour OTA sur les devices ciblés (via MQTT)
adminRouter.post('/ota/:id/trigger', async (req, res, next) => {
  try {
    const { esp_ids } = req.body || {}; // si vide = tous les pending

    const { rows: ota } = await q('SELECT * FROM ota_updates WHERE id=$1', [req.params.id]);
    if (!ota.length) return res.status(404).json({ error: 'not_found' });

    const otaUpdate = ota[0];

    // Récupère les déploiements ciblés (pending + triggered + failed = tout sauf success/skipped)
    let deployFilter = "WHERE d.ota_id=$1 AND d.status IN ('pending','triggered','failed')";
    let deployParams = [req.params.id];
    if (esp_ids?.length) {
      deployFilter += ` AND d.esp_id = ANY($2::uuid[])`;
      deployParams.push(esp_ids);
    }

    const { rows: deps } = await q(
      `SELECT d.id AS dep_id, d.esp_id, e.esp_uid, e.fw_version AS fw_version_before
         FROM ota_deployments d
         JOIN esp_devices e ON e.id = d.esp_id
         ${deployFilter}`,
      deployParams
    );

    if (!deps.length) return res.status(400).json({ error: 'no_pending_targets' });

    // Mode URL externe (legacy) : pas de HMAC, URL directe
    const isLegacyUrl = !!otaUpdate.firmware_url;

    if (!isLegacyUrl && !otaUpdate.hmac_sha256) {
      return res.status(400).json({ error: 'ota_hmac_missing_reupload_required' });
    }

    // URL de téléchargement accessible par les ESP
    const firmwareUrl = isLegacyUrl
      ? otaUpdate.firmware_url
      : (process.env.OTA_DOWNLOAD_BASE_URL || `https://apixam.holiceo.com/ota/${otaUpdate.id}/firmware`);

    // Importe le client MQTT du worker
    const { getMqttClient } = await import('./mqttWorker.js');
    const mqttClient = getMqttClient();
    if (!mqttClient) return res.status(503).json({ error: 'mqtt_not_connected' });

    let triggered = 0;
    for (const dep of deps) {
      // Topic aligné avec la convention firmware : devices/<uid>/cmd/ota
      // Firmware legacy : payload = plain URL (pas de JSON — ancien firmware ne parse pas le JSON)
      // Firmware v2+    : payload = JSON {"cmd":"update","url":"...","version":"...","hmac":"..."}
      const payload = isLegacyUrl
        ? firmwareUrl
        : JSON.stringify({
            cmd:     'update',
            url:     firmwareUrl,
            version: otaUpdate.version,
            hmac:    otaUpdate.hmac_sha256,
          });
      // retain:true = l'ESP reçoit la commande même s'il était offline au déclenchement.
      // Le retain est effacé par le mqttWorker dès que l'ESP répond (succès ou échec).
      mqttClient.publish(`devices/${dep.esp_uid}/cmd/ota`, payload, { qos: 1, retain: true });

      await q(
        `UPDATE ota_deployments
            SET status='triggered', triggered_at=now(), fw_version_before=$1, last_seen_at=now()
          WHERE id=$2`,
        [dep.fw_version_before || null, dep.dep_id]
      );
      triggered++;
    }

    // Passe la mise à jour en 'deploying'
    await q(`UPDATE ota_updates SET status='deploying' WHERE id=$1`, [req.params.id]);

    // Notifications — prévenir les propriétaires des devices ciblés
    const { rows: espOwners } = await q(
      `SELECT DISTINCT e.user_id, e.name AS esp_name, e.esp_uid
         FROM ota_deployments d
         JOIN esp_devices e ON e.id = d.esp_id
        WHERE d.ota_id=$1 AND d.status='triggered' AND e.user_id IS NOT NULL`,
      [req.params.id]
    );
    for (const owner of espOwners) {
      dispatch('ota_triggered', owner.user_id, {
        version: otaUpdate.version,
        esp_name: owner.esp_name || owner.esp_uid,
      }, { resourceType: 'ota_update', resourceId: req.params.id }).catch(() => {});
    }

    res.json({ ok: true, triggered });
  } catch (e) { next(e); }
});

// Supprimer un déploiement individuel (pour pouvoir le ré-ajouter comme pending)
adminRouter.delete('/ota/:id/deployment/:depId', async (req, res, next) => {
  try {
    const { rows } = await q(
      `DELETE FROM ota_deployments WHERE id=$1 AND ota_id=$2 RETURNING id`,
      [req.params.depId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Devices éligibles pour une OTA (même type de device, pas encore ciblés ou tous)
adminRouter.get('/ota/:id/eligible-devices', async (req, res, next) => {
  try {
    const { q: search } = req.query;
    const { rows: ota } = await q('SELECT device_type_id, min_fw_version FROM ota_updates WHERE id=$1', [req.params.id]);
    if (!ota.length) return res.status(404).json({ error: 'not_found' });

    const { device_type_id, min_fw_version } = ota[0];

    let whereClause = 'WHERE e.user_id IS NOT NULL';
    const params = [req.params.id];
    if (device_type_id) {
      params.push(device_type_id);
      whereClause += ` AND e.device_type_id=$${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (e.esp_uid ILIKE $${params.length} OR e.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    const { rows } = await q(`
      SELECT e.id, e.esp_uid, e.name, e.fw_version, e.last_seen,
             u.email AS user_email,
             dt.name AS device_type_name,
             d.status AS deployment_status
      FROM esp_devices e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN device_types dt ON dt.id = e.device_type_id
      LEFT JOIN ota_deployments d ON d.esp_id = e.id AND d.ota_id = $1
      ${whereClause}
      ORDER BY e.name NULLS LAST, e.esp_uid
      LIMIT 200
    `, params);

    res.json(rows);
  } catch (e) { next(e); }
});

// Réception du statut OTA depuis un device (appelé par le worker MQTT)
adminRouter.post('/ota/status-update', async (req, res, next) => {
  try {
    const { esp_uid, ota_id, status, progress, fw_version, error_msg } = req.body || {};
    if (!esp_uid || !status) return res.status(400).json({ error: 'esp_uid_and_status_required' });

    const { rows: esp } = await q('SELECT id FROM esp_devices WHERE esp_uid=$1', [esp_uid]);
    if (!esp.length) return res.status(404).json({ error: 'esp_not_found' });

    let updateQuery;
    let updateParams;

    if (ota_id) {
      updateQuery = `
        UPDATE ota_deployments
           SET status=$1, progress=$2, last_seen_at=now(),
               fw_version_after=CASE WHEN $1='success' THEN $3 ELSE fw_version_after END,
               error_msg=CASE WHEN $1='failed' THEN $4 ELSE error_msg END
         WHERE ota_id=$5 AND esp_id=$6
         RETURNING *`;
      updateParams = [status, progress ?? null, fw_version || null, error_msg || null, ota_id, esp[0].id];
    } else {
      // Mise à jour du dernier déploiement en cours pour cet ESP
      updateQuery = `
        UPDATE ota_deployments
           SET status=$1, progress=$2, last_seen_at=now(),
               fw_version_after=CASE WHEN $1='success' THEN $3 ELSE fw_version_after END,
               error_msg=CASE WHEN $1='failed' THEN $4 ELSE error_msg END
         WHERE esp_id=$5 AND status IN ('triggered','downloading','flashing')
         RETURNING *`;
      updateParams = [status, progress ?? null, fw_version || null, error_msg || null, esp[0].id];
    }

    const { rows } = await q(updateQuery, updateParams);

    // Si succès, met à jour la version firmware de l'ESP
    if (status === 'success' && fw_version) {
      await q('UPDATE esp_devices SET fw_version=$1 WHERE id=$2', [fw_version, esp[0].id]);
    }

    // Vérifie si tous les déploiements de la mise à jour sont terminés
    if (rows.length && rows[0].ota_id) {
      const { rows: remaining } = await q(
        `SELECT count(*)::int AS cnt FROM ota_deployments
          WHERE ota_id=$1 AND status NOT IN ('success','failed','skipped')`,
        [rows[0].ota_id]
      );
      if (remaining[0]?.cnt === 0) {
        await q(`UPDATE ota_updates SET status='done' WHERE id=$1`, [rows[0].ota_id]);
      }
    }

    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* =========================
 *  Rate limit config
 * ========================= */

adminRouter.get('/rate-limit', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM rate_limit_config WHERE id=1 LIMIT 1');
    const db = rows[0] || {};
    const live = getRateLimitConfig();
    res.json({
      global_max:             db.global_max             ?? live.global_max,
      global_window_ms:       db.global_window_ms       ?? live.global_window_ms,
      admin_max:              db.admin_max              ?? live.admin_max              ?? 300,
      admin_window_ms:        db.admin_window_ms        ?? live.admin_window_ms        ?? 900000,
      auth_max:               db.auth_max               ?? live.auth_max,
      auth_window_ms:         db.auth_window_ms         ?? live.auth_window_ms         ?? 900000,
      poll_max:               db.poll_max               ?? live.poll_max,
      poll_window_ms:         db.poll_window_ms         ?? live.poll_window_ms         ?? 900000,
      contact_max:            db.contact_max            ?? live.contact_max            ?? 5,
      contact_window_ms:      db.contact_window_ms      ?? live.contact_window_ms      ?? 3600000,
      portal_login_max:       db.portal_login_max       ?? live.portal_login_max       ?? 10,
      portal_login_window_ms: db.portal_login_window_ms ?? live.portal_login_window_ms ?? 900000,
      app_max:                db.app_max                ?? live.app_max                ?? 1000,
      app_window_ms:          db.app_window_ms          ?? live.app_window_ms          ?? 900000,
      ip_whitelist:           db.ip_whitelist           ?? '',
      updated_at:             db.updated_at             ?? null,
    });
  } catch (e) { next(e); }
});

adminRouter.get('/rate-limit/logs', (req, res) => {
  res.json(getRateLimitLogs());
});

adminRouter.get('/rate-limit/stats', (req, res) => {
  res.json(getRateLimitStats());
});

adminRouter.get('/rate-limit/ips', (req, res) => {
  res.json(getIpTable());
});

adminRouter.post('/rate-limit/ips/reset', (req, res) => {
  const { ip, limiter } = req.body || {};
  if (!ip || !limiter) return res.status(400).json({ error: 'ip and limiter required' });
  resetIpEntry(ip, limiter);
  res.json({ ok: true });
});

adminRouter.post('/rate-limit', async (req, res, next) => {
  try {
    const { global_max, global_window_ms, admin_max, admin_window_ms, auth_max, auth_window_ms, poll_max, poll_window_ms, contact_max, contact_window_ms, portal_login_max, portal_login_window_ms, app_max, app_window_ms, ip_whitelist } = req.body || {};
    // Normalise la whitelist : trim, déduplique, filtre les vides
    const whitelist = (ip_whitelist || '').split(',').map(s => s.trim()).filter(Boolean);
    const whitelistStr = whitelist.join(',');
    await q(
      `INSERT INTO rate_limit_config (id, global_max, global_window_ms, admin_max, admin_window_ms, auth_max, auth_window_ms, poll_max, poll_window_ms, contact_max, contact_window_ms, portal_login_max, portal_login_window_ms, app_max, app_window_ms, ip_whitelist, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
       ON CONFLICT (id) DO UPDATE
         SET global_max=$1, global_window_ms=$2, admin_max=$3, admin_window_ms=$4, auth_max=$5, auth_window_ms=$6, poll_max=$7, poll_window_ms=$8, contact_max=$9, contact_window_ms=$10, portal_login_max=$11, portal_login_window_ms=$12, app_max=$13, app_window_ms=$14, ip_whitelist=$15, updated_at=now()`,
      [
        Number(global_max)             || 500,
        Number(global_window_ms)       || 900000,
        Number(admin_max)              || 300,
        Number(admin_window_ms)        || 900000,
        Number(auth_max)               || 20,
        Number(auth_window_ms)         || 900000,
        Number(poll_max)               || 2000,
        Number(poll_window_ms)         || 900000,
        Number(contact_max)            || 5,
        Number(contact_window_ms)      || 3600000,
        Number(portal_login_max)       || 10,
        Number(portal_login_window_ms) || 900000,
        Number(app_max)                || 1000,
        Number(app_window_ms)          || 900000,
        whitelistStr,
      ]
    );
    await reloadRateLimitConfig();
    res.json({ ok: true, ...getRateLimitConfig() });
  } catch (e) { next(e); }
});

/* =========================
 *  Campaigns manuelles
 * ========================= */

// GET /admin/campaigns/recipients — liste paginée avec filtres (pas de tokens exposés)
adminRouter.get('/campaigns/recipients', async (req, res, next) => {
  try {
    const { search, esp_type_id, mobile_platform, has_push, limit = '50', offset = '0' } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    const off = parseInt(offset, 10) || 0;

    const { where, params: fp, nextIndex: i } = buildRecipientsFilter({ search, esp_type_id, mobile_platform, has_push });
    const clause = where.join(' AND ');

    const sql = `
      SELECT u.id, u.email, u.first_name, u.last_name,
        (SELECT count(*)::int FROM mobile_devices m
          WHERE m.user_id=u.id AND m.is_active=true
            AND (m.apns_token IS NOT NULL OR m.fcm_token IS NOT NULL)) AS push_count,
        (SELECT string_agg(DISTINCT m.platform, ', ' ORDER BY m.platform)
          FROM mobile_devices m WHERE m.user_id=u.id AND m.is_active=true) AS platforms
      FROM users u
      WHERE ${clause}
      ORDER BY u.email
      LIMIT $${i} OFFSET $${i + 1}
    `;
    const countSql = `SELECT count(*)::int AS total FROM users u WHERE ${clause}`;

    const [{ rows }, { rows: cr }] = await Promise.all([
      q(sql, [...fp, lim, off]),
      q(countSql, fp),
    ]);
    res.json({ rows, total: cr[0]?.total ?? 0, limit: lim, offset: off });
  } catch (e) { next(e); }
});

// POST /admin/campaigns/send — envoi push et/ou email
adminRouter.post('/campaigns/send', async (req, res, next) => {
  try {
    const { send_types, title, subject, body, html_body, user_ids, filters } = req.body || {};

    const v = validateCampaignPayload({ send_types, body, title, user_ids });
    if (!v.ok) return res.status(400).json({ error: v.error });

    const results = [];
    const errors  = [];

    // ── Push ──────────────────────────────────────────────
    if (send_types.includes('push')) {
      const { rows: devices } = await q(
        `SELECT m.user_id, m.apns_token, m.fcm_token, m.sandbox
           FROM mobile_devices m
          WHERE m.user_id = ANY($1::uuid[])
            AND m.is_active = true
            AND (m.apns_token IS NOT NULL OR m.fcm_token IS NOT NULL)`,
        [user_ids]
      );

      for (const d of devices) {
        // Incrémenter le badge pour cet utilisateur
        const { rows: badgeRows } = await q(
          `INSERT INTO user_badge (user_id, unread_count)
           VALUES ($1, 1)
           ON CONFLICT (user_id)
           DO UPDATE SET unread_count = user_badge.unread_count + 1, updated_at = now()
           RETURNING unread_count`,
          [d.user_id]
        );
        const badge = Number(badgeRows?.[0]?.unread_count || 1);

        if (d.apns_token && isApnsEnabled()) {
          try {
            const r = await sendAPNS(d.apns_token, title, body, { badge }, { sandbox: d.sandbox });
            const ok = r.status === 200;
            results.push({ channel: 'push', ok });
            if (!ok && errors.length < 50) errors.push({ channel: 'push', user_id: d.user_id, error: r.body });
          } catch (e) {
            results.push({ channel: 'push', ok: false });
            if (errors.length < 50) errors.push({ channel: 'push', user_id: d.user_id, error: String(e?.message || e) });
          }
        }
        if (d.fcm_token) {
          try {
            await sendFCM(d.fcm_token, title, body, { badge });
            results.push({ channel: 'push', ok: true });
          } catch (e) {
            results.push({ channel: 'push', ok: false });
            if (errors.length < 50) errors.push({ channel: 'push', user_id: d.user_id, error: String(e?.message || e) });
          }
        }
      }
    }

    // ── Email ─────────────────────────────────────────────
    if (send_types.includes('email')) {
      const { rows: emailUsers } = await q(
        `SELECT id, email FROM users
          WHERE id = ANY($1::uuid[]) AND is_active = true
            AND email IS NOT NULL AND email != ''`,
        [user_ids]
      );

      const transporter = isSmtpReady() ? await createTransporter() : null;
      const from = transporter ? buildFrom() : null;
      const emailSubject = subject || title || 'Message XamIoT';

      for (const u of emailUsers) {
        if (!transporter) {
          results.push({ channel: 'email', ok: false });
          if (errors.length < 50) errors.push({ channel: 'email', user_id: u.id, error: 'smtp_not_configured' });
          continue;
        }
        try {
          await transporter.sendMail({
            from,
            to: u.email,
            subject: emailSubject,
            text: body,
            ...(html_body ? { html: html_body } : {}),
          });
          results.push({ channel: 'email', ok: true });
        } catch (e) {
          results.push({ channel: 'email', ok: false });
          if (errors.length < 50) errors.push({ channel: 'email', user_id: u.id, error: String(e?.message || e) });
        }
      }
    }

    // ── Agrégation & persistance ───────────────────────────
    const agg = aggregateSendResults(results);
    const { rows: adminRows } = await q('SELECT email FROM users WHERE id=$1', [req.user.sub]);
    const sentBy = adminRows[0]?.email || null;

    await q(
      `INSERT INTO manual_campaigns
         (sent_by, send_types, title, subject, body, html_body, filters, target_count,
          success_push, fail_push, success_email, fail_email, errors)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        sentBy,
        send_types,
        title || null,
        subject || null,
        body,
        html_body || null,
        JSON.stringify(filters || {}),
        user_ids.length,
        agg.success_push,
        agg.fail_push,
        agg.success_email,
        agg.fail_email,
        JSON.stringify(errors),
      ]
    );

    res.json({ ok: true, ...agg, errors });
  } catch (e) { next(e); }
});

// GET /admin/campaigns — historique des envois
adminRouter.get('/campaigns', async (req, res, next) => {
  try {
    const { limit = '50', offset = '0' } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    const off = parseInt(offset, 10) || 0;
    const { rows } = await q(
      `SELECT id, sent_by, send_types, title, subject, body,
              filters, target_count,
              success_push, fail_push, success_email, fail_email,
              jsonb_array_length(COALESCE(errors, '[]'::jsonb)) AS error_count,
              sent_at
         FROM manual_campaigns
        ORDER BY sent_at DESC
        LIMIT $1 OFFSET $2`,
      [lim, off]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

/* =========================
 *  App Config
 * ========================= */

// GET /admin/app-config — toutes les clés non-secrètes + valeur masquée pour secrètes
adminRouter.get('/app-config', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT key, CASE WHEN is_secret THEN '••••••••' ELSE value END AS value,
              description, is_secret, updated_at
         FROM app_config ORDER BY key`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /admin/app-config/:key
adminRouter.get('/app-config/:key', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM app_config WHERE key=$1', [req.params.key]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const row = rows[0];
    if (row.is_secret) row.value = '••••••••';
    res.json(row);
  } catch (e) { next(e); }
});

// PUT /admin/app-config/:key
adminRouter.put('/app-config/:key', requireAuth, async (req, res, next) => {
  try {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ error: 'missing_value' });
    const { rows } = await q(
      `INSERT INTO app_config (key, value, updated_at, updated_by)
         VALUES ($1, $2, now(), $3)
       ON CONFLICT (key) DO UPDATE
         SET value=$2, updated_at=now(), updated_by=$3
       RETURNING key`,
      [req.params.key, String(value), req.user.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, key: rows[0].key });
  } catch (e) { next(e); }
});

// POST /admin/app-config/deepl/test — vérifie la clé DeepL stockée en DB
adminRouter.post('/app-config/deepl/test', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q("SELECT value FROM app_config WHERE key='deepl_api_key'");
    const apiKey = rows[0]?.value;
    if (!apiKey || apiKey === '••••••••' || apiKey.trim() === '') {
      return res.status(400).json({ error: 'no_key', message: 'Aucune clé DeepL configurée.' });
    }
    const resp = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${apiKey}` },
      body: JSON.stringify({ text: ['Hello'], target_lang: 'FR' }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return res.status(400).json({ ok: false, message: err.message || `HTTP ${resp.status}` });
    }
    const data = await resp.json();
    res.json({ ok: true, sample: data?.translations?.[0]?.text });
  } catch (e) { next(e); }
});

/* =========================
 *  CMS — Médias
 * ========================= */

// GET /admin/cms/media
adminRouter.get('/cms/media', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT id, filename, original_name, mime_type, size_bytes,
              width_px, height_px, alt_text, folder, url_path, created_at
         FROM cms_media ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /admin/cms/media/upload
adminRouter.post('/cms/media/upload', requireAuth, mediaUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const { originalname, mimetype, size, filename, destination } = req.file;

    // Construire url_path relatif à MEDIA_DIR
    const rel = path.relative(MEDIA_DIR, path.join(destination, filename));
    const urlPath = `/media/${rel.replace(/\\/g, '/')}`;

    // Dimensions image (best-effort, sans dépendance externe)
    let width_px = null, height_px = null;

    const { rows } = await q(
      `INSERT INTO cms_media (filename, original_name, mime_type, size_bytes, url_path, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [filename, originalname, mimetype, size, urlPath, req.user.sub]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// PATCH /admin/cms/media/:id
adminRouter.patch('/cms/media/:id', requireAuth, async (req, res, next) => {
  try {
    const fields = []; const vals = []; let i = 1;
    if ('alt_text' in req.body) { fields.push(`alt_text=$${i++}`); vals.push(req.body.alt_text ?? null); }
    if ('folder'   in req.body) { fields.push(`folder=$${i++}`);   vals.push(req.body.folder || null); }
    if (!fields.length) return res.status(400).json({ error: 'no_fields' });
    vals.push(req.params.id);
    const { rows } = await q(`UPDATE cms_media SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /admin/cms/media/:id
adminRouter.delete('/cms/media/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q('DELETE FROM cms_media WHERE id=$1 RETURNING filename, url_path', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    // Suppression physique du fichier (best-effort)
    const filePath = path.join(MEDIA_DIR, rows[0].url_path.replace('/media/', ''));
    try { fs.unlinkSync(filePath); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* =========================
 *  CMS — Pages
 * ========================= */

// GET /admin/cms/pages
adminRouter.get('/cms/pages', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT p.*,
              t_fr.title  AS title_fr,
              t_en.title  AS title_en,
              t_es.title  AS title_es
         FROM cms_pages p
         LEFT JOIN cms_page_translations t_fr ON t_fr.page_id=p.id AND t_fr.lang='fr'
         LEFT JOIN cms_page_translations t_en ON t_en.page_id=p.id AND t_en.lang='en'
         LEFT JOIN cms_page_translations t_es ON t_es.page_id=p.id AND t_es.lang='es'
        ORDER BY p.sort_order, p.created_at`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /admin/cms/pages/:id
adminRouter.get('/cms/pages/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM cms_pages WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const page = rows[0];
    const { rows: translations } = await q(
      'SELECT * FROM cms_page_translations WHERE page_id=$1',
      [req.params.id]
    );
    page.translations = translations;
    res.json(page);
  } catch (e) { next(e); }
});

// POST /admin/cms/pages
adminRouter.post('/cms/pages', requireAuth, async (req, res, next) => {
  try {
    const { slug, status='draft', sort_order=0, show_in_menu=true, show_in_footer=false,
            parent_id=null, featured_media_id=null,
            translations=[] } = req.body;
    if (!slug) return res.status(400).json({ error: 'missing_slug' });

    const { rows } = await q(
      `INSERT INTO cms_pages (slug, status, sort_order, show_in_menu, show_in_footer, parent_id, featured_media_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [slug, status, sort_order, show_in_menu, show_in_footer, parent_id, featured_media_id, req.user.sub]
    );
    const page = rows[0];

    for (const t of translations) {
      if (!t.lang || !t.title) continue;
      await q(
        `INSERT INTO cms_page_translations (page_id, lang, title, content, content_after, seo_title, seo_description, menu_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (page_id, lang) DO UPDATE
           SET title=$3, content=$4, content_after=$5, seo_title=$6, seo_description=$7, menu_label=$8, updated_at=now()`,
        [page.id, t.lang, t.title, t.content||null, t.content_after||null, t.seo_title||null, t.seo_description||null, t.menu_label||null]
      );
    }
    res.status(201).json(page);
  } catch (e) { next(e); }
});

// PATCH /admin/cms/pages/:id
adminRouter.patch('/cms/pages/:id', requireAuth, async (req, res, next) => {
  try {
    const allowed = ['slug','status','sort_order','show_in_menu','show_in_footer','parent_id','featured_media_id'];
    const fields = [];
    const vals   = [];
    let idx = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) { fields.push(`${k}=$${idx++}`); vals.push(req.body[k]); }
    }
    if (req.body.status === 'published') {
      fields.push(`published_at=COALESCE(published_at, now())`);
    }
    fields.push(`updated_at=now()`);
    vals.push(req.params.id);

    const { rows } = await q(
      `UPDATE cms_pages SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });

    // Mise à jour des traductions si fournies
    if (Array.isArray(req.body.translations)) {
      for (const t of req.body.translations) {
        if (!t.lang || !t.title) continue;
        await q(
          `INSERT INTO cms_page_translations (page_id, lang, title, content, seo_title, seo_description, menu_label)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (page_id, lang) DO UPDATE
             SET title=$3, content=$4, seo_title=$5, seo_description=$6, menu_label=$7, updated_at=now()`,
          [req.params.id, t.lang, t.title, t.content||null, t.seo_title||null, t.seo_description||null, t.menu_label||null]
        );
      }
    }
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /admin/cms/pages/:id
adminRouter.delete('/cms/pages/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q('DELETE FROM cms_pages WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /admin/cms/pages/:id/translate — traduction auto via DeepL
adminRouter.post('/cms/pages/:id/translate', requireAuth, async (req, res, next) => {
  try {
    const { target_langs = ['en', 'es'] } = req.body;

    // Récupérer clé DeepL
    const { rows: cfgRows } = await q("SELECT value FROM app_config WHERE key='deepl_api_key'");
    const apiKey = cfgRows[0]?.value;
    if (!apiKey || apiKey.trim() === '') {
      return res.status(400).json({ error: 'no_deepl_key', message: 'Clé DeepL non configurée.' });
    }

    // Source FR
    const { rows: srcRows } = await q(
      "SELECT * FROM cms_page_translations WHERE page_id=$1 AND lang='fr'",
      [req.params.id]
    );
    if (!srcRows.length) return res.status(400).json({ error: 'no_fr_translation' });
    const src = srcRows[0];

    const results = {};
    const LANG_MAP = { en: 'EN', es: 'ES' };

    for (const lang of target_langs) {
      const deeplLang = LANG_MAP[lang];
      if (!deeplLang) continue;

      const texts = [src.title, src.content, src.seo_title, src.seo_description, src.menu_label]
        .map(t => t || '');

      const resp = await fetch('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${apiKey}` },
        body: JSON.stringify({ text: texts, target_lang: deeplLang, tag_handling: 'html' }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        results[lang] = { ok: false, error: err.message || `HTTP ${resp.status}` };
        continue;
      }

      const data = await resp.json();
      const [title, content, seo_title, seo_description, menu_label] =
        data.translations.map(t => t.text || null);

      await q(
        `INSERT INTO cms_page_translations
           (page_id, lang, title, content, seo_title, seo_description, menu_label, is_auto_translated, translated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,true,now())
         ON CONFLICT (page_id, lang) DO UPDATE
           SET title=$3, content=$4, seo_title=$5, seo_description=$6, menu_label=$7,
               is_auto_translated=true, translated_at=now(), updated_at=now()`,
        [req.params.id, lang, title, content, seo_title, seo_description, menu_label]
      );
      results[lang] = { ok: true };
    }

    res.json({ ok: true, results });
  } catch (e) { next(e); }
});

// PATCH /admin/cms/pages/reorder — réordonner les pages
adminRouter.patch('/cms/pages/reorder', requireAuth, async (req, res, next) => {
  try {
    const { order } = req.body; // [{ id, sort_order }]
    if (!Array.isArray(order)) return res.status(400).json({ error: 'invalid_payload' });
    for (const { id, sort_order } of order) {
      await q('UPDATE cms_pages SET sort_order=$1 WHERE id=$2', [sort_order, id]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* =========================
 *  Handler d'erreur (router)
 * ========================= */

adminRouter.use((err, req, res, next) => {
  console.error('[ADMIN] Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'admin_internal_error', message: String(err?.message || err) });
});

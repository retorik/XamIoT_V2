// src/app.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { q } from './db.js';
import {
  signup,
  login,
  requireAuth,
  activate,
  resendActivation,
  requestPasswordReset,
  resetPasswordWithToken,
  deleteMyAccount,
  requestAccountDeletion,
  confirmAccountDeletion,
} from './auth.js';
import { startWorker, evaluateAlertRules } from './mqttWorker.js';
import { dispatch } from './notifDispatcher.js';
import { checkOfflineDevices } from './sysNotifEngine.js';
import { runScheduledNotifs } from './scheduledNotifWorker.js';
import { adminRouter } from './adminRoutes.js';
import { auditMiddleware, getRealIp } from './auditMiddleware.js';
import { auditRouter } from './auditRouter.js';
import { cmsPublicRouter } from './cmsPublicRouter.js';
import { adminProductsRouter, publicProductsRouter } from './productsRouter.js';
import { adminTicketsRouter, portalTicketsRouter } from './ticketsRouter.js';
import { adminOrdersRouter, publicOrdersRouter, portalOrdersRouter } from './ordersRouter.js';
import { publicCountriesRouter, adminCountriesRouter } from './countriesRouter.js';
import { addressesRouter } from './addressesRouter.js';
import { config } from './config.js';
import { reloadApnsConfig } from './apns.js';
import { reloadFcmConfig } from './fcm.js';
import { reloadSmtpConfig, createTransporter, buildFrom } from './smtp.js';
import { globalLimiter, adminLimiter, authLimiter, pollLimiter, contactLimiter, portalLoginLimiter, deletionLimiter, appLimiter, reloadRateLimitConfig } from './rateLimitManager.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import argon2 from 'argon2';

const app = express();

// Traefik est le reverse-proxy devant l'API — on lui fait confiance pour X-Forwarded-For
// 'loopback, uniquelocal' couvre 127.x, 10.x, 172.16-31.x (Docker bridge), 192.168.x
app.set('trust proxy', 'loopback, uniquelocal');

// =============================================
// MIDDLEWARES GLOBAUX
// =============================================

app.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  const hasBearer = /^Bearer\s.+/i.test(auth);
  console.log(`[REQ] ${req.method} ${req.url} auth=${hasBearer ? 'yes' : 'no'}`);
  next();
});

app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

// Le webhook Stripe nécessite le body RAW pour vérifier la signature.
// bodyParser.json() NE DOIT PAS consommer le body de cette route.
app.use((req, res, next) => {
  if (req.originalUrl === '/public/checkout/webhook') return next();
  bodyParser.json()(req, res, next);
});

app.use(globalLimiter);

// =============================================
// ROUTES PUBLIQUES
// =============================================

app.get('/health', (req, res) => res.json({ ok: true, version: '2.0.0' }));
app.get('/', (req, res) => res.json({ ok: true, service: 'XamIoT API', version: '2.0.0' }));

// =============================================
// MÉDIAS — Fichiers uploadés (photos, docs)
// Servis depuis MEDIA_DIR (volume Docker /data/media)
// =============================================
const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || '/data/media');
try { fs.mkdirSync(MEDIA_DIR, { recursive: true }); } catch {}

app.get('/media/*', (req, res) => {
  // Protection contre le path traversal
  const rel = (req.params[0] || '').replace(/\.\./g, '').replace(/^\/+/, '');
  const filePath = path.join(MEDIA_DIR, rel);
  if (!filePath.startsWith(MEDIA_DIR)) return res.status(400).end();
  res.sendFile(filePath, err => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

/**
 * GET /public/config
 * Retourne les informations publiques et non sensibles de l'instance.
 * Utilisé par le site public, le portail client et les apps mobiles
 * pour connaître les URLs d'environnement sans hardcoding.
 */
app.get('/public/config', async (req, res) => {
  try {
    const { rows } = await q(
      "SELECT key, value FROM app_config WHERE key IN ('site_name','available_langs','default_lang','support_email','logo_url','logo_height','appstore_url','googleplay_url','nav_appstore_logo','nav_googleplay_logo') AND is_secret = false"
    );
    const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({
      site_name:       cfg.site_name    || 'XamIoT',
      support_email:   cfg.support_email || 'support@xamiot.com',
      available_langs: (cfg.available_langs || 'fr,en,es').split(',').map(l => l.trim()),
      default_lang:    cfg.default_lang  || 'fr',
      logo_url:           cfg.logo_url            || null,
      logo_height:        cfg.logo_height         ? parseInt(cfg.logo_height, 10) : 40,
      appstore_url:       cfg.appstore_url        || 'https://apps.apple.com',
      googleplay_url:     cfg.googleplay_url      || 'https://play.google.com',
      nav_appstore_logo:  cfg.nav_appstore_logo   || null,
      nav_googleplay_logo:cfg.nav_googleplay_logo || null,
      urls: {
        site:   config.urls.publicSite,
        portal: config.urls.publicPortal,
        api:    config.urls.apiPublic,
      },
    });
  } catch {
    // En cas d'erreur DB (ex: table pas encore créée), retourne les valeurs statiques
    res.json({
      site_name: 'XamIoT',
      available_langs: ['fr', 'en', 'es'],
      default_lang: 'fr',
      logo_url:    null,
      logo_height: 40,
      urls: {
        site:   config.urls.publicSite,
        portal: config.urls.publicPortal,
        api:    config.urls.apiPublic,
      },
    });
  }
});

// Téléchargement firmware OTA (accessible sans auth pour les ESP)
app.get('/ota/:id/firmware', async (req, res) => {
  try {
    const { rows } = await q('SELECT firmware_file, version FROM ota_updates WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const OTA_DIR = process.env.OTA_DIR || '/data/ota';
    const filePath = path.join(OTA_DIR, rows[0].firmware_file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file_not_found' });
    res.download(filePath, `firmware_v${rows[0].version}${path.extname(rows[0].firmware_file)}`);
  } catch (e) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// =============================================
// AUTH
// =============================================

app.post('/auth/signup', authLimiter, async (req, res) => {
  const {
    email, password,
    first_name, last_name, phone,
    firstname, lastname, FirstName, LastName, Phone,
  } = req.body || {};

  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm || !password) return res.status(400).json({ error: 'email_password_required' });

  const fn = first_name ?? firstname ?? FirstName ?? null;
  const ln = last_name ?? lastname ?? LastName ?? null;
  const ph = phone ?? Phone ?? null;

  try {
    const result = await signup(emailNorm, password, fn, ln, ph);
    // Audit — inscription
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, ip_address, user_agent, details)
       VALUES ($1, $2, 'AUTH_SIGNUP', 'auth', $3, $4, $5)`,
      [
        result.user_id || null, emailNorm,
        getRealIp(req), req.headers['user-agent'] || null,
        JSON.stringify({ first_name: fn, last_name: ln }),
      ]
    ).catch(err => console.error('[AUDIT] signup error:', err.message));
    res.status(201).json(result);
  } catch (e) {
    if (e && e.code === '23505') return res.status(409).json({ error: 'email_exists' });
    console.error('Signup failed:', e);
    res.status(500).json({ error: 'signup_failed' });
  }
});

app.get('/auth/activate/:token', async (req, res) => {
  const base = config.urls.activationResult;
  try {
    const result = await activate(req.params.token);
    // Audit — vérification email
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, ip_address, user_agent)
       VALUES ($1, $2, 'AUTH_VERIFY_EMAIL', 'auth', $3, $4)`,
      [
        result?.user_id || null, result?.email || null,
        getRealIp(req), req.headers['user-agent'] || null,
      ]
    ).catch(err => console.error('[AUDIT] verify email error:', err.message));
    res.redirect(`${base}?status=success`);
  } catch (e) {
    res.redirect(`${base}?status=error&code=${encodeURIComponent(e.message)}`);
  }
});

app.post('/auth/resend-activation', authLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email_required' });
    await resendActivation(email);
    res.json({ ok: true });
  } catch (e) {
    const status = e?.status || 400;
    res.status(status).json({ error: e?.message || 'resend_failed' });
  }
});

app.post('/auth/login', authLimiter, portalLoginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email_password_required' });
  try {
    const result = await login(email, password);
    // Tracer la connexion dans l'audit
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, ip_address, user_agent, details)
       VALUES ($1, $2, 'LOGIN', 'auth', $3, $4, $5)`,
      [
        result.user.id,
        result.user.email,
        getRealIp(req),
        req.headers['user-agent'] || null,
        null,
      ]
    ).catch(err => console.error('[AUDIT] login insert error:', err.message));
    res.json(result);
  } catch (e) {
    const reason = e?.message === 'account_inactive' ? 'account_inactive' : 'invalid_credentials';
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, ip_address, user_agent, details)
       VALUES (NULL, $1, 'LOGIN_FAILED', 'auth', $2, $3, $4)`,
      [
        (email || '').toLowerCase(),
        getRealIp(req),
        req.headers['user-agent'] || null,
        JSON.stringify({ reason }),
      ]
    ).catch(err => console.error('[AUDIT] login_failed insert error:', err.message));
    if (reason === 'account_inactive') return res.status(403).json({ error: 'account_inactive' });
    res.status(401).json({ error: 'invalid_credentials' });
  }
});

app.post('/auth/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    const out = await requestPasswordReset(email);
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, ip_address, user_agent, details)
       VALUES (NULL, $1, 'PASSWORD_RESET_REQUEST', 'auth', $2, $3, NULL)`,
      [(email || '').toLowerCase(), getRealIp(req), req.headers['user-agent'] || null]
    ).catch(() => {});
    res.json(out);
  } catch (e) {
    const status = e?.status || 400;
    res.status(status).json({ error: e?.message || 'reset_request_failed' });
  }
});

app.post('/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, new_password } = req.body || {};
    const out = await resetPasswordWithToken(token, new_password);
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, ip_address, user_agent, details)
       VALUES ($1, $2, 'PASSWORD_RESET_DONE', 'auth', $3, $4, NULL)`,
      [out.user?.id || null, out.user?.email || null, getRealIp(req), req.headers['user-agent'] || null]
    ).catch(() => {});
    res.json(out);
  } catch (e) {
    const status = e?.status || 400;
    res.status(status).json({ error: e?.message || 'reset_failed' });
  }
});

// =============================================
// PORTAL CONFIG (paramètres dynamiques du portail client)
// =============================================

app.get('/portal-config', requireAuth, async (req, res) => {
  try {
    const { rows } = await q(
      "SELECT key, value FROM app_config WHERE key IN ('portal_refresh_interval_sec','portal_idle_timeout_sec','portal_auto_logout_min')"
    );
    const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({
      refresh_interval_sec: parseInt(cfg.portal_refresh_interval_sec, 10) || 60,
      idle_timeout_sec:     parseInt(cfg.portal_idle_timeout_sec, 10)     || 60,
      auto_logout_min:      parseInt(cfg.portal_auto_logout_min, 10)     ?? 30,
    });
  } catch {
    res.json({ refresh_interval_sec: 60, idle_timeout_sec: 60, auto_logout_min: 30 });
  }
});

// =============================================
// BADGE
// =============================================

app.post('/me/badge/reset', requireAuth, async (req, res) => {
  await q(
    `INSERT INTO user_badge(user_id, unread_count, updated_at)
     VALUES ($1, 0, now())
     ON CONFLICT (user_id)
     DO UPDATE SET unread_count = 0, updated_at = now()`,
    [req.user.sub]
  );
  res.json({ ok: true, badge: 0 });
});

app.get('/me/profile', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      'SELECT id, email, first_name, last_name, phone, created_at, is_active, activated_at FROM users WHERE id=$1',
      [req.user.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// PATCH /me/profile — Modifier son profil (nom, prénom, téléphone)
app.patch('/me/profile', requireAuth, async (req, res, next) => {
  try {
    const { first_name, last_name, phone } = req.body || {};
    const sets = []; const params = []; let i = 1;
    if (first_name !== undefined) { sets.push(`first_name=$${i++}`); params.push(first_name || null); }
    if (last_name  !== undefined) { sets.push(`last_name=$${i++}`);  params.push(last_name || null); }
    if (phone      !== undefined) { sets.push(`phone=$${i++}`);      params.push(phone || null); }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
    params.push(req.user.sub);
    const { rows } = await q(
      `UPDATE users SET ${sets.join(', ')} WHERE id=$${i} RETURNING id, email, first_name, last_name, phone, created_at, is_active, activated_at`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    // Audit
    q(`INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent)
       VALUES ($1, $2, 'UPDATE', 'user', $1, $3, $4)`,
      [req.user.sub, req.user.email, getRealIp(req), req.headers['user-agent'] || null]
    ).catch(err => console.error('[AUDIT] profile update error:', err.message));
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// POST /me/change-password — Changer son mot de passe
app.post('/me/change-password', requireAuth, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) return res.status(400).json({ error: 'missing_fields' });
    if (new_password.length < 8) return res.status(400).json({ error: 'password_too_short' });
    const { rows } = await q('SELECT pass_hash FROM users WHERE id=$1', [req.user.sub]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const ok = await argon2.verify(rows[0].pass_hash, current_password);
    if (!ok) return res.status(403).json({ error: 'wrong_password' });
    const newHash = await argon2.hash(new_password);
    await q('UPDATE users SET pass_hash=$1 WHERE id=$2', [newHash, req.user.sub]);
    // Audit
    q(`INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent)
       VALUES ($1, $2, 'UPDATE', 'auth', $1, $3, $4)`,
      [req.user.sub, req.user.email, getRealIp(req), req.headers['user-agent'] || null]
    ).catch(err => console.error('[AUDIT] password change error:', err.message));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /sound-history — Historique sonore d'un appareil
app.get('/sound-history', requireAuth, async (req, res, next) => {
  try {
    const { esp_id, limit = '50' } = req.query;
    if (!esp_id) return res.status(400).json({ error: 'esp_id_required' });
    // Vérifier propriété
    const { rows: check } = await q('SELECT esp_uid FROM esp_devices WHERE id=$1 AND user_id=$2', [esp_id, req.user.sub]);
    if (!check.length) return res.status(404).json({ error: 'esp_not_found' });
    const lim = Math.min(Number(limit) || 50, 500);
    const { rows } = await q(
      `SELECT (m.payload::jsonb->>'soundPct')::numeric AS level,
              (m.payload::jsonb->>'dbfsAvg')::numeric AS dbfs,
              m.received_at AS timestamp
         FROM mqtt_raw_logs m
        WHERE m.esp_uid = $1
          AND (m.payload::jsonb->>'soundPct') IS NOT NULL
        ORDER BY m.received_at DESC
        LIMIT $2`,
      [check[0].esp_uid, lim]
    );
    res.json({ history: rows });
  } catch (e) { next(e); }
});

app.get('/me/badge', requireAuth, async (req, res) => {
  const { rows } = await q(
    'SELECT unread_count FROM user_badge WHERE user_id=$1',
    [req.user.sub]
  );
  res.json({ badge: Number(rows?.[0]?.unread_count || 0) });
});

// =============================================
// MOBILE DEVICES
// =============================================

app.post('/devices', requireAuth, async (req, res) => {
  const {
    name, platform = 'iOS', apns_token, fcm_token, bundle_id,
    sandbox = false, model = null, os_version = null, timezone = null,
    app_version = null, app_build_number = null,
  } = req.body || {};
  if (!bundle_id) return res.status(400).json({ error: 'missing_fields' });
  if (!apns_token && !fcm_token) return res.status(400).json({ error: 'apns_token_or_fcm_token_required' });

  const conflictField = apns_token ? 'apns_token' : 'fcm_token';

  const { rows } = await q(
    `INSERT INTO mobile_devices(user_id, name, platform, apns_token, fcm_token, bundle_id, sandbox, model, os_version, timezone, app_version, app_build_number, is_active, last_seen)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, now())
     ON CONFLICT(${conflictField}) DO UPDATE
       SET user_id=excluded.user_id, name=excluded.name, platform=excluded.platform,
           bundle_id=excluded.bundle_id, sandbox=excluded.sandbox,
           model=excluded.model, os_version=excluded.os_version, timezone=excluded.timezone,
           app_version=excluded.app_version, app_build_number=excluded.app_build_number,
           is_active=true, last_seen=now()
     RETURNING id, (xmax = 0) AS is_new_token`,
    [req.user.sub, name || null, platform, apns_token || null, fcm_token || null, bundle_id, sandbox, model, os_version, timezone, app_version, app_build_number ?? null]
  );

  // Notification — enrôlement mobile uniquement si le token est nouveau
  if (rows[0].is_new_token) {
    const { rows: uRows } = await q('SELECT first_name FROM users WHERE id=$1', [req.user.sub]).catch(() => ({ rows: [] }));
    dispatch('mobile_enrolled', req.user.sub, {
      first_name: uRows[0]?.first_name || '',
      device_name: name || platform || 'Mobile',
      platform: platform,
      model: model || '',
      app_version: app_version || '',
    }, { resourceType: 'mobile_device', resourceId: rows[0].id }).catch(() => {});
  }

  res.json({ device_id: rows[0].id });
});

app.get('/devices', requireAuth, async (req, res) => {
  const { rows } = await q(
    'SELECT id, name, platform, bundle_id, is_active, last_seen, model, os_version, app_version, app_build_number FROM mobile_devices WHERE user_id=$1 ORDER BY last_seen DESC',
    [req.user.sub]
  );
  res.json(rows);
});

// =============================================
// ESP DEVICES
// =============================================

app.post('/esp-devices', requireAuth, async (req, res) => {
  const { esp_uid, name, topic_prefix, mqtt_password } = req.body || {};

  if (!esp_uid || !topic_prefix) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  try {
    const { rows: existingRows } = await q(
      'SELECT id, user_id, mqtt_password_hash FROM esp_devices WHERE esp_uid=$1 LIMIT 1',
      [esp_uid]
    );

    const auditDevice = (action, details) => q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, $3, 'esp_device', $4, $5, $6, $7)`,
      [req.user.sub, req.user.email, action, esp_uid,
       getRealIp(req), req.headers['user-agent'] || null, JSON.stringify(details)]
    ).catch(err => console.error('[AUDIT]', err.message));

    if (existingRows.length === 0) {
      if (!mqtt_password) return res.status(400).json({ error: 'mqtt_password_required' });
      const mqtt_password_hash = await bcrypt.hash(mqtt_password, 10);
      const { rows } = await q(
        `INSERT INTO esp_devices(user_id, esp_uid, name, topic_prefix, mqtt_password_hash, mqtt_enabled)
         VALUES($1, $2, $3, $4, $5, true)
         RETURNING id, esp_uid, name, topic_prefix, last_seen, last_db`,
        [req.user.sub, esp_uid, name || null, topic_prefix, mqtt_password_hash]
      );
      await auditDevice('device.enrolled', { esp_uid, name: name || null, topic_prefix });
      // Notification — enrôlement nouveau périphérique
      const { rows: uRows } = await q('SELECT first_name FROM users WHERE id=$1', [req.user.sub]).catch(() => ({ rows: [] }));
      dispatch('esp_enrolled', req.user.sub, {
        first_name: uRows[0]?.first_name || '',
        esp_name: name || esp_uid,
        esp_uid,
      }, { resourceType: 'esp_device', resourceId: rows[0].id }).catch(() => {});
      // device_type_id sera auto-assigné par mqttWorker dès le premier message MQTT
      return res.status(201).json({ ...rows[0], mqtt_username: esp_uid });
    }

    const existing = existingRows[0];
    if (String(existing.user_id) !== String(req.user.sub)) {
      return res.status(409).json({ error: 'esp_uid_already_used' });
    }

    let newHash = existing.mqtt_password_hash;
    if (mqtt_password) newHash = await bcrypt.hash(mqtt_password, 10);

    const { rows: updated } = await q(
      `UPDATE esp_devices
          SET name=COALESCE($1, name), topic_prefix=COALESCE($2, topic_prefix),
              mqtt_password_hash=$3, mqtt_enabled=true
        WHERE esp_uid=$4
        RETURNING id, esp_uid, name, topic_prefix, last_seen, last_db`,
      [name || null, topic_prefix || null, newHash, esp_uid]
    );
    await auditDevice('device.re_enrolled', { esp_uid, name: name || null, topic_prefix });
    return res.json({ ...updated[0], mqtt_username: esp_uid });
  } catch (e) {
    console.error('POST /esp-devices failed:', e);
    return res.status(500).json({ error: 'esp_devices_failed' });
  }
});

app.get('/esp-devices', requireAuth, async (req, res) => {
  const { rows } = await q(
    `SELECT
       e.id, e.esp_uid, e.name, e.topic_prefix, e.last_seen, e.last_db,
       e.is_simulated,
       COALESCE((
         SELECT json_agg(s.sound_pct ORDER BY s.received_at ASC)
         FROM (
           SELECT (m.payload::jsonb->>'soundPct')::numeric AS sound_pct, m.received_at
           FROM mqtt_raw_logs m
           WHERE m.esp_uid = e.esp_uid
             AND (m.payload::jsonb->>'soundPct') IS NOT NULL
           ORDER BY m.received_at DESC
           LIMIT 30
         ) s
       ), '[]'::json) AS sound_history
     FROM esp_devices e
     WHERE e.user_id = $1
     ORDER BY e.is_simulated ASC, e.name NULLS LAST, e.esp_uid`,
    [req.user.sub]
  );
  res.json(rows);
});

app.get('/esp-devices/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT e.id, e.esp_uid, e.name, e.topic_prefix, e.last_seen, e.last_db,
              e.is_simulated, dt.name AS device_type_name
         FROM esp_devices e
         LEFT JOIN device_types dt ON dt.id = e.device_type_id
        WHERE e.id = $1 AND e.user_id = $2`,
      [req.params.id, req.user.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'esp_not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

app.patch('/esp-devices/:id', requireAuth, async (req, res) => {
  const { name, topic_prefix } = req.body || {};
  // Récupérer l'état avant pour l'audit
  const { rows: before } = await q(
    'SELECT name, topic_prefix FROM esp_devices WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.sub]
  );
  await q(
    'UPDATE esp_devices SET name=COALESCE($1,name), topic_prefix=COALESCE($2,topic_prefix) WHERE id=$3 AND user_id=$4',
    [name || null, topic_prefix || null, req.params.id, req.user.sub]
  );
  const { rows } = await q(
    'SELECT id, esp_uid, name, topic_prefix, last_seen, last_db FROM esp_devices WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.sub]
  );
  if (before.length) {
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, 'DEVICE_UPDATE', 'esp_device', $3, $4, $5, $6)`,
      [req.user.sub, req.user.email, req.params.id, getRealIp(req), req.headers['user-agent'] || null,
       JSON.stringify({ before: before[0], after: { name: name || before[0].name, topic_prefix: topic_prefix || before[0].topic_prefix } })]
    ).catch(err => console.error('[AUDIT] device_update error:', err.message));
  }
  res.json(rows[0] || {});
});

// =============================================
// SIMULATION — injection de mesures simulées
// =============================================

// POST /esp-devices/:id/simulate — injecte une mesure simulée
// Body : { soundPct: number (0-100), soundAvg?: number }
app.post('/esp-devices/:id/simulate', requireAuth, appLimiter, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT e.id, e.esp_uid, e.user_id, e.name, e.device_type_id,
              dt.notif_title_tpl, dt.notif_body_tpl
         FROM esp_devices e
         LEFT JOIN device_types dt ON dt.id = e.device_type_id
        WHERE e.id=$1 AND e.user_id=$2 AND e.is_simulated=true LIMIT 1`,
      [req.params.id, req.user.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'simulated_device_not_found' });

    const device = rows[0];
    let { soundPct, soundAvg } = req.body || {};

    soundPct = Math.min(100, Math.max(0, Number(soundPct) || 0));
    soundAvg = soundAvg != null ? Math.min(100, Math.max(0, Number(soundAvg))) : soundPct;

    const payload = JSON.stringify({ soundPct, soundAvg });
    const topic = `xamiot/${device.esp_uid}/data`;

    // Insère dans mqtt_raw_logs pour que l'historique soit visible
    await q(
      `INSERT INTO mqtt_raw_logs(topic, payload, esp_uid, esp_id, payload_size)
       VALUES($1, $2, $3, $4, $5)`,
      [topic, payload, device.esp_uid, device.id, payload.length]
    );

    // Met à jour last_seen et last_db (soundPct est la valeur primaire)
    await q(
      'UPDATE esp_devices SET last_seen=now(), last_db=$1 WHERE id=$2',
      [soundPct, device.id]
    );

    // Évalue les règles d'alerte — même pipeline que les vraies trames MQTT
    evaluateAlertRules(device, { soundPct, soundAvg }, topic).catch(e =>
      console.error('[SIMULATOR] Erreur évaluation règles:', e?.message || e)
    );

    console.log(`[SIMULATOR] Mesure injectée: ${device.esp_uid} soundPct=${soundPct}`);
    res.json({ ok: true, esp_uid: device.esp_uid, soundPct, soundAvg });
  } catch (e) { next(e); }
});

// POST /esp-devices/:id/simulate/reset — vide l'historique simulé
app.post('/esp-devices/:id/simulate/reset', requireAuth, appLimiter, async (req, res, next) => {
  try {
    const { rows } = await q(
      'SELECT id, esp_uid FROM esp_devices WHERE id=$1 AND user_id=$2 AND is_simulated=true LIMIT 1',
      [req.params.id, req.user.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'simulated_device_not_found' });

    const device = rows[0];
    await q('DELETE FROM mqtt_raw_logs WHERE esp_uid=$1', [device.esp_uid]);
    await q('UPDATE esp_devices SET last_seen=NULL, last_db=NULL WHERE id=$1', [device.id]);

    console.log(`[SIMULATOR] Historique effacé: ${device.esp_uid}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.delete('/esp-devices/:id', requireAuth, async (req, res, next) => {
  try {
    // Récupère l'esp_uid avant suppression pour envoyer la commande MQTT
    const { rows: found } = await q(
      'SELECT esp_uid, name FROM esp_devices WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.sub]
    );
    if (!found.length) return res.json({ ok: false });

    const { esp_uid: espUid, name: espName } = found[0];
    const ip = getRealIp(req);
    const ua = req.headers['user-agent'] || null;

    const auditInsert = (action, details) => q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, $3, 'esp_device', $4, $5, $6, $7)`,
      [req.user.sub, req.user.email, action, espUid, ip, ua, JSON.stringify(details)]
    ).catch(err => console.error('[AUDIT]', err.message));

    // Tente d'envoyer reset_mqtt à l'ESP et attend son ack (max 15s)
    // Si l'ESP est hors ligne, on supprime quand même après le timeout.
    const { getMqttClient } = await import('./mqttWorker.js');
    const mqttClient = getMqttClient();
    if (mqttClient) {
      await auditInsert('device.reset_mqtt_sent', { esp_uid: espUid, name: espName });
      await new Promise((resolve) => {
        const ackTopic = `devices/${espUid}/cmd/reset_mqtt/ack`;
        let resolved = false;
        const done = async (result) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          mqttClient.unsubscribe(ackTopic);
          mqttClient.removeListener('message', onMsg);
          await auditInsert(
            result === 'ack' ? 'device.reset_mqtt_ack' : 'device.reset_mqtt_timeout',
            { esp_uid: espUid, name: espName, result }
          );
          resolve();
        };
        const onMsg = (topic) => { if (topic === ackTopic) done('ack'); };
        const timer = setTimeout(() => done('timeout'), 15000);
        mqttClient.on('message', onMsg);
        mqttClient.subscribe(ackTopic);
        mqttClient.publish(`devices/${espUid}/cmd/reset_mqtt`, 'now', { qos: 1 });
      });
    }

    // Suppression en DB (credentials MQTT révoqués côté Mosquitto dès cet instant)
    await q('DELETE FROM esp_devices WHERE id=$1 AND user_id=$2', [req.params.id, req.user.sub]);
    await q('DELETE FROM mqtt_raw_logs WHERE esp_uid=$1', [espUid]);
    await auditInsert('device.deleted', { esp_uid: espUid, name: espName });

    res.json({ ok: true });
  } catch (e) { next(e); }
});

// =============================================
// ESP META — champs disponibles + modèles de règles
// =============================================

/**
 * GET /esp-devices/:id/meta
 * Retourne pour un ESP de l'utilisateur :
 *   - device_type (nom, description)
 *   - available_fields (depuis les trames inbound du type)
 *   - operators disponibles par data_type
 *   - rule_templates (modèles de règles configurés par l'admin)
 *
 * Utilisé par les apps iOS/Android pour construire l'UI de création de règle.
 */
app.get('/esp-devices/:id/meta', requireAuth, async (req, res, next) => {
  try {
    // Vérifier que l'ESP appartient à l'utilisateur
    const { rows: espRows } = await q(
      'SELECT id, esp_uid, name, device_type_id FROM esp_devices WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.sub]
    );
    if (!espRows.length) return res.status(404).json({ error: 'esp_not_found' });
    const esp = espRows[0];

    if (!esp.device_type_id) {
      // Pas de type configuré : retourner uniquement le champ legacy
      return res.json({
        esp_id:           esp.id,
        esp_name:         esp.name || esp.esp_uid,
        device_type:      null,
        available_fields: [
          { name: 'soundPct', label: 'Niveau sonore', data_type: 'number', unit: '%', min_value: 0, max_value: 100, operators: ['>', '>=', '<', '<=', '==', '!='] },
        ],
        rule_templates:   [],
        operators_by_type: _operatorsByType(),
      });
    }

    // Champs disponibles depuis les trames inbound — dédupliqués par nom de champ
    const { rows: fieldRows } = await q(
      `SELECT DISTINCT ON (ff.name) ff.name, ff.label, ff.data_type, ff.unit, ff.min_value, ff.max_value, ff.sort_order
         FROM mqtt_frame_fields ff
         JOIN mqtt_frame_definitions fd ON fd.id = ff.frame_id
        WHERE fd.device_type_id = $1 AND fd.direction = 'inbound'
        ORDER BY ff.name, fd.topic_suffix, ff.sort_order`,
      [esp.device_type_id]
    );

    // Ajouter les opérateurs selon le type de données
    const available_fields = fieldRows.map(f => ({
      ...f,
      operators: _operatorsFor(f.data_type),
    }));

    // Modèles de règles pour ce type — dédupliqués par template (un seul par id)
    // si plusieurs trames ont le même champ, on prend la première frame (ORDER BY fd.topic_suffix)
    const { rows: rawTemplates } = await q(
      `SELECT * FROM (
         SELECT DISTINCT ON (t.id)
                t.id, t.name, t.description, t.field, t.cooldown_min_sec, t.sort_order,
                ff.label AS field_label, ff.data_type AS field_data_type,
                ff.unit AS field_unit, ff.min_value AS field_min, ff.max_value AS field_max,
                fd.name AS frame_name
           FROM alert_rule_templates t
           LEFT JOIN mqtt_frame_fields ff ON ff.name = t.field
             AND ff.frame_id IN (
               SELECT id FROM mqtt_frame_definitions
                WHERE device_type_id = $1 AND direction = 'inbound'
             )
           LEFT JOIN mqtt_frame_definitions fd ON fd.id = ff.frame_id
          WHERE t.device_type_id = $1
          ORDER BY t.id, fd.topic_suffix
       ) sub
       ORDER BY sort_order, name`,
      [esp.device_type_id]
    );

    const rule_templates = rawTemplates.map(t => ({
      id:               t.id,
      name:             t.name,
      description:      t.description,
      field:            t.field,
      field_label:      t.field_label || t.field,
      field_data_type:  t.field_data_type || 'number',
      field_unit:       t.field_unit || null,
      field_min:        t.field_min ?? null,
      field_max:        t.field_max ?? null,
      field_operators:  _operatorsFor(t.field_data_type || 'number'),
      cooldown_min_sec: t.cooldown_min_sec,
      frame_name:       t.frame_name || null,
    }));

    // Infos du type de device
    const { rows: typeRows } = await q(
      'SELECT id, name, description FROM device_types WHERE id=$1',
      [esp.device_type_id]
    );

    res.json({
      esp_id:            esp.id,
      esp_name:          esp.name || esp.esp_uid,
      device_type:       typeRows[0] || null,
      available_fields,
      rule_templates,
      operators_by_type: _operatorsByType(),
    });
  } catch (e) { next(e); }
});

function _operatorsFor(dataType) {
  switch (dataType) {
    case 'number':  return ['>', '>=', '<', '<=', '==', '!='];
    case 'boolean': return ['==', '!='];
    case 'string':  return ['==', '!=', 'contains', 'notcontains'];
    default:        return ['==', '!='];
  }
}

function _operatorsByType() {
  return {
    number:  ['>', '>=', '<', '<=', '==', '!='],
    boolean: ['==', '!='],
    string:  ['==', '!=', 'contains', 'notcontains'],
  };
}

// =============================================
// RULES & ALERTS
// =============================================

app.post('/esp-rules', requireAuth, async (req, res, next) => {
  try {
    const { esp_id, field, op, threshold_num, threshold_str, cooldown_sec = 60, enabled = true, user_label, template_id } = req.body || {};
    if (!esp_id || !field || !op) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    if (threshold_num == null && !threshold_str) {
      return res.status(400).json({ error: 'threshold_required' });
    }
    const { rows: check } = await q(
      'SELECT id FROM esp_devices WHERE id=$1 AND user_id=$2',
      [esp_id, req.user.sub]
    );
    if (!check.length) return res.status(404).json({ error: 'esp_not_found' });
    const { rows } = await q(
      `INSERT INTO alert_rules(esp_id, field, op, threshold_num, threshold_str, enabled, cooldown_sec, user_label, template_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [esp_id, field, op, threshold_num ?? null, threshold_str ?? null, enabled, cooldown_sec, user_label ?? null, template_id ?? null]
    );
    const created = rows[0];
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, 'RULE_CREATE', 'alert_rule', $3, $4, $5, $6)`,
      [req.user.sub, req.user.email, String(created.id), getRealIp(req), req.headers['user-agent'] || null,
       JSON.stringify({ esp_id, field, op, threshold_num: threshold_num ?? null, threshold_str: threshold_str ?? null, cooldown_sec, user_label: user_label ?? null })]
    ).catch(err => console.error('[AUDIT] rule_create error:', err.message));
    res.json(created);
  } catch (e) { next(e); }
});

app.get('/esp-rules', requireAuth, async (req, res, next) => {
  try {
    const { esp_id } = req.query;
    const sql = esp_id
      ? `SELECT ar.*, t.name AS template_name, t.cooldown_min_sec
           FROM alert_rules ar
           JOIN esp_devices d ON d.id=ar.esp_id
           LEFT JOIN alert_rule_templates t ON t.id=ar.template_id
          WHERE d.user_id=$1 AND ar.esp_id=$2
          ORDER BY ar.field`
      : `SELECT ar.*, t.name AS template_name, t.cooldown_min_sec
           FROM alert_rules ar
           JOIN esp_devices d ON d.id=ar.esp_id
           LEFT JOIN alert_rule_templates t ON t.id=ar.template_id
          WHERE d.user_id=$1
          ORDER BY ar.esp_id, ar.field`;
    const params = esp_id ? [req.user.sub, esp_id] : [req.user.sub];
    const { rows } = await q(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

app.patch('/esp-rules/:ruleId', requireAuth, async (req, res, next) => {
  try {
    const { enabled, threshold_num, threshold_str, field, op, cooldown_sec, user_label, template_id } = req.body || {};
    const sets = [];
    const params = [];
    let i = 1;
    if (enabled      !== undefined) { sets.push(`enabled=$${i++}`);       params.push(Boolean(enabled)); }
    if (threshold_num !== undefined){ sets.push(`threshold_num=$${i++}`); params.push(threshold_num ?? null); }
    if (threshold_str !== undefined){ sets.push(`threshold_str=$${i++}`); params.push(threshold_str ?? null); }
    if (field        !== undefined) { sets.push(`field=$${i++}`);         params.push(field); }
    if (op           !== undefined) { sets.push(`op=$${i++}`);            params.push(op); }
    if (cooldown_sec !== undefined) { sets.push(`cooldown_sec=$${i++}`);  params.push(Number(cooldown_sec)); }
    if (user_label   !== undefined) { sets.push(`user_label=$${i++}`);    params.push(user_label ?? null); }
    if (template_id  !== undefined) { sets.push(`template_id=$${i++}`);   params.push(template_id ?? null); }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
    params.push(req.params.ruleId, req.user.sub);
    const { rows: updated } = await q(
      `UPDATE alert_rules AS ar
          SET ${sets.join(', ')}
         FROM esp_devices d
        WHERE ar.id=$${i} AND d.id=ar.esp_id AND d.user_id=$${i + 1}
      RETURNING ar.*`,
      params
    );
    if (!updated.length) return res.json({});
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, 'RULE_UPDATE', 'alert_rule', $3, $4, $5, $6)`,
      [req.user.sub, req.user.email, req.params.ruleId, getRealIp(req), req.headers['user-agent'] || null,
       JSON.stringify(req.body)]
    ).catch(err => console.error('[AUDIT] rule_update error:', err.message));
    res.json(updated[0]);
  } catch (e) { next(e); }
});

app.delete('/esp-rules/:ruleId', requireAuth, async (req, res, next) => {
  try {
    // Récupérer la règle avant suppression pour l'audit
    const { rows: before } = await q(
      'SELECT ar.* FROM alert_rules ar JOIN esp_devices d ON d.id=ar.esp_id WHERE ar.id=$1 AND d.user_id=$2',
      [req.params.ruleId, req.user.sub]
    );
    const { rowCount } = await q(
      'DELETE FROM alert_rules AS ar USING esp_devices d WHERE ar.id=$1 AND d.id=ar.esp_id AND d.user_id=$2',
      [req.params.ruleId, req.user.sub]
    );
    if (rowCount > 0 && before.length) {
      q(
        `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
         VALUES ($1, $2, 'RULE_DELETE', 'alert_rule', $3, $4, $5, $6)`,
        [req.user.sub, req.user.email, req.params.ruleId, getRealIp(req), req.headers['user-agent'] || null,
         JSON.stringify({ deleted_rule: before[0] })]
      ).catch(err => console.error('[AUDIT] rule_delete error:', err.message));
    }
    res.json({ ok: rowCount > 0 });
  } catch (e) { next(e); }
});

app.get('/esp-alerts', requireAuth, async (req, res, next) => {
  try {
    const { esp_id, device_id, rule_id, since, limit = '100', offset = '0' } = req.query;
    const where = ['d.user_id = $1'];
    const params = [req.user.sub];
    let i = 2;
    if (esp_id)    { where.push(`al.esp_id = $${i++}`);    params.push(esp_id); }
    if (device_id) { where.push(`al.device_id = $${i++}`); params.push(device_id); }
    if (rule_id)   { where.push(`al.rule_id = $${i++}`);   params.push(rule_id); }
    if (since)     { where.push(`al.sent_at >= $${i++}`);  params.push(new Date(since)); }
    const lim = Math.min(Number.parseInt(limit, 10) || 100, 500);
    const off = Number.parseInt(offset, 10) || 0;
    const sql = `
      SELECT al.id::text, al.rule_id, al.esp_id, al.device_id,
             al.sent_at, al.channel, al.status, al.payload, al.error
        FROM alert_log al
        JOIN esp_devices d ON d.id = al.esp_id
       WHERE ${where.join(' AND ')}
       ORDER BY al.sent_at DESC
       LIMIT $${i++} OFFSET $${i++}
    `;
    params.push(lim, off);
    const { rows } = await q(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// =============================================
// COMPTE
// =============================================

// Étape 1 : demande de suppression → envoie email avec code 8 car + lien (15 min)
// deletionLimiter : 5 req/h par IP — très strict pour éviter spam d'emails
app.post('/auth/request-account-deletion', deletionLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    const out = await requestAccountDeletion(email);
    res.json(out);
  } catch (e) {
    const status = e?.status || 500;
    res.status(status).json({ error: e?.message || 'request_failed' });
  }
});

// Étape 2 : confirmation par code → supprime le compte
// deletionLimiter : 5 req/h par IP — protège contre le brute-force sur le code 8 char
app.post('/auth/confirm-account-deletion', deletionLimiter, async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const out = await confirmAccountDeletion(email, code);
    res.json(out);
  } catch (e) {
    const status = e?.status || 500;
    res.status(status).json({ error: e?.message || 'confirmation_failed' });
  }
});

app.delete('/me', requireAuth, async (req, res) => {
  try {
    const { confirm } = req.body || {};
    if (confirm !== 'DELETE') return res.status(400).json({ error: 'confirmation_required' });
    const out = await deleteMyAccount(req.user.sub);
    res.json(out);
  } catch (e) {
    const status = e?.status || 500;
    res.status(status).json({ error: e?.message || 'account_delete_failed' });
  }
});

// =============================================
// CMS PUBLIC
// =============================================

app.use('/public', cmsPublicRouter);
app.use('/public', publicProductsRouter);
app.use('/public', publicOrdersRouter);
app.use('/public', publicCountriesRouter);

// GET /public/stripe/config — publishable key Stripe (clé publique, non secrète)
app.get('/public/stripe/config', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT key, value FROM app_config WHERE key IN (
        'stripe_mode','stripe_test_publishable_key','stripe_live_publishable_key'
      )`
    );
    const db = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const mode = db.stripe_mode || 'test';
    const pk = db[`stripe_${mode}_publishable_key`] || null;
    res.json({ publishable_key: pk, mode });
  } catch {
    res.json({ publishable_key: null, mode: 'test' });
  }
});

/**
 * POST /public/contact
 * Formulaire de contact public — envoi d'un email à support_email via SMTP.
 * Rate limité par IP (contact_max / contact_window_ms).
 */
app.post('/public/contact', contactLimiter, async (req, res) => {
  const { firstName = '', lastName = '', phone = '', email = '', message = '' } = req.body || {};

  if (!email.trim() || !message.trim()) {
    return res.status(400).json({ error: 'email_message_required' });
  }

  const transporter = await createTransporter();
  if (!transporter) {
    // SMTP non configuré — on accepte quand même pour ne pas bloquer l'utilisateur
    console.warn('[CONTACT] SMTP non configuré — message ignoré');
    return res.json({ ok: true });
  }

  try {
    const { rows } = await q("SELECT value FROM app_config WHERE key='support_email' LIMIT 1");
    const to = rows[0]?.value || 'support@xamiot.com';

    const fullName = [firstName, lastName].filter(Boolean).join(' ') || email;
    const htmlBody = `
      <p><strong>Prénom :</strong> ${firstName}</p>
      <p><strong>Nom :</strong> ${lastName}</p>
      <p><strong>Téléphone :</strong> ${phone || '—'}</p>
      <p><strong>Email :</strong> ${email}</p>
      <hr>
      <p><strong>Message :</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
    `;

    await transporter.sendMail({
      from:    buildFrom(),
      to,
      replyTo: email,
      subject: `[Contact] ${fullName}`,
      text:    `Prénom: ${firstName}\nNom: ${lastName}\nTéléphone: ${phone}\nEmail: ${email}\n\n${message}`,
      html:    htmlBody,
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('[CONTACT] sendMail error:', e.message);
    res.status(500).json({ error: 'send_failed' });
  }
});

// =============================================
// ADMIN
// =============================================

app.use('/admin', adminLimiter);
app.use('/admin', auditMiddleware);
app.use('/admin', adminRouter);
app.use('/admin', auditRouter);
app.use('/admin', adminProductsRouter);
app.use('/admin', adminTicketsRouter);
app.use('/admin', adminOrdersRouter);
app.use('/admin', adminCountriesRouter);

// =============================================
// APP MOBILE (iOS / Android)
// =============================================

app.use(['/devices', '/esp-devices', '/esp-rules', '/esp-alerts', '/sound-history', '/me'], appLimiter);

// =============================================
// PORTAL / AUTHENTICATED USER
// =============================================

app.use(addressesRouter);
app.use('/portal', portalTicketsRouter);
app.use('/portal', portalOrdersRouter);

// =============================================
// PURGE RÉTENTION (job horaire)
// =============================================

async function runRetentionPurge() {
  try {
    const { rows } = await q('SELECT log_type, retain_days, retain_count FROM retention_config');
    for (const { log_type, retain_days, retain_count } of rows) {
      // Purge par durée
      if (log_type === 'mqtt_raw') {
        const { rowCount } = await q(
          `DELETE FROM mqtt_raw_logs WHERE received_at < now() - ($1 || ' days')::interval`,
          [retain_days]
        );
        if (rowCount) console.log(`[PURGE] mqtt_raw_logs : ${rowCount} supprimé(s) (${retain_days}j)`);

        // Purge par quantité par device
        if (retain_count) {
          const { rowCount: rc2 } = await q(
            `DELETE FROM mqtt_raw_logs
              WHERE id IN (
                SELECT id FROM (
                  SELECT id, row_number() OVER (PARTITION BY esp_uid ORDER BY received_at DESC) AS rn
                  FROM mqtt_raw_logs
                ) t WHERE t.rn > $1
              )`,
            [retain_count]
          ).catch(() => ({ rowCount: 0 }));
          if (rc2) console.log(`[PURGE] mqtt_raw_logs : ${rc2} supprimé(s) (max ${retain_count}/device)`);
        }
      } else if (log_type === 'alert_log') {
        const { rowCount } = await q(
          `DELETE FROM alert_log WHERE created_at < now() - ($1 || ' days')::interval`,
          [retain_days]
        ).catch(() => ({ rowCount: 0 }));
        if (rowCount) console.log(`[PURGE] alert_log : ${rowCount} supprimé(s) (${retain_days}j)`);

        // Purge par quantité par device
        if (retain_count) {
          const { rowCount: rc2 } = await q(
            `DELETE FROM alert_log
              WHERE id IN (
                SELECT id FROM (
                  SELECT id, row_number() OVER (PARTITION BY esp_id ORDER BY created_at DESC) AS rn
                  FROM alert_log
                ) t WHERE t.rn > $1
              )`,
            [retain_count]
          ).catch(() => ({ rowCount: 0 }));
          if (rc2) console.log(`[PURGE] alert_log : ${rc2} supprimé(s) (max ${retain_count}/device)`);
        }
      }
    }
  } catch (e) {
    console.warn('[PURGE] erreur rétention:', e?.message || e);
  }
}

function startRetentionPurge() {
  runRetentionPurge(); // immédiat au démarrage
  setInterval(runRetentionPurge, 60 * 60 * 1000); // toutes les heures
}

function startNotifWorkers() {
  // Sys 3 — vérification hors-ligne toutes les minutes
  setInterval(() => { checkOfflineDevices().catch(() => {}); }, 60 * 1000);
  // Sys 4 — notifications planifiées toutes les minutes
  setInterval(() => { runScheduledNotifs().catch(() => {}); }, 60 * 1000);
  console.log('[APP] Workers notifications (offline + scheduled) démarrés');
}

// =============================================
// HANDLERS
// =============================================

app.use((req, res) => {
  console.warn(`[404] ${req.method} ${req.url}`);
  res.status(404).json({ error: 'not_found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'internal_error', message: String(err?.message || err) });
});

// =============================================
// START
// =============================================

app.listen(config.port, async () => {
  console.log(`API v2 on :${config.port} [${process.env.NODE_ENV || 'development'}]`);
  await reloadRateLimitConfig();
  await reloadApnsConfig();
  await reloadFcmConfig();
  await reloadSmtpConfig();
  startWorker();
  startRetentionPurge();
  startNotifWorkers();
});

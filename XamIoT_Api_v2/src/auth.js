// src/auth.js
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import crypto from 'crypto';
import { q } from './db.js';
import { createTransporter, buildFrom, isSmtpReady } from './smtp.js';
import { config } from './config.js';
import { dispatch } from './notifDispatcher.js';
export { renderActivationPage } from './activation-template.js';

// === Config / Env ===
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ACTIVATION_EXPIRES = process.env.ACTIVATION_EXPIRES || '2d';
const RESET_EXPIRES = process.env.RESET_EXPIRES || '15m'; // ex: "15m", "2h", "1d"

// URLs dynamiques — lues depuis config.js (DEV ou PROD selon NODE_ENV).
// Ne jamais hardcoder d'URL ici : utiliser config.urls.*
const ACTIVATION_LINK_BASE = config.urls.activationLinkBase;
const RESET_LINK_BASE      = `${config.urls.resetPassword}?token=`;

function msFromHuman(h) {
  const m = /^(\d+)([smhd])$/i.exec(h || '');
  if (!m) return 2 * 60 * 60 * 1000;
  const n = Number(m[1]);
  return { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2].toLowerCase()] * n;
}

function activationToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, typ: 'activation' },
    JWT_SECRET,
    { expiresIn: ACTIVATION_EXPIRES }
  );
}

/** Envoie l'email d'activation. Ne jette jamais — retourne true/false. */
async function sendActivationEmail(to, url) {
  if (!isSmtpReady()) {
    console.log(`[ACTIVATION] SMTP non configuré. Lien: ${url}`);
    return false;
  }
  const transporter = await createTransporter();
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: buildFrom(),
      to,
      subject: 'Activez votre compte XamIoT',
      text: `Bonjour,\n\nMerci d'avoir créé un compte sur XamIoT ! Pour finaliser votre inscription, cliquez : ${url}\n\nIgnorer si non sollicité.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #2c3e50;">Bienvenue sur XamIoT !</h2>
          <p>Pour activer votre compte, cliquez sur le bouton ci-dessous :</p>
          <p style="text-align: center; margin: 20px 0;">
            <a href="${url}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Valider votre compte</a>
          </p>
          <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
        </div>
      `,
    });
    return true;
  } catch (e) {
    console.error('[ACTIVATION] Échec SMTP:', e?.code || e?.name || e, e?.response || '');
    return false;
  }
}

/** Envoie l'email de réinitialisation de mot de passe. Ne jette jamais — retourne true/false. */
async function sendResetEmail(to, url, expiresHuman = RESET_EXPIRES) {
  if (!isSmtpReady()) {
    console.log(`[RESET] SMTP non configuré. Lien: ${url}`);
    return false;
  }
  const transporter = await createTransporter();
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: buildFrom(),
      to,
      subject: 'Réinitialisation de votre mot de passe XamIoT',
      text: `Bonjour,\n\nPour réinitialiser votre mot de passe, cliquez : ${url}\n\nCe lien expire dans ${expiresHuman}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color:#2c3e50;">Réinitialiser votre mot de passe</h2>
          <p>Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe :</p>
          <p style="text-align:center;margin:20px 0;">
            <a href="${url}" style="background-color:#2ecc71;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Réinitialiser</a>
          </p>
          <p>Ce lien expirera dans ${expiresHuman}.</p>
          <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
        </div>
      `,
    });
    return true;
  } catch (e) {
    console.error('[RESET] Échec SMTP:', e?.code || e?.name || e, e?.response || '');
    return false;
  }
}

// === SIMULATEUR ===
// Crée un device simulé pour un utilisateur juste après son inscription.
// Idempotent : ne crée rien si un device simulé existe déjà pour ce user.
// Non-bloquant : les erreurs n'impactent pas le signup.
async function createSimulatedDevice(userId) {
  // Idempotence — un seul device simulé par compte
  const { rows: existing } = await q(
    'SELECT id FROM esp_devices WHERE user_id=$1 AND is_simulated=true LIMIT 1',
    [userId]
  );
  if (existing.length > 0) {
    console.log(`[SIMULATOR] Device simulé déjà présent pour user=${userId}, skip.`);
    return existing[0];
  }

  // Récupération du type SoundSense — NULL si absent (non bloquant)
  const { rows: typeRows } = await q(
    `SELECT id FROM device_types WHERE name='SoundSense' LIMIT 1`
  );
  const soundSenseTypeId = typeRows[0]?.id ?? null;

  // Génération d'un esp_uid unique avec retry (collision quasi-impossible à cette échelle)
  let esp_uid, inserted;
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase(); // ex: A3F8C2
    esp_uid = `sim${suffix}`;
    const topic_prefix = `xamiot/${esp_uid}`;
    const name = `Capteur démo`;
    try {
      const { rows } = await q(
        `INSERT INTO esp_devices(user_id, esp_uid, name, topic_prefix, mqtt_password_hash, mqtt_enabled, is_simulated, device_type_id)
         VALUES($1, $2, $3, $4, NULL, false, true, $5)
         RETURNING id, esp_uid, name`,
        [userId, esp_uid, name, topic_prefix, soundSenseTypeId]
      );
      inserted = rows[0];
      break;
    } catch (e) {
      if (e.code === '23505') continue; // collision esp_uid unique → retry
      throw e;
    }
  }
  if (!inserted) throw new Error('simulator_uid_collision_max_retries');

  // Règle d'alerte par défaut — désactivée (évite des notifs push sur données simulées)
  await q(
    `INSERT INTO alert_rules(esp_id, field, op, threshold_num, enabled, cooldown_sec, user_label)
     VALUES($1, 'soundPct', '>', 80, false, 300, 'Alerte sonore démo')`,
    [inserted.id]
  );

  console.log(`[SIMULATOR] Device créé: ${inserted.esp_uid} pour user=${userId}`);
  return inserted;
}

// === API ===
export async function signup(email, password, firstName, lastName, phone) {
  const emailNorm = (email || '').trim().toLowerCase();
  const pass_hash = await argon2.hash(password);

  const { rows } = await q(
    `INSERT INTO users(email, pass_hash, first_name, last_name, phone, is_active)
     VALUES($1,$2,$3,$4,$5,false)
     RETURNING id,email`,
    [emailNorm, pass_hash, firstName, lastName, phone]
  );
  const user = rows[0];

  const token = activationToken(user);

  const url = ACTIVATION_LINK_BASE.includes('?')
    ? `${ACTIVATION_LINK_BASE}&token=${encodeURIComponent(token)}`
    : `${ACTIVATION_LINK_BASE}/${encodeURIComponent(token)}`;

  // Envoi via le système de templates auto (Système 2)
  dispatch('account_created', user.id, {
    first_name: firstName || '', last_name: lastName || '',
    email: user.email, activation_url: url,
  }, { resourceType: 'user', resourceId: user.id }).catch(() => {});

  // Création non-bloquante du device simulé — une erreur ici n'empêche pas l'inscription
  createSimulatedDevice(user.id).catch(e =>
    console.error('[SIMULATOR] Échec création device simulé (non bloquant):', e?.message || e)
  );

  const isProd = (process.env.NODE_ENV || 'development') === 'production';
  return {
    ok: true,
    user_id: user.id,
    email_sent: true,
    activation_url: !isProd ? url : undefined,
  };
}

export async function activate(token) {
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    const msg = e?.name === 'TokenExpiredError' ? 'activation_token_expired' : 'activation_token_invalid';
    const err = new Error(msg);
    err.status = 400;
    throw err;
  }
  if (payload.typ !== 'activation') {
    const err = new Error('activation_token_invalid');
    err.status = 400;
    throw err;
  }

  const { sub: userId, email } = payload;
  const { rowCount } = await q(
    `UPDATE users SET is_active=true, activated_at=now()
     WHERE id=$1 AND email=$2 AND is_active=false`,
    [userId, email]
  );
  if (!rowCount) {
    const err = new Error('already_active_or_not_found');
    err.status = 400;
    throw err;
  }

  // Notification système — compte activé
  const { rows: uRows } = await q('SELECT first_name, last_name FROM users WHERE id=$1', [userId]).catch(() => ({ rows: [] }));
  const u = uRows[0] || {};
  dispatch('account_activated', userId, {
    first_name: u.first_name || '', email,
    login_url: config.urls.activationLinkBase.replace('/activate', '/login').replace('/compte/activer', '/compte'),
  }, { resourceType: 'user', resourceId: userId }).catch(() => {});

  return { ok: true, user_id: userId, email };
}

export async function resendActivation(email) {
  const emailNorm = (email || '').trim().toLowerCase();
  const { rows } = await q('SELECT id,email,is_active,first_name,last_name FROM users WHERE email=$1', [emailNorm]);
  if (!rows.length) {
    const err = new Error('user_not_found');
    err.status = 404;
    throw err;
  }
  const u = rows[0];
  if (u.is_active) {
    const err = new Error('already_active');
    err.status = 400;
    throw err;
  }

  const token = activationToken(u);
  const url = ACTIVATION_LINK_BASE.includes('?')
    ? `${ACTIVATION_LINK_BASE}&token=${encodeURIComponent(token)}`
    : `${ACTIVATION_LINK_BASE}/${encodeURIComponent(token)}`;

  // Renvoi via le système de templates auto (même template que l'inscription)
  dispatch('account_created', u.id, {
    first_name: u.first_name || '', last_name: u.last_name || '',
    email: u.email, activation_url: url,
  }, { resourceType: 'user', resourceId: u.id }).catch(() => {});
  return { ok: true };
}

export async function login(email, password) {
  const emailNorm = (email || '').trim().toLowerCase();
  const { rows } = await q('SELECT * FROM users WHERE email=$1', [emailNorm]);
  if (!rows.length) throw new Error('invalid_credentials');

  const u = rows[0];
  const ok = await argon2.verify(u.pass_hash, password);
  if (!ok) throw new Error('invalid_credentials');

  if (!u.is_active) {
    const err = new Error('account_inactive');
    err.status = 403;
    throw err;
  }
  return issue(u);
}

function issue(u) {
  const payload = { sub: u.id, email: u.email };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
  return { token, user: { id: u.id, email: u.email } };
}

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer (.+)$/i);
  // Accepte aussi ?token= pour les téléchargements directs (lien navigateur sans header)
  const rawToken = m ? m[1] : (req.query.token || null);
  if (!rawToken) return res.status(401).json({ error: 'missing_token' });
  try {
    req.user = jwt.verify(rawToken, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

/* ==========================
 *  RESET MOT DE PASSE
 * ========================== */

/**
 * Demande de reset : génère un token opaque (stocké HACHÉ en DB), envoie un mail.
 * Réponse toujours neutre { ok:true } pour éviter l'énumération d'emails.
 */
export async function requestPasswordReset(email) {
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm) throw Object.assign(new Error('email_required'), { status: 400 });

  const { rows } = await q('SELECT id,email,first_name FROM users WHERE email=$1 LIMIT 1', [emailNorm]);
  if (!rows.length) {
    // Réponse neutre
    return { ok: true };
  }

  const user = rows[0];
  const token = crypto.randomBytes(32).toString('hex');
  const token_hash = await argon2.hash(token);
  const expires_at = new Date(Date.now() + msFromHuman(RESET_EXPIRES));

  // Invalider les anciens non utilisés (optionnel)
  await q('UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [user.id]);

  await q(
    'INSERT INTO password_resets(id, user_id, token_hash, expires_at) VALUES(gen_random_uuid(), $1, $2, $3)',
    [user.id, token_hash, expires_at]
  );

  const url = `${RESET_LINK_BASE}${encodeURIComponent(token)}`;

  // Envoi via le système de templates auto (Système 2)
  dispatch('password_reset', user.id, {
    first_name: user.first_name || '', email: user.email,
    reset_url: url, expires_in: RESET_EXPIRES,
  }, { resourceType: 'user', resourceId: user.id }).catch(() => {});

  return { ok: true };
}

/**
 * Consomme un token et fixe le nouveau mot de passe.
 * Implémentation: on parcourt un petit lot des tokens non utilisés et non expirés, et on vérifie le hash.
 */
export async function resetPasswordWithToken(token, newPassword) {
  if (!token || !newPassword) throw Object.assign(new Error('missing_fields'), { status: 400 });

  const { rows } = await q(
    `SELECT id, user_id, token_hash, expires_at, used_at
       FROM password_resets
      WHERE used_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 200`
  );

  let match = null;
  for (const r of rows) {
    const ok = await argon2.verify(r.token_hash, token).catch(() => false);
    if (ok) { match = r; break; }
  }
  if (!match) throw Object.assign(new Error('invalid_or_expired_token'), { status: 400 });

  const pass_hash = await argon2.hash(newPassword);
  await q('UPDATE users SET pass_hash=$1 WHERE id=$2', [pass_hash, match.user_id]);
  await q('UPDATE password_resets SET used_at=now() WHERE id=$1', [match.id]);

  // Notification système — mot de passe modifié
  const { rows: pRows } = await q('SELECT email, first_name FROM users WHERE id=$1', [match.user_id]).catch(() => ({ rows: [] }));
  if (pRows[0]) {
    dispatch('password_changed', match.user_id, {
      first_name: pRows[0].first_name || '', email: pRows[0].email,
    }, { resourceType: 'user', resourceId: match.user_id }).catch(() => {});
  }

  return { ok: true };
}

/* ==========================
 *  SUPPRESSION DEFINITIVE
 * ========================== */

const DELETE_CODE_EXPIRES = '15m';
const DELETE_LINK_BASE = (portalUrl) => `${portalUrl}/supprimer-compte/confirmer`;

function generateDeletionCode() {
  // 8 caractères alphanumériques majuscules sans ambiguïtés (0/O, I/1/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

async function sendDeletionEmail(to, code, linkUrl) {
  if (!isSmtpReady()) {
    console.log(`[DELETE_ACCOUNT] SMTP non configuré. Code: ${code} | Lien: ${linkUrl}`);
    return false;
  }
  const transporter = await createTransporter();
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: buildFrom(),
      to,
      subject: 'Confirmation de suppression de votre compte XamIoT',
      text: `Bonjour,\n\nVous avez demandé la suppression définitive de votre compte XamIoT.\n\nVotre code de vérification : ${code}\n\nOu cliquez directement sur ce lien : ${linkUrl}\n\nCe code et ce lien expirent dans 15 minutes.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail — votre compte ne sera pas supprimé.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color:#c0392b;">Suppression de votre compte XamIoT</h2>
          <p>Vous avez demandé la suppression définitive de votre compte et de toutes vos données.</p>
          <p><strong>Votre code de vérification :</strong></p>
          <p style="text-align:center;margin:20px 0;">
            <span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#c0392b;font-family:monospace;">${code}</span>
          </p>
          <p style="text-align:center;margin:20px 0;">
            <a href="${linkUrl}" style="background-color:#c0392b;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Confirmer la suppression</a>
          </p>
          <p style="color:#666;font-size:13px;">Ce code et ce lien expirent dans <strong>15 minutes</strong>.</p>
          <p style="color:#666;font-size:13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail — votre compte ne sera pas supprimé.</p>
        </div>
      `,
    });
    return true;
  } catch (e) {
    console.error('[DELETE_ACCOUNT] Échec SMTP:', e?.code || e?.name || e, e?.response || '');
    return false;
  }
}

/**
 * Étape 1 : génère un code 8 caractères, l'enregistre haché en DB, envoie l'email.
 * Réponse toujours neutre { ok: true } pour éviter l'énumération d'emails.
 */
export async function requestAccountDeletion(email) {
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm) throw Object.assign(new Error('email_required'), { status: 400 });

  const { rows } = await q('SELECT id, email FROM users WHERE email=$1 LIMIT 1', [emailNorm]);
  if (!rows.length) return { ok: true }; // réponse neutre

  const user = rows[0];
  const code = generateDeletionCode();
  const code_hash = await argon2.hash(code);
  const expires_at = new Date(Date.now() + msFromHuman(DELETE_CODE_EXPIRES));

  // Invalider les anciens codes non utilisés
  await q('UPDATE account_deletion_codes SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [user.id]);

  await q(
    'INSERT INTO account_deletion_codes(user_id, code_hash, expires_at) VALUES($1, $2, $3)',
    [user.id, code_hash, expires_at]
  );

  const portalUrl = config.urls.publicPortal;
  const linkUrl = `${DELETE_LINK_BASE(portalUrl)}?email=${encodeURIComponent(user.email)}&code=${encodeURIComponent(code)}`;

  await sendDeletionEmail(user.email, code, linkUrl);

  return { ok: true };
}

/**
 * Étape 2 : vérifie email + code, supprime le compte.
 */
export async function confirmAccountDeletion(email, code) {
  if (!email || !code) throw Object.assign(new Error('missing_fields'), { status: 400 });

  const emailNorm = email.trim().toLowerCase();
  const { rows: users } = await q('SELECT id, email FROM users WHERE email=$1 LIMIT 1', [emailNorm]);
  if (!users.length) throw Object.assign(new Error('invalid_code'), { status: 400 });

  const userId = users[0].id;
  const userEmail = users[0].email;

  const { rows } = await q(
    `SELECT id, code_hash FROM account_deletion_codes
     WHERE user_id=$1 AND used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 5`,
    [userId]
  );

  for (const row of rows) {
    const valid = await argon2.verify(row.code_hash, code);
    if (valid) {
      await q('UPDATE account_deletion_codes SET used_at=now() WHERE id=$1', [row.id]);
      const { rowCount } = await q('DELETE FROM users WHERE id=$1', [userId]);
      return { ok: rowCount > 0, user_id: userId, deleted_email: userEmail };
    }
  }

  throw Object.assign(new Error('invalid_code'), { status: 400 });
}

/**
 * Supprime l'utilisateur directement (utilisé depuis les apps mobiles avec token auth).
 * Les FK ON DELETE CASCADE + le trigger de purge alert_log
 * s'occupent du reste (esp_devices, alert_rules, mobile_devices, user_badge, password_resets, alert_log via trigger).
 */
export async function deleteMyAccount(userId) {
  const { rows: users } = await q('SELECT email FROM users WHERE id=$1', [userId]);
  const deletedEmail = users[0]?.email || null;
  const { rowCount } = await q('DELETE FROM users WHERE id=$1', [userId]);
  return { ok: rowCount > 0, deleted_email: deletedEmail };
}

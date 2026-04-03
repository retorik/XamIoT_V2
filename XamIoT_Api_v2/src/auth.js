// src/auth.js
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import crypto from 'crypto';
import { q } from './db.js';
import { createTransporter, buildFrom, isSmtpReady } from './smtp.js';
import { config } from './config.js';
export { renderActivationPage } from './activation-template.js';

// === Config / Env ===
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ACTIVATION_EXPIRES = process.env.ACTIVATION_EXPIRES || '2d';
const RESET_EXPIRES = process.env.RESET_EXPIRES || '2h'; // ex: "15m", "2h", "1d"

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

  const sent = await sendActivationEmail(user.email, url);

  const isProd = (process.env.NODE_ENV || 'development') === 'production';
  return {
    ok: true,
    email_sent: sent,
    activation_url: (!isProd || !sent) ? url : undefined,
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
  return { ok: true };
}

export async function resendActivation(email) {
  const emailNorm = (email || '').trim().toLowerCase();
  const { rows } = await q('SELECT id,email,is_active FROM users WHERE email=$1', [emailNorm]);
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

  await sendActivationEmail(u.email, url);
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

  const { rows } = await q('SELECT id,email FROM users WHERE email=$1 LIMIT 1', [emailNorm]);
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
  await sendResetEmail(user.email, url, RESET_EXPIRES);

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

  return { ok: true };
}

/* ==========================
 *  SUPPRESSION DEFINITIVE
 * ========================== */

/**
 * Supprime l'utilisateur. Les FK ON DELETE CASCADE + le trigger de purge alert_log
 * s'occupent du reste (esp_devices, alert_rules, mobile_devices, user_badge, password_resets, alert_log via trigger).
 */
export async function deleteMyAccount(userId) {
  // Suppression simple : laisse les cascades faire le travail
  const { rowCount } = await q('DELETE FROM users WHERE id=$1', [userId]);
  return { ok: rowCount > 0 };
}

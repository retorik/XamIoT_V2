// src/smtp.js
// Configuration SMTP chargée depuis la DB (priorité) ou les variables d'env (fallback)
import { q } from './db.js';

let _config = null; // null = non configuré

/**
 * Retourne true si secure doit être activé.
 * Port 465 = TLS implicite, sinon STARTTLS.
 */
function _isImplicit(port, secureFlag) {
  if (secureFlag !== undefined && secureFlag !== null) return Boolean(secureFlag);
  return Number(port) === 465;
}

/** Charge la config depuis la DB, fallback sur les variables d'env. */
export async function reloadSmtpConfig() {
  try {
    const { rows } = await q('SELECT * FROM smtp_config WHERE id=1 LIMIT 1');
    if (rows.length) {
      _config = rows[0];
      console.log(`[SMTP] config chargée depuis DB : ${_config.host}:${_config.port} <${_config.from_email}>`);
      return;
    }
  } catch (e) {
    // Table peut ne pas exister encore
    console.warn('[SMTP] impossible de lire smtp_config :', e?.message || e);
  }

  // Fallback variables d'env
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT || 587);
    _config = {
      host:       process.env.SMTP_HOST,
      port,
      secure:     _isImplicit(port, null),
      user_login: process.env.SMTP_USER || null,
      pass:       process.env.SMTP_PASS || null,
      from_name:  process.env.MAIL_FROM_NAME || null,
      from_email: process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@xamiot.com',
      reply_to:   process.env.MAIL_REPLY_TO || null,
    };
    console.log(`[SMTP] config chargée depuis env : ${_config.host}:${_config.port} <${_config.from_email}>`);
  } else {
    _config = null;
    console.log('[SMTP] non configuré (ni DB ni env)');
  }
}

export function isSmtpReady() {
  return _config !== null && !!_config.host && !!_config.from_email;
}

export function getSmtpConfig() {
  return _config;
}

/** Crée un transporter nodemailer à partir de la config courante. */
export async function createTransporter() {
  if (!isSmtpReady()) return null;

  let nm;
  try {
    nm = (await import('nodemailer')).default;
  } catch (e) {
    console.warn('[SMTP] nodemailer indisponible:', e?.message || e);
    return null;
  }

  const c = _config;
  const secure = _isImplicit(c.port, c.secure);
  return nm.createTransport({
    host:       c.host,
    port:       c.port,
    secure,
    requireTLS: !secure,
    auth:       c.user_login ? { user: c.user_login, pass: c.pass || '' } : undefined,
    tls:        { servername: c.host, rejectUnauthorized: false },
    logger:     process.env.NODE_ENV !== 'production',
    debug:      process.env.NODE_ENV !== 'production',
  });
}

/** Construit l'adresse "from" formatée. */
export function buildFrom() {
  if (!_config) return 'no-reply@xamiot.com';
  return _config.from_name
    ? `"${_config.from_name}" <${_config.from_email}>`
    : _config.from_email;
}

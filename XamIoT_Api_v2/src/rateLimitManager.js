// src/rateLimitManager.js
// Rate limiters dynamiques — rechargeables depuis la DB sans restart
import rateLimit from 'express-rate-limit';
import { q } from './db.js';

const DEFAULTS = {
  global_max:        500,
  global_window_ms:  15 * 60 * 1000, // 15 min
  auth_max:          20,
  poll_max:          2000,
  contact_max:       5,
  contact_window_ms: 60 * 60 * 1000, // 1h
  portal_login_max:       10,
  portal_login_window_ms: 15 * 60 * 1000, // 15 min
  ip_whitelist:      '',
};

let _cfg       = { ...DEFAULTS };
let _whitelist = []; // IPs parsées depuis ip_whitelist

// Ring buffer des derniers hits de rate limit (max 200 entrées)
const MAX_LOGS = 200;
const _logs = [];

function _pushLog(limiter, ip, path) {
  _logs.push({ ts: new Date().toISOString(), limiter, ip, path: path || '' });
  if (_logs.length > MAX_LOGS) _logs.shift();
}

/** Retourne les derniers hits dans la fenêtre de temps courante. */
export function getRateLimitLogs() {
  const since = Date.now() - _cfg.global_window_ms;
  return _logs.filter(e => new Date(e.ts).getTime() >= since).slice().reverse();
}

/** Retourne true si l'IP du client est dans la whitelist → rate limit bypassed. */
function _isWhitelisted(req) {
  if (_whitelist.length === 0) return false;
  const ip = (req.ip || '').replace(/^::ffff:/, ''); // normalise IPv4-mapped IPv6
  return _whitelist.includes(ip);
}

function _make(max, windowMs, limiterName, msg = 'too_many_requests') {
  return rateLimit({
    windowMs,
    max,
    skip:            _isWhitelisted,
    standardHeaders: true,
    legacyHeaders:   false,
    message:         { error: msg },
    handler(req, res, next, options) {
      const ip = (req.ip || '').replace(/^::ffff:/, '');
      _pushLog(limiterName, ip, req.path);
      res.status(options.statusCode).json(options.message);
    },
  });
}

// Instances courantes
let _global       = _make(_cfg.global_max,        _cfg.global_window_ms,        'global');
let _auth         = _make(_cfg.auth_max,          _cfg.global_window_ms,        'auth');
let _poll         = _make(_cfg.poll_max,          _cfg.global_window_ms,        'poll');
let _contact      = _make(_cfg.contact_max,       _cfg.contact_window_ms,       'contact');
let _portalLogin  = _make(_cfg.portal_login_max,  _cfg.portal_login_window_ms,  'portal_login');

/** Middleware proxy — pointe toujours vers l'instance courante */
export function globalLimiter(req, res, next)      { return _global(req, res, next); }
export function authLimiter(req, res, next)        { return _auth(req, res, next); }
export function pollLimiter(req, res, next)        { return _poll(req, res, next); }
export function contactLimiter(req, res, next)     { return _contact(req, res, next); }
export function portalLoginLimiter(req, res, next) { return _portalLogin(req, res, next); }

/** Charge la config depuis la DB et recrée les limiters. */
export async function reloadRateLimitConfig() {
  try {
    const { rows } = await q('SELECT * FROM rate_limit_config WHERE id=1 LIMIT 1');
    if (rows.length) {
      _cfg = {
        global_max:             rows[0].global_max             ?? DEFAULTS.global_max,
        global_window_ms:       rows[0].global_window_ms       ?? DEFAULTS.global_window_ms,
        auth_max:               rows[0].auth_max               ?? DEFAULTS.auth_max,
        poll_max:               rows[0].poll_max               ?? DEFAULTS.poll_max,
        contact_max:            rows[0].contact_max            ?? DEFAULTS.contact_max,
        contact_window_ms:      rows[0].contact_window_ms      ?? DEFAULTS.contact_window_ms,
        portal_login_max:       rows[0].portal_login_max       ?? DEFAULTS.portal_login_max,
        portal_login_window_ms: rows[0].portal_login_window_ms ?? DEFAULTS.portal_login_window_ms,
        ip_whitelist:           rows[0].ip_whitelist           ?? '',
      };
    }
  } catch (e) {
    console.warn('[RATELIMIT] impossible de lire rate_limit_config :', e?.message || e);
  }
  _whitelist = (_cfg.ip_whitelist || '').split(',').map(s => s.trim()).filter(Boolean);
  _global       = _make(_cfg.global_max,        _cfg.global_window_ms,        'global');
  _auth         = _make(_cfg.auth_max,          _cfg.global_window_ms,        'auth');
  _poll         = _make(_cfg.poll_max,          _cfg.global_window_ms,        'poll');
  _contact      = _make(_cfg.contact_max,       _cfg.contact_window_ms,       'contact');
  _portalLogin  = _make(_cfg.portal_login_max,  _cfg.portal_login_window_ms,  'portal_login');
  console.log(`[RATELIMIT] global=${_cfg.global_max} auth=${_cfg.auth_max} poll=${_cfg.poll_max} contact=${_cfg.contact_max}/${_cfg.contact_window_ms/60000}min portal_login=${_cfg.portal_login_max}/${_cfg.portal_login_window_ms/60000}min window=${_cfg.global_window_ms / 60000}min whitelist=[${_whitelist.join(', ') || 'none'}]`);
}

export function getRateLimitConfig() {
  return { ..._cfg };
}

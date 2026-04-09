// src/rateLimitManager.js
// Rate limiters dynamiques — rechargeables depuis la DB sans restart
import rateLimit from 'express-rate-limit';
import { q } from './db.js';

const DEFAULTS = {
  global_max:        500,
  global_window_ms:  15 * 60 * 1000, // 15 min
  admin_max:         300,
  admin_window_ms:   15 * 60 * 1000, // 15 min
  auth_max:          20,
  auth_window_ms:    15 * 60 * 1000, // 15 min
  poll_max:          2000,
  poll_window_ms:    15 * 60 * 1000, // 15 min
  contact_max:       5,
  contact_window_ms: 60 * 60 * 1000, // 1h
  portal_login_max:       10,
  portal_login_window_ms: 15 * 60 * 1000, // 15 min
  deletion_max:      5,
  deletion_window_ms: 60 * 60 * 1000, // 1h — suppression de compte
  app_max:           1000,
  app_window_ms:     15 * 60 * 1000, // 15 min
  ip_whitelist:      '',
};

let _cfg       = { ...DEFAULTS };
let _whitelist = []; // IPs parsées depuis ip_whitelist

// Ring buffer des derniers hits de rate limit (max 200 entrées)
const MAX_LOGS = 200;
const _logs = [];

// Compteurs de requêtes par limiteur (fenêtre glissante)
const _LIMITER_KEYS = ['global', 'admin', 'auth', 'poll', 'contact', 'portal_login', 'deletion', 'app'];
const _counters = {};
for (const k of _LIMITER_KEYS) {
  _counters[k] = { count: 0, windowStart: Date.now() };
}

// Tracking par IP+limiteur : Map<`${ip}::${limiter}`, { ip, limiter, count, windowStart }>
const _ipTable = new Map();

function _trackIp(ip, limiterName) {
  const key = `${ip}::${limiterName}`;
  const wMs = _windowMs(limiterName);
  const now = Date.now();
  let entry = _ipTable.get(key);
  if (!entry || now - entry.windowStart >= wMs) {
    entry = { ip, limiter: limiterName, count: 0, windowStart: now };
    _ipTable.set(key, entry);
  }
  entry.count++;
}

function _windowMs(limiterName) {
  const map = {
    global:       'global_window_ms',
    admin:        'admin_window_ms',
    auth:         'auth_window_ms',
    poll:         'poll_window_ms',
    contact:      'contact_window_ms',
    portal_login: 'portal_login_window_ms',
    deletion:     'deletion_window_ms',
    app:          'app_window_ms',
  };
  return _cfg[map[limiterName]] || _cfg.global_window_ms;
}

function _trackRequest(limiterName) {
  const c = _counters[limiterName];
  if (!c) return;
  const wMs = _windowMs(limiterName);
  if (Date.now() - c.windowStart >= wMs) {
    c.count = 0;
    c.windowStart = Date.now();
  }
  c.count++;
}

function _pushLog(limiter, ip, path) {
  _logs.push({ ts: new Date().toISOString(), limiter, ip, path: path || '' });
  if (_logs.length > MAX_LOGS) _logs.shift();
}

/** Retourne les derniers hits dans la fenêtre de temps courante. */
export function getRateLimitLogs() {
  const since = Date.now() - _cfg.global_window_ms;
  return _logs.filter(e => new Date(e.ts).getTime() >= since).slice().reverse();
}

/** Retourne les stats en cours par limiteur (requêtes + bloquées dans la fenêtre). */
export function getRateLimitStats() {
  const now = Date.now();
  return _LIMITER_KEYS.map(name => {
    const c    = _counters[name];
    const wMs  = _windowMs(name);
    const age  = now - c.windowStart;
    const count = age < wMs ? c.count : 0;
    const since = now - wMs;
    const blocked = _logs.filter(e => e.limiter === name && new Date(e.ts).getTime() >= since).length;
    const windowResetIn = Math.max(0, Math.ceil((wMs - age) / 1000)); // secondes
    return { name, count, blocked, windowResetIn };
  });
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
let _admin        = _make(_cfg.admin_max,         _cfg.admin_window_ms,         'admin');
let _auth         = _make(_cfg.auth_max,          _cfg.auth_window_ms,          'auth');
let _poll         = _make(_cfg.poll_max,          _cfg.poll_window_ms,          'poll');
let _contact      = _make(_cfg.contact_max,       _cfg.contact_window_ms,       'contact');
let _portalLogin  = _make(_cfg.portal_login_max,  _cfg.portal_login_window_ms,  'portal_login');
let _deletion     = _make(_cfg.deletion_max,      _cfg.deletion_window_ms,      'deletion');
let _app          = _make(_cfg.app_max,           _cfg.app_window_ms,           'app');

// Chemins /admin/* utilisés par la status bar — exemptés du rate limit admin
// (polling toutes les 30s, comptabilisés par le pollLimiter sur chaque route)
const _STATUSBAR_PATHS = new Set([
  '/status', '/apns', '/fcm', '/smtp', '/stripe',
  '/rate-limit/logs', '/tickets/stats', '/rma/stats', '/orders/stats',
]);

/** Middleware proxy — pointe toujours vers l'instance courante */
export function globalLimiter(req, res, next) {
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  if (!_isWhitelisted(req)) { _trackRequest('global'); _trackIp(ip, 'global'); }
  return _global(req, res, next);
}
export function adminLimiter(req, res, next) {
  if (_STATUSBAR_PATHS.has(req.path)) return next();
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  if (!_isWhitelisted(req)) { _trackRequest('admin'); _trackIp(ip, 'admin'); }
  return _admin(req, res, next);
}
export function authLimiter(req, res, next) {
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  if (!_isWhitelisted(req)) { _trackRequest('auth'); _trackIp(ip, 'auth'); }
  return _auth(req, res, next);
}
export function pollLimiter(req, res, next) {
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  if (!_isWhitelisted(req)) { _trackRequest('poll'); _trackIp(ip, 'poll'); }
  return _poll(req, res, next);
}
export function contactLimiter(req, res, next) {
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  if (!_isWhitelisted(req)) { _trackRequest('contact'); _trackIp(ip, 'contact'); }
  return _contact(req, res, next);
}
export function portalLoginLimiter(req, res, next) {
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  if (!_isWhitelisted(req)) { _trackRequest('portal_login'); _trackIp(ip, 'portal_login'); }
  return _portalLogin(req, res, next);
}
export function deletionLimiter(req, res, next) {
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  if (!_isWhitelisted(req)) { _trackRequest('deletion'); _trackIp(ip, 'deletion'); }
  return _deletion(req, res, next);
}
export function appLimiter(req, res, next) {
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  if (!_isWhitelisted(req)) { _trackRequest('app'); _trackIp(ip, 'app'); }
  return _app(req, res, next);
}

/** Charge la config depuis la DB et recrée les limiters. */
export async function reloadRateLimitConfig() {
  try {
    const { rows } = await q('SELECT * FROM rate_limit_config WHERE id=1 LIMIT 1');
    if (rows.length) {
      _cfg = {
        global_max:             rows[0].global_max             ?? DEFAULTS.global_max,
        global_window_ms:       rows[0].global_window_ms       ?? DEFAULTS.global_window_ms,
        admin_max:              rows[0].admin_max              ?? DEFAULTS.admin_max,
        admin_window_ms:        rows[0].admin_window_ms        ?? DEFAULTS.admin_window_ms,
        auth_max:               rows[0].auth_max               ?? DEFAULTS.auth_max,
        auth_window_ms:         rows[0].auth_window_ms         ?? DEFAULTS.auth_window_ms,
        poll_max:               rows[0].poll_max               ?? DEFAULTS.poll_max,
        poll_window_ms:         rows[0].poll_window_ms         ?? DEFAULTS.poll_window_ms,
        contact_max:            rows[0].contact_max            ?? DEFAULTS.contact_max,
        contact_window_ms:      rows[0].contact_window_ms      ?? DEFAULTS.contact_window_ms,
        portal_login_max:       rows[0].portal_login_max       ?? DEFAULTS.portal_login_max,
        portal_login_window_ms: rows[0].portal_login_window_ms ?? DEFAULTS.portal_login_window_ms,
        deletion_max:           rows[0].deletion_max           ?? DEFAULTS.deletion_max,
        deletion_window_ms:     rows[0].deletion_window_ms     ?? DEFAULTS.deletion_window_ms,
        app_max:                rows[0].app_max                ?? DEFAULTS.app_max,
        app_window_ms:          rows[0].app_window_ms          ?? DEFAULTS.app_window_ms,
        ip_whitelist:           rows[0].ip_whitelist           ?? '',
      };
    }
  } catch (e) {
    console.warn('[RATELIMIT] impossible de lire rate_limit_config :', e?.message || e);
  }
  _whitelist = (_cfg.ip_whitelist || '').split(',').map(s => s.trim()).filter(Boolean);
  // Réinitialiser les compteurs (nouvelle fenêtre)
  for (const k of _LIMITER_KEYS) {
    _counters[k] = { count: 0, windowStart: Date.now() };
  }
  _global       = _make(_cfg.global_max,        _cfg.global_window_ms,        'global');
  _admin        = _make(_cfg.admin_max,         _cfg.admin_window_ms,         'admin');
  _auth         = _make(_cfg.auth_max,          _cfg.auth_window_ms,          'auth');
  _poll         = _make(_cfg.poll_max,          _cfg.poll_window_ms,          'poll');
  _contact      = _make(_cfg.contact_max,       _cfg.contact_window_ms,       'contact');
  _portalLogin  = _make(_cfg.portal_login_max,  _cfg.portal_login_window_ms,  'portal_login');
  _deletion     = _make(_cfg.deletion_max,      _cfg.deletion_window_ms,      'deletion');
  _app          = _make(_cfg.app_max,           _cfg.app_window_ms,           'app');
  console.log(`[RATELIMIT] global=${_cfg.global_max}/${_cfg.global_window_ms/60000}min admin=${_cfg.admin_max}/${_cfg.admin_window_ms/60000}min auth=${_cfg.auth_max}/${_cfg.auth_window_ms/60000}min app=${_cfg.app_max}/${_cfg.app_window_ms/60000}min poll=${_cfg.poll_max}/${_cfg.poll_window_ms/60000}min contact=${_cfg.contact_max}/${_cfg.contact_window_ms/60000}min portal_login=${_cfg.portal_login_max}/${_cfg.portal_login_window_ms/60000}min deletion=${_cfg.deletion_max}/${_cfg.deletion_window_ms/60000}min whitelist=[${_whitelist.join(', ') || 'none'}]`);
}

export function getRateLimitConfig() {
  return { ..._cfg };
}

/** Retourne toutes les entrées IP en mémoire avec leur statut. */
export function getIpTable() {
  const now = Date.now();
  const maxMap = {
    global:       'global_max',
    admin:        'admin_max',
    auth:         'auth_max',
    poll:         'poll_max',
    contact:      'contact_max',
    portal_login: 'portal_login_max',
    deletion:     'deletion_max',
    app:          'app_max',
  };
  const rows = [];
  for (const [key, entry] of _ipTable.entries()) {
    const wMs = _windowMs(entry.limiter);
    const age = now - entry.windowStart;
    if (age >= wMs) {
      // Fenêtre expirée — on garde quand même pour affichage (count=0)
      rows.push({ key, ip: entry.ip, limiter: entry.limiter, count: 0, max: _cfg[maxMap[entry.limiter]] || 0, windowResetIn: 0, blocked: false });
    } else {
      const max = _cfg[maxMap[entry.limiter]] || 0;
      const since = now - wMs;
      const blocked = _logs.some(e => e.limiter === entry.limiter && e.ip === entry.ip && new Date(e.ts).getTime() >= since);
      const windowResetIn = Math.max(0, Math.ceil((wMs - age) / 1000));
      rows.push({ key, ip: entry.ip, limiter: entry.limiter, count: entry.count, max, windowResetIn, blocked });
    }
  }
  // Trie : bloqués d'abord, puis par IP
  rows.sort((a, b) => (b.blocked - a.blocked) || a.ip.localeCompare(b.ip));
  return rows;
}

/** Remet à zéro le compteur d'une IP pour un limiteur donné. */
export function resetIpEntry(ip, limiter) {
  const key = `${ip}::${limiter}`;
  _ipTable.delete(key);
}

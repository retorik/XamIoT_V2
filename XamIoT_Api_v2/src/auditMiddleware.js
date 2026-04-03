// src/auditMiddleware.js
import { q } from './db.js';

// Extrait l'IP publique réelle du client (ignore les IPs privées/LAN)
export function getRealIp(req) {
  // X-Real-IP : positionné par Traefik à l'IP du client avant tout proxy
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp.trim();

  // X-Forwarded-For : prendre la première IP non-privée (gauche = client original)
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const ips = xff.split(',').map(ip => ip.trim());
    const pub = ips.find(ip => !isPrivateIp(ip));
    if (pub) return pub;
    if (ips[0]) return ips[0]; // toutes privées → prendre la première
  }

  return req.ip || null;
}

function isPrivateIp(ip) {
  if (!ip) return true;
  const clean = ip.replace(/^::ffff:/, '');
  return (
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean.startsWith('10.') ||
    clean.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(clean)
  );
}

// Détermine l'action à partir de la méthode HTTP
function methodToAction(method) {
  switch (method) {
    case 'POST':   return 'CREATE';
    case 'PUT':
    case 'PATCH':  return 'UPDATE';
    case 'DELETE': return 'DELETE';
    default:       return method;
  }
}

// Détermine le resource_type à partir du path
function pathToResourceType(path) {
  if (path.includes('/cms/pages'))   return 'page';
  if (path.includes('/cms/media'))   return 'media';
  if (path.includes('/products'))    return 'product';
  if (path.includes('/users'))       return 'user';
  if (path.includes('/tickets'))     return 'ticket';
  if (path.includes('/rma'))         return 'rma';
  if (path.includes('/app-config'))  return 'config';
  if (path.includes('/esp-devices')) return 'device';
  if (path.includes('/rules'))       return 'rule';
  if (path.includes('/alerts'))      return 'alert';
  if (path.includes('/ota'))         return 'ota';
  return 'admin';
}

// Extrait l'ID depuis le path (dernier segment UUID-like ou numérique)
function extractResourceId(path) {
  const parts = path.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  // UUID pattern ou entier
  if (/^[0-9a-f-]{36}$/.test(last) || /^\d+$/.test(last)) return last;
  return null;
}

export function auditMiddleware(req, res, next) {
  // Uniquement les mutations sur /admin
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (!req.path.startsWith('/') ) return next();

  // On logue après la réponse pour avoir le status code
  res.on('finish', () => {
    // Ne pas loguer les erreurs 5xx
    if (res.statusCode >= 500) return;
    // Ne pas loguer les routes de login/logout
    if (req.originalUrl.includes('/login') || req.originalUrl.includes('/logout')) return;

    const user_id       = req.user?.sub || null;
    const user_email    = req.user?.email || null;
    const action        = methodToAction(req.method);
    const resource_type = pathToResourceType(req.originalUrl);
    const resource_id   = extractResourceId(req.originalUrl);
    const ip_address    = getRealIp(req);
    const user_agent    = req.headers['user-agent'] || null;

    // Capturer le body comme détails (filtrer les secrets)
    let details = null;
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      const filtered = { ...req.body };
      for (const key of ['password', 'pass', 'secret', 'token', 'key', 'apns_key', 'fcm_key']) {
        if (key in filtered) filtered[key] = '[redacted]';
      }
      details = filtered;
    }

    // Async fire-and-forget (ne pas bloquer la réponse)
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details ? JSON.stringify(details) : null]
    ).catch(err => console.error('[AUDIT] insert error:', err.message));
  });

  next();
}

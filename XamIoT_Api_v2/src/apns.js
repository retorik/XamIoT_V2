// src/apns.js
import fs from 'fs';
import http2 from 'http2';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { q } from './db.js';

/**
 * Logique demandée
 * - Si l'appelant fournit opts.sandbox (boolean), on l'utilise pour choisir l'hôte.
 * - Sinon, on retombe sur la variable globale useSandbox (comportement global par défaut).
 */

const APNS_HOST_SANDBOX = 'api.sandbox.push.apple.com';
const APNS_HOST_PROD    = 'api.push.apple.com';

// Variables APNs modifiables (chargées depuis DB ou env)
let keyPEM   = null;
let teamId   = null;
let keyId    = null;
let bundleId = null;
/** 'sandbox' | 'production' | 'both' */
let apnsEnv  = 'sandbox';

// Charge depuis la DB (priorité) ou depuis les variables d'env (fallback)
export async function reloadApnsConfig() {
  try {
    const { rows } = await q('SELECT * FROM apns_config WHERE id = 1 LIMIT 1');
    if (rows.length && rows[0].key_pem) {
      keyPEM   = rows[0].key_pem;
      teamId   = rows[0].team_id;
      keyId    = rows[0].key_id;
      bundleId = rows[0].bundle_id;
      // Support both old boolean column and new apns_env text column
      if (typeof rows[0].apns_env === 'string') {
        apnsEnv = rows[0].apns_env;
      } else {
        apnsEnv = rows[0].use_sandbox ? 'sandbox' : 'production';
      }
      console.log('[APNS] Config chargée depuis DB, bundleId=', bundleId, 'env=', apnsEnv);
      return;
    }
  } catch (e) {
    console.warn('[APNS] Impossible de charger depuis DB:', e.message);
  }
  // Fallback variables d'env
  teamId   = config.apns.teamId;
  keyId    = config.apns.keyId;
  bundleId = config.apns.bundleId;
  apnsEnv  = config.apns.useSandbox ? 'sandbox' : 'production';
  try {
    if (config.apns.keyFile) keyPEM = fs.readFileSync(config.apns.keyFile, 'utf8');
  } catch (e) {
    console.warn('[APNS] Clé .p8 absente ou illisible:', config.apns.keyFile);
  }
  if (keyPEM) console.log('[APNS] Config chargée depuis env, bundleId=', bundleId);
  else console.warn('[APNS] APNs désactivé (pas de clé configurée)');
}

export function isApnsEnabled() { return !!keyPEM; }

// JWT Apple ES256 (iat + iss). Durée courte conseillée.
function makeJwt() {
  return jwt.sign(
    {}, // claims vides → iat auto
    keyPEM,
    {
      algorithm: 'ES256',
      issuer: teamId,         // iss = Team ID
      header: { kid: keyId }, // kid dans l'en-tête
      expiresIn: '20m',       // 20–30 min recommandé
    }
  );
}

/**
 * Envoi APNs.
 * @param {string} deviceToken  Token APNs (64 hex)
 * @param {string} title        Titre notification
 * @param {string} body         Corps notification
 * @param {object} custom       Données custom; si custom.badge est un entier → aps.badge
 * @param {object} opts         { sandbox?: boolean } → sélection par device
 * @returns {Promise<{status:number, body:string, env:'sandbox'|'prod'}>}
 */
export async function sendAPNS(deviceToken, title, body, custom = {}, opts = {}) {
  if (!keyPEM) return { status: 0, body: 'APNs disabled (no key configured)', env: 'none' };
  const token = makeJwt();

  // Per-device sandbox flag takes priority; global apnsEnv is the fallback.
  // 'both' = rely entirely on the per-device flag (default: production if unset).
  const sandbox =
    typeof opts.sandbox === 'boolean'
      ? opts.sandbox
      : apnsEnv === 'sandbox';

  const host = sandbox ? APNS_HOST_SANDBOX : APNS_HOST_PROD;
  const env  = sandbox ? 'sandbox' : 'prod';

  // Badge ABSOLU si fourni (ex: compteur DB d'alertes non lues)
  const badge = Number.isFinite(Number(custom?.badge))
    ? Number(custom.badge)
    : undefined;

  // Construire payload APS standard (alert + son + badge éventuel)
  const aps = {
    alert: { title, body },
    sound: 'default',
    ...(badge !== undefined ? { badge } : {}),
  };

  // Éviter de renvoyer badge en double dans la partie custom
  const { badge: _dropBadge, ...customSafe } = custom || {};

  const payload = JSON.stringify({ aps, ...customSafe });

  return new Promise((resolve) => {
    let client;
    try {
      client = http2.connect(`https://${host}:443`);
    } catch (e) {
      return resolve({ status: 0, body: `http2 connect throw: ${e.message}`, env });
    }

    client.on('error', (err) => {
      resolve({ status: 0, body: `http2 connect: ${err.message}`, env });
    });

    let req;
    try {
      req = client.request({
        ':method'        : 'POST',
        ':path'          : `/3/device/${deviceToken}`,
        'content-type'   : 'application/json',
        'apns-topic'     : bundleId,  // bundle id (doit correspondre au token)
        'apns-push-type' : 'alert',   // requis pour badge/alerte/son
        'apns-priority'  : '10',      // immédiat
        // 'apns-expiration': '0',    // optionnel (expiration si non délivré)
        'authorization'  : `bearer ${token}`,
      });
    } catch (e) {
      client.close();
      return resolve({ status: 0, body: `http2 request build: ${e.message}`, env });
    }

    let resp = '';
    req.setEncoding('utf8');

    req.on('response', (headers) => {
      const status = headers[':status'];
      req.on('data', (chunk) => (resp += chunk));
      req.on('end', () => {
        client.close();
        let reason = null;
        try { reason = JSON.parse(resp).reason || null; } catch {}
        // Expose aussi l'ID APNs utile pour Apple (debug avancé)
        const apnsId = headers['apns-id'];
        resolve({ status, body: resp, reason, apnsId, env })
      });
    });

    req.on('error', (err) => {
      client.close();
      resolve({ status: 0, body: `http2 request: ${err.message}`, env });
    });

    req.end(payload);
  });
}

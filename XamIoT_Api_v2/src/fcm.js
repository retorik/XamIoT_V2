// src/fcm.js
import fs from 'fs';
import { initializeApp, cert, getApps, getApp, deleteApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { q } from './db.js';

function bool(v, dflt = false) {
  if (v == null) return dflt;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}

let _ready = false;
let _initError = null;

function _parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

async function _reinitialize(saObj) {
  // Détruire l'app existante si elle existe
  if (getApps().length > 0) {
    try { await deleteApp(getApp()); } catch { /* noop */ }
  }
  initializeApp({ credential: cert(saObj) });
  _ready = true;
  _initError = null;
}

/**
 * Recharge la config FCM depuis la DB (priorité) ou l'environnement (fallback).
 * Appelé au démarrage et après chaque modification via le backoffice.
 */
export async function reloadFcmConfig() {
  if (bool(process.env.FCM_DISABLED, false)) {
    _ready = false;
    _initError = new Error('fcm_disabled');
    console.log('[FCM] désactivé (FCM_DISABLED)');
    return;
  }

  try {
    // 1) Priorité : config en DB
    const { rows } = await q('SELECT service_account_json FROM fcm_config WHERE id=1 LIMIT 1');
    if (rows.length && rows[0].service_account_json) {
      const sa = _parseJson(rows[0].service_account_json);
      if (sa) {
        await _reinitialize(sa);
        console.log('[FCM] init OK (DB)');
        return;
      }
    }

    // 2) Fallback : JSON dans variable d'env
    if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
      const sa = _parseJson(process.env.FCM_SERVICE_ACCOUNT_JSON);
      if (sa) {
        await _reinitialize(sa);
        console.log('[FCM] init OK (FCM_SERVICE_ACCOUNT_JSON)');
        return;
      }
    }

    // 3) Fallback : fichier monté
    if (process.env.FCM_SERVICE_ACCOUNT_FILE) {
      const sa = _parseJson(fs.readFileSync(process.env.FCM_SERVICE_ACCOUNT_FILE, 'utf8'));
      if (sa) {
        await _reinitialize(sa);
        console.log('[FCM] init OK (FCM_SERVICE_ACCOUNT_FILE)');
        return;
      }
    }

    // Aucune config trouvée
    _ready = false;
    _initError = new Error('fcm_not_configured');
    console.warn('[FCM] non configuré (aucune credential trouvée)');
  } catch (e) {
    _ready = false;
    _initError = e;
    console.error('[FCM] erreur init:', e?.message || e);
  }
}

export function isFcmReady() {
  return _ready;
}

function isInvalidToken(code) {
  const c = String(code || '');
  return (
    c === 'messaging/registration-token-not-registered' ||
    c === 'messaging/invalid-registration-token'
  );
}

function toStringMap(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    out[String(k)] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

export async function sendFCM(registrationToken, title, body, data = {}) {
  const token = (registrationToken || '').trim();
  if (!token) return { ok: false, code: 'missing_token', message: 'FCM token empty', disableDevice: false };

  if (!_ready) {
    return {
      ok: false,
      code: 'fcm_not_ready',
      message: _initError?.message || 'fcm_not_configured',
      disableDevice: false,
    };
  }

  try {
    const messageId = await getMessaging().send({
      token,
      notification: { title, body },
      data: toStringMap(data),
      android: {
        priority: 'high',
        notification: { sound: 'default' },
      },
    });

    return { ok: true, messageId };
  } catch (e) {
    const code = e?.code || e?.errorInfo?.code || 'fcm_send_failed';
    const message = e?.message || e?.errorInfo?.message || 'unknown';
    return { ok: false, code, message, disableDevice: isInvalidToken(code) };
  }
}

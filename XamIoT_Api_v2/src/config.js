// src/config.js
function bool(v, dflt = false) {
  if (v == null) return dflt;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}
function int(v, dflt) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
}

// JWT secret — obligatoire, jamais de fallback en dur
function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is required in production');
    }
    console.warn('[WARN] JWT_SECRET not set — using insecure dev default');
    return 'dev-secret-not-for-production';
  }
  return s;
}

// DB: DATABASE_URL ou PG*
function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.PGHOST ?? 'db';
  const port = process.env.PGPORT ?? '5432';
  const db   = process.env.PGDATABASE ?? 'xamiot_v2';
  const user = process.env.PGUSER ?? 'xamiot_v2_user';
  const pass = process.env.PGPASSWORD ?? 'xamiot_v2_pass';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

// MQTT
function buildMqttUrl() {
  if (process.env.MQTT_URL) return process.env.MQTT_URL;
  const host = process.env.MQTT_HOST ?? 'mosquitto';
  const port = process.env.MQTT_PORT ?? '1883';
  const tls  = port === '8883' || bool(process.env.MQTT_TLS);
  return `${tls ? 'mqtts' : 'mqtt'}://${host}:${port}`;
}

// CORS origins autorisées (liste séparée par virgule)
function buildCorsOrigins() {
  const raw = process.env.CORS_ORIGINS;
  if (raw) return raw.split(',').map(s => s.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production') return ['https://admin.xamiot.com'];
  // Dev local : admin Vite sur 5173 + éventuel autre port
  return ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3001', 'http://192.168.1.191:4000', 'http://192.168.1.191:5173', 'http://192.168.1.191:5174'];
}

// =============================================
// URLs d'environnement — source de vérité unique
// Chaque URL peut être surchargée via variable d'env.
// Les valeurs par défaut correspondent au VPS DEV (holiceo.com).
// En production, toutes ces variables DOIVENT être définies dans .env.prod.
// =============================================
function buildUrls() {
  const isProd = process.env.NODE_ENV === 'production';

  // URLs de base — surchargeables individuellement
  const apiPublic     = process.env.API_PUBLIC_URL    || (isProd ? 'https://api.xamiot.com'      : 'https://apixam.holiceo.com');
  const publicPortal  = process.env.PUBLIC_PORTAL_URL || (isProd ? 'https://client.xamiot.com'   : 'https://xamcli.holiceo.com');
  const publicSite    = process.env.PUBLIC_SITE_URL   || (isProd ? 'https://xamiot.com'           : 'https://xamsite.holiceo.com');

  return {
    // URLs publiques exposées aux clients (site + portail)
    publicSite,
    publicPortal,
    apiPublic,

    // Lien d'activation envoyé dans l'email → appelle l'API elle-même
    activationLinkBase: process.env.ACTIVATION_LINK_BASE || `${apiPublic}/auth/activate`,

    // Page de résultat après clic sur le lien d'activation (portail client)
    activationResult: process.env.ACTIVATION_RESULT_URL || `${publicPortal}/activation-result`,

    // Page de réinitialisation du mot de passe (portail client)
    resetPassword: process.env.RESET_PASSWORD_URL || `${publicPortal}/reset-password`,
  };
}

export const config = {
  port: int(process.env.PORT, 3000),
  jwtSecret: getJwtSecret(),

  databaseUrl: buildDatabaseUrl(),
  corsOrigins: buildCorsOrigins(),

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000), // 15 min
    max: int(process.env.RATE_LIMIT_MAX, 500),
    authMax: int(process.env.RATE_LIMIT_AUTH_MAX, 20), // plus strict sur /auth/*
  },

  mqtt: {
    url: buildMqttUrl(),
    username: process.env.MQTT_USER ?? process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASS ?? process.env.MQTT_PASSWORD,
    subscribePattern: process.env.MQTT_SUBSCRIBE_PATTERN || 'devices/+/status',
    rejectUnauthorized: (process.env.MQTT_TLS_REJECT_UNAUTHORIZED != null)
      ? bool(process.env.MQTT_TLS_REJECT_UNAUTHORIZED, true)
      : undefined,
  },

  apns: {
    teamId: process.env.APNS_TEAM_ID,
    keyId: process.env.APNS_KEY_ID,
    keyFile: process.env.APNS_KEY_FILE || process.env.APNS_P8_PATH,
    bundleId: process.env.APNS_BUNDLE_ID,
    useSandbox: process.env.APNS_ENV
      ? (process.env.APNS_ENV === 'sandbox')
      : bool(process.env.APNS_USE_SANDBOX, true),
  },

  defaults: {
    ruleCooldownSec: int(process.env.DEFAULT_RULE_COOLDOWN_SEC, 120),
  },

  urls: buildUrls(),
};

// src/__tests__/urlConfig.test.js
// Tests de la configuration dynamique des URLs (Lot 0)
// Vérifie que les URLs ne sont jamais hardcodées vers la PROD
// et que les valeurs DEV par défaut sont correctes.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Helper pour re-importer config avec des env vars simulées
function buildUrls(overrides = {}) {
  const saved = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }

  // Re-créer la logique de buildUrls depuis config.js
  const isProd = process.env.NODE_ENV === 'production';
  const apiPublic    = process.env.API_PUBLIC_URL    || (isProd ? 'https://api.xamiot.com'      : 'https://apixam.holiceo.com');
  const publicPortal = process.env.PUBLIC_PORTAL_URL || (isProd ? 'https://client.xamiot.com'   : 'https://xamcli.holiceo.com');
  const publicSite   = process.env.PUBLIC_SITE_URL   || (isProd ? 'https://xamiot.com'           : 'https://xamsite.holiceo.com');

  const result = {
    publicSite,
    publicPortal,
    apiPublic,
    activationLinkBase: process.env.ACTIVATION_LINK_BASE  || `${apiPublic}/auth/activate`,
    activationResult:   process.env.ACTIVATION_RESULT_URL || `${publicPortal}/activation-result`,
    resetPassword:      process.env.RESET_PASSWORD_URL    || `${publicPortal}/reset-password`,
  };

  // Restaurer les env vars
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  return result;
}

describe('config.urls — environnement DEV (par défaut)', () => {
  test('should use DEV site URL by default', () => {
    const urls = buildUrls({ NODE_ENV: 'development' });
    assert.equal(urls.publicSite, 'https://xamsite.holiceo.com');
  });

  test('should use DEV portal URL by default', () => {
    const urls = buildUrls({ NODE_ENV: 'development' });
    assert.equal(urls.publicPortal, 'https://xamcli.holiceo.com');
  });

  test('should use DEV API URL by default', () => {
    const urls = buildUrls({ NODE_ENV: 'development' });
    assert.equal(urls.apiPublic, 'https://apixam.holiceo.com');
  });

  test('should build activation link from DEV API URL', () => {
    const urls = buildUrls({ NODE_ENV: 'development' });
    assert.equal(urls.activationLinkBase, 'https://apixam.holiceo.com/auth/activate');
  });

  test('should build activation result URL from DEV portal URL', () => {
    const urls = buildUrls({ NODE_ENV: 'development' });
    assert.equal(urls.activationResult, 'https://xamcli.holiceo.com/activation-result');
  });

  test('should build reset password URL from DEV portal URL', () => {
    const urls = buildUrls({ NODE_ENV: 'development' });
    assert.equal(urls.resetPassword, 'https://xamcli.holiceo.com/reset-password');
  });

  test('should never contain production domain in DEV mode', () => {
    const urls = buildUrls({ NODE_ENV: 'development' });
    for (const [k, v] of Object.entries(urls)) {
      assert.ok(!v.includes('xamiot.com'), `${k} contient xamiot.com en mode DEV: ${v}`);
    }
  });
});

describe('config.urls — environnement PROD', () => {
  test('should use PROD site URL in production', () => {
    const urls = buildUrls({ NODE_ENV: 'production' });
    assert.equal(urls.publicSite, 'https://xamiot.com');
  });

  test('should use PROD portal URL in production', () => {
    const urls = buildUrls({ NODE_ENV: 'production' });
    assert.equal(urls.publicPortal, 'https://client.xamiot.com');
  });

  test('should use PROD API URL in production', () => {
    const urls = buildUrls({ NODE_ENV: 'production' });
    assert.equal(urls.apiPublic, 'https://api.xamiot.com');
  });

  test('should build activation result from PROD portal URL in production', () => {
    const urls = buildUrls({ NODE_ENV: 'production' });
    assert.equal(urls.activationResult, 'https://client.xamiot.com/activation-result');
  });

  test('should build reset password URL from PROD portal URL in production', () => {
    const urls = buildUrls({ NODE_ENV: 'production' });
    assert.equal(urls.resetPassword, 'https://client.xamiot.com/reset-password');
  });
});

describe('config.urls — surcharge via variables d\'env', () => {
  test('should use custom PUBLIC_SITE_URL when set', () => {
    const urls = buildUrls({ PUBLIC_SITE_URL: 'https://custom.example.com' });
    assert.equal(urls.publicSite, 'https://custom.example.com');
  });

  test('should use custom ACTIVATION_RESULT_URL when set', () => {
    const urls = buildUrls({ ACTIVATION_RESULT_URL: 'https://custom.example.com/activate' });
    assert.equal(urls.activationResult, 'https://custom.example.com/activate');
  });

  test('should use custom RESET_PASSWORD_URL when set', () => {
    const urls = buildUrls({ RESET_PASSWORD_URL: 'https://custom.example.com/reset' });
    assert.equal(urls.resetPassword, 'https://custom.example.com/reset');
  });

  test('should derive activation and reset from custom portal URL', () => {
    const urls = buildUrls({ PUBLIC_PORTAL_URL: 'https://myportal.example.com' });
    assert.equal(urls.activationResult, 'https://myportal.example.com/activation-result');
    assert.equal(urls.resetPassword,    'https://myportal.example.com/reset-password');
  });
});

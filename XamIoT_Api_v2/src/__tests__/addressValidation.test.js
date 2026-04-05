// src/__tests__/addressValidation.test.js
// Tests unitaires de la validation d'adresses (addressesRouter.validateAddress)
// et du calcul frais/taxes (ordersRouter.computeShippingAndTax)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Réplication de la fonction validateAddress (pas d'export côté router)
function validateAddress(body) {
  const { first_name, last_name, line1, postal_code, city, country_code } = body;
  if (!first_name?.trim()) return 'first_name requis';
  if (!last_name?.trim()) return 'last_name requis';
  if (!line1?.trim()) return 'line1 requis';
  if (!postal_code?.trim()) return 'postal_code requis';
  if (!city?.trim()) return 'city requis';
  if (!country_code?.trim() || country_code.trim().length !== 2) return 'country_code invalide (2 lettres)';
  return null;
}

describe('validateAddress', () => {
  const validAddress = {
    first_name: 'Jean',
    last_name: 'Dupont',
    line1: '12 rue de la Paix',
    postal_code: '75002',
    city: 'Paris',
    country_code: 'FR',
  };

  test('should return null for a valid address', () => {
    assert.equal(validateAddress(validAddress), null);
  });

  test('should reject when first_name is missing', () => {
    assert.equal(validateAddress({ ...validAddress, first_name: '' }), 'first_name requis');
    assert.equal(validateAddress({ ...validAddress, first_name: '   ' }), 'first_name requis');
    assert.equal(validateAddress({ ...validAddress, first_name: undefined }), 'first_name requis');
    assert.equal(validateAddress({ ...validAddress, first_name: null }), 'first_name requis');
  });

  test('should reject when last_name is missing', () => {
    assert.equal(validateAddress({ ...validAddress, last_name: '' }), 'last_name requis');
  });

  test('should reject when line1 is missing', () => {
    assert.equal(validateAddress({ ...validAddress, line1: '' }), 'line1 requis');
  });

  test('should reject when postal_code is missing', () => {
    assert.equal(validateAddress({ ...validAddress, postal_code: '' }), 'postal_code requis');
  });

  test('should reject when city is missing', () => {
    assert.equal(validateAddress({ ...validAddress, city: '' }), 'city requis');
  });

  test('should reject when country_code is missing', () => {
    assert.equal(validateAddress({ ...validAddress, country_code: '' }), 'country_code invalide (2 lettres)');
  });

  test('should reject when country_code is not 2 letters', () => {
    assert.equal(validateAddress({ ...validAddress, country_code: 'F' }), 'country_code invalide (2 lettres)');
    assert.equal(validateAddress({ ...validAddress, country_code: 'FRA' }), 'country_code invalide (2 lettres)');
  });

  test('should accept country_code with surrounding spaces', () => {
    assert.equal(validateAddress({ ...validAddress, country_code: ' FR ' }), null);
  });

  test('should trim values when validating', () => {
    const addr = {
      first_name: '  Jean  ',
      last_name: '  Dupont  ',
      line1: '  12 rue  ',
      postal_code: '  75002  ',
      city: '  Paris  ',
      country_code: 'FR',
    };
    assert.equal(validateAddress(addr), null);
  });
});

// Réplication de computeShippingAndTax (logique pure, sans DB)
function computeShippingAndTax(subtotal, country) {
  if (!country) return { error: 'country_not_available' };
  if (country.is_blocked) return { error: 'country_blocked', message: country.message_client || 'Livraison non disponible dans ce pays.' };

  const shippingCents = country.shipping_cents || 0;
  const taxCents = Math.round(subtotal * parseFloat(country.tax_rate_pct || 0) / 100);
  const customsCents = country.customs_cents || 0;
  const totalCents = subtotal + shippingCents + taxCents + customsCents;

  return { shippingCents, taxCents, customsCents, totalCents, taxRate: parseFloat(country.tax_rate_pct || 0), message: country.message_client };
}

describe('computeShippingAndTax', () => {
  const france = {
    shipping_cents: 990,
    tax_rate_pct: '20.00',
    customs_cents: 0,
    is_blocked: false,
    message_client: null,
  };

  const usa = {
    shipping_cents: 2500,
    tax_rate_pct: '0.00',
    customs_cents: 1500,
    is_blocked: false,
    message_client: 'Customs may apply',
  };

  const blocked = {
    shipping_cents: 0,
    tax_rate_pct: '0',
    customs_cents: 0,
    is_blocked: true,
    message_client: 'Pays non desservi',
  };

  test('should compute correctly for France (20% TVA, no customs)', () => {
    const result = computeShippingAndTax(10000, france); // 100.00 EUR de produits
    assert.equal(result.shippingCents, 990);
    assert.equal(result.taxCents, 2000); // 20% de 10000
    assert.equal(result.customsCents, 0);
    assert.equal(result.totalCents, 10000 + 990 + 2000 + 0);
    assert.equal(result.taxRate, 20);
  });

  test('should compute correctly for USA (no tax, customs)', () => {
    const result = computeShippingAndTax(10000, usa);
    assert.equal(result.shippingCents, 2500);
    assert.equal(result.taxCents, 0);
    assert.equal(result.customsCents, 1500);
    assert.equal(result.totalCents, 10000 + 2500 + 0 + 1500);
    assert.equal(result.message, 'Customs may apply');
  });

  test('should return error for blocked country', () => {
    const result = computeShippingAndTax(10000, blocked);
    assert.equal(result.error, 'country_blocked');
    assert.equal(result.message, 'Pays non desservi');
  });

  test('should return error when country is null', () => {
    const result = computeShippingAndTax(10000, null);
    assert.equal(result.error, 'country_not_available');
  });

  test('should handle zero subtotal', () => {
    const result = computeShippingAndTax(0, france);
    assert.equal(result.taxCents, 0);
    assert.equal(result.totalCents, 990); // shipping only
  });

  test('should round tax to nearest cent', () => {
    // 333 cents * 20% = 66.6 → 67
    const result = computeShippingAndTax(333, france);
    assert.equal(result.taxCents, 67);
  });

  test('should handle missing shipping_cents and customs_cents', () => {
    const country = { shipping_cents: null, tax_rate_pct: '10', customs_cents: null, is_blocked: false };
    const result = computeShippingAndTax(10000, country);
    assert.equal(result.shippingCents, 0);
    assert.equal(result.customsCents, 0);
    assert.equal(result.taxCents, 1000);
    assert.equal(result.totalCents, 11000);
  });

  test('should handle missing tax_rate_pct', () => {
    const country = { shipping_cents: 500, tax_rate_pct: null, customs_cents: 0, is_blocked: false };
    const result = computeShippingAndTax(10000, country);
    assert.equal(result.taxCents, 0);
    assert.equal(result.taxRate, 0);
  });
});

describe('Non-régression : calcul total commande', () => {
  test('should compute correct total for a typical French order', () => {
    // Scénario réel : 2 capteurs à 199.99 EUR + livraison France
    const subtotal = 19999 * 2; // 399.98 EUR
    const country = { shipping_cents: 990, tax_rate_pct: '20.00', customs_cents: 0, is_blocked: false };
    const result = computeShippingAndTax(subtotal, country);
    // Tax: 39998 * 20 / 100 = 7999.6 → 8000
    assert.equal(result.taxCents, 8000);
    // Total: 39998 + 990 + 8000 = 48988
    assert.equal(result.totalCents, 48988);
  });

  test('should never produce negative totals', () => {
    const country = { shipping_cents: 0, tax_rate_pct: '0', customs_cents: 0, is_blocked: false };
    const result = computeShippingAndTax(0, country);
    assert.ok(result.totalCents >= 0);
  });
});

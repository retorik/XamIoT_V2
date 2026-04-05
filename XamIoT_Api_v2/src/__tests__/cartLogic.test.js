// src/__tests__/cartLogic.test.js
// Tests unitaires de la logique panier (cartTotal, cartCount, addToCart)
// Réplique les fonctions pures de XamIoT_Site_v2/lib/cart.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Réplication des fonctions pures du panier
function cartTotal(items) {
  return items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);
}

function cartCount(items) {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

function addToCart(cart, item, quantity = 1) {
  const copy = cart.map(c => ({ ...c }));
  const existing = copy.find(c => c.product_id === item.product_id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    copy.push({ ...item, quantity });
  }
  return copy;
}

function updateQuantity(cart, productId, quantity) {
  if (quantity <= 0) {
    return cart.filter(c => c.product_id !== productId);
  }
  return cart.map(c => c.product_id === productId ? { ...c, quantity } : { ...c });
}

function removeFromCart(cart, productId) {
  return cart.filter(c => c.product_id !== productId);
}

const PRODUCT_A = { product_id: 'aaa', slug: 'capteur-a', name: 'Capteur A', price_cents: 19999, image_url: null };
const PRODUCT_B = { product_id: 'bbb', slug: 'capteur-b', name: 'Capteur B', price_cents: 29999, image_url: null };

describe('cartTotal', () => {
  test('should return 0 for empty cart', () => {
    assert.equal(cartTotal([]), 0);
  });

  test('should compute total for single item', () => {
    const items = [{ ...PRODUCT_A, quantity: 1 }];
    assert.equal(cartTotal(items), 19999);
  });

  test('should multiply by quantity', () => {
    const items = [{ ...PRODUCT_A, quantity: 3 }];
    assert.equal(cartTotal(items), 59997);
  });

  test('should sum multiple items', () => {
    const items = [
      { ...PRODUCT_A, quantity: 2 },
      { ...PRODUCT_B, quantity: 1 },
    ];
    assert.equal(cartTotal(items), 19999 * 2 + 29999);
  });
});

describe('cartCount', () => {
  test('should return 0 for empty cart', () => {
    assert.equal(cartCount([]), 0);
  });

  test('should count quantities not items', () => {
    const items = [
      { ...PRODUCT_A, quantity: 2 },
      { ...PRODUCT_B, quantity: 3 },
    ];
    assert.equal(cartCount(items), 5);
  });
});

describe('addToCart', () => {
  test('should add new product to empty cart', () => {
    const cart = addToCart([], PRODUCT_A, 1);
    assert.equal(cart.length, 1);
    assert.equal(cart[0].product_id, 'aaa');
    assert.equal(cart[0].quantity, 1);
  });

  test('should increment quantity when product already in cart', () => {
    const cart = [{ ...PRODUCT_A, quantity: 1 }];
    const updated = addToCart(cart, PRODUCT_A, 2);
    assert.equal(updated.length, 1);
    assert.equal(updated[0].quantity, 3);
  });

  test('should add different product without touching existing', () => {
    const cart = [{ ...PRODUCT_A, quantity: 1 }];
    const updated = addToCart(cart, PRODUCT_B, 1);
    assert.equal(updated.length, 2);
    assert.equal(updated[0].quantity, 1);
    assert.equal(updated[1].product_id, 'bbb');
  });

  test('should not mutate original cart', () => {
    const cart = [{ ...PRODUCT_A, quantity: 1 }];
    addToCart(cart, PRODUCT_A, 1);
    assert.equal(cart[0].quantity, 1); // inchangé
  });
});

describe('updateQuantity', () => {
  test('should update quantity of existing item', () => {
    const cart = [{ ...PRODUCT_A, quantity: 1 }];
    const updated = updateQuantity(cart, 'aaa', 5);
    assert.equal(updated[0].quantity, 5);
  });

  test('should remove item when quantity is 0', () => {
    const cart = [{ ...PRODUCT_A, quantity: 1 }];
    const updated = updateQuantity(cart, 'aaa', 0);
    assert.equal(updated.length, 0);
  });

  test('should remove item when quantity is negative', () => {
    const cart = [{ ...PRODUCT_A, quantity: 1 }];
    const updated = updateQuantity(cart, 'aaa', -1);
    assert.equal(updated.length, 0);
  });
});

describe('removeFromCart', () => {
  test('should remove item by product_id', () => {
    const cart = [{ ...PRODUCT_A, quantity: 1 }, { ...PRODUCT_B, quantity: 2 }];
    const updated = removeFromCart(cart, 'aaa');
    assert.equal(updated.length, 1);
    assert.equal(updated[0].product_id, 'bbb');
  });

  test('should return empty array when removing last item', () => {
    const cart = [{ ...PRODUCT_A, quantity: 1 }];
    const updated = removeFromCart(cart, 'aaa');
    assert.equal(updated.length, 0);
  });

  test('should do nothing when product_id not found', () => {
    const cart = [{ ...PRODUCT_A, quantity: 1 }];
    const updated = removeFromCart(cart, 'zzz');
    assert.equal(updated.length, 1);
  });
});

describe('Non-régression : scénario commande type', () => {
  test('should handle full cart workflow correctly', () => {
    let cart = [];
    // Ajouter 2 capteurs A
    cart = addToCart(cart, PRODUCT_A, 2);
    // Ajouter 1 capteur B
    cart = addToCart(cart, PRODUCT_B, 1);
    assert.equal(cartCount(cart), 3);
    assert.equal(cartTotal(cart), 19999 * 2 + 29999);

    // Modifier quantité B à 3
    cart = updateQuantity(cart, 'bbb', 3);
    assert.equal(cartCount(cart), 5);
    assert.equal(cartTotal(cart), 19999 * 2 + 29999 * 3);

    // Supprimer A
    cart = removeFromCart(cart, 'aaa');
    assert.equal(cartCount(cart), 3);
    assert.equal(cartTotal(cart), 29999 * 3);
  });
});

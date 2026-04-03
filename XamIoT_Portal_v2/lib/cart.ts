'use client';

export interface CartItem {
  product_id: string;
  slug: string;
  name: string;
  price_cents: number;
  quantity: number;
  image_url?: string | null;
}

const CART_KEY = 'xamiot_cart';

export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
}

export function saveCart(items: CartItem[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function addToCart(item: Omit<CartItem, 'quantity'> & { quantity?: number }): void {
  const cart = getCart();
  const existing = cart.find(i => i.product_id === item.product_id);
  if (existing) {
    existing.quantity += item.quantity ?? 1;
  } else {
    cart.push({ ...item, quantity: item.quantity ?? 1 });
  }
  saveCart(cart);
}

export function removeFromCart(product_id: string): void {
  saveCart(getCart().filter(i => i.product_id !== product_id));
}

export function clearCart(): void {
  localStorage.removeItem(CART_KEY);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);
}

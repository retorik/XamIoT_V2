// lib/cart.ts — Panier côté client (localStorage)

export interface CartItem {
  product_id: string;
  slug: string;
  name: string;
  price_cents: number;
  quantity: number;
  image_url: string | null;
}

const STORAGE_KEY = 'xamiot_cart';

export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('cart-updated'));
}

export function addToCart(item: Omit<CartItem, 'quantity'>, quantity = 1) {
  const cart = getCart();
  const existing = cart.find(c => c.product_id === item.product_id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ ...item, quantity });
  }
  saveCart(cart);
}

export function updateQuantity(productId: string, quantity: number) {
  const cart = getCart();
  const item = cart.find(c => c.product_id === productId);
  if (item) {
    if (quantity <= 0) {
      saveCart(cart.filter(c => c.product_id !== productId));
    } else {
      item.quantity = quantity;
      saveCart(cart);
    }
  }
}

export function removeFromCart(productId: string) {
  saveCart(getCart().filter(c => c.product_id !== productId));
}

export function clearCart() {
  saveCart([]);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

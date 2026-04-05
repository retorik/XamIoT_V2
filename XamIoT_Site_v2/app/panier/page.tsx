'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCart, updateQuantity, removeFromCart, cartTotal, CartItem } from '@/lib/cart';
import { isAuthenticated } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';
const fmtEur = (c: number) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export default function PanierPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setItems(getCart());
    setMounted(true);
    const handler = () => setItems(getCart());
    window.addEventListener('cart-updated', handler);
    return () => window.removeEventListener('cart-updated', handler);
  }, []);

  if (!mounted) return null;

  if (!items.length) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Votre panier est vide</h1>
        <Link href="/boutique" className="text-blue-600 hover:underline">Continuer mes achats</Link>
      </div>
    );
  }

  const total = cartTotal(items);
  const loggedIn = isAuthenticated();

  function handleCheckout() {
    if (!loggedIn) {
      localStorage.setItem('xamiot_checkout_pending', '1');
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Mon panier</h1>

      <div className="space-y-4 mb-8">
        {items.map(item => (
          <div key={item.product_id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
            {item.image_url ? (
              <img src={`${API_BASE}${item.image_url}`} alt={item.name}
                className="w-16 h-16 object-cover rounded" />
            ) : (
              <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-2xl">📦</div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{item.name}</div>
              <div className="text-sm text-gray-500">{fmtEur(item.price_cents)} / unité</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                className="w-8 h-8 rounded border border-gray-300 flex items-center justify-center text-lg hover:bg-gray-100">
                −
              </button>
              <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
              <button onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                className="w-8 h-8 rounded border border-gray-300 flex items-center justify-center text-lg hover:bg-gray-100">
                +
              </button>
            </div>
            <div className="w-24 text-right font-medium text-sm">{fmtEur(item.price_cents * item.quantity)}</div>
            <button onClick={() => removeFromCart(item.product_id)}
              className="text-red-400 hover:text-red-600 text-lg" title="Supprimer">✕</button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg mb-6">
        <span className="font-medium">Sous-total</span>
        <span className="text-xl font-bold">{fmtEur(total)}</span>
      </div>
      <p className="text-xs text-gray-500 mb-4">Frais de port et taxes calculés à l'étape suivante.</p>

      <div className="flex gap-3">
        <Link href="/boutique" className="flex-1 py-3 text-center rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 transition">
          Continuer mes achats
        </Link>
        <Link href={loggedIn ? '/checkout' : '/compte'}
          onClick={handleCheckout}
          className="flex-1 py-3 text-center rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition">
          {loggedIn ? 'Passer commande' : 'Se connecter pour commander'}
        </Link>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCart, saveCart, removeFromCart, cartTotal, CartItem } from '@/lib/cart';

function fmtPrice(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

export default function PanierPage() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => { setItems(getCart()); }, []);

  function updateQty(product_id: string, qty: number) {
    if (qty < 1) return remove(product_id);
    const updated = items.map(i => i.product_id === product_id ? { ...i, quantity: qty } : i);
    setItems(updated);
    saveCart(updated);
  }

  function remove(product_id: string) {
    removeFromCart(product_id);
    setItems(getCart());
  }

  const total = cartTotal(items);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-8">Mon panier</h1>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg mb-4">Votre panier est vide.</p>
          <Link href="/boutique" className="bg-brand-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-brand-700 transition-colors">
            Voir la boutique
          </Link>
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
            {items.map((item, idx) => (
              <div key={item.product_id} className={`flex items-center gap-4 p-4 ${idx < items.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    : <span className="text-2xl">📦</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-sm text-gray-500">{fmtPrice(item.price_cents)} / unité</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(item.product_id, item.quantity - 1)}
                    className="w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center">−</button>
                  <span className="w-6 text-center font-medium">{item.quantity}</span>
                  <button onClick={() => updateQty(item.product_id, item.quantity + 1)}
                    className="w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center">+</button>
                </div>
                <p className="font-semibold text-gray-900 w-20 text-right">{fmtPrice(item.price_cents * item.quantity)}</p>
                <button onClick={() => remove(item.product_id)}
                  className="text-gray-400 hover:text-red-500 transition-colors ml-2">✕</button>
              </div>
            ))}
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
            <div className="flex justify-between text-lg font-bold mb-6">
              <span>Total</span>
              <span>{fmtPrice(total)}</span>
            </div>
            <Link href="/commande"
              className="w-full block text-center bg-brand-600 text-white py-3 rounded-lg font-semibold hover:bg-brand-700 transition-colors">
              Passer la commande
            </Link>
            <Link href="/boutique" className="w-full block text-center mt-3 text-sm text-gray-500 hover:text-gray-700">
              ← Continuer mes achats
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

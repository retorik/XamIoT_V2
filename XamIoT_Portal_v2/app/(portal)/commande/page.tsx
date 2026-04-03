'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCart, cartTotal, clearCart, CartItem } from '@/lib/cart';
import { getToken, getUser } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';

function fmtPrice(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

export default function CommandePage() {
  const router = useRouter();
  const [items, setItems]     = useState<CartItem[]>([]);
  const [email, setEmail]     = useState('');
  const [name, setName]       = useState('');
  const [address, setAddress] = useState({ line1: '', city: '', postal_code: '', country: 'FR' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    const cart = getCart();
    if (!cart.length) { router.push('/boutique'); return; }
    setItems(cart);
    const user = getUser();
    if (user?.email) setEmail(user.email);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!items.length) return;
    setLoading(true); setError(null);

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/public/checkout/create-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
          email, full_name: name, address,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Erreur lors de la commande');

      if (data.error === 'stripe_not_configured') {
        // Mode démo sans Stripe : aller directement à la confirmation
        clearCart();
        router.push(`/commande/confirmation?order_id=${data.order_id}&demo=1`);
        return;
      }

      // Stripe configuré — rediriger vers confirmation avec client_secret
      clearCart();
      router.push(`/commande/confirmation?order_id=${data.order_id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const total = cartTotal(items);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-8">Finaliser la commande</h1>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
            <input value={address.line1} onChange={e => setAddress(a => ({ ...a, line1: e.target.value }))}
              placeholder="Numéro et rue"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <div className="grid grid-cols-2 gap-2">
              <input value={address.postal_code} onChange={e => setAddress(a => ({ ...a, postal_code: e.target.value }))}
                placeholder="Code postal"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <input value={address.city} onChange={e => setAddress(a => ({ ...a, city: e.target.value }))}
                placeholder="Ville"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            💳 Le paiement sécurisé par Stripe sera disponible prochainement. En mode démo, la commande est enregistrée sans paiement réel.
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-brand-600 text-white py-3 rounded-lg font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50">
            {loading ? 'Traitement…' : `Commander — ${fmtPrice(total)}`}
          </button>
        </form>

        {/* Récap */}
        <div className="lg:col-span-2">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 sticky top-20">
            <h2 className="font-semibold text-gray-800 mb-4">Récapitulatif</h2>
            <div className="space-y-3 mb-4">
              {items.map(i => (
                <div key={i.product_id} className="flex justify-between text-sm">
                  <span className="text-gray-700">{i.name} <span className="text-gray-400">×{i.quantity}</span></span>
                  <span className="font-medium">{fmtPrice(i.price_cents * i.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 pt-3 flex justify-between font-bold">
              <span>Total</span>
              <span>{fmtPrice(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

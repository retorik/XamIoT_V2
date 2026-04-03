'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { addToCart } from '@/lib/cart';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';

interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  compare_price_cents: number | null;
  price_eur: number;
  compare_price_eur: number | null;
  stock_qty: number;
  featured_media_url: string | null;
  category_name: string | null;
}

function fmtPrice(eur: number) {
  return eur.toFixed(2).replace('.', ',') + ' €';
}

export default function BoutiquePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [added, setAdded]       = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/public/products?lang=fr`)
      .then(r => r.json())
      .then(setProducts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleAdd(p: Product) {
    addToCart({ product_id: p.id, slug: p.slug, name: p.name, price_cents: p.price_cents, image_url: p.featured_media_url ? `${API_BASE}${p.featured_media_url}` : null });
    setAdded(p.id);
    setTimeout(() => setAdded(null), 1500);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Boutique</h1>
        <Link href="/panier" className="text-sm text-brand-600 font-medium hover:underline">
          🛒 Voir le panier
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400">Chargement…</p>
      ) : products.length === 0 ? (
        <p className="text-gray-400">Aucun produit disponible.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map(p => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              {p.featured_media_url ? (
                <img src={`${API_BASE}${p.featured_media_url}`} alt={p.name}
                  className="w-full h-44 object-cover" />
              ) : (
                <div className="w-full h-44 bg-gray-100 flex items-center justify-center text-4xl">📦</div>
              )}
              <div className="p-4">
                {p.category_name && (
                  <span className="text-xs text-brand-600 font-medium uppercase tracking-wide">{p.category_name}</span>
                )}
                <h2 className="font-semibold text-gray-900 mt-1 mb-2">{p.name}</h2>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-lg font-bold text-gray-900">{fmtPrice(p.price_eur)}</span>
                  {p.compare_price_eur && p.compare_price_eur > p.price_eur && (
                    <span className="text-sm text-gray-400 line-through">{fmtPrice(p.compare_price_eur)}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link href={`/boutique/${p.slug}`}
                    className="flex-1 text-center text-sm py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
                    Détails
                  </Link>
                  <button
                    onClick={() => handleAdd(p)}
                    disabled={p.stock_qty === 0}
                    className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${
                      p.stock_qty === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                      added === p.id ? 'bg-green-500 text-white' : 'bg-brand-600 text-white hover:bg-brand-700'
                    }`}
                  >
                    {p.stock_qty === 0 ? 'Épuisé' : added === p.id ? '✓ Ajouté' : '+ Panier'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

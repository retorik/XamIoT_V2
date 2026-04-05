'use client';

import { useState } from 'react';
import { addToCart } from '@/lib/cart';
import Link from 'next/link';

interface Props {
  product: {
    product_id: string;
    slug: string;
    name: string;
    price_cents: number;
    image_url: string | null;
  };
}

export default function AddToCartButton({ product }: Props) {
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="space-y-3">
      <button onClick={handleAdd}
        className={`w-full py-3.5 rounded-xl text-base font-semibold transition ${
          added
            ? 'bg-green-600 text-white'
            : 'bg-brand-600 text-white hover:bg-brand-700'
        }`}>
        {added ? '✓ Ajouté au panier' : 'Ajouter au panier'}
      </button>
      {added && (
        <Link href="/panier"
          className="block w-full py-3 rounded-xl border border-brand-300 text-brand-700 text-center text-sm font-medium hover:bg-brand-50 transition">
          Voir le panier
        </Link>
      )}
    </div>
  );
}

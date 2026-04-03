'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';

function fmtPrice(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

function ConfirmationContent() {
  const params   = useSearchParams();
  const orderId  = params.get('order_id');
  const isDemo   = params.get('demo') === '1';
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    if (!orderId) return;
    fetch(`${API_BASE}/public/orders/${orderId}`)
      .then(r => r.json())
      .then(setOrder)
      .catch(console.error);
  }, [orderId]);

  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <span className="text-3xl">✓</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Commande confirmée !</h1>
      {isDemo && (
        <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
          Mode démonstration — aucun paiement n'a été encaissé.
        </p>
      )}
      {order ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-left mt-6">
          <p className="text-sm text-gray-500 mb-4">Commande <code className="text-xs bg-gray-100 px-1 rounded">{orderId?.slice(0, 8)}…</code></p>
          <div className="space-y-2 mb-4">
            {order.items?.map((i: any, idx: number) => (
              <div key={idx} className="flex justify-between text-sm">
                <span>{i.name} × {i.quantity}</span>
                <span className="font-medium">{fmtPrice(i.unit_price_cents * i.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-3 flex justify-between font-bold">
            <span>Total</span>
            <span>{fmtPrice(order.total_cents)}</span>
          </div>
          <p className="text-xs text-gray-400 mt-3">Confirmation envoyée à {order.email}</p>
        </div>
      ) : orderId ? (
        <p className="text-gray-400 text-sm mt-4">Chargement du récapitulatif…</p>
      ) : null}

      <Link href="/dashboard" className="inline-block mt-8 bg-brand-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-brand-700 transition-colors">
        Retour au dashboard
      </Link>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-gray-400">Chargement…</div>}>
      <ConfirmationContent />
    </Suspense>
  );
}

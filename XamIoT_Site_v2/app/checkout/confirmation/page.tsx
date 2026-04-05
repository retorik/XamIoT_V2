'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';

function ConfirmationContent() {
  const params = useSearchParams();
  const orderId = params.get('order');

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="text-5xl mb-4">✓</div>
      <h1 className="text-2xl font-bold mb-2">Commande confirmée</h1>
      {orderId && (
        <p className="text-gray-500 text-sm mb-2">Référence : {orderId.substring(0, 8).toUpperCase()}</p>
      )}
      <p className="text-gray-600 mb-8">Vous recevrez un email de confirmation à l'adresse indiquée.</p>
      <Link href="/boutique"
        className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">
        Retour à la boutique
      </Link>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="text-center py-16">Chargement...</div>}>
      <ConfirmationContent />
    </Suspense>
  );
}

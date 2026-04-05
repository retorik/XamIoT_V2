'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function ActivationContent() {
  const params = useSearchParams();
  const status = params.get('status');
  const success = status === 'success';

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className={`text-5xl mb-6 ${success ? 'text-green-500' : 'text-red-500'}`}>
        {success ? '✓' : '✕'}
      </div>
      <h1 className="text-2xl font-bold mb-3">
        {success ? 'Compte activé !' : 'Lien invalide ou expiré'}
      </h1>
      <p className="text-gray-500 mb-8">
        {success
          ? 'Votre adresse email a été confirmée. Vous pouvez maintenant vous connecter.'
          : 'Ce lien d\'activation est invalide ou a expiré. Essayez de vous connecter — si votre compte est actif, vous pourrez accéder à votre panier.'}
      </p>
      <Link
        href="/compte"
        className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
      >
        {success ? 'Se connecter' : 'Aller à la page de connexion'}
      </Link>
    </div>
  );
}

export default function ActivationResultPage() {
  return (
    <Suspense>
      <ActivationContent />
    </Suspense>
  );
}

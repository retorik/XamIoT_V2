'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AccountStatus({ lang = 'fr' }: { lang?: string }) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const check = () => setConnected(!!localStorage.getItem('xamiot_token'));

    check();

    // Écoute les changements depuis d'autres onglets
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'xamiot_token') setConnected(!!e.newValue);
    };
    window.addEventListener('storage', onStorage);

    // Polling pour détecter les changements dans le même onglet (login/logout)
    const interval = setInterval(check, 2000);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(interval);
    };
  }, []);

  if (connected) {
    return (
      <Link
        href="/compte"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-green-600 hover:text-green-700 transition-colors"
      >
        {lang === 'fr' ? 'Mon compte' : lang === 'es' ? 'Mi cuenta' : 'My account'}
        <span className="inline-block w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Connecté" />
      </Link>
    );
  }

  return (
    <Link
      href="/compte"
      className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors"
    >
      {lang === 'fr' ? 'Mon compte' : lang === 'es' ? 'Mi cuenta' : 'My account'}
    </Link>
  );
}

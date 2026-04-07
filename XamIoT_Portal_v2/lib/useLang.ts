'use client';

import { useState, useEffect } from 'react';

export type Lang = 'fr' | 'en' | 'es';

function readLangCookie(): Lang {
  if (typeof document === 'undefined') return 'fr';
  const m = document.cookie.match(/(?:^|;\s*)lang=([^;]+)/);
  const v = m?.[1];
  return (['fr', 'en', 'es'] as Lang[]).includes(v as Lang) ? (v as Lang) : 'fr';
}

export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>('fr');
  useEffect(() => {
    setLang(readLangCookie());
    const handler = () => setLang(readLangCookie());
    window.addEventListener('langchange', handler);
    return () => window.removeEventListener('langchange', handler);
  }, []);
  return lang;
}

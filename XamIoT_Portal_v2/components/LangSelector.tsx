'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LANG_LABELS } from '@/lib/lang';

const LANGS = ['fr', 'en', 'es'] as const;
type Lang = typeof LANGS[number];

interface Props {
  currentLang: Lang;
  dropUp?: boolean;
  large?: boolean;
}

export default function LangSelector({ currentLang, dropUp = true, large = false }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function selectLang(lang: Lang) {
    document.cookie = `lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    setOpen(false);
    window.dispatchEvent(new Event('langchange'));
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-4 rounded-xl border border-slate-200 bg-white shadow-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition ${large ? 'py-2.5 text-sm gap-2' : 'w-full py-2 text-xs gap-1'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {LANG_LABELS[currentLang]}
        <svg className={`transition-transform ${large ? 'w-4 h-4' : 'w-3 h-3 ml-auto'} ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <ul role="listbox" className={`absolute ${large ? 'right-0 w-32' : 'left-0 w-24'} bg-white border border-slate-200 rounded-lg shadow-md z-20 py-1 ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
            {LANGS.map(lang => (
              <li key={lang}>
                <button
                  role="option"
                  aria-selected={lang === currentLang}
                  onClick={() => selectLang(lang)}
                  className={`w-full text-left px-3 font-medium transition hover:bg-slate-50 ${large ? 'py-2 text-sm' : 'py-1.5 text-xs'} ${lang === currentLang ? 'text-brand-600' : 'text-slate-700'}`}
                >
                  {LANG_LABELS[lang]}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LANG_LABELS } from '@/lib/lang';

const LANGS = ['fr', 'en', 'es'] as const;
type Lang = typeof LANGS[number];

interface Props {
  currentLang: Lang;
}

export default function LangSelector({ currentLang }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function selectLang(lang: Lang) {
    document.cookie = `lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-brand-600 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {LANG_LABELS[currentLang]}
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <ul
            role="listbox"
            className="absolute right-0 mt-1 w-16 bg-white border border-gray-200 rounded-md shadow-md z-20 py-1"
          >
            {LANGS.map((lang) => (
              <li key={lang}>
                <button
                  role="option"
                  aria-selected={lang === currentLang}
                  onClick={() => selectLang(lang)}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors hover:bg-gray-50 ${
                    lang === currentLang ? 'text-brand-600' : 'text-gray-700'
                  }`}
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

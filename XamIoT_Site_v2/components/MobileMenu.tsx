'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LangSelector from '@/components/LangSelector';
import AccountStatus from '@/components/AccountStatus';

interface MenuItem {
  id: string;
  slug: string;
  title: string;
  menu_label: string | null;
}

interface Props {
  menuItems: MenuItem[];
  lang: string;
  portalUrl: string;
}

export default function MobileMenu({ menuItems, lang, portalUrl }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  const shopLabel = lang === 'es' ? 'Tienda' : lang === 'en' ? 'Shop' : 'Boutique';

  return (
    <>
      {/* Hamburger button — visible < md only */}
      <button
        className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Menu"
        onClick={() => setOpen(true)}
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay + Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <aside className="relative z-10 ml-auto flex flex-col w-72 max-w-[85vw] bg-white h-full shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="font-bold text-gray-900">Menu</span>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                aria-label="Fermer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {menuItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/${item.slug}`}
                  className="flex items-center px-3 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-brand-600 transition-colors"
                >
                  {item.menu_label ?? item.title}
                </Link>
              ))}
              <Link
                href="/boutique"
                className="flex items-center px-3 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-brand-600 transition-colors"
              >
                {shopLabel}
              </Link>
              <a
                href={`${portalUrl}/support`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center px-3 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-brand-600 transition-colors"
              >
                Support
              </a>
              <Link
                href="/panier"
                className="flex items-center px-3 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-brand-600 transition-colors"
              >
                {lang === 'fr' ? 'Panier' : lang === 'es' ? 'Carrito' : 'Cart'}
              </Link>
              <div className="px-3 py-3">
                <AccountStatus lang={lang} />
              </div>
            </nav>

            {/* Lang selector */}
            <div className="border-t border-gray-100 px-5 py-4">
              <LangSelector currentLang={lang as 'fr' | 'en' | 'es'} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

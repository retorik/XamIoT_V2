import Link from 'next/link';
import { cookies } from 'next/headers';
import { getMenuItems, getSiteConfig } from '@/lib/api';
import { getLang } from '@/lib/lang';
import LangSelector from '@/components/LangSelector';

export default async function Header() {
  const lang = getLang(cookies());
  const [menuItems, siteConfig] = await Promise.all([
    getMenuItems(lang),
    getSiteConfig(),
  ]);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {siteConfig.logo_url ? (
            <img
              src={siteConfig.logo_url}
              alt={siteConfig.site_name || 'XamIoT'}
              height={siteConfig.logo_height ?? 40}
              style={{ height: siteConfig.logo_height ?? 40 }}
              className="object-contain"
            />
          ) : (
            <span className="font-bold text-xl text-brand-700">{siteConfig.site_name || 'XamIoT'}</span>
          )}
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {menuItems.map((item) => (
            <Link
              key={item.id}
              href={`/${item.slug}`}
              className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors"
            >
              {item.menu_label || item.title}
            </Link>
          ))}
          <Link href="/boutique" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">
            {lang === 'fr' ? 'Boutique' : lang === 'es' ? 'Tienda' : 'Shop'}
          </Link>
          <a
            href={`${process.env.NEXT_PUBLIC_PORTAL_URL || 'https://xamcli.holiceo.com'}/support`}
            className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Support
          </a>
          <a
            href={process.env.NEXT_PUBLIC_PORTAL_URL || 'https://xamcli.holiceo.com'}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors"
          >
            Mon espace
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <LangSelector currentLang={lang} />
          {siteConfig.appstore_url && (
            <a
              href={siteConfig.appstore_url}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-brand-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              {siteConfig.nav_appstore_logo ? (
                <img src={siteConfig.nav_appstore_logo} alt="App Store" style={{ height: 24 }} className="object-contain" />
              ) : (
                'App Store'
              )}
            </a>
          )}
          {siteConfig.googleplay_url && (
            <a
              href={siteConfig.googleplay_url}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-brand-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              {siteConfig.nav_googleplay_logo ? (
                <img src={siteConfig.nav_googleplay_logo} alt="Google Play" style={{ height: 24 }} className="object-contain" />
              ) : (
                'Google Play'
              )}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

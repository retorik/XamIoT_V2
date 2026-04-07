import Link from 'next/link';
import { cookies } from 'next/headers';
import { getFooterItems } from '@/lib/api';
import { getLang } from '@/lib/lang';

export default async function Footer() {
  const lang = getLang(cookies());
  const year = new Date().getFullYear();
  const items = await getFooterItems(lang);

  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-gray-500">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <p>© {year} XamIoT. Tous droits réservés.</p>
          {items.length > 0 && (
            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              {items.map(item => (
                <Link key={item.id} href={`/${item.slug}`} className="hover:text-brand-600 transition-colors">
                  {item.menu_label || item.title}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>
    </footer>
  );
}

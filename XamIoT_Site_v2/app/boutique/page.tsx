import { cookies } from 'next/headers';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getProducts, getSiteConfig } from '@/lib/api';
import { getLang } from '@/lib/lang';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig();
  return {
    title: `Boutique | ${cfg.site_name}`,
    description: 'Commandez vos capteurs XamIoT — surveillance acoustique intelligente.',
  };
}

function fmtPrice(eur: number) {
  return eur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default async function BoutiquePage() {
  const lang = getLang(cookies());
  const products = await getProducts(lang);

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Boutique</h1>
        <p className="text-gray-500 mt-2">
          {lang === 'fr' && 'Découvrez nos capteurs XamIoT et accessoires.'}
          {lang === 'en' && 'Discover our XamIoT sensors and accessories.'}
          {lang === 'es' && 'Descubra nuestros sensores XamIoT y accesorios.'}
        </p>
      </div>

      {/* Grille produits */}
      {products.length === 0 ? (
        <p className="text-gray-400 text-center py-16">
          {lang === 'fr' && 'Aucun produit disponible pour le moment.'}
          {lang === 'en' && 'No products available at the moment.'}
          {lang === 'es' && 'No hay productos disponibles por el momento.'}
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map(p => (
            <Link
              key={p.id}
              href={`/boutique/${p.slug}`}
              className="group bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-brand-200 transition"
            >
              {p.featured_media_url ? (
                <img
                  src={`${API_BASE}${p.featured_media_url}`}
                  alt={p.featured_media_alt || p.name}
                  className="w-full h-48 object-cover"
                />
              ) : (
                <div className="w-full h-48 bg-gray-50 flex items-center justify-center">
                  <svg className="w-16 h-16 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              )}
              <div className="p-5">
                {p.category_name && (
                  <span className="text-xs text-brand-600 font-semibold uppercase tracking-wide">{p.category_name}</span>
                )}
                <h2 className="font-semibold text-gray-900 mt-1 mb-2 group-hover:text-brand-700 transition">{p.name}</h2>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-gray-900">{fmtPrice(p.price_eur)}</span>
                  {p.compare_price_eur && p.compare_price_eur > p.price_eur && (
                    <span className="text-sm text-gray-400 line-through">{fmtPrice(p.compare_price_eur)}</span>
                  )}
                </div>
                {p.stock_qty === 0 && (
                  <span className="mt-2 inline-block text-xs text-red-500 font-medium">
                    {lang === 'fr' ? 'Épuisé' : lang === 'en' ? 'Out of stock' : 'Agotado'}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

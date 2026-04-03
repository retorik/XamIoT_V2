import { cookies } from 'next/headers';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getProducts, getSiteConfig } from '@/lib/api';
import { getLang } from '@/lib/lang';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://xamcli.holiceo.com';

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

const ACCOUNT_NOTICE: Record<string, { title: string; body: string; cta: string; register: string }> = {
  fr: {
    title: 'Un compte confirmé est requis pour commander',
    body: 'Créez votre compte XamIoT gratuitement. Une fois votre e-mail confirmé, vous pouvez passer commande depuis votre espace client — et utiliser les applications iOS et Android.',
    cta: 'Commander depuis mon espace client',
    register: 'Créer un compte',
  },
  en: {
    title: 'A confirmed account is required to place an order',
    body: 'Create your XamIoT account for free. Once your email is confirmed, you can order from your client portal — and use the iOS and Android apps.',
    cta: 'Order from my client portal',
    register: 'Create an account',
  },
  es: {
    title: 'Se requiere una cuenta confirmada para realizar un pedido',
    body: 'Crea tu cuenta XamIoT gratis. Una vez confirmado tu correo, puedes hacer pedidos desde tu área de cliente — y usar las apps iOS y Android.',
    cta: 'Pedir desde mi área de cliente',
    register: 'Crear una cuenta',
  },
};

export default async function BoutiquePage() {
  const lang = getLang(cookies());
  const products = await getProducts(lang);
  const notice = ACCOUNT_NOTICE[lang] ?? ACCOUNT_NOTICE.fr;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Titre */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Boutique</h1>
        <p className="text-gray-500 mt-2">
          {lang === 'fr' && 'Découvrez nos capteurs XamIoT et accessoires.'}
          {lang === 'en' && 'Discover our XamIoT sensors and accessories.'}
          {lang === 'es' && 'Descubra nuestros sensores XamIoT y accesorios.'}
        </p>
      </div>

      {/* Bandeau compte obligatoire */}
      <div className="mb-10 rounded-2xl bg-brand-50 border border-brand-100 px-6 py-5 flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="flex-1">
          <p className="font-semibold text-brand-800 text-sm mb-1">{notice.title}</p>
          <p className="text-brand-700 text-sm">{notice.body}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
          <a
            href={`${PORTAL_URL}/login`}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition whitespace-nowrap"
          >
            {notice.cta}
          </a>
          <a
            href={`${PORTAL_URL}/register`}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-brand-300 text-brand-700 text-sm font-medium hover:bg-brand-100 transition whitespace-nowrap"
          >
            {notice.register}
          </a>
        </div>
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
                {p.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{p.description}</p>
                )}
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

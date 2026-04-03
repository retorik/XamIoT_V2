import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProductBySlug, getSiteConfig } from '@/lib/api';
import { getLang } from '@/lib/lang';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://xamcli.holiceo.com';

interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  price_eur: number;
  compare_price_eur: number | null;
  price_cents: number;
  stock_qty: number;
  is_physical: boolean;
  featured_media_url: string | null;
  featured_media_alt: string | null;
  category_name: string | null;
  images: { id: string; url_path: string; alt_text: string | null; sort_order: number }[];
}

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = getLang(cookies());
  const p = await getProductBySlug(params.slug, lang) as ProductDetail | null;
  if (!p) return {};
  const cfg = await getSiteConfig();
  return {
    title: p.seo_title || `${p.name} | ${cfg.site_name}`,
    description: p.seo_description || p.description || undefined,
  };
}

function fmtPrice(eur: number) {
  return eur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const ORDER_LABEL: Record<string, string> = {
  fr: 'Commander depuis mon espace client',
  en: 'Order from my client portal',
  es: 'Pedir desde mi área de cliente',
};
const BACK_LABEL: Record<string, string> = {
  fr: '← Retour à la boutique',
  en: '← Back to shop',
  es: '← Volver a la tienda',
};
const NOTICE_LABEL: Record<string, string> = {
  fr: 'Un compte confirmé est requis pour commander. La commande s\'effectue depuis votre espace client.',
  en: 'A confirmed account is required to place an order. Orders are placed from your client portal.',
  es: 'Se requiere una cuenta confirmada para realizar un pedido. Los pedidos se realizan desde el área de cliente.',
};
const STOCK_LABEL: Record<string, string> = {
  fr: 'Épuisé',
  en: 'Out of stock',
  es: 'Agotado',
};

export default async function ProductPage({ params }: Props) {
  const lang = getLang(cookies());
  const product = await getProductBySlug(params.slug, lang) as ProductDetail | null;
  if (!product) notFound();

  const allImages = [
    ...(product.featured_media_url ? [{ url_path: product.featured_media_url, alt_text: product.featured_media_alt }] : []),
    ...(product.images ?? []).filter(i => i.url_path !== product.featured_media_url),
  ];

  const inStock = product.stock_qty > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <Link href="/boutique" className="text-sm text-brand-600 hover:underline mb-8 inline-block">
        {BACK_LABEL[lang] ?? BACK_LABEL.fr}
      </Link>

      <div className="grid md:grid-cols-2 gap-12 mt-4">
        {/* Images */}
        <div>
          {allImages.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-2xl overflow-hidden bg-gray-50 aspect-square">
                <img
                  src={`${API_BASE}${allImages[0].url_path}`}
                  alt={allImages[0].alt_text || product.name}
                  className="w-full h-full object-contain"
                />
              </div>
              {allImages.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {allImages.slice(1).map((img, i) => (
                    <div key={i} className="w-20 h-20 rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                      <img
                        src={`${API_BASE}${img.url_path}`}
                        alt={img.alt_text || product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-gray-50 aspect-square flex items-center justify-center">
              <svg className="w-24 h-24 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          )}
        </div>

        {/* Infos */}
        <div className="flex flex-col">
          {product.category_name && (
            <span className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-2">{product.category_name}</span>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{product.name}</h1>

          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-3xl font-bold text-gray-900">{fmtPrice(product.price_eur)}</span>
            {product.compare_price_eur && product.compare_price_eur > product.price_eur && (
              <span className="text-lg text-gray-400 line-through">{fmtPrice(product.compare_price_eur)}</span>
            )}
          </div>

          {product.description && (
            <p className="text-gray-600 leading-relaxed mb-8 whitespace-pre-line">{product.description}</p>
          )}

          {/* Notice compte requis */}
          <div className="rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 text-sm text-brand-700 mb-6">
            {NOTICE_LABEL[lang] ?? NOTICE_LABEL.fr}
          </div>

          {inStock ? (
            <a
              href={`${PORTAL_URL}/boutique/${product.slug}`}
              className="inline-flex items-center justify-center w-full py-3.5 rounded-xl bg-brand-600 text-white text-base font-semibold hover:bg-brand-700 transition"
            >
              {ORDER_LABEL[lang] ?? ORDER_LABEL.fr}
            </a>
          ) : (
            <button disabled className="w-full py-3.5 rounded-xl bg-gray-100 text-gray-400 text-base font-semibold cursor-not-allowed">
              {STOCK_LABEL[lang] ?? STOCK_LABEL.fr}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

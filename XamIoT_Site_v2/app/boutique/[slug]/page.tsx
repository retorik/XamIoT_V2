import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProductBySlug, getSiteConfig } from '@/lib/api';
import { getLang } from '@/lib/lang';
import AddToCartButton from './AddToCartButton';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';

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

const BACK_LABEL: Record<string, string> = {
  fr: '← Retour à la boutique',
  en: '← Back to shop',
  es: '← Volver a la tienda',
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
    ...(product.images || []).filter(img => img.url_path !== product.featured_media_url),
  ];

  const inStock = product.stock_qty > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <Link href="/boutique" className="text-sm text-brand-600 hover:underline mb-6 inline-block">
        {BACK_LABEL[lang] ?? BACK_LABEL.fr}
      </Link>

      <div className="grid md:grid-cols-2 gap-10">
        {/* Images */}
        <div>
          {allImages.length > 0 ? (
            <div className="space-y-3">
              {allImages.map((img, i) => (
                <img
                  key={i}
                  src={`${API_BASE}${img.url_path}`}
                  alt={img.alt_text || product.name}
                  className="w-full rounded-2xl shadow-sm border border-gray-100 object-cover"
                />
              ))}
            </div>
          ) : (
            <div className="w-full aspect-square bg-gray-50 rounded-2xl flex items-center justify-center">
              <svg className="w-24 h-24 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          )}
        </div>

        {/* Détails */}
        <div>
          {product.category_name && (
            <span className="text-xs text-brand-600 font-semibold uppercase tracking-wide">
              {product.category_name}
            </span>
          )}
          <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-4">{product.name}</h1>

          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-3xl font-bold text-gray-900">{fmtPrice(product.price_eur)}</span>
            {product.compare_price_eur && product.compare_price_eur > product.price_eur && (
              <span className="text-lg text-gray-400 line-through">{fmtPrice(product.compare_price_eur)}</span>
            )}
          </div>

          {product.description && (
            <div className="prose prose-gray max-w-none text-gray-600 leading-relaxed mb-8"
              dangerouslySetInnerHTML={{ __html: product.description }} />
          )}

          {inStock ? (
            <AddToCartButton
              product={{
                product_id: product.id,
                slug: product.slug,
                name: product.name,
                price_cents: product.price_cents,
                image_url: product.featured_media_url,
              }}
              lang={lang}
            />
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

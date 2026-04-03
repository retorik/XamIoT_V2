import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getPageBySlug, getPages } from '@/lib/api';
import { getLang } from '@/lib/lang';
import type { Metadata } from 'next';
import Image from 'next/image';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';

interface Props {
  params: { slug: string };
}

export async function generateStaticParams() {
  const pages = await getPages();
  return pages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = getLang(cookies());
  const page = await getPageBySlug(params.slug, lang);
  if (!page) return {};
  return {
    title: page.seo_title || page.title,
    description: page.seo_description || undefined,
  };
}

export default async function CmsPage({ params }: Props) {
  const lang = getLang(cookies());
  const page = await getPageBySlug(params.slug, lang);

  if (!page) {
    notFound();
  }

  return (
    <article className="max-w-4xl mx-auto px-4 py-12">
      {page.featured_media_url && (
        <div className="relative w-full h-64 md:h-80 rounded-xl overflow-hidden mb-8">
          <Image
            src={`${API_BASE}${page.featured_media_url}`}
            alt={page.title}
            fill
            className="object-cover"
            priority
          />
        </div>
      )}

      <h1 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900">{page.title}</h1>

      {page.content ? (
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      ) : (
        <p className="text-gray-500">Contenu à venir.</p>
      )}
    </article>
  );
}

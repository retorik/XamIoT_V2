import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getPageBySlug, getSiteConfig } from '@/lib/api';
import { getLang } from '@/lib/lang';
import type { Metadata } from 'next';
import ContactForm from '@/components/ContactForm';

export async function generateMetadata(): Promise<Metadata> {
  const lang = getLang(cookies());
  const page = await getPageBySlug('contact', lang);
  if (!page) return {};
  return {
    title: page.seo_title || page.title,
    description: page.seo_description || undefined,
  };
}

export default async function ContactPage() {
  const lang = getLang(cookies());
  const page = await getPageBySlug('contact', lang);

  if (!page) notFound();

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl md:text-4xl font-bold mb-8 text-gray-900">{page.title}</h1>

      {/* Contenu avant le formulaire */}
      {page.content && (
        <div
          className="prose max-w-none mb-10"
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      )}

      {/* Formulaire de contact */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 md:p-8 mb-10">
        <ContactForm lang={lang} />
      </div>

      {/* Contenu après le formulaire */}
      {page.content_after && (
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: page.content_after }}
        />
      )}
    </article>
  );
}

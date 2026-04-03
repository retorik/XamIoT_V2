import { cookies } from 'next/headers';
import { getPageBySlug, getSiteConfig } from '@/lib/api';
import { getLang } from '@/lib/lang';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const lang = getLang(cookies());
  const page = await getPageBySlug('home', lang);
  return {
    title: page?.seo_title || page?.title || undefined,
    description: page?.seo_description || undefined,
  };
}

export default async function HomePage() {
  const lang = getLang(cookies());
  const [page, cfg] = await Promise.all([
    getPageBySlug('home', lang),
    getSiteConfig(),
  ]);

  if (page?.content) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      </div>
    );
  }

  /* Fallback hero si pas de contenu CMS */
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-900 to-brand-600 text-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">{cfg.site_name}</h1>
          <p className="text-xl text-blue-100 mb-8">
            Solution IoT intelligente pour la surveillance acoustique et l&apos;automatisation
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://apps.apple.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-white text-brand-700 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Télécharger sur App Store
            </a>
            <a
              href="https://play.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-brand-500 text-white font-semibold px-8 py-3 rounded-lg hover:bg-brand-400 transition-colors"
            >
              Télécharger sur Google Play
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10 text-gray-800">Fonctionnalités clés</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: 'Surveillance en temps réel', desc: 'Détection sonore intelligente via capteurs ESP32' },
              { title: 'Alertes instantanées', desc: 'Notifications push iOS et Android configurables' },
              { title: 'Historique complet', desc: 'Logs audio et analyses consultables depuis l\'app' },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-800 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

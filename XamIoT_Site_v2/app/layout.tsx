import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getSiteConfig } from '@/lib/api';
import { getLang } from '@/lib/lang';

const inter = Inter({ subsets: ['latin'] });

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';

async function getCustomCss(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/public/styles`, { cache: 'no-store' });
    if (!res.ok) return '';
    const data = await res.json();
    return data.css || '';
  } catch { return ''; }
}

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig();
  return {
    title: { default: cfg.site_name, template: `%s | ${cfg.site_name}` },
    description: 'Solution IoT intelligente pour la surveillance et l\'automatisation',
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://xamsite.holiceo.com'),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = getLang(cookies());
  const customCss = await getCustomCss();
  return (
    <html lang={lang}>
      <head>{customCss ? <style dangerouslySetInnerHTML={{ __html: customCss }} /> : null}</head>
      <body className={`${inter.className} min-h-screen flex flex-col bg-white text-gray-900`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

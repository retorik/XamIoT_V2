import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getSiteConfig } from '@/lib/api';
import { getLang } from '@/lib/lang';

const inter = Inter({ subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig();
  return {
    title: { default: cfg.site_name, template: `%s | ${cfg.site_name}` },
    description: 'Solution IoT intelligente pour la surveillance et l\'automatisation',
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://xamsite.holiceo.com'),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = getLang(cookies());
  return (
    <html lang={lang}>
      <body className={`${inter.className} min-h-screen flex flex-col bg-white text-gray-900`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { getLang } from '@/lib/lang';

export const metadata: Metadata = {
  title: 'XamIoT Portal',
  description: 'Portail client XamIoT — supervision de vos appareils',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = getLang(cookies());
  return (
    <html lang={lang}>
      <body className="antialiased">{children}</body>
    </html>
  );
}

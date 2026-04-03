import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'XamIoT Portal',
  description: 'Portail client XamIoT — supervision de vos appareils',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}

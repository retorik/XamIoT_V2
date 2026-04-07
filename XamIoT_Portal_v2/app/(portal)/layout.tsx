import { cookies } from 'next/headers';
import { getLang } from '@/lib/lang';
import Sidebar from '@/components/Sidebar';
import PortalProviders from '@/components/PortalProviders';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const lang = getLang(cookies());
  return (
    <PortalProviders>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar lang={lang} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto pt-14 md:pt-0 p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </PortalProviders>
  );
}

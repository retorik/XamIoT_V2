'use client';

import { PortalConfigProvider } from '@/lib/portalConfig';
import { useAutoLogout } from '@/lib/useAutoLogout';

function AutoLogoutGuard({ children }: { children: React.ReactNode }) {
  useAutoLogout();
  return <>{children}</>;
}

export default function PortalProviders({ children }: { children: React.ReactNode }) {
  return (
    <PortalConfigProvider>
      <AutoLogoutGuard>
        {children}
      </AutoLogoutGuard>
    </PortalConfigProvider>
  );
}

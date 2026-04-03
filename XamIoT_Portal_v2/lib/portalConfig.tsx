'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface PortalConfig {
  refresh_interval_sec: number;
  idle_timeout_sec: number;
  auto_logout_min: number;
}

const DEFAULTS: PortalConfig = {
  refresh_interval_sec: 60,
  idle_timeout_sec: 60,
  auto_logout_min: 30,
};

const PortalConfigContext = createContext<PortalConfig>(DEFAULTS);

export function usePortalConfig() {
  return useContext(PortalConfigContext);
}

export function PortalConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PortalConfig>(DEFAULTS);

  useEffect(() => {
    apiFetch<PortalConfig>('/portal-config')
      .then(setConfig)
      .catch(() => {}); // fallback sur DEFAULTS
  }, []);

  return (
    <PortalConfigContext.Provider value={config}>
      {children}
    </PortalConfigContext.Provider>
  );
}

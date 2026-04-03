'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { clearAuth } from '@/lib/auth';
import { usePortalConfig } from '@/lib/portalConfig';

/**
 * Déconnecte automatiquement l'utilisateur après X minutes d'inactivité.
 * La durée est configurée depuis le backoffice (portal_auto_logout_min).
 * Si la valeur est 0, l'auto-logout est désactivé.
 */
export function useAutoLogout() {
  const { auto_logout_min } = usePortalConfig();
  const router = useRouter();
  const lastActivity = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const markActive = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    if (!auto_logout_min || auto_logout_min <= 0) return;

    const timeoutMs = auto_logout_min * 60 * 1000;
    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'] as const;
    events.forEach(e => window.addEventListener(e, markActive, { passive: true }));

    timerRef.current = setInterval(() => {
      if (Date.now() - lastActivity.current >= timeoutMs) {
        clearAuth();
        router.push('/login?reason=idle');
      }
    }, 30_000); // vérifie toutes les 30s

    return () => {
      events.forEach(e => window.removeEventListener(e, markActive));
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [auto_logout_min, markActive, router]);
}

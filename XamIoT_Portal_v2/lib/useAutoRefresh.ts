'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * Auto-refresh hook : appelle `onRefresh` toutes les `intervalMs` ms
 * tant que l'utilisateur est actif (mouse, keyboard, touch, scroll).
 * Se met en pause après `idleTimeoutMs` ms sans activité.
 */
export function useAutoRefresh(
  onRefresh: () => void,
  intervalMs = 60_000,
  idleTimeoutMs = 60_000,
) {
  const lastActivity = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const markActive = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'] as const;
    events.forEach(e => window.addEventListener(e, markActive, { passive: true }));

    intervalRef.current = setInterval(() => {
      if (Date.now() - lastActivity.current < idleTimeoutMs) {
        onRefresh();
      }
    }, intervalMs);

    return () => {
      events.forEach(e => window.removeEventListener(e, markActive));
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [onRefresh, intervalMs, idleTimeoutMs, markActive]);
}

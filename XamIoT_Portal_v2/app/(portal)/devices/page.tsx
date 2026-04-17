'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useLang } from '@/lib/useLang';

interface EspDevice {
  id: string;
  esp_uid: string;
  name: string;
  last_seen: string | null;
  last_db: number | null;
  sound_history: number[];
  is_simulated: boolean;
}

interface MobileDevice {
  id: string;
  name: string;
  platform: 'ios' | 'android';
  is_active: boolean;
  last_seen: string | null;
  model: string | null;
  os_version: string | null;
  app_version: string | null;
  app_build_number: number | null;
}

const T = {
  fr: {
    title: 'Mes appareils', subtitle: 'Vos capteurs et appareils XamIoT',
    section_iot: 'Capteurs IoT', section_mobile: 'Applications mobiles',
    last_activity: 'Dernière activité :',
    empty: 'Aucun appareil associé à votre compte.',
    empty_sub: "Ajoutez un appareil depuis l'application mobile XamIoT.",
    error: 'Impossible de charger vos appareils.',
    demo_badge: 'Démo',
    no_data: 'Aucune donnée',
  },
  en: {
    title: 'My devices', subtitle: 'Your XamIoT sensors and devices',
    section_iot: 'IoT sensors', section_mobile: 'Mobile apps',
    last_activity: 'Last activity:',
    empty: 'No device linked to your account.',
    empty_sub: 'Add a device from the XamIoT mobile app.',
    error: 'Unable to load your devices.',
    demo_badge: 'Demo',
    no_data: 'No data',
  },
  es: {
    title: 'Mis dispositivos', subtitle: 'Sus sensores y dispositivos XamIoT',
    section_iot: 'Sensores IoT', section_mobile: 'Aplicaciones móviles',
    last_activity: 'Última actividad:',
    empty: 'Ningún dispositivo asociado a su cuenta.',
    empty_sub: 'Añada un dispositivo desde la aplicación móvil XamIoT.',
    error: 'No se pueden cargar sus dispositivos.',
    demo_badge: 'Demo',
    no_data: 'Sin datos',
  },
};

function MiniSparkline({ data }: { data: number[] }) {
  if (!data || data.length === 0) return <span className="text-slate-300 text-xs">—</span>;
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-px h-8 w-full">
      {data.map((v, i) => {
        const h = Math.max(2, (v / max) * 100);
        const hue = Math.max(0, 120 - (v / 100) * 120);
        return <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, minWidth: 2, backgroundColor: `hsl(${hue},75%,50%)` }} title={`${v}%`} />;
      })}
    </div>
  );
}

function LevelBadge({ level }: { level: number | null }) {
  if (level === null) return <span className="text-slate-400 text-sm">—</span>;
  const color =
    level >= 80 ? 'bg-red-100 text-red-700 border-red-200' :
    level >= 60 ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-green-100 text-green-700 border-green-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold ${color}`}>
      {level}%
    </span>
  );
}

export default function DevicesPage() {
  const lang = useLang();
  const t = T[lang];
  const dateLocale = lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'fr-FR';

  const [devices, setDevices] = useState<EspDevice[]>([]);
  const [mobiles, setMobiles] = useState<MobileDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<EspDevice[]>('/esp-devices'),
      apiFetch<MobileDevice[]>('/devices'),
    ])
      .then(([espList, mobileList]) => { setDevices(espList); setMobiles(mobileList); })
      .catch(() => setError(t.error))
      .finally(() => setLoading(false));
  }, [t.error]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.subtitle}</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {devices.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{t.section_iot}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mb-10">
            {devices.map((d) => (
              <Link key={d.id} href={`/devices/${d.id}`}
                className={`group bg-white rounded-xl border p-5 hover:shadow-md transition ${d.is_simulated ? 'border-violet-200 hover:border-violet-400' : 'border-slate-200 hover:border-brand-300'}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${d.is_simulated ? 'bg-violet-50' : 'bg-brand-50'}`}>
                      <svg className={`w-5 h-5 ${d.is_simulated ? 'text-violet-500' : 'text-brand-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        {d.is_simulated
                          ? <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15a2.25 2.25 0 01-.659 1.591l-1.591 1.591a2.25 2.25 0 01-1.591.659H7.757a2.25 2.25 0 01-1.591-.659l-1.591-1.591A2.25 2.25 0 014 15m15.8 0H4" />
                          : <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.008v.008H12V20zm3.889-4.596a5.5 5.5 0 00-7.778 0M12 12a3 3 0 110-6 3 3 0 010 6z" />
                        }
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 text-sm">{d.name || d.esp_uid}</p>
                        {d.is_simulated && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200">
                            {t.demo_badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">{d.esp_uid}</p>
                    </div>
                  </div>
                  <LevelBadge level={d.last_db} />
                </div>
                <MiniSparkline data={d.sound_history} />
                {d.last_seen ? (
                  <p className="text-xs text-slate-400 mt-2">
                    {t.last_activity} {new Date(d.last_seen).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                ) : d.is_simulated ? (
                  <p className="text-xs text-violet-400 mt-2">{t.no_data}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </>
      )}

      {mobiles.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{t.section_mobile}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {mobiles.map(m => (
              <div key={m.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${m.platform === 'ios' ? 'bg-slate-900' : 'bg-green-50'}`}>
                  {m.platform === 'ios' ? (
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  ) : (
                    <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.341a.75.75 0 01-.75-.75V8.25a.75.75 0 011.5 0v6.341a.75.75 0 01-.75.75zM6.477 15.341a.75.75 0 01-.75-.75V8.25a.75.75 0 011.5 0v6.341a.75.75 0 01-.75.75z"/></svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 text-sm truncate">{m.name || (m.platform === 'ios' ? 'iPhone' : 'Android')}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{[m.model, m.os_version].filter(Boolean).join(' · ') || m.platform}</p>
                  {(m.app_version || m.app_build_number) && (
                    <p className="text-xs text-slate-500 mt-0.5">v{m.app_version ?? '—'}{m.app_build_number ? ` (${m.app_build_number})` : ''}</p>
                  )}
                </div>
                <span className={`flex-shrink-0 w-2 h-2 rounded-full ${m.is_active ? 'bg-green-400' : 'bg-slate-300'}`} />
              </div>
            ))}
          </div>
        </>
      )}

      {devices.length === 0 && mobiles.length === 0 && !error && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">{t.empty}</p>
          <p className="text-xs mt-2">{t.empty_sub}</p>
        </div>
      )}
    </div>
  );
}

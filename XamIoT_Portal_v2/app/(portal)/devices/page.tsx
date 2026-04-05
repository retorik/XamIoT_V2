'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface EspDevice {
  id: string;
  esp_uid: string;
  name: string;
  last_seen: string | null;
  last_db: number | null;
  sound_history: number[];
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
  const [devices, setDevices] = useState<EspDevice[]>([]);
  const [mobiles, setMobiles] = useState<MobileDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<EspDevice[]>('/esp-devices'),
      apiFetch<MobileDevice[]>('/devices'),
    ])
      .then(([espList, mobileList]) => {
        setDevices(espList);
        setMobiles(mobileList);
      })
      .catch(() => setError('Impossible de charger vos appareils.'))
      .finally(() => setLoading(false));
  }, []);

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
        <h1 className="text-2xl font-bold text-slate-900">Mes appareils</h1>
        <p className="text-slate-500 text-sm mt-1">Vos capteurs et appareils XamIoT</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Capteurs IoT */}
      {devices.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Capteurs IoT</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mb-10">
            {devices.map((d) => (
              <Link
                key={d.id}
                href={`/devices/${d.id}`}
                className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-brand-300 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.008v.008H12V20zm3.889-4.596a5.5 5.5 0 00-7.778 0M12 12a3 3 0 110-6 3 3 0 010 6z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{d.name || d.esp_uid}</p>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">{d.esp_uid}</p>
                    </div>
                  </div>
                  <LevelBadge level={d.last_db} />
                </div>
                <MiniSparkline data={d.sound_history} />
                {d.last_seen && (
                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(d.last_seen).toLocaleString('fr-FR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Appareils mobiles */}
      {mobiles.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Applications mobiles</h2>
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
                  <p className="text-xs text-slate-400 mt-0.5">
                    {[m.model, m.os_version].filter(Boolean).join(' · ') || m.platform}
                  </p>
                  {(m.app_version || m.app_build_number) && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      v{m.app_version ?? '—'}{m.app_build_number ? ` (${m.app_build_number})` : ''}
                    </p>
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
          <p className="text-sm">Aucun appareil associé à votre compte.</p>
          <p className="text-xs mt-2">Ajoutez un appareil depuis l&apos;application mobile XamIoT.</p>
        </div>
      )}
    </div>
  );
}

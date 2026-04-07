'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useLang } from '@/lib/useLang';

interface Device { id: string; esp_uid: string; name: string; }

interface AlertLog {
  id: string;
  rule_id: number;
  esp_id: string;
  sent_at: string;
  channel: string;
  status: string;
  payload: Record<string, unknown> | null;
  error: string | null;
}

const T = {
  fr: {
    title: 'Historique des alertes', subtitle: 'Toutes les alertes déclenchées sur vos appareils',
    device: 'Appareil', all: 'Tous', since: 'Depuis le', filter: 'Filtrer',
    search: 'Recherche', search_ph: 'Rechercher…',
    col_date: 'Date', col_device: 'Appareil', col_channel: 'Canal', col_status: 'Statut', col_details: 'Détails',
    empty: 'Aucune alerte trouvée.',
    count: (n: number) => `${n} alerte${n > 1 ? 's' : ''} affichée${n > 1 ? 's' : ''}`,
    error: 'Impossible de charger les données.',
  },
  en: {
    title: 'Alert history', subtitle: 'All alerts triggered on your devices',
    device: 'Device', all: 'All', since: 'Since', filter: 'Filter',
    search: 'Search', search_ph: 'Search…',
    col_date: 'Date', col_device: 'Device', col_channel: 'Channel', col_status: 'Status', col_details: 'Details',
    empty: 'No alerts found.',
    count: (n: number) => `${n} alert${n > 1 ? 's' : ''} shown`,
    error: 'Unable to load data.',
  },
  es: {
    title: 'Historial de alertas', subtitle: 'Todas las alertas activadas en sus dispositivos',
    device: 'Dispositivo', all: 'Todos', since: 'Desde', filter: 'Filtrar',
    search: 'Buscar', search_ph: 'Buscar…',
    col_date: 'Fecha', col_device: 'Dispositivo', col_channel: 'Canal', col_status: 'Estado', col_details: 'Detalles',
    empty: 'No se encontraron alertas.',
    count: (n: number) => `${n} alerta${n > 1 ? 's' : ''} mostrada${n > 1 ? 's' : ''}`,
    error: 'No se pueden cargar los datos.',
  },
};

export default function AlertesPage() {
  const lang = useLang();
  const t = T[lang];
  const dateLocale = lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'fr-FR';

  const [devices, setDevices] = useState<Device[]>([]);
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterDevice, setFilterDevice] = useState('');
  const [filterSince, setFilterSince] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch<Device[]>('/esp-devices')
      .then(devs => { setDevices(devs); return loadAlerts('', ''); })
      .catch(() => setError(t.error))
      .finally(() => setLoading(false));
  }, [t.error]);

  async function loadAlerts(espId: string, since: string) {
    const params = new URLSearchParams({ limit: '200' });
    if (espId) params.set('esp_id', espId);
    if (since) params.set('since', since);
    try {
      const data = await apiFetch<AlertLog[]>(`/esp-alerts?${params}`);
      setAlerts(data);
    } catch {
      setAlerts([]);
    }
  }

  function handleFilter() {
    setLoading(true);
    loadAlerts(filterDevice, filterSince).finally(() => setLoading(false));
  }

  const filtered = search
    ? alerts.filter(a => {
        const s = search.toLowerCase();
        const dev = devices.find(d => d.id === a.esp_id);
        return (
          (dev?.name || '').toLowerCase().includes(s) ||
          (dev?.esp_uid || '').toLowerCase().includes(s) ||
          a.channel.toLowerCase().includes(s) ||
          a.status.toLowerCase().includes(s) ||
          JSON.stringify(a.payload || {}).toLowerCase().includes(s)
        );
      })
    : alerts;

  function deviceName(espId: string) {
    const d = devices.find(d => d.id === espId);
    return d?.name || d?.esp_uid || espId;
  }

  const statusColor = (s: string) => {
    if (s === 'sent' || s === 'delivered') return 'bg-green-100 text-green-700';
    if (s === 'failed' || s === 'error') return 'bg-red-100 text-red-700';
    return 'bg-slate-100 text-slate-700';
  };

  if (loading && alerts.length === 0) {
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

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">{t.device}</label>
          <select value={filterDevice} onChange={e => setFilterDevice(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm min-w-[160px]">
            <option value="">{t.all}</option>
            {devices.map(d => <option key={d.id} value={d.id}>{d.name || d.esp_uid}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{t.since}</label>
          <input type="date" value={filterSince} onChange={e => setFilterSince(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <button onClick={handleFilter} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg">
          {t.filter}
        </button>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-slate-500 mb-1">{t.search}</label>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t.search_ph} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">{t.empty}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{t.col_date}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{t.col_device}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{t.col_channel}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{t.col_status}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{t.col_details}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {new Date(a.sent_at).toLocaleString(dateLocale, {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{deviceName(a.esp_id)}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{a.channel}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(a.status)}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[250px] truncate" title={a.error || JSON.stringify(a.payload)}>
                      {a.error || (a.payload ? JSON.stringify(a.payload).slice(0, 60) : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-3">{t.count(filtered.length)}</p>
    </div>
  );
}

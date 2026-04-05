'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, downloadFile } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';

type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded';

interface OrderLog {
  event_type: string;
  status_from: string | null;
  status_to: string | null;
  tracking_number: string | null;
  carrier: string | null;
  note: string | null;
  created_at: string;
}

interface Order {
  id: string;
  status: OrderStatus;
  total_cents: number;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  tracking_number: string | null;
  carrier: string | null;
  item_count: number;
}

interface OrderDetail extends Order {
  email: string;
  full_name: string | null;
  address_line1: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  stripe_payment_status: string | null;
  items: { id: string; name: string; sku: string; quantity: number; unit_price_cents: number; total_cents: number }[];
  logs: OrderLog[];
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending:    'En attente',
  paid:       'Payée',
  processing: 'En préparation',
  shipped:    'Expédiée',
  delivered:  'Livrée',
  completed:  'Terminée',
  cancelled:  'Annulée',
  refunded:   'Remboursée',
};

const STATUS_CLASS: Record<OrderStatus, string> = {
  pending:    'bg-slate-100 text-slate-600',
  paid:       'bg-blue-100 text-blue-700',
  processing: 'bg-purple-100 text-purple-700',
  shipped:    'bg-cyan-100 text-cyan-700',
  delivered:  'bg-green-100 text-green-700',
  completed:  'bg-emerald-100 text-emerald-700',
  cancelled:  'bg-slate-100 text-slate-500',
  refunded:   'bg-red-100 text-red-600',
};

// Étapes du fil d'ariane
const STATUS_STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'pending',    label: 'Commandé' },
  { key: 'paid',       label: 'Payé' },
  { key: 'processing', label: 'Préparation' },
  { key: 'shipped',    label: 'Expédié' },
  { key: 'delivered',  label: 'Livré' },
  { key: 'completed',  label: 'Terminé' },
];

const STEP_COLORS: Record<OrderStatus, string> = {
  pending: '#f59e0b', paid: '#2563eb', processing: '#7c3aed',
  shipped: '#0891b2', delivered: '#16a34a', completed: '#15803d',
  cancelled: '#6b7280', refunded: '#dc2626',
};

function stepDate(order: Order | OrderDetail, key: OrderStatus): string | null {
  const map: Partial<Record<OrderStatus, string | null>> = {
    pending: order.created_at,
    paid: order.paid_at,
    shipped: order.shipped_at,
    delivered: order.delivered_at,
    completed: order.completed_at,
  };
  return map[key] ?? null;
}

function fmtPrice(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const TRACKING_URLS: Record<string, string> = {
  colissimo:    'https://www.laposte.fr/particuliers/outils/suivre-vos-envois?code={n}',
  chronopost:   'https://www.chronopost.fr/tracking-no-cms/suivi-colis?listeNumerosLT={n}',
  dhl:          'https://www.dhl.com/fr-fr/home/tracking.html?tracking-id={n}',
  ups:          'https://www.ups.com/track?loc=fr_FR&tracknum={n}',
  fedex:        'https://www.fedex.com/apps/fedextrack/?action=track&trackingnumber={n}',
  dpd:          'https://trace.dpd.fr/fr/trace/{n}',
  gls:          'https://gls-group.eu/track/{n}',
  mondialrelay: 'https://www.mondialrelay.fr/suivi-de-colis/?Expedition={n}',
};

function getTrackingUrl(carrier: string | null, number: string | null): string | null {
  if (!carrier || !number || !TRACKING_URLS[carrier]) return null;
  return TRACKING_URLS[carrier].replace('{n}', encodeURIComponent(number));
}

// Fil d'ariane compact pour la liste
function OrderStepperCompact({ order }: { order: Order }) {
  const isCancelledOrRefunded = order.status === 'cancelled' || order.status === 'refunded';
  const currentIdx = STATUS_STEPS.findIndex(s => s.key === order.status);

  if (isCancelledOrRefunded) {
    return (
      <p className="text-xs text-slate-400 mt-1">
        {STATUS_LABEL[order.status]}{order.cancelled_at ? ` — ${fmtDateShort(order.cancelled_at)}` : ''}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-0 mt-2 overflow-x-auto">
      {STATUS_STEPS.map((step, idx) => {
        const done    = idx < currentIdx;
        const current = idx === currentIdx;
        const color   = STEP_COLORS[step.key];

        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                style={{
                  width: current ? 20 : 16,
                  height: current ? 20 : 16,
                  borderRadius: '50%',
                  background: done ? '#16a34a' : current ? color : '#e5e7eb',
                  color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700,
                  boxShadow: current ? `0 0 0 3px ${color}25` : 'none',
                  flexShrink: 0,
                }}
              >
                {done ? '✓' : idx + 1}
              </div>
              <span style={{ fontSize: 8, color: done ? '#16a34a' : current ? color : '#9ca3af', fontWeight: current ? 700 : 400, marginTop: 2, whiteSpace: 'nowrap' }}>
                {step.label}
              </span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: idx < currentIdx ? '#16a34a' : '#e5e7eb', minWidth: 4, marginBottom: 10 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Fil d'ariane détaillé pour la modale
function OrderStepperDetail({ order }: { order: Order | OrderDetail }) {
  const isCancelledOrRefunded = order.status === 'cancelled' || order.status === 'refunded';
  const currentIdx = STATUS_STEPS.findIndex(s => s.key === order.status);

  if (isCancelledOrRefunded) {
    return (
      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-500 text-center">
        Commande {STATUS_LABEL[order.status].toLowerCase()}
        {order.cancelled_at && <span className="ml-1 text-xs">— {fmtDate(order.cancelled_at)}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-0 overflow-x-auto py-2">
      {STATUS_STEPS.map((step, idx) => {
        const done    = idx < currentIdx;
        const current = idx === currentIdx;
        const color   = STEP_COLORS[step.key];
        const date    = stepDate(order, step.key);

        return (
          <div key={step.key} className="flex items-start flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                style={{
                  width: current ? 28 : 22,
                  height: current ? 28 : 22,
                  borderRadius: '50%',
                  background: done ? '#16a34a' : current ? color : '#e5e7eb',
                  color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: current ? 12 : 10, fontWeight: 700,
                  boxShadow: current ? `0 0 0 4px ${color}20` : 'none',
                  flexShrink: 0,
                }}
              >
                {done ? '✓' : idx + 1}
              </div>
              <span style={{ fontSize: 9, color: done ? '#16a34a' : current ? color : '#9ca3af', fontWeight: current ? 700 : 500, marginTop: 4, textAlign: 'center', whiteSpace: 'nowrap' }}>
                {step.label}
              </span>
              {date && (
                <span style={{ fontSize: 8, color: '#9ca3af', textAlign: 'center', marginTop: 1 }}>
                  {fmtDateShort(date)}
                </span>
              )}
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: idx < currentIdx ? '#16a34a' : '#e5e7eb', minWidth: 8, marginTop: current ? 13 : 10 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Journal d'événements
const EVENT_ICONS: Record<string, string> = {
  status_change:   '🔄',
  payment:         '💳',
  shipping_update: '🚚',
  note:            '📝',
};

function OrderTimeline({ logs }: { logs: OrderLog[] }) {
  if (!logs || logs.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Historique</h3>
      <div className="space-y-0">
        {logs.map((log, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center w-7 flex-shrink-0">
              <div className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-sm flex-shrink-0">
                {EVENT_ICONS[log.event_type] || '•'}
              </div>
              {i < logs.length - 1 && <div className="w-0.5 flex-1 bg-slate-100 mt-1 min-h-3" />}
            </div>
            <div className="pb-3 flex-1">
              <p className="text-xs font-medium text-slate-700">
                {log.status_from && log.status_to
                  ? `${STATUS_LABEL[log.status_from as OrderStatus] || log.status_from} → ${STATUS_LABEL[log.status_to as OrderStatus] || log.status_to}`
                  : log.event_type === 'shipping_update' ? 'Expédition mise à jour'
                  : log.event_type === 'note' ? 'Note'
                  : 'Événement'}
              </p>
              {log.tracking_number && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Suivi : <span className="font-mono">{log.tracking_number}</span>
                  {log.carrier && <span className="ml-1">({log.carrier})</span>}
                </p>
              )}
              {log.note && <p className="text-xs text-slate-400 mt-0.5">{log.note}</p>}
              <p className="text-xs text-slate-300 mt-1">{fmtDate(log.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CommandesPage() {
  const router = useRouter();
  const [orders, setOrders]           = useState<Order[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [detail, setDetail]           = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);
    setError('');
    try {
      setOrders(await apiFetch<Order[]>('/portal/orders'));
    } catch {
      setError('Impossible de charger vos commandes.');
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(order: Order) {
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await apiFetch<OrderDetail>(`/portal/orders/${order.id}`));
    } catch {
      setError('Impossible de charger le détail de la commande.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function downloadInvoice(order: Order | OrderDetail) {
    setDownloading(true);
    try {
      await downloadFile(`/portal/orders/${order.id}/invoice`, `facture-${order.id.slice(0, 8).toUpperCase()}.pdf`);
    } catch {
      setError('Impossible de télécharger la facture.');
    } finally {
      setDownloading(false);
    }
  }

  const tUrl = detail ? getTrackingUrl(detail.carrier, detail.tracking_number) : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Mes commandes</h1>
        <p className="text-slate-500 text-sm mt-1">Historique de vos achats</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <svg className="w-14 h-14 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
          </svg>
          <p className="text-sm font-medium text-slate-500">Aucune commande pour le moment</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <button
              key={order.id}
              onClick={() => openDetail(order)}
              className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-brand-300 hover:shadow-sm transition"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">#{order.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {fmtDate(order.created_at)} &middot; {order.item_count} article{order.item_count > 1 ? 's' : ''}
                  </p>
                  {/* Fil d'ariane compact */}
                  <OrderStepperCompact order={order} />
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 self-start">
                  <span className="text-base font-semibold text-slate-900">{fmtPrice(order.total_cents)}</span>
                  <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal détail commande */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* En-tête */}
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="flex items-start justify-between mb-1">
                <div>
                  {detail ? (
                    <>
                      <h2 className="font-bold text-slate-900 text-base">
                        Commande #{detail.id.slice(0, 8).toUpperCase()}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">{fmtDate(detail.created_at)}</p>
                    </>
                  ) : (
                    <h2 className="font-bold text-slate-900 text-base">Chargement…</h2>
                  )}
                </div>
                <button
                  onClick={() => setDetail(null)}
                  className="text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-100"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Fil d'ariane détaillé */}
              {detail && <OrderStepperDetail order={detail} />}
            </div>

            {/* Corps */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {detailLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                </div>
              ) : detail ? (
                <div className="space-y-5">
                  {/* N° de suivi */}
                  {detail.tracking_number && (
                    <div className="rounded-lg bg-cyan-50 border border-cyan-100 px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-cyan-700 mb-0.5">Numéro de suivi</p>
                        <p className="text-sm font-mono font-semibold text-cyan-800">
                          {detail.carrier && <span className="font-sans font-normal text-cyan-600 mr-1">{detail.carrier} —</span>}
                          {detail.tracking_number}
                        </p>
                      </div>
                      {tUrl && (
                        <a
                          href={tUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-700 transition"
                        >
                          Suivre ↗
                        </a>
                      )}
                    </div>
                  )}

                  {/* Articles */}
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Articles</h3>
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                      {detail.items.map(item => (
                        <div key={item.id} className="flex items-center justify-between px-4 py-3 bg-white">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                            {item.sku && <p className="text-xs text-slate-400 font-mono">{item.sku}</p>}
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0 ml-3">
                            <span className="text-xs text-slate-500">x{item.quantity}</span>
                            <span className="text-sm font-semibold text-slate-900 w-20 text-right">
                              {fmtPrice(item.total_cents)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-sm font-semibold text-slate-700">Total</span>
                    <span className="text-lg font-bold text-slate-900">{fmtPrice(detail.total_cents)}</span>
                  </div>

                  {/* Adresse de livraison */}
                  {(detail.address_line1 || detail.city) && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Livraison</h3>
                      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                        {detail.full_name && <p className="font-medium">{detail.full_name}</p>}
                        {detail.address_line1 && <p>{detail.address_line1}</p>}
                        {(detail.postal_code || detail.city) && <p>{[detail.postal_code, detail.city].filter(Boolean).join(' ')}</p>}
                        {detail.country && detail.country !== 'FR' && <p>{detail.country}</p>}
                      </div>
                    </div>
                  )}

                  {/* Historique */}
                  {detail.logs && detail.logs.length > 0 && (
                    <OrderTimeline logs={detail.logs} />
                  )}
                </div>
              ) : null}
            </div>

            {/* Pied */}
            <div className="border-t border-slate-100 px-6 py-4 flex gap-3">
              {(detail?.status === 'paid' || detail?.stripe_payment_status === 'succeeded') && (
                <button
                  onClick={() => detail && downloadInvoice(detail)}
                  disabled={downloading}
                  className="flex-1 py-2 text-sm font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition disabled:opacity-50"
                >
                  {downloading ? 'Téléchargement…' : 'Télécharger la facture PDF'}
                </button>
              )}
              <button
                onClick={() => setDetail(null)}
                className="flex-1 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

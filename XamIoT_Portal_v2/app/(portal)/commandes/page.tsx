'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';

type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled';

interface Order {
  id: string;
  status: OrderStatus;
  total_cents: number;
  created_at: string;
  paid_at: string | null;
  item_count: number;
}

interface OrderItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

interface OrderDetail extends Order {
  email: string;
  full_name: string | null;
  address_line1: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  stripe_payment_status: string | null;
  tracking_number: string | null;
  items: OrderItem[];
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending:   'En attente',
  paid:      'Payée',
  shipped:   'Expédiée',
  cancelled: 'Annulée',
};

const STATUS_CLASS: Record<OrderStatus, string> = {
  pending:   'bg-slate-100 text-slate-600',
  paid:      'bg-green-100 text-green-700',
  shipped:   'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-600',
};

function fmtPrice(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function CommandesPage() {
  const router = useRouter();
  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [detail, setDetail]         = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<Order[]>('/portal/orders');
      setOrders(data);
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
      const data = await apiFetch<OrderDetail>(`/portal/orders/${order.id}`);
      setDetail(data);
    } catch {
      setError('Impossible de charger le détail de la commande.');
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetail(null);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Mes commandes</h1>
        <p className="text-slate-500 text-sm mt-1">Historique de vos achats</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
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
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
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
            {/* En-tête modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
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
                onClick={closeDetail}
                className="text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Corps modal */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {detailLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                </div>
              ) : detail ? (
                <div className="space-y-5">
                  {/* Statut + infos */}
                  <div className="flex items-center gap-3">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${STATUS_CLASS[detail.status]}`}>
                      {STATUS_LABEL[detail.status]}
                    </span>
                    {detail.paid_at && (
                      <span className="text-xs text-slate-400">Payée le {fmtDate(detail.paid_at)}</span>
                    )}
                  </div>

                  {detail.tracking_number && (
                    <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
                      Numéro de suivi : <span className="font-mono font-semibold">{detail.tracking_number}</span>
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
                            {item.sku && (
                              <p className="text-xs text-slate-400 font-mono">{item.sku}</p>
                            )}
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
                        {(detail.postal_code || detail.city) && (
                          <p>{[detail.postal_code, detail.city].filter(Boolean).join(' ')}</p>
                        )}
                        {detail.country && detail.country !== 'FR' && <p>{detail.country}</p>}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Pied modal */}
            <div className="border-t border-slate-100 px-6 py-4">
              <button
                onClick={closeDetail}
                className="w-full py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
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

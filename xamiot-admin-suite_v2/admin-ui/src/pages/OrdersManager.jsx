import React, { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../api.js';

const STATUS_LABEL = {
  pending:    'En attente',
  paid:       'Payé',
  processing: 'En préparation',
  shipped:    'Expédié',
  delivered:  'Livré',
  completed:  'Terminé',
  cancelled:  'Annulé',
  refunded:   'Remboursé',
};
const STATUS_COLOR = {
  pending:    '#f59e0b',
  paid:       '#2563eb',
  processing: '#7c3aed',
  shipped:    '#0891b2',
  delivered:  '#16a34a',
  completed:  '#15803d',
  cancelled:  '#6b7280',
  refunded:   '#dc2626',
};
const STATUS_BG = {
  pending:    '#fef9c3',
  paid:       '#dbeafe',
  processing: '#ede9fe',
  shipped:    '#e0f2fe',
  delivered:  '#dcfce7',
  completed:  '#d1fae5',
  cancelled:  '#f3f4f6',
  refunded:   '#fee2e2',
};

// Étapes du fil d'ariane (ordre logique)
const STATUS_STEPS = [
  { key: 'pending',    label: 'Commandé' },
  { key: 'paid',       label: 'Paiement\nconfirmé' },
  { key: 'processing', label: 'En\npréparation' },
  { key: 'shipped',    label: 'Expédié' },
  { key: 'delivered',  label: 'Livré' },
  { key: 'completed',  label: 'Terminé' },
];

const STEP_INDEX = Object.fromEntries(STATUS_STEPS.map((s, i) => [s.key, i]));

const CARRIERS = [
  { key: '',             label: '— Transporteur —' },
  { key: 'colissimo',   label: 'Colissimo' },
  { key: 'chronopost',  label: 'Chronopost' },
  { key: 'dhl',         label: 'DHL' },
  { key: 'ups',         label: 'UPS' },
  { key: 'fedex',       label: 'FedEx' },
  { key: 'dpd',         label: 'DPD' },
  { key: 'gls',         label: 'GLS' },
  { key: 'mondialrelay',label: 'Mondial Relay' },
  { key: 'other',       label: 'Autre' },
];

const TRACKING_URLS = {
  colissimo:    'https://www.laposte.fr/particuliers/outils/suivre-vos-envois?code={n}',
  chronopost:   'https://www.chronopost.fr/tracking-no-cms/suivi-colis?listeNumerosLT={n}',
  dhl:          'https://www.dhl.com/fr-fr/home/tracking.html?tracking-id={n}',
  ups:          'https://www.ups.com/track?loc=fr_FR&tracknum={n}',
  fedex:        'https://www.fedex.com/apps/fedextrack/?action=track&trackingnumber={n}',
  dpd:          'https://trace.dpd.fr/fr/trace/{n}',
  gls:          'https://gls-group.eu/track/{n}',
  mondialrelay: 'https://www.mondialrelay.fr/suivi-de-colis/?Expedition={n}',
};

function trackingUrl(carrier, number) {
  if (!carrier || !number || !TRACKING_URLS[carrier]) return null;
  return TRACKING_URLS[carrier].replace('{n}', encodeURIComponent(number));
}

function fmtPrice(cents) {
  if (cents == null) return '—';
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}
function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDateShort(d) {
  if (!d) return null;
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Retourne le timestamp correspondant à un statut
function stepDate(order, key) {
  const map = { pending: order.created_at, paid: order.paid_at, shipped: order.shipped_at, delivered: order.delivered_at, completed: order.completed_at };
  return map[key] || null;
}

// Fil d'ariane horizontal
function OrderStepper({ order }) {
  const isCancelled = order.status === 'cancelled' || order.status === 'refunded';
  const currentIdx = STEP_INDEX[order.status] ?? -1;

  if (isCancelled) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 4px', marginTop: 2 }}>
        <span style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
          {STATUS_LABEL[order.status]}{order.cancelled_at ? ` — ${fmtDateShort(order.cancelled_at)}` : ''}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, padding: '8px 0 4px', overflowX: 'auto' }}>
      {STATUS_STEPS.map((step, idx) => {
        const done    = idx < currentIdx;
        const current = idx === currentIdx;
        const future  = idx > currentIdx;
        const date    = stepDate(order, step.key);

        const circleColor = done ? '#16a34a' : current ? STATUS_COLOR[order.status] || '#f59e0b' : '#d1d5db';
        const textColor   = done ? '#16a34a' : current ? STATUS_COLOR[order.status] || '#f59e0b' : '#9ca3af';
        const lineColor   = idx < currentIdx ? '#16a34a' : '#d1d5db';

        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', flex: '1 1 0', minWidth: 60 }}>
            {/* Point + label */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
              <div style={{
                width: current ? 22 : 18,
                height: current ? 22 : 18,
                borderRadius: '50%',
                background: circleColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff',
                fontSize: current ? 11 : 10,
                fontWeight: 700,
                boxShadow: current ? `0 0 0 3px ${circleColor}30` : 'none',
                transition: 'all 0.2s',
              }}>
                {done ? '✓' : idx + 1}
              </div>
              <div style={{
                fontSize: 9, color: textColor, fontWeight: current ? 700 : 400,
                textAlign: 'center', marginTop: 3, lineHeight: 1.2, whiteSpace: 'pre',
              }}>
                {step.label}
              </div>
              {date && (
                <div style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center', marginTop: 1 }}>
                  {fmtDateShort(date)}
                </div>
              )}
            </div>
            {/* Ligne de connexion */}
            {idx < STATUS_STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, background: lineColor,
                marginTop: current ? 10 : 8,
                transition: 'background 0.2s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Mini-dashboard comptage
function StatsDashboard({ stats }) {
  const allStatuses = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded'];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
      {allStatuses.map(s => {
        const count = stats[s] || 0;
        return (
          <div key={s} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '8px 14px', borderRadius: 10, minWidth: 80,
            background: count > 0 ? STATUS_BG[s] : '#f9fafb',
            border: `1.5px solid ${count > 0 ? STATUS_COLOR[s] + '40' : '#e5e7eb'}`,
          }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: count > 0 ? STATUS_COLOR[s] : '#d1d5db' }}>
              {count}
            </span>
            <span style={{ fontSize: 10, color: count > 0 ? STATUS_COLOR[s] : '#9ca3af', fontWeight: 600, textAlign: 'center', marginTop: 2 }}>
              {STATUS_LABEL[s]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Événement dans le journal de commande
const EVENT_ICONS = {
  status_change:   '🔄',
  payment:         '💳',
  shipping_update: '🚚',
  note:            '📝',
};
const EVENT_LABELS = {
  status_change:   'Changement de statut',
  payment:         'Paiement',
  shipping_update: 'Expédition mise à jour',
  note:            'Note',
};

function OrderTimeline({ logs }) {
  if (!logs || logs.length === 0) {
    return <p style={{ color: '#9ca3af', fontSize: 12, margin: '8px 0' }}>Aucun historique pour cette commande.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {logs.map((log, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, position: 'relative' }}>
          {/* Trait vertical */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: '#f3f4f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0,
            }}>
              {EVENT_ICONS[log.event_type] || '•'}
            </div>
            {i < logs.length - 1 && (
              <div style={{ width: 2, flex: 1, background: '#e5e7eb', minHeight: 12, marginTop: 2 }} />
            )}
          </div>
          <div style={{ paddingBottom: 12, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
              {EVENT_LABELS[log.event_type] || log.event_type}
              {log.status_from && log.status_to && (
                <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>
                  {STATUS_LABEL[log.status_from] || log.status_from} → <strong style={{ color: STATUS_COLOR[log.status_to] }}>{STATUS_LABEL[log.status_to] || log.status_to}</strong>
                </span>
              )}
            </div>
            {log.tracking_number && (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                Suivi : <code style={{ fontSize: 11 }}>{log.tracking_number}</code>
                {log.carrier && <span> ({log.carrier})</span>}
              </div>
            )}
            {log.note && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{log.note}</div>}
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
              {fmtDate(log.created_at)}{log.created_by_email ? ` — ${log.created_by_email}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OrdersManager({ embedded } = {}) {
  const [orders, setOrders]         = useState([]);
  const [stats, setStats]           = useState({});
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [detail, setDetail]         = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterQ, setFilterQ]           = useState('');
  const [msg, setMsg]               = useState(null);
  const [tracking, setTracking]     = useState('');
  const [carrier, setCarrier]       = useState('');
  const [newStatus, setNewStatus]   = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteInput, setDeleteInput]   = useState('');
  const [deleting, setDeleting]         = useState(false);
  const [detailTab, setDetailTab]       = useState('info'); // 'info' | 'timeline'

  const filterQRef = useRef(filterQ);
  filterQRef.current = filterQ;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterQRef.current.trim()) params.set('q', filterQRef.current.trim());
      const url = `/admin/orders${params.toString() ? '?' + params.toString() : ''}`;
      const [ordersData, statsData] = await Promise.all([
        apiFetch(url),
        apiFetch('/admin/orders/stats'),
      ]);
      setOrders(ordersData);
      setStats(statsData);
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally { setLoading(false); }
  }, [filterStatus]);

  // Status → rechargement immédiat
  useEffect(() => { load(); }, [load]);

  // Recherche texte → debounce 400ms
  const mountedQ = useRef(false);
  useEffect(() => {
    if (!mountedQ.current) { mountedQ.current = true; return; }
    const t = setTimeout(load, 400);
    return () => clearTimeout(t);
  }, [filterQ]);

  async function openDetail(order) {
    setSelected(order);
    setTracking(order.tracking_number || '');
    setCarrier(order.carrier || '');
    setNewStatus(order.status);
    setDetailTab('info');
    try {
      setDetail(await apiFetch(`/admin/orders/${order.id}`));
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  function openDeleteConfirm(order) {
    setDeleteTarget(order);
    setDeleteInput('');
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/admin/orders/${deleteTarget.id}`, { method: 'DELETE' });
      setMsg({ type: 'success', text: `Commande #${deleteTarget.id.slice(0, 8).toUpperCase()} supprimée.` });
      setDeleteTarget(null);
      setDeleteInput('');
      setSelected(null);
      setDetail(null);
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setDeleting(false);
    }
  }

  async function saveDetail() {
    if (!selected) return;
    try {
      await apiFetch(`/admin/orders/${selected.id}`, {
        method: 'PATCH',
        body: { status: newStatus, tracking_number: tracking || null, carrier: carrier || null },
      });
      setMsg({ type: 'success', text: 'Commande mise à jour.' });
      setSelected(null); setDetail(null);
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  const tUrl = trackingUrl(carrier || selected?.carrier, tracking || selected?.tracking_number);

  const content = (
    <>
      {/* Mini-dashboard */}
      <StatsDashboard stats={stats} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {!embedded && <h2 style={{ margin: 0, marginRight: 'auto' }}>Commandes</h2>}
        <input
          className="input"
          style={{ flex: '1 1 200px', minWidth: 160 }}
          value={filterQ}
          onChange={e => setFilterQ(e.target.value)}
          placeholder="Recherche email, nom, numéro…"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, flexShrink: 0 }}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, fontSize: 14,
          background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
          color:      msg.type === 'success' ? '#15803d' : '#b91c1c',
        }}>{msg.text}</div>
      )}

      {loading ? <p style={{ color: '#6b7280' }}>Chargement…</p> : orders.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Aucune commande{filterStatus ? ' pour ce statut' : ''}.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orders.map(o => (
            <div key={o.id} style={{
              border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff',
              overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              {/* Ligne principale */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 160px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{o.full_name || '—'}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.email}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{fmtDate(o.created_at)}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{fmtPrice(o.total_cents)}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>{o.item_count} art.</div>
                <span style={{
                  background: STATUS_BG[o.status] || '#f3f4f6',
                  color: STATUS_COLOR[o.status] || '#6b7280',
                  padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>
                  {STATUS_LABEL[o.status] || o.status}
                </span>
                {o.tracking_number && (
                  <span style={{ fontSize: 11, color: '#0891b2', fontFamily: 'monospace', flexShrink: 0 }}>
                    🚚 {o.carrier ? `${o.carrier} ` : ''}{o.tracking_number}
                  </span>
                )}
                <button onClick={() => openDetail(o)} style={{
                  background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6,
                  padding: '4px 12px', fontSize: 12, cursor: 'pointer', marginLeft: 'auto', flexShrink: 0,
                }}>
                  Gérer →
                </button>
              </div>
              {/* Fil d'ariane */}
              <div style={{ borderTop: '1px solid #f3f4f6', padding: '2px 14px 6px' }}>
                <OrderStepper order={o} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modale détail */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 0, maxWidth: 600, width: '95%', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Header modal */}
            <div style={{ padding: '16px 20px 0', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Commande #{selected.id.slice(0, 8).toUpperCase()}</h3>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{fmtDate(selected.created_at)}</div>
                </div>
                <button onClick={() => { setSelected(null); setDetail(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
              </div>
              {/* Fil d'ariane dans la modal */}
              <OrderStepper order={selected} />
              {/* Onglets */}
              <div style={{ display: 'flex', gap: 0, marginTop: 8 }}>
                {[{ key: 'info', label: 'Informations' }, { key: 'timeline', label: 'Historique' }].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '6px 14px', fontSize: 13, fontWeight: 500,
                    color: detailTab === t.key ? '#2563eb' : '#6b7280',
                    borderBottom: detailTab === t.key ? '2px solid #2563eb' : '2px solid transparent',
                    marginBottom: -1,
                  }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Corps modal */}
            <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
              {detailTab === 'info' ? (
                <>
                  <div style={{ fontSize: 13, marginBottom: 12 }}>
                    <div><strong>Client :</strong> {selected.full_name || '—'} ({selected.email})</div>
                    <div><strong>Total :</strong> {fmtPrice(selected.total_cents)}</div>
                    {selected.paid_at && <div><strong>Payé le :</strong> {fmtDate(selected.paid_at)}</div>}
                    {selected.shipped_at && <div><strong>Expédié le :</strong> {fmtDate(selected.shipped_at)}</div>}
                  </div>

                  {detail?.items && (
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 14 }}>
                      <thead>
                        <tr>
                          {['Produit', 'Qté', 'Prix unit.', 'Total'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map(i => (
                          <tr key={i.id}>
                            <td style={{ padding: '6px 8px' }}>{i.name}<br /><span style={{ fontSize: 11, color: '#9ca3af' }}>{i.sku}</span></td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>{i.quantity}</td>
                            <td style={{ padding: '6px 8px' }}>{fmtPrice(i.unit_price_cents)}</td>
                            <td style={{ padding: '6px 8px', fontWeight: 600 }}>{fmtPrice(i.total_cents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontWeight: 500, fontSize: 12, marginBottom: 4, color: '#374151' }}>Statut</label>
                      <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                        {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontWeight: 500, fontSize: 12, marginBottom: 4, color: '#374151' }}>Transporteur</label>
                      <select value={carrier} onChange={e => setCarrier(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                        {CARRIERS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontWeight: 500, fontSize: 12, marginBottom: 4, color: '#374151' }}>N° de suivi</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input value={tracking} onChange={e => setTracking(e.target.value)}
                          placeholder="ex: 1Z999AA1..."
                          style={{ flex: 1, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                        {tUrl && (
                          <a href={tUrl} target="_blank" rel="noopener noreferrer"
                            style={{ padding: '7px 10px', borderRadius: 6, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                            Suivre ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <OrderTimeline logs={detail?.logs} />
              )}
            </div>

            {/* Pied modal */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => openDeleteConfirm(selected)}
                style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff1f2', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
              >
                🗑 Supprimer
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setSelected(null); setDetail(null); }} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontSize: 13 }}>
                  Annuler
                </button>
                <button onClick={saveDetail} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modale confirmation suppression */}
      {deleteTarget && (() => {
        const orderNum = deleteTarget.id.slice(0, 8).toUpperCase();
        const canConfirm = deleteInput.trim().toUpperCase() === orderNum;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 440, width: '90%', border: '2px solid #fca5a5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 24 }}>⚠️</span>
                <h3 style={{ margin: 0, fontSize: 17, color: '#dc2626' }}>Suppression définitive</h3>
              </div>
              <p style={{ fontSize: 14, color: '#374151', marginBottom: 8 }}>
                Vous allez supprimer la commande <strong>#{orderNum}</strong> et tous ses articles.
              </p>
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                Client : {deleteTarget.email} — Montant : {fmtPrice(deleteTarget.total_cents)}
              </p>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Saisissez le numéro <strong>{orderNum}</strong> pour confirmer :
              </label>
              <input
                type="text"
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                placeholder={orderNum}
                autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '9px 12px', borderRadius: 6, fontSize: 15, fontFamily: 'monospace', letterSpacing: 2,
                  border: `2px solid ${canConfirm ? '#16a34a' : '#d1d5db'}`,
                  outline: 'none', marginBottom: 20, textTransform: 'uppercase',
                }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setDeleteTarget(null); setDeleteInput(''); }}
                  disabled={deleting}
                  style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontSize: 13 }}
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={!canConfirm || deleting}
                  style={{
                    padding: '8px 18px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
                    cursor: canConfirm && !deleting ? 'pointer' : 'not-allowed',
                    background: canConfirm ? '#dc2626' : '#fca5a5', color: '#fff',
                  }}
                >
                  {deleting ? 'Suppression…' : 'Supprimer définitivement'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );

  return embedded ? content : <div className="container">{content}</div>;
}

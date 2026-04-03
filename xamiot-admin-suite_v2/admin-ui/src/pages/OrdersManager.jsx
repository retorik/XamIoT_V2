import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

const STATUS_LABEL = {
  pending: 'En attente', paid: 'Payé', processing: 'En cours',
  shipped: 'Expédié', delivered: 'Livré', cancelled: 'Annulé', refunded: 'Remboursé',
};
const STATUS_COLOR = {
  pending: '#f59e0b', paid: '#2563eb', processing: '#7c3aed',
  shipped: '#0891b2', delivered: '#16a34a', cancelled: '#6b7280', refunded: '#dc2626',
};

function fmtPrice(cents) {
  if (cents == null) return '—';
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OrdersManager({ embedded } = {}) {
  const [orders, setOrders]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);
  const [detail, setDetail]           = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [msg, setMsg]                 = useState(null);
  const [tracking, setTracking]       = useState('');
  const [newStatus, setNewStatus]     = useState('');

  useEffect(() => { load(); }, [filterStatus]);

  async function load() {
    setLoading(true);
    try {
      const url = filterStatus ? `/admin/orders?status=${filterStatus}` : '/admin/orders';
      setOrders(await apiFetch(url));
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally { setLoading(false); }
  }

  async function openDetail(order) {
    setSelected(order);
    setTracking(order.tracking_number || '');
    setNewStatus(order.status);
    try {
      setDetail(await apiFetch(`/admin/orders/${order.id}`));
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  async function saveDetail() {
    if (!selected) return;
    try {
      await apiFetch(`/admin/orders/${selected.id}`, {
        method: 'PATCH',
        body: { status: newStatus, tracking_number: tracking || null },
      });
      setMsg({ type: 'success', text: 'Commande mise à jour.' });
      setSelected(null); setDetail(null);
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  const content = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        {!embedded && <h2 style={{ margin: 0 }}>Commandes</h2>}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
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
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              {['Date', 'Client', 'Montant', 'Articles', 'Statut', 'Paiement', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px', fontSize: 13, color: '#6b7280' }}>{fmtDate(o.created_at)}</td>
                <td style={{ padding: '10px' }}>
                  <div style={{ fontWeight: 500 }}>{o.full_name || '—'}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{o.email}</div>
                </td>
                <td style={{ padding: '10px', fontWeight: 600 }}>{fmtPrice(o.total_cents)}</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#6b7280' }}>{o.item_count}</td>
                <td style={{ padding: '10px' }}>
                  <span style={{ background: (STATUS_COLOR[o.status] || '#6b7280') + '20', color: STATUS_COLOR[o.status] || '#6b7280', padding: '3px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                    {STATUS_LABEL[o.status] || o.status}
                  </span>
                </td>
                <td style={{ padding: '10px', fontSize: 12, color: o.stripe_payment_status === 'succeeded' ? '#16a34a' : '#f59e0b' }}>
                  {o.stripe_payment_status || '—'}
                </td>
                <td style={{ padding: '10px' }}>
                  <button onClick={() => openDetail(o)} style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                    Détail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modale détail */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 560, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Commande #{selected.id.slice(0, 8)}</h3>
              <button onClick={() => { setSelected(null); setDetail(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
            </div>

            <div style={{ fontSize: 14, marginBottom: 16 }}>
              <div><strong>Client :</strong> {selected.full_name || '—'} ({selected.email})</div>
              <div><strong>Date :</strong> {fmtDate(selected.created_at)}</div>
              <div><strong>Total :</strong> {fmtPrice(selected.total_cents)}</div>
              {selected.paid_at && <div><strong>Payé le :</strong> {fmtDate(selected.paid_at)}</div>}
            </div>

            {detail?.items && (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 16 }}>
                <thead>
                  <tr>
                    {['Produit', 'Qté', 'Prix unit.', 'Total'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>{h}</th>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontWeight: 500, fontSize: 13, marginBottom: 4 }}>Statut</label>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 500, fontSize: 13, marginBottom: 4 }}>N° de suivi</label>
                <input value={tracking} onChange={e => setTracking(e.target.value)}
                  placeholder="ex: 1Z999AA1..."
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setSelected(null); setDetail(null); }} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontSize: 13 }}>
                Annuler
              </button>
              <button onClick={saveDetail} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return content;
  return <div className="container">{content}</div>;
}

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '../api.js';

const ACTION_COLORS = {
  ORDER_CREATED:        { background: '#dbeafe', color: '#1e40af' },
  CHECKOUT_CREATE:      { background: '#dbeafe', color: '#1e40af' },
  PAYMENT_SUCCEEDED:    { background: '#d1fae5', color: '#065f46' },
  PAYMENT_FAILED:       { background: '#fee2e2', color: '#991b1b' },
  WEBHOOK_SIG_FAIL:     { background: '#fef3c7', color: '#92400e' },
  ORDER_STATUS_UPDATE:  { background: '#ede9fe', color: '#5b21b6' },
};

const ACTION_LABELS = {
  ORDER_CREATED:       'Commande créée',
  CHECKOUT_CREATE:     'Commande créée',
  PAYMENT_SUCCEEDED:   'Paiement OK',
  PAYMENT_FAILED:      'Paiement échoué',
  WEBHOOK_SIG_FAIL:    'Webhook — Signature invalide',
  ORDER_STATUS_UPDATE: 'Statut mis à jour',
};

const STRIPE_STATUS_COLORS = {
  succeeded:               { background: '#d1fae5', color: '#065f46' },
  requires_payment_method: { background: '#f3f4f6', color: '#374151' },
  requires_confirmation:   { background: '#fef3c7', color: '#92400e' },
  processing:              { background: '#dbeafe', color: '#1e40af' },
  canceled:                { background: '#fee2e2', color: '#991b1b' },
  failed:                  { background: '#fee2e2', color: '#991b1b' },
};

const ORDER_STATUS_COLORS = {
  pending:    { background: '#f3f4f6', color: '#374151' },
  paid:       { background: '#d1fae5', color: '#065f46' },
  processing: { background: '#ede9fe', color: '#5b21b6' },
  shipped:    { background: '#dbeafe', color: '#1e40af' },
  delivered:  { background: '#d1fae5', color: '#065f46' },
  completed:  { background: '#d1fae5', color: '#065f46' },
  cancelled:  { background: '#fee2e2', color: '#991b1b' },
  refunded:   { background: '#fee2e2', color: '#991b1b' },
};

const LIMIT = 100;

function Badge({ label, style }) {
  return (
    <span style={{
      ...style,
      padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function DetailsCell({ details }) {
  const [open, setOpen] = useState(false);
  if (!details || Object.keys(details).length === 0) return <span style={{ color: '#9ca3af' }}>—</span>;
  const preview = Object.keys(details).slice(0, 2).join(', ');
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'none', border: '1px solid #d1d5db', borderRadius: 4,
          padding: '1px 8px', cursor: 'pointer', fontSize: 12, color: '#374151',
        }}
      >
        {open ? '▲ Fermer' : `▼ ${preview}…`}
      </button>
      {open && (
        <pre style={{
          marginTop: 6, padding: 8, background: '#f9fafb', borderRadius: 4,
          fontSize: 11, maxWidth: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          border: '1px solid #e5e7eb', textAlign: 'left',
        }}>
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtPrice(cents) {
  if (!cents && cents !== 0) return '—';
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
}

export default function PaymentLogs() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset]   = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom]     = useState('');
  const [filterTo, setFilterTo]         = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (filterAction) params.set('action', filterAction);
      if (filterFrom)   params.set('from', filterFrom);
      if (filterTo)     params.set('to', filterTo);
      const data = await apiFetch(`/admin/order-logs?${params.toString()}`);
      setRows(data);
      setHasMore(data.length === LIMIT);
      setOffset(off);
    } catch (e) {
      console.error('[OrderLogs] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterFrom, filterTo]);

  useEffect(() => {
    load(0);
    timerRef.current = setInterval(() => load(0), 30000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  function handleSearch(e) { e.preventDefault(); load(0); }
  function handleReset() { setFilterAction(''); setFilterFrom(''); setFilterTo(''); }

  const hasErrors = rows.some(r => r.action === 'WEBHOOK_SIG_FAIL');

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Logs commandes</h1>
        {loading && <span style={{ fontSize: 12, color: '#9ca3af' }}>Actualisation…</span>}
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        Suivi de toutes les actions sur les commandes : créations, paiements, changements de statut, expéditions. Actualisation toutes les 30s.
      </p>

      {hasErrors && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 8,
          background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', fontSize: 13,
        }}>
          ⚠️ Des erreurs de signature webhook sont détectées. Vérifiez que le <strong>Webhook Secret Stripe</strong> dans les Paramètres correspond bien au endpoint configuré.
        </div>
      )}

      {/* Filtres */}
      <form onSubmit={handleSearch} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Événement</label>
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, minWidth: 220 }}
          >
            <option value="">Tous les événements</option>
            <option value="CHECKOUT_CREATE">Commandes créées</option>
            <option value="PAYMENT_SUCCEEDED">Paiements réussis</option>
            <option value="PAYMENT_FAILED">Paiements échoués</option>
            <option value="ORDER_STATUS_UPDATE">Changements de statut</option>
            <option value="WEBHOOK_SIG_FAIL">Erreurs webhook</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Du</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Au</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }} />
        </div>
        <button type="submit" style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          Filtrer
        </button>
        <button type="button" onClick={handleReset} style={{ padding: '6px 16px', borderRadius: 6, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', cursor: 'pointer', fontSize: 14 }}>
          Réinitialiser
        </button>
        <button type="button" onClick={() => load(0)} style={{ padding: '6px 16px', borderRadius: 6, background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', cursor: 'pointer', fontSize: 14 }}>
          ↻ Actualiser
        </button>
      </form>

      {/* Tableau */}
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={thStyle}>Date / heure</th>
              <th style={thStyle}>Événement</th>
              <th style={thStyle}>Email client</th>
              <th style={thStyle}>Commande ID</th>
              <th style={thStyle}>Statut commande</th>
              <th style={thStyle}>Statut Stripe</th>
              <th style={thStyle}>Montant</th>
              <th style={thStyle}>IP</th>
              <th style={thStyle}>Détails</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>Chargement…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>
                Aucun log. Les événements apparaîtront ici après la première transaction.
              </td></tr>
            )}
            {rows.map((row, i) => {
              const actionStyle = ACTION_COLORS[row.action] || { background: '#f3f4f6', color: '#374151' };
              const stripeStyle = STRIPE_STATUS_COLORS[row.stripe_payment_status] || { background: '#f3f4f6', color: '#374151' };
              const orderStyle  = ORDER_STATUS_COLORS[row.order_status] || { background: '#f3f4f6', color: '#374151' };
              const email = row.user_email || row.order_email || '—';
              const orderId = row.resource_id ? row.resource_id.slice(0, 8).toUpperCase() : '—';

              return (
                <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={tdStyle}>{fmtDate(row.created_at)}</td>
                  <td style={tdStyle}><Badge label={ACTION_LABELS[row.action] || row.action} style={actionStyle} /></td>
                  <td style={{ ...tdStyle, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }} title={row.resource_id || ''}>
                    {orderId}
                  </td>
                  <td style={tdStyle}>
                    {row.order_status
                      ? <Badge label={row.order_status} style={orderStyle} />
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={tdStyle}>
                    {row.stripe_payment_status
                      ? <Badge label={row.stripe_payment_status} style={stripeStyle} />
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtPrice(row.total_cents)}</td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#6b7280' }}>{row.ip_address || '—'}</td>
                  <td style={{ ...tdStyle, maxWidth: 300 }}><DetailsCell details={row.details} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button onClick={() => load(Math.max(0, offset - LIMIT))} disabled={offset === 0 || loading} style={paginBtn(offset === 0 || loading)}>
          ← Précédent
        </button>
        <span style={{ fontSize: 13, color: '#6b7280' }}>
          Entrées {offset + 1}–{offset + rows.length}
        </span>
        <button onClick={() => load(offset + LIMIT)} disabled={!hasMore || loading} style={paginBtn(!hasMore || loading)}>
          Suivant →
        </button>
      </div>
    </div>
  );
}

const thStyle = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#374151', whiteSpace: 'nowrap' };
const tdStyle = { padding: '8px 14px', color: '#374151', whiteSpace: 'nowrap' };
function paginBtn(disabled) {
  return {
    padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db',
    background: disabled ? '#f9fafb' : '#fff', color: disabled ? '#d1d5db' : '#374151',
    cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500,
  };
}

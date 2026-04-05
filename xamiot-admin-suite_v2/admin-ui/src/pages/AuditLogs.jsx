import React, { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '../api.js';

const ACTION_COLORS = {
  // Auth
  LOGIN:                    { background: '#fef3c7', color: '#92400e' },
  LOGIN_FAILED:             { background: '#fee2e2', color: '#991b1b' },
  AUTH_SIGNUP:              { background: '#fef3c7', color: '#92400e' },
  AUTH_VERIFY_EMAIL:        { background: '#fef3c7', color: '#92400e' },
  PASSWORD_RESET_REQUEST:   { background: '#fef3c7', color: '#92400e' },
  PASSWORD_RESET_DONE:      { background: '#d1fae5', color: '#065f46' },
  // Generic CRUD
  CREATE:              { background: '#d1fae5', color: '#065f46' },
  UPDATE:              { background: '#dbeafe', color: '#1e40af' },
  DELETE:              { background: '#fee2e2', color: '#991b1b' },
  // Commandes / paiements
  CHECKOUT_CREATE:          { background: '#d1fae5', color: '#065f46' },
  ORDER_STATUS_UPDATE:      { background: '#dbeafe', color: '#1e40af' },
  PAYMENT_SUCCEEDED:        { background: '#d1fae5', color: '#065f46' },
  PAYMENT_FAILED:           { background: '#fee2e2', color: '#991b1b' },
  WEBHOOK_SIG_FAIL:         { background: '#fee2e2', color: '#991b1b' },
  // Règles
  RULE_CREATE:         { background: '#d1fae5', color: '#065f46' },
  RULE_UPDATE:         { background: '#dbeafe', color: '#1e40af' },
  RULE_DELETE:         { background: '#fee2e2', color: '#991b1b' },
  // Adresses
  ADDRESS_CREATE:      { background: '#d1fae5', color: '#065f46' },
  ADDRESS_UPDATE:      { background: '#dbeafe', color: '#1e40af' },
  ADDRESS_DELETE:      { background: '#fee2e2', color: '#991b1b' },
  // Devices ESP
  DEVICE_UPDATE:              { background: '#dbeafe', color: '#1e40af' },
  'device.enrolled':           { background: '#d1fae5', color: '#065f46' },
  'device.re_enrolled':        { background: '#dbeafe', color: '#1e40af' },
  'device.reset_mqtt_sent':    { background: '#ede9fe', color: '#5b21b6' },
  'device.reset_mqtt_ack':     { background: '#d1fae5', color: '#065f46' },
  'device.reset_mqtt_timeout': { background: '#fff7ed', color: '#c2410c' },
  'device.deleted':            { background: '#fee2e2', color: '#991b1b' },
};

const RESOURCE_TYPES = [
  'auth', 'user', 'address',
  'esp_device', 'device', 'alert_rule', 'alert',
  'order', 'country',
  'page', 'product', 'media',
  'ticket', 'config', 'ota', 'rma', 'admin',
];
const ACTIONS = [
  // Auth & compte
  'LOGIN', 'LOGIN_FAILED', 'AUTH_SIGNUP', 'AUTH_VERIFY_EMAIL',
  'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_DONE',
  // CRUD génériques (auditMiddleware)
  'CREATE', 'UPDATE', 'DELETE',
  // Commandes / paiements
  'CHECKOUT_CREATE', 'ORDER_STATUS_UPDATE',
  'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'WEBHOOK_SIG_FAIL',
  // Règles d'alerte
  'RULE_CREATE', 'RULE_UPDATE', 'RULE_DELETE',
  // Adresses
  'ADDRESS_CREATE', 'ADDRESS_UPDATE', 'ADDRESS_DELETE',
  // Devices ESP
  'DEVICE_UPDATE',
  'device.enrolled', 'device.re_enrolled',
  'device.reset_mqtt_sent', 'device.reset_mqtt_ack', 'device.reset_mqtt_timeout', 'device.deleted',
];
const LIMIT = 50;

function ActionBadge({ action }) {
  const style = ACTION_COLORS[action] || { background: '#f3f4f6', color: '#374151' };
  return (
    <span style={{
      ...style,
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: '0.03em',
    }}>
      {action}
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
          fontSize: 11, maxWidth: 360, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          border: '1px solid #e5e7eb', textAlign: 'left',
        }}>
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function AuditLogs() {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [offset, setOffset]       = useState(0);
  const [hasMore, setHasMore]     = useState(false);
  const [filterAction, setFilterAction]     = useState('');
  const [filterResource, setFilterResource] = useState('');
  const [filterFrom, setFilterFrom]         = useState('');
  const [filterTo, setFilterTo]             = useState('');
  const [filterSearch, setFilterSearch]     = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (filterAction)   params.set('action', filterAction);
      if (filterResource) params.set('resource_type', filterResource);
      if (filterFrom)     params.set('from', filterFrom);
      if (filterTo)       params.set('to', filterTo);
      if (filterSearch)   params.set('search', filterSearch);

      const data = await apiFetch(`/admin/audit-logs?${params.toString()}`);
      setRows(data);
      setHasMore(data.length === LIMIT);
      setOffset(off);
    } catch (e) {
      console.error('[AuditLogs] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterResource, filterFrom, filterTo, filterSearch]);

  // Chargement initial + refresh auto toutes les 30s
  useEffect(() => {
    load(0);
    timerRef.current = setInterval(() => load(0), 30000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  function handleSearch(e) {
    e.preventDefault();
    load(0);
  }

  function handleReset() {
    setFilterAction('');
    setFilterResource('');
    setFilterFrom('');
    setFilterTo('');
    setFilterSearch('');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  function truncate(str, n = 12) {
    if (!str) return '—';
    return str.length > n ? str.slice(0, n) + '…' : str;
  }

  function formatUser(row) {
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
    if (name) return <span title={row.user_email || ''}>{name}</span>;
    return row.user_email || <span style={{ color: '#9ca3af' }}>—</span>;
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Audit logs</h1>

      {/* Filtres */}
      <form onSubmit={handleSearch} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Utilisateur</label>
          <input
            type="text"
            placeholder="nom ou email…"
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, minWidth: 160 }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Action</label>
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, minWidth: 130 }}
          >
            <option value="">Toutes</option>
            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Type de ressource</label>
          <select
            value={filterResource}
            onChange={e => setFilterResource(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, minWidth: 130 }}
          >
            <option value="">Tous</option>
            {RESOURCE_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Du</label>
          <input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Au</label>
          <input
            type="date"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
          />
        </div>

        <button
          type="submit"
          style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
        >
          Filtrer
        </button>
        <button
          type="button"
          onClick={handleReset}
          style={{ padding: '6px 16px', borderRadius: 6, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', cursor: 'pointer', fontSize: 14 }}
        >
          Réinitialiser
        </button>
      </form>

      {/* Tableau */}
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={thStyle}>Date / heure</th>
              <th style={thStyle}>Utilisateur</th>
              <th style={thStyle}>Action</th>
              <th style={thStyle}>Ressource</th>
              <th style={thStyle}>ID ressource</th>
              <th style={thStyle}>Détails</th>
              <th style={thStyle}>IP</th>
              <th style={thStyle}>Agent</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>Chargement…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>Aucun log</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={tdStyle}>{formatDate(row.created_at)}</td>
                <td style={tdStyle}>{formatUser(row)}</td>
                <td style={tdStyle}><ActionBadge action={row.action} /></td>
                <td style={tdStyle}>{row.resource_type}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }} title={row.resource_id || ''}>
                  {truncate(row.resource_id, 14)}
                </td>
                <td style={{ ...tdStyle, maxWidth: 320 }}>
                  <DetailsCell details={row.details} />
                </td>
                <td style={{ ...tdStyle, fontSize: 12, color: '#6b7280' }}>{row.ip_address || '—'}</td>
                <td style={{ ...tdStyle, fontSize: 11, color: '#9ca3af', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={row.user_agent || ''}>
                  {truncate(row.user_agent, 30)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button
          onClick={() => load(Math.max(0, offset - LIMIT))}
          disabled={offset === 0 || loading}
          style={paginBtnStyle(offset === 0 || loading)}
        >
          ← Précédent
        </button>
        <span style={{ fontSize: 13, color: '#6b7280' }}>
          Entrées {offset + 1}–{offset + rows.length}
        </span>
        <button
          onClick={() => load(offset + LIMIT)}
          disabled={!hasMore || loading}
          style={paginBtnStyle(!hasMore || loading)}
        >
          Suivant →
        </button>
        {loading && <span style={{ fontSize: 12, color: '#9ca3af' }}>Actualisation…</span>}
      </div>
    </div>
  );
}

const thStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 13,
  color: '#374151',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '9px 14px',
  color: '#374151',
  whiteSpace: 'nowrap',
};

function paginBtnStyle(disabled) {
  return {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid #d1d5db',
    background: disabled ? '#f9fafb' : '#fff',
    color: disabled ? '#d1d5db' : '#374151',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    fontWeight: 500,
  };
}

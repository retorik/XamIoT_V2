import React, { useEffect, useState, useRef } from 'react';
import { apiFetch } from '../api.js';

const PAGE_SIZE = 100;

export default function MqttLogs() {
  const [rows, setRows]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ]           = useState('');
  const [err, setErr]       = useState('');
  const [expanded, setExpanded] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const timerRef = useRef(null);

  async function load(off = 0, search = q) {
    setErr('');
    try {
      const data = await apiFetch(
        `/admin/mqtt-logs?limit=${PAGE_SIZE}&offset=${off}&q=${encodeURIComponent(search)}`
      );
      setRows(data.rows || []);
      setTotal(data.total || 0);
      setOffset(off);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  useEffect(() => { load(0); }, []);

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => load(0), 5000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, q]);

  function handleKey(e) {
    if (e.key === 'Enter') load(0, q);
  }

  async function clearAll() {
    if (!confirm('Vider tous les logs MQTT ? Cette action est irréversible.')) return;
    try {
      await apiFetch('/admin/mqtt-logs', { method: 'DELETE' });
      setRows([]);
      setTotal(0);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  function fmtPayload(payload) {
    try {
      return JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      return payload;
    }
  }

  const pages = Math.ceil(total / PAGE_SIZE);
  const page  = Math.floor(offset / PAGE_SIZE);

  return (
    <div className="container">
      <h2>Logs MQTT bruts</h2>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 200 }}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Filtrer par ESP UID ou topic"
        />
        <button className="btn" style={{ flexShrink: 0 }} onClick={() => load(0)}>Rechercher</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
          Auto (5s)
        </label>
        <button
          className="btn secondary"
          style={{ flexShrink: 0, color: '#b91c1c' }}
          onClick={clearAll}
        >
          Vider les logs
        </button>
      </div>

      {err ? <div style={{ color: '#b91c1c', marginBottom: 10 }}>{err}</div> : null}

      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
        {total} entrée{total !== 1 ? 's' : ''} {q ? `(filtrées sur "${q}")` : ''}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 170 }}>Date</th>
              <th>Topic</th>
              <th>ESP UID</th>
              <th style={{ width: 60 }}>Taille</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <React.Fragment key={r.id}>
                <tr>
                  <td style={{ fontSize: 12 }}>{new Date(r.received_at).toLocaleString('fr-FR')}</td>
                  <td><code style={{ fontSize: 11 }}>{r.topic}</code></td>
                  <td>
                    <code style={{ fontSize: 11 }}>{r.esp_uid || '—'}</code>
                    {r.esp_name ? <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 11 }}>{r.esp_name}</span> : null}
                  </td>
                  <td style={{ color: '#6b7280', fontSize: 12 }}>{r.payload_size} o</td>
                  <td style={{ fontSize: 12, color: '#3b82f6', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    {expanded === r.id ? 'Réduire' : 'Voir'}
                  </td>
                </tr>
                <tr>
                  <td colSpan={5} style={{ padding: '0 16px 6px', borderTop: 'none' }}>
                    <code style={{
                      display: 'block',
                      fontSize: 10,
                      color: '#94a3b8',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}>
                      {r.payload}
                    </code>
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr>
                    <td colSpan={5} style={{ background: '#f8fafc', padding: '10px 16px' }}>
                      <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#1e293b' }}>
                        {fmtPayload(r.payload)}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {!rows.length && (
              <tr><td colSpan={5} style={{ color: '#6b7280', textAlign: 'center' }}>Aucun log.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center' }}>
          <button className="btn secondary" disabled={page === 0} onClick={() => load((page - 1) * PAGE_SIZE)}>←</button>
          <span style={{ fontSize: 13, color: '#6b7280' }}>Page {page + 1} / {pages}</span>
          <button className="btn secondary" disabled={page >= pages - 1} onClick={() => load((page + 1) * PAGE_SIZE)}>→</button>
        </div>
      )}
    </div>
  );
}

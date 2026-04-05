import React, { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../api.js';

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function Alerts() {
  const [espUid, setEspUid]     = useState('');
  const [userId, setUserId]     = useState('');
  const [rows, setRows]         = useState([]);
  const [err, setErr]           = useState('');
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    setSelected(new Set());
    const params = new URLSearchParams();
    params.set('limit', '200');
    if (espUid) params.set('esp_uid', espUid);
    if (userId) params.set('user_id', userId);
    try {
      const data = await apiFetch(`/admin/alerts?${params.toString()}`);
      setRows(data || []);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }, [espUid, userId]);

  useEffect(() => { load(); }, []);

  // Recherche live avec debounce 400ms (skip le premier rendu)
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const t = setTimeout(load, 400);
    return () => clearTimeout(t);
  }, [espUid, userId]);

  const allChecked = rows.length > 0 && selected.size === rows.length;

  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  }

  function toggleOne(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (!selected.size) return;
    if (!window.confirm(`Supprimer ${selected.size} alerte(s) ?`)) return;
    setDeleting(true);
    try {
      await apiFetch('/admin/alerts', { method: 'DELETE', body: { ids: [...selected] } });
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="container">
      <h2>Alertes / logs</h2>

      <div className="row" style={{ alignItems: 'center' }}>
        <input className="input" style={{ flex: '1 1 260px' }} value={espUid}
          onChange={e => setEspUid(e.target.value)} placeholder="Filtre esp_uid (ex: 00F1AA...)" />
        <input className="input" style={{ flex: '1 1 260px' }} value={userId}
          onChange={e => setUserId(e.target.value)} placeholder="Filtre user_id (uuid)" />
        <button className="btn" onClick={load}>Filtrer</button>
      </div>

      {err && <div style={{ color: '#b91c1c', marginTop: 10 }}>{err}</div>}

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            {rows.length} alerte(s) {selected.size > 0 && `· ${selected.size} sélectionnée(s)`}
          </span>
          {selected.size > 0 && (
            <button className="btn danger" style={{ padding: '6px 14px', fontSize: 13 }}
              onClick={deleteSelected} disabled={deleting}>
              {deleting ? 'Suppression…' : `Supprimer (${selected.size})`}
            </button>
          )}
        </div>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll}
                  title={allChecked ? 'Tout désélectionner' : 'Tout sélectionner'} />
              </th>
              <th>Date</th><th>User</th><th>ESP</th><th>Statut</th><th>Canal</th><th>Règle</th><th>Erreur</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id} style={{ background: selected.has(a.id) ? '#f0f4ff' : undefined }}>
                <td>
                  <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)} />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmt(a.sent_at)}</td>
                <td style={{ maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.user_email || '—'}
                </td>
                <td>{a.esp_name || a.esp_uid}</td>
                <td>
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                    background: a.status === 'sent' ? '#dcfce7' : '#fee2e2',
                    color: a.status === 'sent' ? '#166534' : '#991b1b',
                  }}>
                    {a.status}
                  </span>
                </td>
                <td>{a.channel}</td>
                <td style={{ maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12, color: '#6b7280' }}>
                  {a.rule_id ? a.rule_id.slice(0, 8) + '…' : '—'}
                </td>
                <td style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12, color: '#b91c1c' }}>
                  {a.error || '—'}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan="8" style={{ color: '#9ca3af', padding: 16 }}>Aucune alerte.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api.js';
import { useNavigate } from 'react-router-dom';

const COLS = [
  { key: 'email',        label: 'Email' },
  { key: 'name',         label: 'Nom' },
  { key: 'is_active',    label: 'Actif' },
  { key: 'is_admin',     label: 'Admin' },
  { key: 'mobile_count', label: 'Mobiles' },
  { key: 'esp_count',    label: 'ESP' },
  { key: 'alert_count',  label: 'Alertes' },
  { key: 'created_at',   label: 'Créé' },
];

export default function Users() {
  const [q, setQ]           = useState('');
  const [rows, setRows]     = useState([]);
  const [err, setErr]       = useState('');
  const [sortCol, setSortCol] = useState('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const nav = useNavigate();

  async function load() {
    setErr('');
    try {
      const data = await apiFetch(`/admin/users?limit=100&offset=0&q=${encodeURIComponent(q)}`);
      setRows(data || []);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  useEffect(() => { load(); }, []);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const t = setTimeout(load, 400);
    return () => clearTimeout(t);
  }, [q]);

  function handleKey(e) {
    if (e.key === 'Enter') load();
  }

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(true); }
  }

  const sorted = [...rows].sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol];
    if (sortCol === 'name') {
      av = [a.first_name, a.last_name].filter(Boolean).join(' ').toLowerCase();
      bv = [b.first_name, b.last_name].filter(Boolean).join(' ').toLowerCase();
    }
    if (av === null || av === undefined) av = '';
    if (bv === null || bv === undefined) bv = '';
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av > bv ? 1 : av < bv ? -1 : 0);
    return sortAsc ? cmp : -cmp;
  });

  return (
    <div className="container">
      <h2>Utilisateurs</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Recherche email / nom / téléphone"
        />
        <button className="btn" style={{ flexShrink: 0, whiteSpace: 'nowrap' }} onClick={load}>
          Rechercher
        </button>
      </div>

      {err ? <div style={{ color: '#b91c1c', marginBottom: 10 }}>{err}</div> : null}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr style={{ background: '#111827' }}>
              {COLS.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  style={{
                    background: '#111827',
                    color: '#fff',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    padding: '10px 12px',
                  }}
                >
                  {col.label}
                  {sortCol === col.key && (
                    <span style={{ marginLeft: 4, opacity: 0.8 }}>{sortAsc ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((u, idx) => (
              <tr
                key={u.id}
                onClick={() => nav(`/users/${u.id}`)}
                style={{ cursor: 'pointer', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}
                onMouseEnter={e => e.currentTarget.style.background = '#e0e7ff'}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#f8fafc'}
              >
                <td>{u.email}</td>
                <td>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                <td>{u.is_active ? '✅' : '—'}</td>
                <td>{u.is_admin ? <span className="badge">admin</span> : '—'}</td>
                <td>{u.mobile_active_count}/{u.mobile_count}</td>
                <td>{u.esp_count}</td>
                <td>{u.alert_count}</td>
                <td>{u.created_at?.slice?.(0, 10) || ''}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan="8" style={{ color: '#666' }}>Aucun résultat.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';
import { useNavigate } from 'react-router-dom';

export default function Users() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
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

  function handleKey(e) {
    if (e.key === 'Enter') load();
  }

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
            <tr>
              <th>Email</th>
              <th>Nom</th>
              <th>Actif</th>
              <th>Admin</th>
              <th>Mobiles</th>
              <th>ESP</th>
              <th>Alertes</th>
              <th>Créé</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(u => (
              <tr
                key={u.id}
                onClick={() => nav(`/users/${u.id}`)}
                style={{ cursor: 'pointer' }}
                className="tr-hover"
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

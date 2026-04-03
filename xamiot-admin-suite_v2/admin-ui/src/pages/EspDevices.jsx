import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

export default function EspDevices() {
  const [q, setQ]             = useState('');
  const [rows, setRows]       = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [err, setErr]         = useState('');
  const [assigningId, setAssigningId] = useState(null); // id de l'ESP en cours d'assignation

  async function load() {
    setErr('');
    try {
      const [data, types] = await Promise.all([
        apiFetch(`/admin/esp-devices?limit=200&offset=0&q=${encodeURIComponent(q)}`),
        apiFetch('/admin/device-types'),
      ]);
      setRows(data || []);
      setDeviceTypes(types || []);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  useEffect(() => { load(); }, []);

  function handleKey(e) {
    if (e.key === 'Enter') load();
  }

  async function assignType(espId, deviceTypeId) {
    setAssigningId(espId);
    try {
      await apiFetch(`/admin/esp-devices/${espId}/device-type`, {
        method: 'PATCH',
        body: { device_type_id: deviceTypeId || null },
      });
      setRows(prev => prev.map(r => r.id === espId
        ? { ...r, device_type_id: deviceTypeId || null, device_type_name: deviceTypes.find(t => t.id === deviceTypeId)?.name || null }
        : r
      ));
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <div className="container">
      <h2>ESP devices</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Recherche UID / nom / user email"
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
              <th>UID</th><th>Nom</th><th>User</th><th>Type device</th><th>Firmware</th><th>Last seen</th><th>Dernier dB</th><th>Règles</th><th>Dernière alerte</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.id}>
                <td><code style={{ fontSize: 12 }}>{e.esp_uid}</code></td>
                <td>{e.name || '—'}</td>
                <td>{e.user_email}</td>
                <td>
                  <select
                    className="input"
                    style={{ padding: '3px 6px', fontSize: 12, width: 'auto', minWidth: 130 }}
                    value={e.device_type_id || ''}
                    disabled={assigningId === e.id}
                    onChange={ev => assignType(e.id, ev.target.value)}
                  >
                    <option value="">— Non assigné —</option>
                    {deviceTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </td>
                <td>{e.fw_version ? <code style={{ fontSize: 11 }}>v{e.fw_version}</code> : '—'}</td>
                <td>{e.last_seen ? new Date(e.last_seen).toLocaleString('fr-FR') : '—'}</td>
                <td>{e.last_db != null ? `${e.last_db} xB` : '—'}</td>
                <td>{e.rule_count}</td>
                <td>{e.last_alert_at ? new Date(e.last_alert_at).toLocaleString('fr-FR') : '—'}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan="9" style={{ color: '#666' }}>Aucun résultat.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

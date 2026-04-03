import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

const STATUS_LABELS = {
  draft:      { label: 'Brouillon',   color: '#6b7280', bg: '#f3f4f6' },
  scheduled:  { label: 'Planifiée',   color: '#d97706', bg: '#fef3c7' },
  deploying:  { label: 'En cours',    color: '#2563eb', bg: '#dbeafe' },
  done:       { label: 'Terminée',    color: '#15803d', bg: '#dcfce7' },
  cancelled:  { label: 'Annulée',     color: '#b91c1c', bg: '#fee2e2' },
};

const DEP_STATUS_LABELS = {
  pending:     { label: 'En attente',     color: '#6b7280' },
  triggered:   { label: 'Déclenché',      color: '#2563eb' },
  downloading: { label: 'Téléchargement', color: '#7c3aed' },
  flashing:    { label: 'Flash...',       color: '#d97706' },
  success:     { label: 'Succès',         color: '#15803d' },
  failed:      { label: 'Échec',          color: '#b91c1c' },
  skipped:     { label: 'Ignoré',         color: '#6b7280' },
};

function StatusBadge({ status, labels }) {
  const s = labels[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      color: s.color, background: s.bg || '#f3f4f6',
      border: `1px solid ${s.color}33`,
    }}>
      {s.label}
    </span>
  );
}

export default function OtaUpdates() {
  const [updates, setUpdates] = useState([]);
  const [selected, setSelected] = useState(null); // détail OTA
  const [showCreate, setShowCreate] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      const data = await apiFetch('/admin/ota');
      setUpdates(data || []);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function openDetail(ota) {
    try {
      const data = await apiFetch(`/admin/ota/${ota.id}`);
      setSelected(data);
      setShowCreate(false);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  async function del(id) {
    if (!confirm('Supprimer cette mise à jour OTA ?')) return;
    try {
      await apiFetch(`/admin/ota/${id}`, { method: 'DELETE' });
      if (selected?.id === id) setSelected(null);
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Mises à jour OTA</h2>
        <button className="btn" onClick={() => { setShowCreate(true); setSelected(null); }}>
          Créer une mise à jour
        </button>
      </div>

      {err ? <div style={{ color: '#b91c1c', marginBottom: 10 }}>{err}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: selected || showCreate ? '1fr 1.4fr' : '1fr', gap: 16 }}>
        {/* Liste */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', alignSelf: 'start' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Version</th><th>Nom</th><th>Type device</th><th>Statut</th><th>Devices</th><th></th>
              </tr>
            </thead>
            <tbody>
              {updates.map(u => (
                <tr
                  key={u.id}
                  style={{ cursor: 'pointer', background: selected?.id === u.id ? '#eff6ff' : '' }}
                  onClick={() => openDetail(u)}
                >
                  <td><code style={{ fontSize: 12 }}>{u.version}</code></td>
                  <td>{u.name}</td>
                  <td style={{ fontSize: 12, color: '#6b7280' }}>{u.device_type_name || '—'}</td>
                  <td><StatusBadge status={u.status} labels={STATUS_LABELS} /></td>
                  <td style={{ fontSize: 12, color: '#6b7280' }}>
                    {u.success_count}/{u.target_count}
                    {u.failed_count > 0 ? <span style={{ color: '#b91c1c', marginLeft: 4 }}>({u.failed_count} éch.)</span> : null}
                  </td>
                  <td>
                    <button
                      className="btn secondary"
                      style={{ padding: '2px 8px', fontSize: 11, color: '#b91c1c' }}
                      onClick={e => { e.stopPropagation(); del(u.id); }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {!updates.length && (
                <tr><td colSpan={6} style={{ color: '#6b7280', textAlign: 'center' }}>Aucune mise à jour.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Création */}
        {showCreate && (
          <CreateOtaForm
            onCreated={() => { setShowCreate(false); load(); }}
            onClose={() => setShowCreate(false)}
          />
        )}

        {/* Détail */}
        {selected && !showCreate && (
          <OtaDetail
            ota={selected}
            onRefresh={() => openDetail(selected)}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

function CreateOtaForm({ onCreated, onClose }) {
  const [form, setForm] = useState({
    version: '', name: '', description: '', device_type_id: '', min_fw_version: '', scheduled_at: '',
  });
  const [file, setFile] = useState(null);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch('/admin/device-types').then(setDeviceTypes).catch(() => {});
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!file) return setErr('Fichier firmware requis');
    setLoading(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('firmware', file);
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });

      const token = localStorage.getItem('xamiot_admin_token');
      const apiBase = import.meta.env.VITE_API_BASE || '';
      const res = await fetch(`${apiBase}/admin/ota`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      onCreated();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ alignSelf: 'start' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Nouvelle mise à jour OTA</h3>
        <button className="btn secondary" style={{ padding: '3px 10px' }} onClick={onClose}>✕</button>
      </div>

      {err ? <div style={{ color: '#b91c1c', marginBottom: 10 }}>{err}</div> : null}

      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 8px', marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280' }}>Version *</label>
            <input className="input" value={form.version} onChange={e => set('version', e.target.value)} placeholder="1.2.3" required />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280' }}>Nom *</label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Correctif critique v1.2.3" required />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Description</label>
          <textarea className="input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Changelog / notes..." style={{ resize: 'vertical' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 8px', marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280' }}>Type de device</label>
            <select className="input" value={form.device_type_id} onChange={e => set('device_type_id', e.target.value)}>
              <option value="">— Tous types —</option>
              {deviceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280' }}>Version firmware min. éligible</label>
            <input className="input" value={form.min_fw_version} onChange={e => set('min_fw_version', e.target.value)} placeholder="1.0.0" />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Planification (optionnel)</label>
          <input className="input" type="datetime-local" value={form.scheduled_at} onChange={e => set('scheduled_at', e.target.value)} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Fichier firmware * (.bin, .elf, .hex…)</label>
          <input
            type="file"
            className="input"
            accept=".bin,.elf,.hex,.img"
            onChange={e => setFile(e.target.files[0] || null)}
            required
            style={{ padding: '6px' }}
          />
          {file && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{file.name} — {(file.size / 1024).toFixed(1)} ko</div>}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" type="submit" disabled={loading}>{loading ? 'Upload…' : 'Créer'}</button>
          <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </div>
  );
}

function OtaDetail({ ota, onRefresh, onClose }) {
  const [devices, setDevices] = useState([]);
  const [q, setQ]             = useState('');
  const [selected, setSelected] = useState(new Set(ota.deployments?.map(d => d.esp_id) || []));
  const [triggering, setTriggering] = useState(false);
  const [err, setErr]         = useState('');
  const [msg, setMsg]         = useState('');

  async function loadDevices(search = '') {
    try {
      const data = await apiFetch(`/admin/ota/${ota.id}/eligible-devices?q=${encodeURIComponent(search)}`);
      setDevices(data || []);
    } catch {}
  }

  useEffect(() => { loadDevices(); }, [ota.id]);

  function handleKey(e) {
    if (e.key === 'Enter') loadDevices(q);
  }

  function toggleDevice(id) {
    setSelected(s => {
      const ns = new Set(s);
      ns.has(id) ? ns.delete(id) : ns.add(id);
      return ns;
    });
  }

  async function saveTargets() {
    setErr(''); setMsg('');
    try {
      await apiFetch(`/admin/ota/${ota.id}/targets`, {
        method: 'POST',
        body: { esp_ids: [...selected] },
      });
      setMsg('Cibles enregistrées.');
      onRefresh();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  async function deleteDeployment(depId) {
    try {
      await apiFetch(`/admin/ota/${ota.id}/deployment/${depId}`, { method: 'DELETE' });
      onRefresh();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  async function trigger() {
    if (!confirm(`Déclencher la mise à jour sur ${selected.size} device(s) ?`)) return;
    setTriggering(true); setErr(''); setMsg('');
    try {
      await apiFetch(`/admin/ota/${ota.id}/targets`, {
        method: 'POST',
        body: { esp_ids: [...selected] },
      });
      const data = await apiFetch(`/admin/ota/${ota.id}/trigger`, {
        method: 'POST',
        body: { esp_ids: [...selected] },
      });
      setMsg(`Commande envoyée à ${data.triggered} device(s).`);
      onRefresh();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setTriggering(false);
    }
  }

  const deployMap = Object.fromEntries((ota.deployments || []).map(d => [d.esp_id, d]));

  return (
    <div className="card" style={{ alignSelf: 'start' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Firmware {ota.version} — {ota.name}</h3>
        <button className="btn secondary" style={{ padding: '3px 10px' }} onClick={onClose}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <StatusBadge status={ota.status} labels={STATUS_LABELS} />
        {ota.device_type_name && <span style={{ fontSize: 12, color: '#6b7280' }}>Type : {ota.device_type_name}</span>}
        {ota.md5 && <code style={{ fontSize: 10, color: '#6b7280' }}>MD5: {ota.md5.slice(0, 12)}…</code>}
        <a href={`${import.meta.env.VITE_API_BASE || ''}/admin/ota/${ota.id}/download?token=${encodeURIComponent(localStorage.getItem('xamiot_admin_token') || '')}`} style={{ fontSize: 12, color: '#2563eb' }}>Télécharger firmware</a>
      </div>

      {ota.description && <p style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>{ota.description}</p>}

      {err ? <div style={{ color: '#b91c1c', marginBottom: 8 }}>{err}</div> : null}
      {msg ? <div style={{ color: '#15803d', marginBottom: 8 }}>{msg}</div> : null}

      {/* Sélection des devices cibles */}
      <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, marginTop: 4 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <strong style={{ fontSize: 13 }}>Devices cibles</strong>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{selected.size} sélectionné(s)</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Filtrer UID / nom / email"
          />
          <button className="btn secondary" style={{ flexShrink: 0 }} onClick={() => loadDevices(q)}>Filtrer</button>
        </div>

        <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <table className="table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>UID</th>
                <th>Nom</th>
                <th>FW actuel</th>
                <th>Statut dépl.</th>
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr
                  key={d.id}
                  style={{ cursor: 'pointer', background: selected.has(d.id) ? '#eff6ff' : '' }}
                  onClick={() => toggleDevice(d.id)}
                >
                  <td>
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleDevice(d.id)} onClick={e => e.stopPropagation()} />
                  </td>
                  <td><code>{d.esp_uid}</code></td>
                  <td>{d.name || '—'}</td>
                  <td style={{ color: '#6b7280' }}>{d.fw_version || '—'}</td>
                  <td>
                    {deployMap[d.id]
                      ? <StatusBadge status={deployMap[d.id].status} labels={DEP_STATUS_LABELS} />
                      : <span style={{ color: '#d1d5db', fontSize: 11 }}>non ciblé</span>}
                  </td>
                </tr>
              ))}
              {!devices.length && <tr><td colSpan={5} style={{ color: '#6b7280', textAlign: 'center' }}>Aucun device.</td></tr>}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn secondary" onClick={saveTargets} disabled={!selected.size}>
            Enregistrer sélection
          </button>
          <button className="btn" onClick={trigger} disabled={triggering || !selected.size}>
            {triggering ? 'Envoi…' : `Déclencher OTA (${selected.size})`}
          </button>
        </div>
      </div>

      {/* Suivi des déploiements */}
      {ota.deployments?.length > 0 && (
        <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Suivi des déploiements</strong>
            <button className="btn secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={onRefresh}>Rafraîchir</button>
          </div>
          <table className="table" style={{ fontSize: 12 }}>
            <thead>
              <tr><th>Device</th><th>Statut</th><th>Prog.</th><th>FW avant</th><th>FW après</th><th>Dernière maj</th><th></th></tr>
            </thead>
            <tbody>
              {ota.deployments.map(d => (
                <tr key={d.id}>
                  <td>
                    <div><code style={{ fontSize: 11 }}>{d.esp_uid}</code></div>
                    {d.esp_name && <div style={{ color: '#6b7280', fontSize: 11 }}>{d.esp_name}</div>}
                  </td>
                  <td>
                    <StatusBadge status={d.status} labels={DEP_STATUS_LABELS} />
                    {d.error_msg && <div style={{ color: '#b91c1c', fontSize: 10, marginTop: 2 }}>{d.error_msg}</div>}
                  </td>
                  <td>{d.progress != null ? `${d.progress}%` : '—'}</td>
                  <td style={{ color: '#6b7280' }}>{d.fw_version_before || '—'}</td>
                  <td style={{ color: d.fw_version_after ? '#15803d' : '#6b7280' }}>{d.fw_version_after || '—'}</td>
                  <td style={{ color: '#6b7280' }}>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('fr-FR') : '—'}</td>
                  <td>
                    {d.status !== 'success' && (
                      <button
                        onClick={() => deleteDeployment(d.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, padding: '0 4px' }}
                        title="Supprimer ce déploiement"
                      >✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../api.js';
import { useParams, useNavigate } from 'react-router-dom';

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function StatusDot({ ok }) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? '#22c55e' : '#e5e7eb', display: 'inline-block', marginRight: 6, flexShrink: 0 }} />;
}

function SectionTitle({ children }) {
  return (
    <div style={{
      padding: '14px 20px',
      borderBottom: '2px solid #e5e7eb',
      background: '#f9fafb',
      borderRadius: '12px 12px 0 0',
    }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        {children}
      </h3>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '9px 0',
      borderBottom: '1px solid #ececec',
      gap: 12,
    }}>
      <span style={{ color: '#6b7280', fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, fontSize: 13, textAlign: 'right', wordBreak: 'break-all' }}>{value ?? '—'}</span>
    </div>
  );
}

export default function UserDetails() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [selectedAlerts, setSelectedAlerts] = useState(new Set());
  const [deletingAlerts, setDeletingAlerts] = useState(false);

  // Édition compte
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const load = useCallback(() => {
    setErr('');
    setSelectedAlerts(new Set());
    apiFetch(`/admin/users/${id}`).then(setData).catch(e => setErr(e?.data?.error || e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function deleteMobile(mobileId) {
    if (!window.confirm('Supprimer ce token mobile ?')) return;
    try {
      await apiFetch(`/admin/mobile-devices/${mobileId}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert(e?.data?.error || e.message);
    }
  }

  async function deleteSelectedAlerts() {
    if (!selectedAlerts.size) return;
    if (!window.confirm(`Supprimer ${selectedAlerts.size} alerte(s) ?`)) return;
    setDeletingAlerts(true);
    try {
      await apiFetch('/admin/alerts', { method: 'DELETE', body: { ids: [...selectedAlerts] } });
      await load();
    } catch (e) {
      alert(e?.data?.error || e.message);
    } finally {
      setDeletingAlerts(false);
    }
  }

  function toggleAlert(alertId) {
    setSelectedAlerts(prev => {
      const next = new Set(prev);
      next.has(alertId) ? next.delete(alertId) : next.add(alertId);
      return next;
    });
  }

  function toggleAllAlerts(alerts) {
    if (selectedAlerts.size === alerts.length) setSelectedAlerts(new Set());
    else setSelectedAlerts(new Set(alerts.map(a => a.id)));
  }

  function startEdit(u) {
    setEditForm({
      first_name: u.first_name || '',
      last_name:  u.last_name  || '',
      email:      u.email      || '',
      phone:      u.phone      || '',
      is_active:  u.is_active,
      password:   '',
    });
    setSaveErr('');
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    setSaveErr('');
    try {
      const body = {
        first_name: editForm.first_name,
        last_name:  editForm.last_name,
        email:      editForm.email,
        phone:      editForm.phone || null,
        is_active:  editForm.is_active,
      };
      if (editForm.password) body.password = editForm.password;
      await apiFetch(`/admin/users/${id}`, { method: 'PATCH', body });
      setEditing(false);
      load();
    } catch (e) {
      setSaveErr(e?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  if (err) return <div className="container" style={{ color: '#b91c1c' }}>{err}</div>;
  if (!data) return <div className="container" style={{ color: '#6b7280' }}>Chargement…</div>;

  const u = data.user;
  const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || null;
  const unreadCount = data.badge?.unread_count ?? 0;
  const activeMobiles = data.mobiles.filter(m => m.is_active).length;
  const activeRules = data.rules.filter(r => r.enabled).length;

  return (
    <div className="container">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn secondary" style={{ flexShrink: 0 }} onClick={() => nav(-1)}>← Retour</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>{fullName || u.email}</h2>
          {fullName && <div style={{ color: '#6b7280', fontSize: 13 }}>{u.email}</div>}
        </div>
        {u.is_admin && (
          <span className="badge" style={{ marginLeft: 'auto', background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e' }}>
            admin
          </span>
        )}
      </div>

      {/* Section : Compte + mini-dashboard */}
      <div className="row" style={{ alignItems: 'stretch' }}>

        {/* Fiche compte */}
        <div style={{ flex: '2 1 320px', border: '2px solid #d1d5db', borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ padding: '14px 20px', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '12px 12px 0 0' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Compte</h3>
            {!editing
              ? <button className="btn secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => startEdit(u)}>Modifier</button>
              : <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setEditing(false)} disabled={saving}>Annuler</button>
                  <button className="btn primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={saveEdit} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
                </div>
            }
          </div>

          {editing ? (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {saveErr && <div style={{ color: '#b91c1c', fontSize: 13, background: '#fee2e2', padding: '8px 12px', borderRadius: 8 }}>{saveErr}</div>}
              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: '1 1 140px' }}>
                  <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Prénom</label>
                  <input className="input" value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} placeholder="Prénom" />
                </div>
                <div style={{ flex: '1 1 140px' }}>
                  <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Nom</label>
                  <input className="input" value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Nom" />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Email</label>
                <input className="input" type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Téléphone</label>
                <input className="input" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="+33..." />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Nouveau mot de passe (laisser vide pour ne pas changer)</label>
                <input className="input" type="password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="Nouveau mot de passe" autoComplete="new-password" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} />
                  Compte actif
                </label>
              </div>
            </div>
          ) : (
            <div style={{ padding: '4px 20px 16px' }}>
              <InfoRow label="Prénom" value={u.first_name || '—'} />
              <InfoRow label="Nom" value={u.last_name || '—'} />
              <InfoRow label="Email" value={u.email} />
              <InfoRow label="Téléphone" value={u.phone || '—'} />
              <InfoRow label="Créé le" value={fmt(u.created_at)} />
              <InfoRow label="Activé le" value={fmt(u.activated_at)} />
              <InfoRow label="Statut" value={
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  background: u.is_active ? '#dcfce7' : '#fee2e2',
                  color: u.is_active ? '#166534' : '#991b1b',
                }}>
                  <StatusDot ok={u.is_active} />{u.is_active ? 'Actif' : 'Inactif'}
                </span>
              } />
              <InfoRow label="ID" value={<code style={{ fontSize: 11, color: '#6b7280' }}>{u.id}</code>} />
            </div>
          )}
        </div>

        {/* Mini-dashboard stats */}
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Appareils actifs', value: `${activeMobiles} / ${data.mobiles.length}`, color: activeMobiles > 0 ? '#166534' : '#6b7280', bg: activeMobiles > 0 ? '#dcfce7' : '#f3f4f6' },
            { label: 'Notifications non-lues', value: unreadCount, color: unreadCount > 0 ? '#92400e' : '#6b7280', bg: unreadCount > 0 ? '#fef3c7' : '#f3f4f6' },
            { label: 'ESP devices', value: data.esp_devices.length, color: '#111', bg: '#fff' },
            { label: 'Règles actives', value: `${activeRules} / ${data.rules.length}`, color: activeRules > 0 ? '#1d4ed8' : '#6b7280', bg: activeRules > 0 ? '#eff6ff' : '#f3f4f6' },
            { label: 'Alertes (total)', value: data.alerts.length, color: '#111', bg: '#fff' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{
              border: '2px solid #d1d5db', borderRadius: 10, padding: '12px 16px',
              background: bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 20, fontWeight: 800, color }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Appareils mobiles */}
      <div style={{ border: '2px solid #d1d5db', borderRadius: 12, overflow: 'hidden', marginTop: 20, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Appareils mobiles
          </h3>
          <span className="badge">{data.mobiles.length}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nom / Modèle</th><th>Plateforme</th><th>OS</th><th>Version app</th><th>Timezone</th>
                <th>Token</th><th>Env</th><th>Notifs</th><th>Actif</th><th>Dernière activité</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.mobiles.map(m => {
                const isIOS = (m.platform || '').toLowerCase() === 'ios';
                const token = m.apns_token || m.fcm_token || '';
                return (
                  <tr key={m.id}>
                    <td>
                      <b style={{ display: 'block' }}>{m.name || '—'}</b>
                      {m.model && <span style={{ fontSize: 11, color: '#6b7280' }}>{m.model}</span>}
                    </td>
                    <td>
                      <span style={{ background: isIOS ? '#e0f2fe' : '#f0fdf4', color: isIOS ? '#0369a1' : '#166534', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                        {m.platform || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{m.os_version || '—'}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {m.app_version
                        ? `${m.app_version}${m.app_build_number != null ? ` (${m.app_build_number})` : ''}`
                        : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{m.timezone || '—'}</td>
                    <td>
                      {token
                        ? <code style={{ fontSize: 10, color: '#6b7280' }} title={token}>{token.slice(0, 12)}…</code>
                        : '—'}
                    </td>
                    <td>
                      {isIOS
                        ? <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: m.sandbox ? '#fef3c7' : '#dcfce7', color: m.sandbox ? '#92400e' : '#166534', fontWeight: 600 }}>
                            {m.sandbox ? 'Sandbox' : 'Prod'}
                          </span>
                        : <span style={{ fontSize: 11, color: '#9ca3af' }}>FCM</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: unreadCount > 0 ? '#92400e' : '#6b7280' }}>
                      {unreadCount}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}><StatusDot ok={m.is_active} />{m.is_active ? 'Oui' : 'Non'}</td>
                    <td style={{ fontSize: 12, color: '#6b7280' }}>{fmt(m.last_seen)}</td>
                    <td>
                      <button
                        className="btn secondary"
                        style={{ padding: '2px 8px', fontSize: 12, color: '#b91c1c', borderColor: '#fca5a5' }}
                        onClick={() => deleteMobile(m.id)}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!data.mobiles.length && <tr><td colSpan="11" style={{ color: '#9ca3af', padding: 16 }}>Aucun mobile enregistré.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ESP devices */}
      <div style={{ border: '2px solid #d1d5db', borderRadius: 12, overflow: 'hidden', marginTop: 20, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>ESP Devices</h3>
          <span className="badge">{data.esp_devices.length}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr><th>UID</th><th>Nom</th><th>Type</th><th>Firmware</th><th>Dernier niveau</th><th>Dernière activité</th><th>MQTT</th></tr>
            </thead>
            <tbody>
              {data.esp_devices.map(e => (
                <tr key={e.id} onClick={() => nav('/esp')} style={{ cursor: 'pointer' }} className="tr-hover">
                  <td><code style={{ fontSize: 12 }}>{e.esp_uid}</code></td>
                  <td><b>{e.name || '—'}</b></td>
                  <td style={{ fontSize: 12 }}>{e.device_type_name || '—'}</td>
                  <td>{e.fw_version ? <code style={{ fontSize: 11 }}>v{e.fw_version}</code> : '—'}</td>
                  <td>{e.last_db != null ? `${e.last_db} xB` : '—'}</td>
                  <td>{fmt(e.last_seen)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><StatusDot ok={e.mqtt_enabled} />{e.mqtt_enabled ? 'Actif' : 'Désactivé'}</td>
                </tr>
              ))}
              {!data.esp_devices.length && <tr><td colSpan="7" style={{ color: '#9ca3af', padding: 16 }}>Aucun ESP enregistré.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Règles d'alerte */}
      <div style={{ border: '2px solid #d1d5db', borderRadius: 12, overflow: 'hidden', marginTop: 20, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Règles d'alerte</h3>
          <span className="badge">{data.rules.length}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr><th>ESP</th><th>Condition</th><th>Seuil</th><th>Cooldown</th><th>Actif</th><th>Dernier déclenchement</th></tr>
            </thead>
            <tbody>
              {data.rules.map(r => (
                <tr key={r.id} onClick={() => nav('/rules')} style={{ cursor: 'pointer' }} className="tr-hover">
                  <td><b>{r.esp_name || r.esp_uid}</b></td>
                  <td><code style={{ fontSize: 12 }}>{r.field} {r.op}</code></td>
                  <td>{r.threshold_num ?? r.threshold_str ?? '—'}</td>
                  <td>{r.cooldown_sec}s</td>
                  <td style={{ whiteSpace: 'nowrap' }}><StatusDot ok={r.enabled} />{r.enabled ? 'Oui' : 'Non'}</td>
                  <td>{fmt(r.last_sent)}</td>
                </tr>
              ))}
              {!data.rules.length && <tr><td colSpan="6" style={{ color: '#9ca3af', padding: 16 }}>Aucune règle configurée.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historique des alertes */}
      <div style={{ border: '2px solid #d1d5db', borderRadius: 12, overflow: 'hidden', marginTop: 20, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Historique des alertes
            </h3>
            <span className="badge">{data.alerts.length > 0 ? `${data.alerts.length} (max 200)` : 0}</span>
            {selectedAlerts.size > 0 && (
              <span style={{ fontSize: 12, color: '#6b7280' }}>· {selectedAlerts.size} sélectionnée(s)</span>
            )}
          </div>
          {selectedAlerts.size > 0 && (
            <button className="btn danger" style={{ padding: '5px 12px', fontSize: 12 }}
              onClick={deleteSelectedAlerts} disabled={deletingAlerts}>
              {deletingAlerts ? 'Suppression…' : `Supprimer (${selectedAlerts.size})`}
            </button>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox"
                    checked={data.alerts.length > 0 && selectedAlerts.size === data.alerts.length}
                    onChange={() => toggleAllAlerts(data.alerts)} />
                </th>
                <th>Date</th><th>ESP</th><th>Statut</th><th>Canal</th><th>Erreur</th>
              </tr>
            </thead>
            <tbody>
              {data.alerts.map(a => (
                <tr key={a.id} style={{ background: selectedAlerts.has(a.id) ? '#f0f4ff' : undefined }}>
                  <td><input type="checkbox" checked={selectedAlerts.has(a.id)} onChange={() => toggleAlert(a.id)} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmt(a.sent_at)}</td>
                  <td>{a.esp_name || a.esp_uid}</td>
                  <td>
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                      background: a.status === 'sent' ? '#dcfce7' : '#fee2e2',
                      color: a.status === 'sent' ? '#166534' : '#991b1b'
                    }}>
                      {a.status}
                    </span>
                  </td>
                  <td>{a.channel}</td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: a.error ? '#b91c1c' : '#9ca3af', fontSize: 12 }}>
                    {a.error || '—'}
                  </td>
                </tr>
              ))}
              {!data.alerts.length && <tr><td colSpan="6" style={{ color: '#9ca3af', padding: 16 }}>Aucune alerte.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

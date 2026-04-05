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

  // Suppression utilisateur
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  // Modal périphérique (édition nom + règles)
  const [deviceModal, setDeviceModal] = useState(null);      // objet esp_device
  const [deviceName, setDeviceName] = useState('');
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [deviceFields, setDeviceFields] = useState([]);       // champs disponibles pour cet ESP
  const [deviceTemplates, setDeviceTemplates] = useState([]); // templates de règles du type de périphérique
  const [ruleEdits, setRuleEdits] = useState({});             // { [ruleId]: formValues }
  const [ruleSaving, setRuleSaving] = useState({});           // { [ruleId]: bool }
  const [ruleSaved, setRuleSaved] = useState({});             // { [ruleId]: bool } feedback succès
  const [addRuleForm, setAddRuleForm] = useState(null);       // null = caché
  const [addRuleSaving, setAddRuleSaving] = useState(false);
  const [deviceModalErr, setDeviceModalErr] = useState('');

  const OPS = ['>', '<', '>=', '<=', '=', '!='];

  const load = useCallback(async () => {
    setErr('');
    setSelectedAlerts(new Set());
    try {
      const result = await apiFetch(`/admin/users/${id}`);
      setData(result);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
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

  async function deleteUser() {
    setDeleting(true);
    setDeleteErr('');
    try {
      await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
      nav('/users');
    } catch (e) {
      setDeleteErr(e?.data?.error || e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function openDeviceModal(esp) {
    setDeviceModal(esp);
    setDeviceName(esp.name || '');
    setDeviceModalErr('');
    setRuleEdits({});
    setRuleSaved({});
    setAddRuleForm(null);
    setDeviceFields([]);
    setDeviceTemplates([]);
    try {
      const fields = await apiFetch(`/admin/esp-devices/${esp.id}/available-fields`);
      setDeviceFields(Array.isArray(fields) ? fields : []);
    } catch { /* silencieux */ }
    if (esp.device_type_id) {
      try {
        const tpls = await apiFetch(`/admin/device-types/${esp.device_type_id}/rule-templates`);
        setDeviceTemplates(Array.isArray(tpls) ? tpls : []);
      } catch { /* silencieux */ }
    }
  }

  async function saveDeviceName() {
    if (!deviceModal) return;
    setDeviceSaving(true);
    setDeviceModalErr('');
    try {
      await apiFetch(`/admin/esp-devices/${deviceModal.id}`, { method: 'PATCH', body: { name: deviceName } });
      await load();
      setDeviceModal(d => ({ ...d, name: deviceName }));
    } catch (e) {
      setDeviceModalErr(e?.data?.error || e.message);
    } finally {
      setDeviceSaving(false);
    }
  }

  async function saveRule(ruleId, form) {
    if (!form) return;
    setRuleSaving(s => ({ ...s, [ruleId]: true }));
    setRuleSaved(s => ({ ...s, [ruleId]: false }));
    setDeviceModalErr('');
    try {
      // Comparaison souple pour les IDs (string vs integer selon la source)
      const tpl = deviceTemplates.find(t => String(t.id) === String(form.template_id));
      const body = {
        field:         tpl?.field || form.field,
        op:            form.op,
        threshold_num: form.threshold_num !== '' && form.threshold_num != null ? Number(form.threshold_num) : null,
        threshold_str: form.threshold_str || null,
        cooldown_sec:  Number(form.cooldown_sec),
        enabled:       Boolean(form.enabled),
        template_id:   tpl?.id || form.template_id || null,
      };
      await apiFetch(`/admin/rules/${ruleId}`, { method: 'PATCH', body });
      await load();
      setRuleEdits(e => { const n = { ...e }; delete n[ruleId]; return n; });
      setRuleSaved(s => ({ ...s, [ruleId]: true }));
      setTimeout(() => setRuleSaved(s => ({ ...s, [ruleId]: false })), 2000);
    } catch (e) {
      setDeviceModalErr(e?.data?.error || e.message);
    } finally {
      setRuleSaving(s => ({ ...s, [ruleId]: false }));
    }
  }

  async function deleteRule(ruleId) {
    if (!window.confirm('Supprimer cette règle ?')) return;
    setDeviceModalErr('');
    try {
      await apiFetch(`/admin/rules/${ruleId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setDeviceModalErr(e?.data?.error || e.message);
    }
  }

  async function addRule() {
    if (!addRuleForm || !deviceModal) return;
    setAddRuleSaving(true);
    setDeviceModalErr('');
    try {
      const tpl = deviceTemplates.find(t => String(t.id) === String(addRuleForm.template_id));
      const body = {
        esp_id:        deviceModal.id,
        field:         tpl?.field || addRuleForm.field,
        op:            addRuleForm.op,
        threshold_num: addRuleForm.threshold_num !== '' ? Number(addRuleForm.threshold_num) : null,
        threshold_str: addRuleForm.threshold_str || null,
        cooldown_sec:  Number(addRuleForm.cooldown_sec),
        enabled:       addRuleForm.enabled,
        user_label:    addRuleForm.user_label || null,
        template_id:   addRuleForm.template_id || null,
      };
      await apiFetch('/admin/rules', { method: 'POST', body });
      await load();
      setAddRuleForm(null);
    } catch (e) {
      setDeviceModalErr(e?.data?.error || e.message);
    } finally {
      setAddRuleSaving(false);
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
          <span className="badge" style={{ background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e' }}>
            admin
          </span>
        )}
        <button
          className="btn danger"
          style={{ marginLeft: 'auto', padding: '5px 14px', fontSize: 13 }}
          onClick={() => { setShowDeleteModal(true); setDeleteConfirmEmail(''); setDeleteErr(''); }}
        >
          Supprimer l'utilisateur
        </button>
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
            { label: 'Périphériques', value: data.esp_devices.length, color: '#111', bg: '#fff' },
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

      {/* Périphériques */}
      <div style={{ border: '2px solid #d1d5db', borderRadius: 12, overflow: 'hidden', marginTop: 20, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Périphériques</h3>
          <span className="badge">{data.esp_devices.length}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr><th>UID</th><th>Nom</th><th>Type</th><th>Firmware</th><th>Dernier niveau</th><th>Dernière activité</th><th>MQTT</th><th>Règles</th><th></th></tr>
            </thead>
            <tbody>
              {data.esp_devices.map(e => {
                const devRules = data.rules.filter(r => r.esp_uid === e.esp_uid || r.esp_id === e.id);
                return (
                  <tr key={e.id} style={{ cursor: 'pointer' }} className="tr-hover" onClick={() => openDeviceModal(e)}>
                    <td><code style={{ fontSize: 12 }}>{e.esp_uid}</code></td>
                    <td><b>{e.name || '—'}</b></td>
                    <td style={{ fontSize: 12 }}>{e.device_type_name || '—'}</td>
                    <td>{e.fw_version ? <code style={{ fontSize: 11 }}>v{e.fw_version}</code> : '—'}</td>
                    <td>{e.last_db != null ? `${e.last_db} xB` : '—'}</td>
                    <td>{fmt(e.last_seen)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><StatusDot ok={e.mqtt_enabled} />{e.mqtt_enabled ? 'Actif' : 'Désactivé'}</td>
                    <td style={{ fontSize: 12, color: '#6b7280' }}>{devRules.length}</td>
                    <td style={{ fontSize: 12, color: '#2563eb' }}>Modifier →</td>
                  </tr>
                );
              })}
              {!data.esp_devices.length && <tr><td colSpan="9" style={{ color: '#9ca3af', padding: 16 }}>Aucun périphérique enregistré.</td></tr>}
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

      {/* Modale édition périphérique */}
      {deviceModal && (() => {
        const devRules = data.rules.filter(r => r.esp_uid === deviceModal.esp_uid || r.esp_id === deviceModal.id);
        const inputS = { padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13 };
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
            <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 660, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', padding: 28 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: 17 }}>Périphérique</h3>
                  <code style={{ fontSize: 12, color: '#6b7280' }}>{deviceModal.esp_uid}</code>
                </div>
                <button onClick={() => setDeviceModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af' }}>✕</button>
              </div>

              {deviceModalErr && <div style={{ color: '#b91c1c', background: '#fee2e2', padding: '8px 12px', borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{deviceModalErr}</div>}

              {/* Nom */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Nom du périphérique</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={deviceName}
                    onChange={e => setDeviceName(e.target.value)}
                    style={{ ...inputS, flex: 1 }}
                    placeholder="Nom du périphérique"
                  />
                  <button
                    onClick={saveDeviceName}
                    disabled={deviceSaving || deviceName === deviceModal.name}
                    style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 16px', fontSize: 13, cursor: 'pointer', opacity: deviceSaving ? 0.7 : 1 }}
                  >
                    {deviceSaving ? '…' : 'Enregistrer'}
                  </button>
                </div>
              </div>

              {/* Règles */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>Règles d'alerte ({devRules.length})</label>
                  {!addRuleForm && (
                    <button
                      onClick={() => {
                        const firstTpl = deviceTemplates[0];
                        setAddRuleForm({ template_id: firstTpl?.id || null, field: firstTpl?.field || '', op: '>', threshold_num: '', threshold_str: '', cooldown_sec: firstTpl?.cooldown_min_sec || 60, enabled: true, user_label: '' });
                      }}
                      style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                    >
                      + Ajouter une règle
                    </button>
                  )}
                </div>

                {devRules.length === 0 && !addRuleForm && (
                  <p style={{ color: '#9ca3af', fontSize: 13, margin: '8px 0' }}>Aucune règle configurée.</p>
                )}

                {devRules.map(r => {
                  const edit = ruleEdits[r.id];
                  const vals = edit || r;
                  // Afficher le bon template : priorité template_id, fallback sur field
                  const activeTplId = edit
                    ? String(vals.template_id ?? '')
                    : String(r.template_id ?? deviceTemplates.find(t => t.field === r.field)?.id ?? '');
                  return (
                    <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', marginBottom: 10, background: edit ? '#f0f9ff' : '#fafafa' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 80px', gap: 8, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Type d'alerte</div>
                          {deviceTemplates.length > 0 ? (
                            <select
                              value={activeTplId}
                              onChange={e => {
                                const tpl = deviceTemplates.find(t => String(t.id) === e.target.value);
                                setRuleEdits(re => ({ ...re, [r.id]: { ...vals, template_id: tpl?.id ?? null, field: tpl?.field || vals.field, cooldown_sec: tpl?.cooldown_min_sec || vals.cooldown_sec } }));
                              }}
                              style={{ ...inputS, width: '100%' }}
                            >
                              <option value="">— choisir —</option>
                              {deviceTemplates.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                            </select>
                          ) : (
                            <span style={{ fontSize: 13, fontWeight: 500 }}><code style={{ fontSize: 12 }}>{r.field}</code></span>
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Opérateur</div>
                          <select value={vals.op} onChange={e => setRuleEdits(re => ({ ...re, [r.id]: { ...vals, op: e.target.value } }))} style={{ ...inputS, width: '100%' }}>
                            {OPS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Seuil</div>
                          <input value={vals.threshold_num ?? vals.threshold_str ?? ''} onChange={e => setRuleEdits(re => ({ ...re, [r.id]: { ...vals, threshold_num: e.target.value, threshold_str: null } }))} style={{ ...inputS, width: '100%' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Cooldown (s)</div>
                          <input type="number" value={vals.cooldown_sec} onChange={e => setRuleEdits(re => ({ ...re, [r.id]: { ...vals, cooldown_sec: e.target.value } }))} style={{ ...inputS, width: '100%' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input type="checkbox" checked={vals.enabled ?? true} onChange={e => setRuleEdits(re => ({ ...re, [r.id]: { ...vals, enabled: e.target.checked } }))} />
                          Activée
                        </label>
                        <div style={{ flex: 1, display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {ruleSaved[r.id] && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Enregistré</span>}
                          <button
                            onClick={() => saveRule(r.id, vals)}
                            disabled={ruleSaving[r.id]}
                            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 12px', fontSize: 12, cursor: 'pointer', opacity: ruleSaving[r.id] ? 0.6 : 1 }}
                          >
                            {ruleSaving[r.id] ? '…' : 'Enregistrer'}
                          </button>
                          {edit && (
                            <button onClick={() => setRuleEdits(re => { const n = { ...re }; delete n[r.id]; return n; })} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 5, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                              Annuler
                            </button>
                          )}
                          <button onClick={() => deleteRule(r.id)} style={{ background: 'none', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 5, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Formulaire ajout règle */}
                {addRuleForm && (
                  <div style={{ border: '2px dashed #2563eb', borderRadius: 8, padding: '12px 14px', marginBottom: 10, background: '#eff6ff' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#1d4ed8' }}>Nouvelle règle</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 80px', gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Type d'alerte</div>
                        {deviceTemplates.length > 0 ? (
                          <select
                            value={String(addRuleForm.template_id ?? '')}
                            onChange={e => {
                              const tpl = deviceTemplates.find(t => String(t.id) === e.target.value);
                              setAddRuleForm(f => ({ ...f, template_id: tpl?.id || null, field: tpl?.field || f.field, cooldown_sec: tpl?.cooldown_min_sec || f.cooldown_sec }));
                            }}
                            style={{ ...inputS, width: '100%' }}
                          >
                            <option value="">— choisir —</option>
                            {deviceTemplates.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                          </select>
                        ) : (
                          <input value={addRuleForm.field} onChange={e => setAddRuleForm(f => ({ ...f, field: e.target.value }))} style={{ ...inputS, width: '100%' }} placeholder="ex: soundPct" />
                        )}
                        {addRuleForm.field && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Champ : <code>{addRuleForm.field}</code></div>}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Opérateur</div>
                        <select value={addRuleForm.op} onChange={e => setAddRuleForm(f => ({ ...f, op: e.target.value }))} style={{ ...inputS, width: '100%' }}>
                          {OPS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Seuil</div>
                        <input value={addRuleForm.threshold_num} onChange={e => setAddRuleForm(f => ({ ...f, threshold_num: e.target.value }))} style={{ ...inputS, width: '100%' }} placeholder="50" />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Cooldown (s)</div>
                        <input type="number" value={addRuleForm.cooldown_sec} onChange={e => setAddRuleForm(f => ({ ...f, cooldown_sec: e.target.value }))} style={{ ...inputS, width: '100%' }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Libellé utilisateur (optionnel)</div>
                      <input value={addRuleForm.user_label} onChange={e => setAddRuleForm(f => ({ ...f, user_label: e.target.value }))} style={{ ...inputS, width: '100%', marginBottom: 10 }} placeholder="ex: Alerte bruit fort" />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setAddRuleForm(null)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 5, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>Annuler</button>
                      <button onClick={addRule} disabled={addRuleSaving || (!addRuleForm.field && !addRuleForm.template_id)} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 5, padding: '5px 14px', fontSize: 12, cursor: 'pointer', opacity: (!addRuleForm.field && !addRuleForm.template_id) ? 0.5 : 1 }}>
                        {addRuleSaving ? '…' : 'Créer la règle'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modale suppression utilisateur */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 28, width: 420, maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, color: '#b91c1c' }}>Supprimer définitivement l'utilisateur</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
              Cette action est <strong>irréversible</strong>. Elle supprimera le compte, tous les appareils (ESP + mobile),
              les règles d'alerte, les adresses et toutes les données associées.
            </p>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: '#6b7280' }}>
              Confirmez en saisissant l'adresse e-mail de l'utilisateur :
            </p>
            <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: 13, color: '#111' }}>{u.email}</p>
            <input
              className="input"
              type="email"
              placeholder={u.email}
              value={deleteConfirmEmail}
              onChange={e => setDeleteConfirmEmail(e.target.value)}
              style={{ marginBottom: 12 }}
              autoFocus
            />
            {deleteErr && (
              <div style={{ color: '#b91c1c', fontSize: 13, background: '#fee2e2', padding: '8px 12px', borderRadius: 8, marginBottom: 12 }}>
                {deleteErr}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Annuler
              </button>
              <button
                className="btn danger"
                onClick={deleteUser}
                disabled={deleting || deleteConfirmEmail !== u.email}
              >
                {deleting ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

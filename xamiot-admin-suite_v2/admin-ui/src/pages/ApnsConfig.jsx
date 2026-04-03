import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api.js';

const EMPTY_FORM = { team_id: '', key_id: '', bundle_id: '', key_pem: '', apns_env: 'sandbox' };

export default function ApnsConfig() {
  const [status, setStatus]   = useState(null); // { configured, team_id, key_id, bundle_id, use_sandbox, updated_at }
  const [form, setForm]       = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null); // { type: 'success'|'error', text }
  const fileRef               = useRef();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const data = await apiFetch('/admin/apns');
      setStatus(data);
      if (data.configured) {
        setForm({
          team_id:  data.team_id,
          key_id:   data.key_id,
          bundle_id: data.bundle_id,
          key_pem:  '',
          apns_env: data.apns_env ?? 'sandbox',
        });
      }
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Erreur lors du chargement' });
    } finally {
      setLoading(false);
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((f) => ({ ...f, key_pem: ev.target.result }));
    reader.readAsText(file);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.team_id || !form.key_id || !form.bundle_id || !form.key_pem) {
      setMsg({ type: 'error', text: 'Tous les champs sont obligatoires, y compris la clé .p8.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch('/admin/apns', { method: 'POST', body: form });
      setMsg({ type: 'success', text: 'Configuration APNS enregistrée et rechargée.' });
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Erreur lors de l\'enregistrement' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Supprimer la configuration APNS ? Les notifications iOS seront désactivées.')) return;
    setMsg(null);
    try {
      await apiFetch('/admin/apns', { method: 'DELETE' });
      setStatus({ configured: false });
      setForm(EMPTY_FORM);
      setMsg({ type: 'success', text: 'Configuration APNS supprimée.' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Erreur lors de la suppression' });
    }
  }

  if (loading) return <div className="container">Chargement...</div>;

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h2>Configuration APNS</h2>

      <div style={{ marginBottom: 20 }}>
        {status?.configured
          ? <span style={{ color: '#22c55e', fontWeight: 600 }}>APNS configuré ✅{status.updated_at ? ` — mis à jour le ${new Date(status.updated_at).toLocaleString('fr-FR')}` : ''}</span>
          : <span style={{ color: '#f59e0b', fontWeight: 600 }}>APNS non configuré ⚠️</span>
        }
      </div>

      {msg && (
        <div style={{
          padding: '10px 14px',
          marginBottom: 16,
          borderRadius: 6,
          background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: msg.type === 'success' ? '#15803d' : '#b91c1c',
          fontWeight: 500,
        }}>
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSave}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Team ID</label>
          <input
            className="input"
            type="text"
            placeholder="ex : 52P2R277KX"
            value={form.team_id}
            onChange={(e) => setForm((f) => ({ ...f, team_id: e.target.value }))}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Key ID</label>
          <input
            className="input"
            type="text"
            placeholder="ex : Y7SDPM4V35"
            value={form.key_id}
            onChange={(e) => setForm((f) => ({ ...f, key_id: e.target.value }))}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Bundle ID</label>
          <input
            className="input"
            type="text"
            placeholder="ex : com.retorik.XamDje"
            value={form.bundle_id}
            onChange={(e) => setForm((f) => ({ ...f, bundle_id: e.target.value }))}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Environnement</label>
          {[
            { value: 'sandbox',    label: 'Sandbox (dev)' },
            { value: 'production', label: 'Production' },
            { value: 'both',       label: 'Les deux (sandbox + production)' },
          ].map(({ value, label }) => (
            <label key={value} style={{ marginRight: 20, cursor: 'pointer' }}>
              <input
                type="radio"
                name="apns_env"
                value={value}
                checked={form.apns_env === value}
                onChange={() => setForm((f) => ({ ...f, apns_env: value }))}
                style={{ marginRight: 6 }}
              />
              {label}
            </label>
          ))}
          {form.apns_env === 'both' && (
            <p style={{ marginTop: 6, marginBottom: 0, fontSize: 12, color: '#6b7280' }}>
              La cle est utilisee pour les deux environnements. L'endpoint (sandbox/production) est determine par le flag de chaque appareil lors de l'enregistrement.
            </p>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            Clé .p8{status?.configured ? ' (laisser vide pour conserver l\'actuelle)' : ''}
          </label>
          <textarea
            className="input"
            rows={8}
            placeholder="-----BEGIN PRIVATE KEY-----&#10;..."
            value={form.key_pem}
            onChange={(e) => setForm((f) => ({ ...f, key_pem: e.target.value }))}
            style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
          />
          <div style={{ marginTop: 6 }}>
            <input ref={fileRef} type="file" accept=".p8" style={{ display: 'none' }} onChange={handleFile} />
            <button type="button" className="btn secondary" onClick={() => fileRef.current?.click()}>
              Choisir un fichier .p8
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          {status?.configured && (
            <button type="button" className="btn danger" onClick={handleDelete}>
              Supprimer la configuration
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

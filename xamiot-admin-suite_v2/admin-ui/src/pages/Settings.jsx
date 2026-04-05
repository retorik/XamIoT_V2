import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../api.js';

const TABS = [
  { key: 'smtp',       label: 'SMTP' },
  { key: 'retention',  label: 'Rétention des logs' },
  { key: 'ratelimit',  label: 'Rate limits' },
  { key: 'portal',     label: 'Portail client' },
  { key: 'apns',       label: 'iOS (APNS)' },
  { key: 'fcm',        label: 'Android (FCM)' },
  { key: 'translation',label: 'Traduction (DeepL)' },
  { key: 'stripe',     label: 'Stripe' },
];

export default function Settings() {
  const [tab, setTab] = useState('smtp');

  return (
    <div className="container">
      <h2>Paramètres</h2>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e5e7eb', paddingBottom: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '8px 16px', fontSize: 14, fontWeight: 500,
              color: tab === t.key ? '#2563eb' : '#6b7280',
              borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'smtp'        && <SmtpSection />}
      {tab === 'retention'   && <RetentionSection />}
      {tab === 'ratelimit'   && <RateLimitSection />}
      {tab === 'portal'      && <PortalSection />}
      {tab === 'apns'        && <ApnsSection />}
      {tab === 'fcm'         && <FcmSection />}
      {tab === 'translation' && <TranslationSection />}
      {tab === 'stripe'      && <StripeSection />}
    </div>
  );
}

/* ----------------------------------------------------------------
 *  Helpers partagés
 * ---------------------------------------------------------------- */
function MsgBanner({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      padding: '10px 14px', marginBottom: 16, borderRadius: 8,
      background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
      color:      msg.type === 'success' ? '#15803d' : '#b91c1c',
      fontWeight: 500, fontSize: 14,
    }}>
      {msg.text}
    </div>
  );
}

function ConfigStatus({ configured, label, updatedAt }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {configured
        ? <span style={{ color: '#22c55e', fontWeight: 600 }}>
            {label} configuré ✅{updatedAt ? ` — mis à jour le ${new Date(updatedAt).toLocaleString('fr-FR')}` : ''}
          </span>
        : <span style={{ color: '#f59e0b', fontWeight: 600 }}>{label} non configuré ⚠️</span>
      }
    </div>
  );
}

/* ----------------------------------------------------------------
 *  iOS APNS
 * ---------------------------------------------------------------- */
const EMPTY_APNS = { team_id: '', key_id: '', bundle_id: '', key_pem: '', apns_env: 'sandbox' };

function ApnsSection() {
  const [status, setStatus]   = useState(null);
  const [form, setForm]       = useState(EMPTY_APNS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null);
  const fileRef               = useRef();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setMsg(null);
    try {
      const data = await apiFetch('/admin/apns');
      setStatus(data);
      if (data.configured) {
        setForm({ team_id: data.team_id, key_id: data.key_id, bundle_id: data.bundle_id, key_pem: '', apns_env: data.apns_env || 'sandbox' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Erreur chargement' });
    } finally { setLoading(false); }
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm(f => ({ ...f, key_pem: ev.target.result }));
    reader.readAsText(file);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.team_id || !form.key_id || !form.bundle_id || !form.key_pem) {
      setMsg({ type: 'error', text: 'Tous les champs sont obligatoires, y compris la clé .p8.' });
      return;
    }
    setSaving(true); setMsg(null);
    try {
      await apiFetch('/admin/apns', { method: 'POST', body: { ...form } });
      setMsg({ type: 'success', text: 'Configuration APNS enregistrée et rechargée.' });
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Erreur enregistrement' });
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!window.confirm('Supprimer la configuration APNS ? Les notifications iOS seront désactivées.')) return;
    setMsg(null);
    try {
      await apiFetch('/admin/apns', { method: 'DELETE' });
      setStatus({ configured: false });
      setForm(EMPTY_APNS);
      setMsg({ type: 'success', text: 'Configuration APNS supprimée.' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Erreur suppression' });
    }
  }

  if (loading) return <div style={{ padding: 20, color: '#6b7280' }}>Chargement...</div>;

  return (
    <div className="card" style={{ maxWidth: 600 }}>
      <h3 style={{ marginTop: 0 }}>Configuration APNS (iOS)</h3>
      <ConfigStatus configured={status?.configured} label="APNS (iOS)" updatedAt={status?.updated_at} />
      <MsgBanner msg={msg} />

      <form onSubmit={handleSave}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px', marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280' }}>Team ID *</label>
            <input className="input" type="text" placeholder="ex : 52P2R277KX"
              value={form.team_id} onChange={e => setForm(f => ({ ...f, team_id: e.target.value }))} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280' }}>Key ID *</label>
            <input className="input" type="text" placeholder="ex : Y7SDPM4V35"
              value={form.key_id} onChange={e => setForm(f => ({ ...f, key_id: e.target.value }))} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280' }}>Bundle ID *</label>
          <input className="input" type="text" placeholder="ex : com.retorik.XamDje"
            value={form.bundle_id} onChange={e => setForm(f => ({ ...f, bundle_id: e.target.value }))} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Environnement</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { value: 'sandbox',    label: 'Sandbox (dev)',                      desc: 'Envoie uniquement vers api.sandbox.push.apple.com' },
              { value: 'production', label: 'Production',                          desc: 'Envoie uniquement vers api.push.apple.com' },
              { value: 'both',       label: 'Les deux (Sandbox + Production)',      desc: 'La clé p8 est valide dans les deux environnements — le serveur choisit selon l\'app enregistrée' },
            ].map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 6, border: `1px solid ${form.apns_env === opt.value ? '#2563eb' : '#e5e7eb'}`, background: form.apns_env === opt.value ? '#eff6ff' : 'white' }}>
                <input type="radio" name="apns_env" value={opt.value}
                  checked={form.apns_env === opt.value}
                  onChange={() => setForm(f => ({ ...f, apns_env: opt.value }))}
                  style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280' }}>
            Clé .p8{status?.configured ? ' (laisser vide pour conserver l\'actuelle)' : ' *'}
          </label>
          <textarea className="input" rows={8}
            placeholder="-----BEGIN PRIVATE KEY-----&#10;..."
            value={form.key_pem} onChange={e => setForm(f => ({ ...f, key_pem: e.target.value }))}
            style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
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

/* ----------------------------------------------------------------
 *  Android FCM
 * ---------------------------------------------------------------- */
function FcmSection() {
  const [status, setStatus]   = useState(null);
  const [saJson, setSaJson]   = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null);
  const fileRef               = useRef();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setMsg(null);
    try { setStatus(await apiFetch('/admin/fcm')); }
    catch (e) { setMsg({ type: 'error', text: e.message || 'Erreur chargement' }); }
    finally { setLoading(false); }
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSaJson(ev.target.result);
    reader.readAsText(file);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!saJson.trim()) {
      setMsg({ type: 'error', text: 'Le fichier de compte de service est obligatoire.' });
      return;
    }
    try { JSON.parse(saJson); }
    catch { setMsg({ type: 'error', text: 'JSON invalide. Vérifiez le fichier.' }); return; }

    setSaving(true); setMsg(null);
    try {
      const data = await apiFetch('/admin/fcm', { method: 'POST', body: { service_account_json: saJson } });
      setMsg({ type: 'success', text: `FCM configuré et rechargé. Projet : ${data.project_id}` });
      setSaJson('');
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message || 'Erreur enregistrement' });
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!window.confirm('Supprimer la configuration FCM ? Les notifications Android seront désactivées.')) return;
    setMsg(null);
    try {
      await apiFetch('/admin/fcm', { method: 'DELETE' });
      setStatus({ configured: false, ready: false });
      setSaJson('');
      setMsg({ type: 'success', text: 'Configuration FCM supprimée.' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Erreur suppression' });
    }
  }

  if (loading) return <div style={{ padding: 20, color: '#6b7280' }}>Chargement...</div>;

  return (
    <div className="card" style={{ maxWidth: 600 }}>
      <h3 style={{ marginTop: 0 }}>Configuration FCM (Android)</h3>
      <ConfigStatus configured={status?.configured} label="FCM (Android)" updatedAt={status?.updated_at} />

      {status?.configured && (
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div><span style={{ color: '#6b7280', marginRight: 8 }}>Projet :</span><b>{status.project_id}</b></div>
            <div><span style={{ color: '#6b7280', marginRight: 8 }}>Compte :</span><code style={{ fontSize: 12 }}>{status.client_email}</code></div>
            <div>
              <span style={{ color: '#6b7280', marginRight: 8 }}>Statut runtime :</span>
              {status.ready
                ? <span style={{ color: '#22c55e', fontWeight: 600 }}>Actif</span>
                : <span style={{ color: '#ef4444', fontWeight: 600 }}>Erreur d'initialisation</span>}
            </div>
          </div>
        </div>
      )}

      <MsgBanner msg={msg} />

      <form onSubmit={handleSave}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280' }}>
            Fichier Service Account JSON (Firebase){status?.configured ? ' — nouveau fichier pour remplacer' : ' *'}
          </label>
          <div style={{ marginBottom: 8 }}>
            <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFile} />
            <button type="button" className="btn secondary" onClick={() => fileRef.current?.click()}>
              Choisir le fichier JSON
            </button>
            {saJson && <span style={{ marginLeft: 10, fontSize: 13, color: '#22c55e' }}>✓ Fichier chargé</span>}
          </div>
          <textarea className="input" rows={10}
            placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
            value={saJson} onChange={e => setSaJson(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }} />
          <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
            Console Firebase → Paramètres → Comptes de service → Générer une nouvelle clé privée
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
          <button type="submit" className="btn primary" disabled={saving || !saJson.trim()}>
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

function SmtpSection() {
  const EMPTY = { host: '', port: 587, secure: false, user_login: '', pass: '', from_name: '', from_email: '', reply_to: '' };

  const [form, setForm]     = useState(EMPTY);
  const [ready, setReady]   = useState(false);
  const [configured, setConfigured] = useState(false);
  const [err, setErr]       = useState('');
  const [msg, setMsg]       = useState('');
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [showPass, setShowPass] = useState(false);

  async function load() {
    setErr('');
    try {
      const data = await apiFetch('/admin/smtp');
      setReady(data?.ready || false);
      setConfigured(data?.configured || false);
      if (data?.configured) {
        setForm({
          host:       data.host       || '',
          port:       data.port       || 587,
          secure:     data.secure     || false,
          user_login: data.user_login || '',
          pass:       '',  // jamais renvoyé par l'API
          from_name:  data.from_name  || '',
          from_email: data.from_email || '',
          reply_to:   data.reply_to   || '',
        });
      }
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  useEffect(() => { load(); }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save(e) {
    e.preventDefault();
    setErr(''); setMsg('');
    try {
      await apiFetch('/admin/smtp', {
        method: 'POST',
        body: {
          ...form,
          port:   Number(form.port),
          secure: Boolean(form.secure),
          pass:   form.pass || undefined,
        },
      });
      setMsg('Configuration SMTP enregistrée.');
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  async function del() {
    if (!confirm('Supprimer la configuration SMTP ?')) return;
    setErr(''); setMsg('');
    try {
      await apiFetch('/admin/smtp', { method: 'DELETE' });
      setForm(EMPTY);
      setConfigured(false);
      setReady(false);
      setMsg('Configuration supprimée.');
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  async function sendTest() {
    if (!testTo) return;
    setTesting(true); setErr(''); setMsg('');
    try {
      await apiFetch('/admin/smtp/test', { method: 'POST', body: { to: testTo } });
      setMsg(`Email de test envoyé à ${testTo}.`);
    } catch (e) {
      const detail = e?.data?.detail;
      const code   = e?.data?.error || e.message;
      const LABELS = {
        smtp_not_configured:     'SMTP non configuré.',
        smtp_connection_refused: 'Connexion refusée.',
        smtp_host_not_found:     'Hôte SMTP introuvable.',
        smtp_timeout:            'Délai de connexion dépassé.',
        smtp_auth_failed:        'Authentification SMTP refusée.',
        smtp_tls_error:          'Erreur TLS/certificat.',
        smtp_send_failed:        'Échec d\'envoi.',
      };
      setErr((LABELS[code] || code) + (detail ? ` — ${detail}` : ''));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Configuration SMTP</h3>
        <span style={{
          padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          background: ready ? '#dcfce7' : configured ? '#fee2e2' : '#f3f4f6',
          color:      ready ? '#15803d' : configured ? '#b91c1c' : '#6b7280',
          border:     `1px solid ${ready ? '#86efac' : configured ? '#fca5a5' : '#d1d5db'}`,
        }}>
          {ready ? 'Actif' : configured ? 'Erreur' : 'Non configuré'}
        </span>
      </div>

      {err ? <div style={{ color: '#b91c1c', marginBottom: 12 }}>{err}</div> : null}
      {msg ? <div style={{ color: '#15803d', marginBottom: 12 }}>{msg}</div> : null}

      <form onSubmit={save}>
        {/* Serveur */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '10px 8px', marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Serveur SMTP *</label>
            <input className="input" value={form.host} onChange={e => set('host', e.target.value)} placeholder="smtp.example.com" required />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Port *</label>
            <input className="input" type="number" value={form.port} onChange={e => set('port', e.target.value)} placeholder="587" required />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={Boolean(form.secure)} onChange={e => set('secure', e.target.checked)} />
            TLS implicite (port 465) — décoché = STARTTLS (port 587)
          </label>
        </div>

        {/* Auth */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 8px', marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Login SMTP</label>
            <input className="input" value={form.user_login} onChange={e => set('user_login', e.target.value)} placeholder="user@example.com" autoComplete="username" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>
              Mot de passe {configured && <span style={{ color: '#9ca3af' }}>(laisser vide pour conserver)</span>}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type={showPass ? 'text' : 'password'}
                value={form.pass}
                onChange={e => set('pass', e.target.value)}
                placeholder={configured ? '••••••••' : ''}
                autoComplete="new-password"
                style={{ paddingRight: 36 }}
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 14 }}
              >
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
          </div>
        </div>

        {/* Expéditeur */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 8px', marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Nom expéditeur</label>
            <input className="input" value={form.from_name} onChange={e => set('from_name', e.target.value)} placeholder="XamIoT" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Email expéditeur *</label>
            <input className="input" type="email" value={form.from_email} onChange={e => set('from_email', e.target.value)} placeholder="no-reply@example.com" required />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Reply-To</label>
          <input className="input" type="email" value={form.reply_to} onChange={e => set('reply_to', e.target.value)} placeholder="contact@example.com (optionnel)" />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" type="submit">Enregistrer</button>
          {configured && (
            <button className="btn secondary" type="button" style={{ color: '#b91c1c' }} onClick={del}>
              Supprimer
            </button>
          )}
        </div>
      </form>

      {configured && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Envoyer un email de test</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              type="email"
              style={{ flex: 1 }}
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              placeholder="destinataire@example.com"
            />
            <button className="btn" onClick={sendTest} disabled={testing || !testTo}>
              {testing ? 'Envoi…' : 'Tester'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const LOG_LABELS = {
  mqtt_raw:  { label: 'Logs MQTT bruts',  hasCount: true },
  alert_log: { label: 'Alertes',          hasCount: true },
};

function RetentionSection() {
  const [rows, setRows]   = useState([]);
  const [editing, setEditing] = useState({});
  const [err, setErr]     = useState('');
  const [msg, setMsg]     = useState('');

  async function load() {
    setErr('');
    try {
      const data = await apiFetch('/admin/retention');
      setRows(data || []);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(logType) {
    const e = editing[logType] || {};
    const days  = Number(e.days);
    const count = e.count !== '' && e.count != null ? Number(e.count) : null;
    if (!days || days < 1) return;
    setErr(''); setMsg('');
    try {
      await apiFetch(`/admin/retention/${logType}`, {
        method: 'PUT',
        body: { retain_days: days, retain_count: count },
      });
      setMsg(`Rétention mise à jour.`);
      setEditing(prev => ({ ...prev, [logType]: undefined }));
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  function startEdit(r) {
    setEditing(prev => ({
      ...prev,
      [r.log_type]: { days: r.retain_days, count: r.retain_count ?? '' },
    }));
  }

  function cancelEdit(logType) {
    setEditing(prev => ({ ...prev, [logType]: undefined }));
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ marginTop: 0 }}>Rétention des logs</h3>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        Les enregistrements plus anciens que la durée configurée sont supprimés automatiquement chaque heure.
        Vous pouvez aussi limiter le nombre maximum de logs conservés par device (logs MQTT et alertes).
      </p>

      {err ? <div style={{ color: '#b91c1c', marginBottom: 10 }}>{err}</div> : null}
      {msg ? <div style={{ color: '#15803d', marginBottom: 10 }}>{msg}</div> : null}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '6px 0', fontWeight: 600 }}>Type de log</th>
            <th style={{ textAlign: 'center', fontSize: 12, color: '#6b7280', padding: '6px 0', fontWeight: 600, width: 110 }}>Durée (jours)</th>
            <th style={{ textAlign: 'center', fontSize: 12, color: '#6b7280', padding: '6px 0', fontWeight: 600, width: 120 }}>Max / device</th>
            <th style={{ width: 90 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const meta = LOG_LABELS[r.log_type] || { label: r.log_type, hasCount: false };
            const ed   = editing[r.log_type];
            return (
              <tr key={r.log_type} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 0', fontSize: 13 }}>{meta.label}</td>

                <td style={{ padding: '10px 0', textAlign: 'center' }}>
                  {ed !== undefined ? (
                    <input
                      className="input"
                      type="number"
                      min={1}
                      style={{ width: 80, textAlign: 'center', padding: '4px 6px', fontSize: 13 }}
                      value={ed.days}
                      onChange={ev => setEditing(p => ({ ...p, [r.log_type]: { ...ed, days: ev.target.value } }))}
                    />
                  ) : (
                    <strong>{r.retain_days} j</strong>
                  )}
                </td>

                <td style={{ padding: '10px 0', textAlign: 'center' }}>
                  {meta.hasCount ? (
                    ed !== undefined ? (
                      <input
                        className="input"
                        type="number"
                        min={1}
                        style={{ width: 80, textAlign: 'center', padding: '4px 6px', fontSize: 13 }}
                        placeholder="illimité"
                        value={ed.count}
                        onChange={ev => setEditing(p => ({ ...p, [r.log_type]: { ...ed, count: ev.target.value } }))}
                      />
                    ) : (
                      <span style={{ color: r.retain_count ? '#374151' : '#9ca3af' }}>
                        {r.retain_count ? `${r.retain_count}` : '—'}
                      </span>
                    )
                  ) : (
                    <span style={{ color: '#d1d5db' }}>—</span>
                  )}
                </td>

                <td style={{ padding: '10px 0', textAlign: 'right' }}>
                  {ed !== undefined ? (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="btn" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => save(r.log_type)}>OK</button>
                      <button className="btn secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => cancelEdit(r.log_type)}>✕</button>
                    </div>
                  ) : (
                    <button className="btn secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => startEdit(r)}>
                      Modifier
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr><td colSpan={4} style={{ color: '#6b7280', fontSize: 13, padding: '10px 0' }}>Aucune configuration.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const LIMITER_LABELS = { global: 'Global', admin: 'Admin', auth: 'Auth', poll: 'Polling', portal_login: 'Portail login', contact: 'Contact', app: 'Apps mobiles' };
const BADGE_COLORS = {
  auth:         { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' },
  poll:         { bg: '#fef9c3', color: '#92400e', border: '#fde68a' },
  admin:        { bg: '#ffedd5', color: '#c2410c', border: '#fdba74' },
  global:       { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  portal_login: { bg: '#ede9fe', color: '#6d28d9', border: '#c4b5fd' },
  contact:      { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  app:          { bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' },
};

function LimiterBadge({ name }) {
  const bc = BADGE_COLORS[name] || { bg: '#ede9fe', color: '#6d28d9', border: '#c4b5fd' };
  return (
    <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: bc.bg, color: bc.color, border: `1px solid ${bc.border}` }}>
      {LIMITER_LABELS[name] || name}
    </span>
  );
}

function RateLimitSection() {
  const EMPTY = { global_max: 500, global_window_ms: 900000, admin_max: 300, admin_window_ms: 900000, auth_max: 20, auth_window_ms: 900000, poll_max: 2000, poll_window_ms: 900000, contact_max: 5, contact_window_ms: 3600000, portal_login_max: 10, portal_login_window_ms: 900000, app_max: 1000, app_window_ms: 900000, ip_whitelist: '' };
  const [form, setForm] = useState(EMPTY);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [err, setErr]  = useState('');
  const [msg, setMsg]  = useState('');
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState([]);
  const [ipRows, setIpRows] = useState([]);
  const [activeTab, setActiveTab] = useState('blocages');
  const [resetMsg, setResetMsg] = useState('');

  async function load() {
    setErr('');
    try {
      const data = await apiFetch('/admin/rate-limit');
      setForm({
        global_max:             data.global_max             ?? 500,
        global_window_ms:       data.global_window_ms       ?? 900000,
        admin_max:              data.admin_max              ?? 300,
        admin_window_ms:        data.admin_window_ms        ?? 900000,
        auth_max:               data.auth_max               ?? 20,
        auth_window_ms:         data.auth_window_ms         ?? 900000,
        poll_max:               data.poll_max               ?? 2000,
        poll_window_ms:         data.poll_window_ms         ?? 900000,
        contact_max:            data.contact_max            ?? 5,
        contact_window_ms:      data.contact_window_ms      ?? 3600000,
        portal_login_max:       data.portal_login_max       ?? 10,
        portal_login_window_ms: data.portal_login_window_ms ?? 900000,
        app_max:                data.app_max                ?? 1000,
        app_window_ms:          data.app_window_ms          ?? 900000,
        ip_whitelist:           data.ip_whitelist           ?? '',
      });
      setUpdatedAt(data.updated_at);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  async function loadStats() {
    try {
      const data = await apiFetch('/admin/rate-limit/stats');
      setStats(data || []);
    } catch { /* silencieux */ }
  }

  async function loadLogs() {
    try {
      const data = await apiFetch('/admin/rate-limit/logs');
      setLogs(data || []);
    } catch { /* silencieux */ }
  }

  function isPrivateIp(ip) {
    return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1$|fc|fd)/.test(ip);
  }

  async function loadIps() {
    try {
      const data = await apiFetch('/admin/rate-limit/ips');
      setIpRows((data || []).filter(r => !isPrivateIp(r.ip)));
    } catch { /* silencieux */ }
  }

  async function refreshAll() {
    await Promise.all([loadStats(), loadLogs(), loadIps()]);
  }

  useEffect(() => {
    load(); refreshAll();
    const id = setInterval(refreshAll, 10000);
    return () => clearInterval(id);
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save(e) {
    e.preventDefault();
    setErr(''); setMsg('');
    try {
      await apiFetch('/admin/rate-limit', {
        method: 'POST',
        body: {
          global_max:             Number(form.global_max),
          global_window_ms:       Number(form.global_window_ms),
          admin_max:              Number(form.admin_max),
          admin_window_ms:        Number(form.admin_window_ms),
          auth_max:               Number(form.auth_max),
          auth_window_ms:         Number(form.auth_window_ms),
          poll_max:               Number(form.poll_max),
          poll_window_ms:         Number(form.poll_window_ms),
          contact_max:            Number(form.contact_max),
          contact_window_ms:      Number(form.contact_window_ms),
          portal_login_max:       Number(form.portal_login_max),
          portal_login_window_ms: Number(form.portal_login_window_ms),
          app_max:                Number(form.app_max),
          app_window_ms:          Number(form.app_window_ms),
          ip_whitelist:           form.ip_whitelist,
        },
      });
      setMsg('Configuration enregistrée et appliquée immédiatement.');
      await load();
      await refreshAll();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  async function resetIp(ip, limiter) {
    try {
      await apiFetch('/admin/rate-limit/ips/reset', { method: 'POST', body: { ip, limiter } });
      setResetMsg(`Compteur réinitialisé pour ${ip} (${LIMITER_LABELS[limiter] || limiter})`);
      setTimeout(() => setResetMsg(''), 3000);
      await loadIps();
    } catch (e) {
      setResetMsg('Erreur : ' + (e?.data?.error || e.message));
    }
  }

  const hasBlocked = logs.length > 0;
  function getStat(name) { return stats.find(s => s.name === name) || { count: 0, blocked: 0, windowResetIn: 0 }; }

  const ROWS = [
    { label: 'Global',        desc: 'Toutes les routes (par IP)',                          maxKey: 'global_max',        windowKey: 'global_window_ms',        statKey: 'global' },
    { label: 'Admin',         desc: 'Back-office (/admin/*)',                              maxKey: 'admin_max',         windowKey: 'admin_window_ms',         statKey: 'admin' },
    { label: 'Apps mobiles',  desc: 'iOS / Android (/devices, /esp-devices, /me…)',       maxKey: 'app_max',           windowKey: 'app_window_ms',           statKey: 'app' },
    { label: 'Auth',          desc: '/auth/* (signup, login, reset…)',                     maxKey: 'auth_max',          windowKey: 'auth_window_ms',          statKey: 'auth' },
    { label: 'Portail login', desc: 'Login portail client (/auth/login)',                  maxKey: 'portal_login_max',  windowKey: 'portal_login_window_ms',  statKey: 'portal_login' },
    { label: 'Polling',       desc: 'Status bar (status, apns, fcm, smtp)',                maxKey: 'poll_max',          windowKey: 'poll_window_ms',          statKey: 'poll' },
    { label: 'Contact',       desc: 'Formulaire de contact public (/public/contact)',      maxKey: 'contact_max',       windowKey: 'contact_window_ms',       statKey: 'contact' },
  ];

  const inputStyle = { width: 72, textAlign: 'center', padding: '4px 6px', fontSize: 13 };
  const tabStyle = (t) => ({
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: activeTab === t ? 600 : 400,
    color: activeTab === t ? '#1d4ed8' : '#6b7280',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === t ? '2px solid #1d4ed8' : '2px solid transparent',
    cursor: 'pointer',
    marginBottom: -1,
  });

  const blockedCount = ipRows.filter(r => r.blocked).length;
  const activeCount  = ipRows.filter(r => r.count > 0).length;

  return (
    <div className="card" style={{ maxWidth: 700 }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Rate limits</h3>
        <span
          title={hasBlocked ? `${logs.length} connexion(s) bloquée(s) dans la fenêtre courante` : 'Aucune IP bloquée'}
          style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: hasBlocked ? '#dc2626' : '#16a34a', flexShrink: 0, boxShadow: `0 0 0 3px ${hasBlocked ? '#fee2e2' : '#dcfce7'}` }}
        />
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        <button style={tabStyle('blocages')} onClick={() => setActiveTab('blocages')}>Blocages actifs</button>
        <button style={tabStyle('whitelist')} onClick={() => setActiveTab('whitelist')}>Whitelist IP</button>
        <button style={tabStyle('config')} onClick={() => setActiveTab('config')}>Configuration</button>
      </div>

      {/* ── Onglet : Blocages actifs ─────────────────────────── */}
      {activeTab === 'blocages' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              Données en mémoire vive — réinitialisées au redémarrage du container.
            </span>
            <button className="btn secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={refreshAll}>
              Actualiser
            </button>
          </div>

          {resetMsg && (
            <div style={{ padding: '6px 10px', marginBottom: 10, borderRadius: 6, background: '#f0fdf4', color: '#15803d', fontSize: 12, border: '1px solid #86efac' }}>
              {resetMsg}
            </div>
          )}

          {ipRows.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9ca3af', padding: '12px 0' }}>
              Aucune IP suivie en mémoire pour le moment.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, fontSize: 12, color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>ADRESSE IP</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, fontSize: 12, color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>TYPE DE LIMITEUR</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600, fontSize: 12, color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>REQUÊTES / SEUIL</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600, fontSize: 12, color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>RÉINIT. DANS</th>
                    <th style={{ textAlign: 'center', padding: '6px 10px', fontWeight: 600, fontSize: 12, color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>STATUT</th>
                    <th style={{ padding: '6px 10px', borderBottom: '2px solid #e5e7eb' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {ipRows.map((row) => (
                    <tr key={row.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: row.blocked ? '#dc2626' : '#374151' }}>
                        {row.ip}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <LimiterBadge name={row.limiter} />
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                        <span style={{ fontWeight: 600, color: row.count >= row.max ? '#dc2626' : '#374151' }}>
                          {row.count}
                        </span>
                        <span style={{ color: '#9ca3af' }}> / {row.max}</span>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>
                        {row.windowResetIn > 0 ? `${Math.ceil(row.windowResetIn / 60)}min` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {row.blocked
                          ? <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>🚫 Bloqué</span>
                          : <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>✓ Actif</span>
                        }
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button
                          className="btn secondary"
                          style={{ padding: '3px 10px', fontSize: 11 }}
                          onClick={() => resetIp(row.ip, row.limiter)}
                        >
                          Remettre à zéro
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
            {blockedCount} bloqué{blockedCount !== 1 ? 's' : ''} • {activeCount} compteur{activeCount !== 1 ? 's' : ''} actif{activeCount !== 1 ? 's' : ''} en mémoire
          </div>
        </div>
      )}

      {/* ── Onglet : Whitelist IP ─────────────────────────────── */}
      {activeTab === 'whitelist' && (
        <div>
          {err ? <div style={{ color: '#b91c1c', marginBottom: 12 }}>{err}</div> : null}
          {msg ? <div style={{ color: '#15803d', marginBottom: 12 }}>{msg}</div> : null}
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
            Ces IPs contournent tous les limiteurs. Une IP par ligne ou séparées par des virgules.
          </p>
          <form onSubmit={save}>
            <textarea
              className="input"
              rows={6}
              placeholder={'192.168.1.1\n10.0.0.0'}
              style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical', marginBottom: 12 }}
              value={(form.ip_whitelist || '').replace(/,/g, '\n')}
              onChange={e => set('ip_whitelist', e.target.value.replace(/\n/g, ','))}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn" type="submit">Enregistrer</button>
              {updatedAt && (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                  Dernière modif : {new Date(updatedAt).toLocaleString('fr-FR')}
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* ── Onglet : Configuration ────────────────────────────── */}
      {activeTab === 'config' && (
        <div>
          {err ? <div style={{ color: '#b91c1c', marginBottom: 12 }}>{err}</div> : null}
          {msg ? <div style={{ color: '#15803d', marginBottom: 12 }}>{msg}</div> : null}
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            Les modifications sont appliquées immédiatement sans redémarrage. Les compteurs en cours sont réinitialisés à l'application.
          </p>
          <form onSubmit={save}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '4px 0 8px', fontWeight: 600 }}>Limiteur</th>
                  <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '4px 0 8px', fontWeight: 600 }}>Description</th>
                  <th style={{ textAlign: 'right', fontSize: 12, color: '#6b7280', padding: '4px 0 8px', fontWeight: 600 }}>Req. max</th>
                  <th style={{ textAlign: 'right', fontSize: 12, color: '#6b7280', padding: '4px 0 8px 12px', fontWeight: 600 }}>Durée (min)</th>
                  <th style={{ textAlign: 'right', fontSize: 12, color: '#6b7280', padding: '4px 0 8px 0 12px', fontWeight: 600 }}>Utilisation</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(({ label, desc, maxKey, windowKey, statKey }) => {
                  const st  = getStat(statKey);
                  const max = Number(form[maxKey]) || 1;
                  const pct = Math.min(100, Math.round((st.count / max) * 100));
                  const barColor = pct >= 90 ? '#dc2626' : pct >= 70 ? '#f59e0b' : '#16a34a';
                  return (
                    <tr key={maxKey} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 0', fontSize: 13, fontWeight: 500, width: 90 }}>{label}</td>
                      <td style={{ padding: '8px 0', fontSize: 12, color: '#6b7280' }}>{desc}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>
                        <input className="input" type="number" min={1} style={inputStyle} value={form[maxKey]} onChange={e => set(maxKey, e.target.value)} />
                      </td>
                      <td style={{ padding: '8px 0 8px 12px', textAlign: 'right' }}>
                        <input className="input" type="number" min={1} style={inputStyle} value={Math.round(form[windowKey] / 60000)} onChange={e => set(windowKey, Number(e.target.value) * 60000)} />
                      </td>
                      <td style={{ padding: '8px 0 8px 12px', textAlign: 'right', minWidth: 110 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: barColor }}>
                            {st.count} / {max}
                            {st.blocked > 0 && <span style={{ marginLeft: 5, color: '#dc2626' }}>🚫 {st.blocked}</span>}
                          </span>
                          <div style={{ width: 80, height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width .4s' }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn" type="submit">Appliquer</button>
              {updatedAt && (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                  Dernière modif : {new Date(updatedAt).toLocaleString('fr-FR')}
                </span>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 *  PortalSection — Paramètres du portail client
 * ---------------------------------------------------------------- */

function PortalSection() {
  const [form, setForm] = useState({ portal_refresh_interval_sec: '60', portal_idle_timeout_sec: '60', portal_auto_logout_min: '30' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setErr('');
    try {
      const data = await apiFetch('/admin/app-config');
      const cfgMap = {};
      (data || []).forEach(r => { cfgMap[r.key] = r.value; });
      setForm({
        portal_refresh_interval_sec: cfgMap.portal_refresh_interval_sec || '60',
        portal_idle_timeout_sec:     cfgMap.portal_idle_timeout_sec     || '60',
        portal_auto_logout_min:      cfgMap.portal_auto_logout_min      || '30',
      });
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setErr(''); setMsg('');
    try {
      await Promise.all(
        Object.entries(form).map(([key, value]) =>
          apiFetch(`/admin/app-config/${key}`, { method: 'PUT', body: { value: String(value) } })
        )
      );
      setMsg('Paramètres du portail enregistrés.');
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  if (loading) return <div className="card" style={{ maxWidth: 520 }}>Chargement…</div>;

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3 style={{ marginTop: 0 }}>Portail client</h3>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        Paramètres de comportement du portail client (rafraîchissement, déconnexion automatique).
        Les changements prennent effet au prochain chargement de page par l'utilisateur.
      </p>

      {err ? <div style={{ color: '#b91c1c', marginBottom: 12 }}>{err}</div> : null}
      {msg ? <div style={{ color: '#15803d', marginBottom: 12 }}>{msg}</div> : null}

      <form onSubmit={save}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
            Rafraîchissement automatique
          </label>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: '#6b7280' }}>
            Intervalle entre chaque mise à jour automatique des données (graphiques, mesures).
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="input"
              type="number"
              min={10}
              max={600}
              style={{ width: 90, textAlign: 'center', padding: '6px 8px', fontSize: 13 }}
              value={form.portal_refresh_interval_sec}
              onChange={e => setForm(f => ({ ...f, portal_refresh_interval_sec: e.target.value }))}
            />
            <span style={{ fontSize: 13, color: '#6b7280' }}>secondes</span>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
            Pause après inactivité
          </label>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: '#6b7280' }}>
            Délai d'inactivité (pas de souris, clavier, scroll) avant de suspendre le rafraîchissement automatique.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="input"
              type="number"
              min={10}
              max={600}
              style={{ width: 90, textAlign: 'center', padding: '6px 8px', fontSize: 13 }}
              value={form.portal_idle_timeout_sec}
              onChange={e => setForm(f => ({ ...f, portal_idle_timeout_sec: e.target.value }))}
            />
            <span style={{ fontSize: 13, color: '#6b7280' }}>secondes</span>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
            Déconnexion automatique
          </label>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: '#6b7280' }}>
            Délai d'inactivité après lequel l'utilisateur est déconnecté automatiquement.
            Mettre 0 pour désactiver.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="input"
              type="number"
              min={0}
              max={1440}
              style={{ width: 90, textAlign: 'center', padding: '6px 8px', fontSize: 13 }}
              value={form.portal_auto_logout_min}
              onChange={e => setForm(f => ({ ...f, portal_auto_logout_min: e.target.value }))}
            />
            <span style={{ fontSize: 13, color: '#6b7280' }}>minutes</span>
          </div>
        </div>

        <button className="btn" type="submit">Enregistrer</button>
      </form>
    </div>
  );
}

/* ----------------------------------------------------------------
 *  TranslationSection — Configuration DeepL
 * ---------------------------------------------------------------- */
function TranslationSection() {
  const [apiKey, setApiKey]         = useState('');
  const [saved, setSaved]           = useState(false);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [msg, setMsg]               = useState(null);

  async function saveKey(e) {
    e.preventDefault();
    setMsg(null); setTestResult(null);
    try {
      await apiFetch('/admin/app-config/deepl_api_key', {
        method: 'PUT',
        body: { value: apiKey },
      });
      setMsg({ type: 'success', text: 'Clé DeepL enregistrée.' });
      setApiKey('');
      setSaved(true);
    } catch (err) {
      setMsg({ type: 'error', text: err?.data?.error || err.message });
    }
  }

  async function testKey() {
    setTesting(true); setTestResult(null); setMsg(null);
    try {
      const data = await apiFetch('/admin/app-config/deepl/test', { method: 'POST' });
      if (data.ok) {
        setTestResult({ ok: true, text: `Test OK — traduction : "${data.sample}"` });
      } else {
        setTestResult({ ok: false, text: data.message || data.error || 'Erreur inconnue' });
      }
    } catch (err) {
      setTestResult({ ok: false, text: err?.data?.error || err.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h3 style={{ marginTop: 0 }}>Traduction automatique — DeepL</h3>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
        La clé DeepL Free API permet de traduire automatiquement les pages et produits
        vers l'anglais et l'espagnol. Inscription gratuite sur{' '}
        <a href="https://www.deepl.com/pro-api" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
          deepl.com/pro-api
        </a>{' '}
        — 500 000 caractères/mois inclus sans CB.
      </p>

      <MsgBanner msg={msg} />

      {testResult && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8,
          background: testResult.ok ? '#dcfce7' : '#fee2e2',
          color:      testResult.ok ? '#15803d' : '#b91c1c',
          fontWeight: 500, fontSize: 14,
        }}>
          {testResult.text}
        </div>
      )}

      <form onSubmit={saveKey}>
        <label style={{ display: 'block', fontWeight: 500, marginBottom: 6, fontSize: 14 }}>
          Clé API DeepL (format : <code>xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx</code>)
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="Coller la clé ici (valeur actuelle masquée)"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit"
            disabled={!apiKey.trim()}
            style={{
              background: apiKey.trim() ? '#2563eb' : '#93c5fd',
              color: '#fff', border: 'none', borderRadius: 6,
              padding: '8px 18px', fontSize: 14, cursor: apiKey.trim() ? 'pointer' : 'default',
            }}
          >
            Enregistrer
          </button>
          <button
            type="button"
            onClick={testKey}
            disabled={testing}
            style={{
              background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
              borderRadius: 6, padding: '8px 18px', fontSize: 14, cursor: 'pointer',
            }}
          >
            {testing ? 'Test en cours…' : 'Tester la connexion'}
          </button>
        </div>
      </form>

      {saved && (
        <p style={{ marginTop: 16, fontSize: 13, color: '#6b7280' }}>
          ✓ Une clé est actuellement configurée. Pour la remplacer, coller la nouvelle clé ci-dessus.
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 *  AppConfigSection — Configuration générale
 * ---------------------------------------------------------------- */
const EDITABLE_KEYS = [
  { key: 'site_name',              label: 'Nom du site',                   type: 'text' },
  { key: 'support_email',          label: 'Email de support',              type: 'email' },
  { key: 'default_lang',           label: 'Langue par défaut',             type: 'select', options: ['fr', 'en', 'es'] },
  { key: 'available_langs',        label: 'Langues disponibles (virgule)', type: 'text' },
  { key: 'password_min_length',    label: 'Longueur min. mot de passe',    type: 'number' },
  { key: 'password_require_upper', label: 'Exiger une majuscule',          type: 'select', options: ['true', 'false'] },
  { key: 'password_require_digit', label: 'Exiger un chiffre',             type: 'select', options: ['true', 'false'] },
];

const MEDIA_BASE = import.meta.env.VITE_API_BASE || 'https://apixam.holiceo.com';

const PICKER_ROOT = '__root__';
function isValidPickerFolder(f) { return f && f !== '/' && f !== '' && f !== PICKER_ROOT; }

function MediaPickerModal({ onSelect, onClose }) {
  const [media, setMedia]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState('');
  const [search, setSearch]         = useState('');
  const [currentFolder, setCurrentFolder] = useState(PICKER_ROOT);

  useEffect(() => {
    apiFetch('/admin/cms/media')
      .then(data => setMedia(Array.isArray(data) ? data : (data.items || data.media || [])))
      .catch(e => setErr(e?.data?.error || e.message || 'Erreur chargement médiathèque'))
      .finally(() => setLoading(false));
  }, []);

  const savedFolders = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('xamiot_media_folders') || '[]'); } catch { return []; }
  }, []);
  const fileFolders = [...new Set(media.map(f => f.folder).filter(isValidPickerFolder))];
  const allFolders  = [...new Set([...savedFolders, ...fileFolders])].filter(isValidPickerFolder);

  const filtered = media.filter(item => {
    const inFolder = currentFolder === PICKER_ROOT
      ? !isValidPickerFolder(item.folder)
      : item.folder === currentFolder;
    const name = item.original_name || item.filename || '';
    return inFolder && name.toLowerCase().includes(search.toLowerCase());
  });

  const folderBtnStyle = (active) => ({
    display: 'block', width: '100%', textAlign: 'left',
    padding: '6px 10px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
    background: active ? '#2563eb' : 'transparent', color: active ? '#fff' : '#374151',
    fontWeight: active ? 600 : 400,
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 10, width: 740, maxWidth: '95vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Médiathèque</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280', lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>
        {/* Search */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Sidebar dossiers */}
          <div style={{ width: 160, borderRight: '1px solid #e5e7eb', padding: '10px 8px', overflowY: 'auto', flexShrink: 0 }}>
            <button style={folderBtnStyle(currentFolder === PICKER_ROOT)} onClick={() => setCurrentFolder(PICKER_ROOT)}>
              🗂 Médiathèque
            </button>
            {allFolders.map(folder => (
              <button key={folder} style={folderBtnStyle(currentFolder === folder)} onClick={() => setCurrentFolder(folder)}>
                📁 {folder}
              </button>
            ))}
          </div>
          {/* Grille images */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {loading && <div style={{ color: '#6b7280', fontSize: 14 }}>Chargement...</div>}
            {err && <div style={{ color: '#b91c1c', fontSize: 14 }}>{err}</div>}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ color: '#9ca3af', fontSize: 14 }}>Aucun fichier dans ce dossier.</div>
            )}
            {!loading && !err && filtered.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                {filtered.map((item, i) => (
                  <button
                    key={item.id || item.url || i}
                    onClick={() => onSelect(item)}
                    style={{ border: '2px solid #e5e7eb', borderRadius: 8, padding: 6, background: '#f9fafb', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#2563eb'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}
                  >
                    <img
                      src={item.url_path ? `${MEDIA_BASE}${item.url_path}` : item.url}
                      alt={item.original_name || item.filename || ''}
                      style={{ width: '100%', height: 80, objectFit: 'contain', borderRadius: 4 }}
                      onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                    />
                    <div style={{ display: 'none', width: '100%', height: 80, alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#d1d5db' }}>🖼</div>
                    <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.original_name || item.filename || item.url_path?.split('/').pop() || ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoSection() {
  const [logoUrl, setLogoUrl]         = useState('');
  const [logoHeight, setLogoHeight]   = useState(40);
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  useEffect(() => { loadLogo(); }, []);

  async function loadLogo() {
    try {
      const rows = await apiFetch('/admin/app-config');
      const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
      setLogoUrl(map.logo_url || '');
      setLogoHeight(map.logo_height ? parseInt(map.logo_height, 10) : 40);
    } catch { /* ignore */ }
  }

  async function saveLogo() {
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch('/admin/app-config/logo_url', { method: 'PUT', body: { value: logoUrl } });
      await apiFetch('/admin/app-config/logo_height', { method: 'PUT', body: { value: String(logoHeight) } });
      setMsg({ type: 'success', text: 'Logo enregistré.' });
    } catch (err) {
      setMsg({ type: 'error', text: err?.data?.error || err.message });
    } finally {
      setSaving(false);
    }
  }

  function handleMediaSelect(item) {
    const url = item.url_path ? `${MEDIA_BASE}${item.url_path}` : item.url;
    setLogoUrl(url || '');
    setShowMediaPicker(false);
  }

  return (
    <div style={{ maxWidth: 640, marginBottom: 40 }}>
      {showMediaPicker && (
        <MediaPickerModal
          onSelect={handleMediaSelect}
          onClose={() => setShowMediaPicker(false)}
        />
      )}

      <h3 style={{ marginTop: 0 }}>Logo du site</h3>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
        Sélectionnez une image depuis la médiathèque ou collez une URL directement.
        Laissez vide pour afficher le texte "XamIoT" dans l'en-tête.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
            URL du logo
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://..."
              style={{ flex: 1, boxSizing: 'border-box', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
            />
            <button
              type="button"
              onClick={() => setShowMediaPicker(true)}
              style={{
                background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
                borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
                whiteSpace: 'nowrap', fontWeight: 500,
              }}
            >
              Choisir depuis la médiathèque
            </button>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
            Hauteur (px)
          </label>
          <input
            type="number"
            value={logoHeight}
            min={10}
            max={200}
            onChange={e => setLogoHeight(parseInt(e.target.value, 10) || 40)}
            style={{ width: 100, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
          />
        </div>

        {logoUrl && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Aperçu</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <img
                src={logoUrl}
                alt="Aperçu logo"
                style={{ height: logoHeight, maxWidth: 300, objectFit: 'contain', display: 'block' }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
          </div>
        )}

        <MsgBanner msg={msg} />

        <div>
          <button
            onClick={saveLogo}
            disabled={saving}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer le logo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NavStoreSection() {
  const KEYS = ['appstore_url', 'googleplay_url', 'nav_appstore_logo', 'nav_googleplay_logo'];
  const [vals, setVals]     = useState({ appstore_url: '', googleplay_url: '', nav_appstore_logo: '', nav_googleplay_logo: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState(null);
  const [picker, setPicker] = useState(null); // 'nav_appstore_logo' | 'nav_googleplay_logo' | null

  useEffect(() => { loadVals(); }, []);

  async function loadVals() {
    try {
      const rows = await apiFetch('/admin/app-config');
      const map  = Object.fromEntries(rows.map(r => [r.key, r.value]));
      setVals({
        appstore_url:        map.appstore_url        || '',
        googleplay_url:      map.googleplay_url      || '',
        nav_appstore_logo:   map.nav_appstore_logo   || '',
        nav_googleplay_logo: map.nav_googleplay_logo || '',
      });
    } catch { /* ignore */ }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await Promise.all(
        KEYS.map(k => apiFetch(`/admin/app-config/${k}`, { method: 'PUT', body: { value: vals[k] || '' } }))
      );
      setMsg({ type: 'success', text: 'Liens App Store / Google Play enregistrés.' });
    } catch (err) {
      setMsg({ type: 'error', text: err?.data?.error || err.message });
    } finally {
      setSaving(false);
    }
  }

  function handleMediaSelect(item) {
    const url = item.url_path ? `${MEDIA_BASE}${item.url_path}` : item.url;
    setVals(v => ({ ...v, [picker]: url || '' }));
    setPicker(null);
  }

  return (
    <div style={{ maxWidth: 640, marginBottom: 40 }}>
      {picker && (
        <MediaPickerModal
          onSelect={handleMediaSelect}
          onClose={() => setPicker(null)}
        />
      )}

      <h3 style={{ marginTop: 0 }}>Liens App Store &amp; Google Play (header)</h3>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
        URLs de destination des boutons dans le coin supérieur droit du site.
        Ajoutez un logo depuis la médiathèque pour remplacer le texte par une image.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {[
          { key: 'appstore_url', logoKey: 'nav_appstore_logo', label: 'App Store', placeholder: 'https://apps.apple.com/fr/app/...' },
          { key: 'googleplay_url', logoKey: 'nav_googleplay_logo', label: 'Google Play', placeholder: 'https://play.google.com/store/apps/...' },
        ].map(({ key, logoKey, label, placeholder }) => (
          <div key={key} style={{ padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: '#111827' }}>{label}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>URL de destination</label>
                <input
                  type="text"
                  value={vals[key]}
                  onChange={e => setVals(v => ({ ...v, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                  Logo (remplace le texte "{label}" si renseigné)
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={vals[logoKey]}
                    onChange={e => setVals(v => ({ ...v, [logoKey]: e.target.value }))}
                    placeholder="https://... ou laisser vide pour afficher le texte"
                    style={{ flex: 1, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={() => setPicker(logoKey)}
                    style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Médiathèque
                  </button>
                  {vals[logoKey] && (
                    <button
                      type="button"
                      onClick={() => setVals(v => ({ ...v, [logoKey]: '' }))}
                      style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 6, padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}
                      title="Supprimer le logo"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {vals[logoKey] && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={vals[logoKey]}
                      alt={`Aperçu ${label}`}
                      style={{ height: 32, maxWidth: 200, objectFit: 'contain', display: 'block', border: '1px solid #e5e7eb', borderRadius: 4, padding: 4, background: '#fff' }}
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        <MsgBanner msg={msg} />

        <div>
          <button
            onClick={save}
            disabled={saving}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppConfigSection() {
  const [config, setConfig]   = useState({});
  const [editing, setEditing] = useState({});
  const [saving, setSaving]   = useState({});
  const [msgs, setMsgs]       = useState({});

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const rows = await apiFetch('/admin/app-config');
      const map = Object.fromEntries(rows.map(r => [r.key, r]));
      setConfig(map);
    } catch { /* ignore */ }
  }

  function startEdit(key) {
    setEditing(p => ({ ...p, [key]: config[key]?.value ?? '' }));
  }

  function cancelEdit(key) {
    setEditing(p => { const n = { ...p }; delete n[key]; return n; });
    setMsgs(p => { const n = { ...p }; delete n[key]; return n; });
  }

  async function save(key) {
    setSaving(p => ({ ...p, [key]: true }));
    setMsgs(p => ({ ...p, [key]: null }));
    try {
      const updated = await apiFetch(`/admin/app-config/${key}`, {
        method: 'PUT',
        body: { value: editing[key] },
      });
      setConfig(p => ({ ...p, [key]: updated }));
      cancelEdit(key);
      setMsgs(p => ({ ...p, [key]: { type: 'success', text: 'Enregistré.' } }));
    } catch (err) {
      setMsgs(p => ({ ...p, [key]: { type: 'error', text: err?.data?.error || err.message } }));
    } finally {
      setSaving(p => ({ ...p, [key]: false }));
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <LogoSection />
      <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', marginBottom: 32 }} />
      <NavStoreSection />
      <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', marginBottom: 32 }} />
      <h3 style={{ marginTop: 0 }}>Configuration générale</h3>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
        Paramètres éditables sans redéploiement. Les URLs d'environnement (DEV/PROD)
        sont gérées via les variables d'environnement du serveur.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            {['Paramètre', 'Valeur actuelle', 'Action'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {EDITABLE_KEYS.map(({ key, label, type, options }) => {
            const row = config[key];
            const isEditing = key in editing;
            const msg = msgs[key];
            return (
              <tr key={key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 10px', fontWeight: 500, color: '#374151', verticalAlign: 'top' }}>
                  {label}
                  <div style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'monospace', marginTop: 2 }}>{key}</div>
                </td>
                <td style={{ padding: '10px 10px', verticalAlign: 'top' }}>
                  {isEditing ? (
                    <>
                      {type === 'select' ? (
                        <select
                          value={editing[key]}
                          onChange={e => setEditing(p => ({ ...p, [key]: e.target.value }))}
                          style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14 }}
                        >
                          {options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type={type}
                          value={editing[key]}
                          onChange={e => setEditing(p => ({ ...p, [key]: e.target.value }))}
                          style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, width: '100%', boxSizing: 'border-box' }}
                        />
                      )}
                      {msg && (
                        <div style={{ fontSize: 12, color: msg.type === 'success' ? '#15803d' : '#b91c1c', marginTop: 4 }}>
                          {msg.text}
                        </div>
                      )}
                    </>
                  ) : (
                    <span style={{ color: row?.value ? '#111827' : '#9ca3af' }}>
                      {row?.value || '—'}
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => save(key)}
                        disabled={saving[key]}
                        style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 13, cursor: 'pointer' }}
                      >
                        {saving[key] ? '…' : 'Sauver'}
                      </button>
                      <button
                        onClick={() => cancelEdit(key)}
                        style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(key)}
                      style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 12px', fontSize: 13, cursor: 'pointer', color: '#374151' }}
                    >
                      Modifier
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------------------------------------------
 *  StripeSection — Configuration Stripe (dual mode test/live)
 * ---------------------------------------------------------------- */
function StripeSection() {
  const [status, setStatus]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [switching, setSwitching]   = useState(false);
  const [msg, setMsg]               = useState(null);
  // Clés test
  const [testSK, setTestSK]           = useState('');
  const [testPK, setTestPK]           = useState('');
  const [testWH, setTestWH]           = useState('');
  // Clés live
  const [liveSK, setLiveSK]           = useState('');
  const [livePK, setLivePK]           = useState('');
  const [liveWH, setLiveWH]           = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setMsg(null);
    try {
      const data = await apiFetch('/admin/stripe');
      setStatus(data);
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message || 'Erreur chargement' });
    } finally {
      setLoading(false);
    }
  }

  async function saveMode(mode) {
    const sk  = mode === 'test' ? testSK  : liveSK;
    const pk  = mode === 'test' ? testPK  : livePK;
    const wh  = mode === 'test' ? testWH  : liveWH;
    if (!sk.trim() && !pk.trim() && !wh.trim()) {
      setMsg({ type: 'error', text: 'Renseignez au moins une clé à mettre à jour.' });
      return;
    }
    setSaving(true); setMsg(null);
    try {
      const body = {};
      if (sk.trim()) body[`${mode}_secret_key`]      = sk.trim();
      if (pk.trim()) body[`${mode}_publishable_key`] = pk.trim();
      if (wh.trim()) body[`${mode}_webhook_secret`]  = wh.trim();
      await apiFetch('/admin/stripe', { method: 'PUT', body });
      if (mode === 'test') { setTestSK(''); setTestPK(''); setTestWH(''); }
      else                 { setLiveSK(''); setLivePK(''); setLiveWH(''); }
      await load();
      setMsg({ type: 'success', text: `Clés ${mode === 'test' ? 'Test' : 'Production'} enregistrées.` });
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message || 'Erreur de sauvegarde' });
    } finally {
      setSaving(false);
    }
  }

  async function switchMode(newMode) {
    setSwitching(true); setMsg(null);
    try {
      await apiFetch('/admin/stripe', { method: 'PUT', body: { mode: newMode } });
      await load();
      setMsg({ type: 'success', text: `Mode Stripe basculé sur : ${newMode === 'test' ? 'Test (sandbox)' : 'Production (live)'}` });
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message || 'Erreur de bascule' });
    } finally {
      setSwitching(false);
    }
  }

  const activeMode = status?.active_mode || 'test';
  const isLiveActive = activeMode === 'live';

  function ModeCard({ mode, label, info, sk, setSk, pk, setPk, wh, setWh }) {
    const isActive = activeMode === mode;
    const borderColor = isActive ? (mode === 'live' ? '#86efac' : '#fde68a') : '#e5e7eb';
    const headerBg    = isActive ? (mode === 'live' ? '#dcfce7' : '#fef9c3') : '#f9fafb';
    const headerColor = isActive ? (mode === 'live' ? '#15803d' : '#92400e') : '#6b7280';
    const prefix = mode === 'test' ? 'sk_test_…' : 'sk_live_…';
    const pkPrefix = mode === 'test' ? 'pk_test_…' : 'pk_live_…';

    return (
      <div style={{
        border: `2px solid ${borderColor}`,
        borderRadius: 10, overflow: 'hidden',
        opacity: isActive ? 1 : 0.85,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', background: headerBg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: headerColor }}>{label}</span>
            {isActive && (
              <span style={{
                padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                background: mode === 'live' ? '#15803d' : '#92400e', color: '#fff',
              }}>
                ACTIF
              </span>
            )}
          </div>
          {!isActive && (
            <button
              type="button"
              onClick={() => switchMode(mode)}
              disabled={switching || !info?.configured}
              title={!info?.configured ? 'Configurez les clés avant d\'activer ce mode' : ''}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: info?.configured ? '#2563eb' : '#e5e7eb',
                color: info?.configured ? '#fff' : '#9ca3af',
                border: 'none', cursor: info?.configured && !switching ? 'pointer' : 'default',
              }}
            >
              {switching ? '…' : 'Activer'}
            </button>
          )}
        </div>

        {/* Status */}
        <div style={{ padding: '12px 16px', fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <span style={{ color: '#6b7280' }}>Clé secrète : </span>
              {info?.configured
                ? <code style={{ fontSize: 12, color: '#374151' }}>{info.key_hint}</code>
                : <span style={{ color: '#9ca3af' }}>Non renseignée</span>}
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Clé publique : </span>
              {info?.publishable_configured
                ? <code style={{ fontSize: 12, color: '#374151' }}>{info.publishable_hint}</code>
                : <span style={{ color: '#9ca3af' }}>Non renseignée</span>}
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Webhook : </span>
              {info?.webhook_configured
                ? <span style={{ color: '#15803d', fontWeight: 600 }}>OK</span>
                : <span style={{ color: '#9ca3af' }}>Non renseigné</span>}
            </div>
          </div>

          {/* Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 3 }}>
                Clé secrète <span style={{ color: '#9ca3af' }}>({prefix})</span>
              </label>
              <input
                type="password"
                value={sk}
                onChange={e => setSk(e.target.value)}
                placeholder={info?.configured ? '••• laisser vide pour conserver •••' : prefix}
                autoComplete="new-password"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6,
                  fontSize: 13, background: '#fff',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 3 }}>
                Clé publique <span style={{ color: '#9ca3af' }}>({pkPrefix})</span>
              </label>
              <input
                type="text"
                value={pk}
                onChange={e => setPk(e.target.value)}
                placeholder={info?.publishable_configured ? '••• laisser vide pour conserver •••' : pkPrefix}
                autoComplete="off"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6,
                  fontSize: 13, background: '#fff',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 3 }}>
                Webhook secret <span style={{ color: '#9ca3af' }}>(whsec_…)</span>
              </label>
              <input
                type="password"
                value={wh}
                onChange={e => setWh(e.target.value)}
                placeholder={info?.webhook_configured ? '••• laisser vide pour conserver •••' : 'whsec_…'}
                autoComplete="new-password"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6,
                  fontSize: 13, background: '#fff',
                }}
              />
            </div>
            <div>
              <button
                type="button"
                onClick={() => saveMode(mode)}
                disabled={saving || (!sk.trim() && !pk.trim() && !wh.trim())}
                style={{
                  padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  background: saving || (!sk.trim() && !pk.trim() && !wh.trim()) ? '#e5e7eb' : '#2563eb',
                  color: saving || (!sk.trim() && !pk.trim() && !wh.trim()) ? '#9ca3af' : '#fff',
                  border: 'none',
                  cursor: saving || (!sk.trim() && !pk.trim() && !wh.trim()) ? 'default' : 'pointer',
                }}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 660 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Configuration Stripe</h3>
        {!loading && status && (
          <span style={{
            padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
            background: isLiveActive ? '#dcfce7' : '#fef9c3',
            color:      isLiveActive ? '#15803d' : '#92400e',
            border:     `1px solid ${isLiveActive ? '#86efac' : '#fde68a'}`,
          }}>
            {isLiveActive ? 'Production (live)' : 'Test (sandbox)'}
          </span>
        )}
      </div>

      {loading && <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>Chargement...</div>}

      <MsgBanner msg={msg} />

      {!loading && status && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ModeCard
            mode="test" label="Mode Test (sandbox)" info={status.test}
            sk={testSK} setSk={setTestSK} pk={testPK} setPk={setTestPK} wh={testWH} setWh={setTestWH}
          />
          <ModeCard
            mode="live" label="Mode Production (live)" info={status.live}
            sk={liveSK} setSk={setLiveSK} pk={livePK} setPk={setLivePK} wh={liveWH} setWh={setLiveWH}
          />
        </div>
      )}

      {!loading && status && (
        <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, color: '#1e40af' }}>
          Le mode actif détermine quelles clés sont utilisées pour les paiements et webhooks.
          Basculer de mode ne supprime pas les clés de l'autre mode.
        </div>
      )}
    </div>
  );
}

// NotifAutoTab.jsx — Onglet "Envoi auto" de la page Notifications
// Gère : Système 2 (auto_notif_templates), Système 3 (sys_notif_rules), Système 4 (scheduled_notifs)

import React, { useEffect, useState, useCallback } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { apiFetch } from '../api.js';

// ─── Styles partagés ────────────────────────────────────────────────────────

const S = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 },
  badge: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: color + '22', color }),
  subTab: (active) => ({
    padding: '6px 16px', border: 'none', background: 'none', cursor: 'pointer',
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    color: active ? '#2563eb' : '#6b7280', fontWeight: active ? 600 : 400,
    marginBottom: -1, fontSize: 13,
  }),
};

// ─── Éditeur Email TipTap léger ─────────────────────────────────────────────

// ─── Extension TipTap — Bouton CTA ──────────────────────────────────────────
// Affiche {{label}} dans l'éditeur, sérialise en <a style="..."> dans le HTML

function CtaButtonNodeView({ node }) {
  const { label } = node.attrs;
  return (
    <NodeViewWrapper as="span" contentEditable={false} style={{ display: 'inline-block', margin: '0 2px' }}>
      <span style={{
        display: 'inline-block',
        background: '#dbeafe',
        color: '#1e40af',
        border: '2px dashed #3b82f6',
        borderRadius: 6,
        padding: '3px 10px',
        fontFamily: 'monospace',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}>
        {`{{${label}}}`}
      </span>
    </NodeViewWrapper>
  );
}

const CtaButtonExtension = Node.create({
  name: 'ctaButton',
  priority: 1000, // priorité > Link mark (100) pour capturer a[data-cta] en premier
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      label: { default: 'Bouton' },
      url:   { default: '' },
      color: { default: '#2563eb' },
    };
  },

  parseHTML() {
    return [
      // Format actuel : span[data-cta-btn] — pas de conflit avec Link mark
      {
        tag: 'span[data-cta-btn]',
        getAttrs: (dom) => ({
          url:   dom.getAttribute('data-href') || '',
          label: dom.getAttribute('data-label') || dom.textContent || 'Bouton',
          color: dom.getAttribute('data-color') || '#2563eb',
        }),
      },
      // Rétrocompat : ancien format a[data-cta="1"] (templates déjà sauvegardés)
      {
        tag: 'a[data-cta="1"]',
        priority: 1000,
        getAttrs: (dom) => {
          const style = dom.getAttribute('style') || '';
          const colorMatch = style.match(/background:\s*(#[0-9a-fA-F]{3,8})/);
          return {
            url:   dom.getAttribute('href') || '',
            label: dom.textContent || 'Bouton',
            color: colorMatch ? colorMatch[1] : '#2563eb',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    // Stocké en base comme span[data-cta-btn] pour éviter le conflit avec l'extension Link.
    // Le notifDispatcher.js convertit ces spans en <a> lors de l'envoi de l'email.
    const { label, url, color } = node.attrs;
    return ['span', {
      'data-cta-btn': '1',
      'data-href':    url,
      'data-label':   label,
      'data-color':   color,
    }, label];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CtaButtonNodeView);
  },
});

// Tous les boutons CTA disponibles dans l'éditeur email (toujours tous affichés)
// URL = variable du template substituée par notifDispatcher au moment de l'envoi
const ALL_CTA_BUTTONS = [
  { label: 'Activer mon compte',             url: '{activation_url}', color: '#2563eb' },
  { label: 'Se connecter',                   url: '{login_url}',      color: '#2563eb' },
  { label: 'Réinitialiser mon mot de passe', url: '{reset_url}',      color: '#dc2626' },
  { label: 'Modifier mon mot de passe',      url: '{reset_url}',      color: '#dc2626' },
  { label: 'Voir ma commande',               url: '{order_url}',      color: '#16a34a' },
  { label: 'Suivre ma livraison',            url: '{order_url}',      color: '#0284c7' },
  { label: 'Voir la réponse',                url: '{ticket_url}',     color: '#7c3aed' },
  { label: 'Accéder à mon ticket',           url: '{ticket_url}',     color: '#7c3aed' },
  { label: 'Suivre ma demande RMA',          url: '{rma_url}',        color: '#ea580c' },
  { label: 'Voir le détail RMA',             url: '{rma_url}',        color: '#ea580c' },
];

function insertCTAButton(editor, { label, url, color }) {
  editor.chain().focus().insertContent({
    type: 'ctaButton',
    attrs: { label, url, color },
  }).run();
}

function EmailToolbar({ editor, eventKey }) {
  if (!editor) return null;
  const btn = (action, label, active, title) => (
    <button title={title} onMouseDown={e => { e.preventDefault(); action(); }}
      style={{ background: active ? '#2563eb' : '#f3f4f6', color: active ? '#fff' : '#374151',
        border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}>
      {label}
    </button>
  );

  function handleLink(e) {
    e.preventDefault();
    if (editor.isActive('link')) { editor.chain().focus().unsetLink().run(); return; }
    const url = window.prompt('URL du lien (ou variable ex: {activation_url}) :');
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  }

  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', padding: 6,
      background: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderRadius: '6px 6px 0 0' }}>
      {btn(() => editor.chain().focus().toggleBold().run(), <strong>G</strong>, editor.isActive('bold'), 'Gras')}
      {btn(() => editor.chain().focus().toggleItalic().run(), <em>I</em>, editor.isActive('italic'), 'Italique')}
      {btn(() => editor.chain().focus().toggleUnderline().run(), <u>U</u>, editor.isActive('underline'), 'Souligné')}
      {btn(() => editor.chain().focus().toggleStrike().run(), <s>S</s>, editor.isActive('strike'), 'Barré')}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'H1', editor.isActive('heading', { level: 1 }), 'Titre 1')}
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'H2', editor.isActive('heading', { level: 2 }), 'Titre 2')}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => editor.chain().focus().toggleBulletList().run(), '• Liste', editor.isActive('bulletList'), 'Liste à puces')}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), '1. Liste', editor.isActive('orderedList'), 'Liste numérotée')}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => editor.chain().focus().setTextAlign('left').run(),   '⬅ Gauche', editor.isActive({ textAlign: 'left' }),   'Aligner à gauche')}
      {btn(() => editor.chain().focus().setTextAlign('center').run(), '↔ Centre', editor.isActive({ textAlign: 'center' }), 'Centrer')}
      {btn(() => editor.chain().focus().setTextAlign('right').run(),  '➡ Droite', editor.isActive({ textAlign: 'right' }),  'Aligner à droite')}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      <button title="Insérer / retirer un lien" onMouseDown={handleLink}
        style={{ background: editor.isActive('link') ? '#2563eb' : '#f3f4f6', color: editor.isActive('link') ? '#fff' : '#374151',
          border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}>
        🔗 Lien
      </button>
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      <label title="Couleur du texte" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12,
        color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 6px', background: '#f3f4f6', cursor: 'pointer' }}>
        <span style={{ fontWeight: 700 }}>A</span>
        <input type="color" title="Couleur du texte" style={{ width: 18, height: 18, cursor: 'pointer', border: 'none', padding: 0, background: 'none' }}
          onChange={e => editor.chain().focus().setColor(e.target.value).run()} />
      </label>
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      <select title="Insérer un bouton d'action cliquable"
        onChange={e => {
          const found = ALL_CTA_BUTTONS.find(b => b.url + '|' + b.label === e.target.value);
          if (found) insertCTAButton(editor, found);
          e.target.value = '';
        }}
        defaultValue=""
        style={{ fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 6px',
          background: '#f3f4f6', color: '#374151', cursor: 'pointer' }}>
        <option value="" disabled>＋ Insérer bouton…</option>
        {ALL_CTA_BUTTONS.map(b => (
          <option key={b.url + b.label} value={b.url + '|' + b.label}>{b.label}</option>
        ))}
      </select>
    </div>
  );
}

function EmailEditor({ value, onChange, eventKey }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      CtaButtonExtension,
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sync si value change de l'extérieur
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) editor.commands.setContent(value || '', false);
  }, [value]);

  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: 6 }}>
      <EmailToolbar editor={editor} eventKey={eventKey} />
      <EditorContent editor={editor} style={{ minHeight: 200, padding: '10px 12px', fontSize: 13 }} />
    </div>
  );
}

// ─── Variables disponibles par event ────────────────────────────────────────

const EVENT_VARS = {
  account_created:          '{first_name} {last_name} {email} {activation_url}',
  account_activated:        '{first_name} {email} {login_url}',
  password_reset:           '{first_name} {email} {reset_url} {expires_in}',
  password_changed:         '{first_name} {email}',
  mobile_enrolled:          '{first_name} {device_name} {platform} {model} {app_version}',
  esp_enrolled:             '{first_name} {esp_name} {esp_uid}',
  order_confirmed:          '{first_name} {order_num} {total} {items_count} {order_url}',
  order_status_changed:     '{first_name} {order_num} {total} {status_from} {status_to} {order_url}',
  order_shipped:            '{first_name} {order_num} {tracking_number} {carrier} {order_url}',
  ticket_created:           '{ticket_id} {subject} {category}',
  ticket_replied_by_admin:  '{ticket_id} {subject} {body_preview} {ticket_url}',
  ticket_status_changed:    '{ticket_id} {subject} {status_to} {ticket_url}',
  rma_created:              '{rma_id} {product_sku} {reason} {rma_url}',
  rma_status_changed:       '{rma_id} {product_sku} {status_to} {rma_url}',
  ota_available:            '{version} {name} {description}',
  ota_triggered:            '{version} {esp_name}',
  ota_success:              '{esp_name} {version}',
  ota_failed:               '{esp_name} {version} {error}',
};

// ─── Sous-onglet 1 : Templates auto (Système 2) ─────────────────────────────

function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // event_key
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/admin/notif/auto-templates');
      setTemplates(data || []);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openEdit(tpl) {
    setForm({
      push_enabled: tpl.push_enabled,
      email_enabled: tpl.email_enabled,
      push_title_tpl: tpl.push_title_tpl || '',
      push_body_tpl: tpl.push_body_tpl || '',
      email_subject_tpl: tpl.email_subject_tpl || '',
      email_html_tpl: tpl.email_html_tpl || '',
    });
    setEditing(tpl.event_key);
    setErr('');
  }

  async function save() {
    setSaving(true);
    setErr('');
    try {
      await apiFetch(`/admin/notif/auto-templates/${editing}`, { method: 'PATCH', body: form });
      setEditing(null);
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnable(tpl, field) {
    try {
      await apiFetch(`/admin/notif/auto-templates/${tpl.event_key}`, {
        method: 'PATCH',
        body: { [field]: !tpl[field] },
      });
      setTemplates(prev => prev.map(t => t.event_key === tpl.event_key ? { ...t, [field]: !tpl[field] } : t));
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  if (loading) return <div style={{ color: '#6b7280', padding: 20 }}>Chargement…</div>;

  return (
    <div>
      {err && <div style={{ color: '#b91c1c', marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {editing && (
        <div style={{ ...S.card, borderColor: '#2563eb' }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Modifier — {editing}</div>
          {EVENT_VARS[editing] && (
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10, fontFamily: 'monospace', background: '#f3f4f6', padding: '4px 8px', borderRadius: 4 }}>
              Variables disponibles : {EVENT_VARS[editing]}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Push</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.push_enabled || false}
                  onChange={e => setForm(f => ({ ...f, push_enabled: e.target.checked }))} />
                Activer
              </label>
              <input className="input" placeholder="Titre push ex: {device_name} — Alerte"
                value={form.push_title_tpl} onChange={e => setForm(f => ({ ...f, push_title_tpl: e.target.value }))}
                style={{ marginBottom: 8 }} />
              <textarea className="input" placeholder="Corps push ex: {trigger_label}" rows={3}
                value={form.push_body_tpl} onChange={e => setForm(f => ({ ...f, push_body_tpl: e.target.value }))}
                style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            <div>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>E-mail</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.email_enabled || false}
                  onChange={e => setForm(f => ({ ...f, email_enabled: e.target.checked }))} />
                Activer
              </label>
              <input className="input" placeholder="Sujet e-mail"
                value={form.email_subject_tpl} onChange={e => setForm(f => ({ ...f, email_subject_tpl: e.target.value }))}
                style={{ marginBottom: 8 }} />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Corps e-mail (HTML)</div>
            <EmailEditor value={form.email_html_tpl} onChange={v => setForm(f => ({ ...f, email_html_tpl: v }))} eventKey={editing} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
            <button className="btn" onClick={() => setEditing(null)}>Annuler</button>
          </div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '8px 6px' }}>Événement</th>
            <th style={{ padding: '8px 6px', textAlign: 'center' }}>Push</th>
            <th style={{ padding: '8px 6px', textAlign: 'center' }}>Email</th>
            <th style={{ padding: '8px 6px' }}>Titre push</th>
          </tr>
        </thead>
        <tbody>
          {templates.map(t => (
            <tr key={t.event_key}
              onClick={() => openEdit(t)}
              style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontSize: 12 }}>{t.event_key}</td>
              <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                <button onClick={e => { e.stopPropagation(); toggleEnable(t, 'push_enabled'); }} style={{
                  background: t.push_enabled ? '#dcfce7' : '#f3f4f6', color: t.push_enabled ? '#15803d' : '#9ca3af',
                  border: '1px solid ' + (t.push_enabled ? '#86efac' : '#d1d5db'),
                  borderRadius: 12, padding: '2px 10px', fontSize: 11, cursor: 'pointer',
                }}>{t.push_enabled ? 'ON' : 'OFF'}</button>
              </td>
              <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                <button onClick={e => { e.stopPropagation(); toggleEnable(t, 'email_enabled'); }} style={{
                  background: t.email_enabled ? '#dcfce7' : '#f3f4f6', color: t.email_enabled ? '#15803d' : '#9ca3af',
                  border: '1px solid ' + (t.email_enabled ? '#86efac' : '#d1d5db'),
                  borderRadius: 12, padding: '2px 10px', fontSize: 11, cursor: 'pointer',
                }}>{t.email_enabled ? 'ON' : 'OFF'}</button>
              </td>
              <td style={{ padding: '8px 6px', color: '#6b7280', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.push_title_tpl || <span style={{ color: '#d1d5db' }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sous-onglet 2 : Règles système (Système 3) ──────────────────────────────

function SysRulesTab() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', trigger_type: 'sensor_threshold', logic_op: 'AND',
    scope_type: 'all', offline_threshold_sec: 300, cooldown_sec: 300,
    channel_push: true, channel_email: false,
    push_title_tpl: '{device_name} — Alerte', push_body_tpl: '{trigger_label}',
    email_subject_tpl: '', email_html_tpl: '', conditions: [],
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [deviceTypes, setDeviceTypes] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, dt] = await Promise.all([
        apiFetch('/admin/notif/sys-rules'),
        apiFetch('/admin/device-types'),
      ]);
      setRules(data || []);
      setDeviceTypes(dt || []);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm({
      name: '', description: '', trigger_type: 'sensor_threshold', logic_op: 'AND',
      scope_type: 'all', scope_device_type_id: '', scope_esp_id: '',
      offline_threshold_sec: 300, cooldown_sec: 300,
      channel_push: true, channel_email: false,
      push_title_tpl: '{device_name} — Alerte', push_body_tpl: '{trigger_label}',
      email_subject_tpl: '', email_html_tpl: '', conditions: [],
    });
    setEditing(null);
    setShowForm(true);
    setErr('');
  }

  function openEdit(rule) {
    setForm({
      ...rule,
      conditions: rule.conditions || [],
      email_html_tpl: rule.email_html_tpl || '',
    });
    setEditing(rule.id);
    setShowForm(true);
    setErr('');
  }

  async function save() {
    setSaving(true);
    setErr('');
    try {
      if (editing) {
        await apiFetch(`/admin/notif/sys-rules/${editing}`, { method: 'PATCH', body: form });
      } else {
        await apiFetch('/admin/notif/sys-rules', { method: 'POST', body: form });
      }
      setShowForm(false);
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id) {
    if (!window.confirm('Supprimer cette règle ?')) return;
    try {
      await apiFetch(`/admin/notif/sys-rules/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  async function toggleRule(rule) {
    try {
      await apiFetch(`/admin/notif/sys-rules/${rule.id}`, { method: 'PATCH', body: { enabled: !rule.enabled } });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !rule.enabled } : r));
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  function addCondition() {
    setForm(f => ({ ...f, conditions: [...f.conditions, { field: '', op: '>', threshold_num: null, threshold_str: '' }] }));
  }

  function removeCondition(idx) {
    setForm(f => ({ ...f, conditions: f.conditions.filter((_, i) => i !== idx) }));
  }

  function updateCondition(idx, key, val) {
    setForm(f => {
      const conds = [...f.conditions];
      conds[idx] = { ...conds[idx], [key]: val };
      return { ...f, conditions: conds };
    });
  }

  if (loading) return <div style={{ color: '#6b7280', padding: 20 }}>Chargement…</div>;

  return (
    <div>
      {err && <div style={{ color: '#b91c1c', marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {showForm && (
        <div style={{ ...S.card, borderColor: '#2563eb', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>{editing ? 'Modifier la règle' : 'Nouvelle règle'}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>Nom <span style={{ color: '#b91c1c' }}>*</span></label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>Déclencheur</label>
              <select className="input" value={form.trigger_type} onChange={e => setForm(f => ({ ...f, trigger_type: e.target.value }))}>
                <option value="sensor_threshold">Seuil capteur</option>
                <option value="device_offline">Hors ligne</option>
                <option value="device_online">Retour en ligne</option>
                <option value="device_silence">Silence</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
            <div>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>Portée</label>
              <select className="input" value={form.scope_type} onChange={e => setForm(f => ({ ...f, scope_type: e.target.value }))}>
                <option value="all">Tous les devices</option>
                <option value="device_type">Par type de device</option>
                <option value="specific_device">Device spécifique</option>
              </select>
            </div>
            {form.scope_type === 'device_type' && (
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>Type de device</label>
                <select className="input" value={form.scope_device_type_id || ''} onChange={e => setForm(f => ({ ...f, scope_device_type_id: e.target.value || null }))}>
                  <option value="">— Choisir —</option>
                  {deviceTypes.map(dt => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
            <div>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>Délai détection (sec)</label>
              <input className="input" type="number" value={form.offline_threshold_sec}
                onChange={e => setForm(f => ({ ...f, offline_threshold_sec: parseInt(e.target.value) || 300 }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>Cooldown (sec)</label>
              <input className="input" type="number" value={form.cooldown_sec}
                onChange={e => setForm(f => ({ ...f, cooldown_sec: parseInt(e.target.value) || 300 }))} />
            </div>
          </div>

          {form.trigger_type === 'sensor_threshold' && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>Conditions</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select style={{ fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 6px' }}
                    value={form.logic_op} onChange={e => setForm(f => ({ ...f, logic_op: e.target.value }))}>
                    <option value="AND">ET (toutes)</option>
                    <option value="OR">OU (au moins une)</option>
                  </select>
                  <button className="btn" style={{ fontSize: 12, padding: '3px 10px' }} onClick={addCondition}>+ Ajouter</button>
                </div>
              </div>
              {form.conditions.map((c, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: 6, marginBottom: 6 }}>
                  <input className="input" placeholder="Champ (ex: soundPct)" value={c.field}
                    onChange={e => updateCondition(idx, 'field', e.target.value)} />
                  <select className="input" value={c.op} onChange={e => updateCondition(idx, 'op', e.target.value)}>
                    {['>', '>=', '<', '<=', '==', '!=', 'contains', 'notcontains'].map(op =>
                      <option key={op} value={op}>{op}</option>
                    )}
                  </select>
                  <input className="input" placeholder="Valeur" value={c.threshold_num ?? c.threshold_str ?? ''}
                    onChange={e => {
                      const v = e.target.value;
                      const n = parseFloat(v);
                      if (!isNaN(n) && v.trim() !== '') updateCondition(idx, 'threshold_num', n);
                      else { updateCondition(idx, 'threshold_num', null); updateCondition(idx, 'threshold_str', v); }
                    }} />
                  <button onClick={() => removeCondition(idx)} style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Canaux</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={form.channel_push}
                    onChange={e => setForm(f => ({ ...f, channel_push: e.target.checked }))} />
                  Push (iOS / Android)
                </label>
                <input className="input" placeholder="Titre push" value={form.push_title_tpl}
                  onChange={e => setForm(f => ({ ...f, push_title_tpl: e.target.value }))} style={{ marginBottom: 8 }} />
                <textarea className="input" placeholder="Corps push" rows={2} value={form.push_body_tpl}
                  onChange={e => setForm(f => ({ ...f, push_body_tpl: e.target.value }))}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={form.channel_email}
                    onChange={e => setForm(f => ({ ...f, channel_email: e.target.checked }))} />
                  E-mail
                </label>
                <input className="input" placeholder="Sujet e-mail" value={form.email_subject_tpl}
                  onChange={e => setForm(f => ({ ...f, email_subject_tpl: e.target.value }))} />
              </div>
            </div>
          </div>

          {form.channel_email && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Corps e-mail (HTML)</div>
              <EmailEditor value={form.email_html_tpl} onChange={v => setForm(f => ({ ...f, email_html_tpl: v }))} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
            <button className="btn" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={openCreate}>+ Nouvelle règle</button>
      </div>

      {rules.length === 0 && !showForm && (
        <div style={{ color: '#6b7280', textAlign: 'center', padding: 32 }}>Aucune règle système configurée.</div>
      )}

      {rules.map(rule => (
        <div key={rule.id} style={{ ...S.card, opacity: rule.enabled ? 1 : 0.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontWeight: 600 }}>{rule.name}</span>
              <span style={{ marginLeft: 8, ...S.badge(rule.enabled ? '#2563eb' : '#6b7280') }}>
                {rule.enabled ? 'Actif' : 'Inactif'}
              </span>
              <span style={{ marginLeft: 6, ...S.badge('#9333ea') }}>{rule.trigger_type}</span>
              {rule.conditions?.length > 0 && (
                <span style={{ marginLeft: 6, color: '#6b7280', fontSize: 12 }}>
                  {rule.conditions.length} condition{rule.conditions.length > 1 ? 's' : ''} ({rule.logic_op})
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn" style={{ fontSize: 12 }} onClick={() => toggleRule(rule)}>
                {rule.enabled ? 'Désactiver' : 'Activer'}
              </button>
              <button className="btn" style={{ fontSize: 12 }} onClick={() => openEdit(rule)}>Modifier</button>
              <button className="btn" style={{ fontSize: 12, color: '#b91c1c' }} onClick={() => deleteRule(rule.id)}>Supprimer</button>
            </div>
          </div>
          {rule.description && <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>{rule.description}</div>}
          <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
            Cooldown : {rule.cooldown_sec}s | Délai détection : {rule.offline_threshold_sec}s |
            Push : {rule.channel_push ? '✓' : '✗'} | Email : {rule.channel_email ? '✓' : '✗'}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Sous-onglet 3 : Notifications planifiées (Système 4) ───────────────────

function ScheduledTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '', push_enabled: true, email_enabled: false,
    push_title: '', push_body: '', email_subject: '', email_html: '',
    scheduled_at: '', recurrence: '', recurrence_end_at: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/admin/notif/scheduled');
      setItems(data || []);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm({
      name: '', push_enabled: true, email_enabled: false,
      push_title: '', push_body: '', email_subject: '', email_html: '',
      scheduled_at: '', recurrence: '', recurrence_end_at: '',
    });
    setEditing(null);
    setShowForm(true);
    setErr('');
  }

  function openEdit(item) {
    const toLocal = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toISOString().slice(0, 16);
    };
    setForm({
      ...item,
      scheduled_at: toLocal(item.scheduled_at),
      recurrence_end_at: toLocal(item.recurrence_end_at),
      email_html: item.email_html || '',
    });
    setEditing(item.id);
    setShowForm(true);
    setErr('');
  }

  async function save() {
    setSaving(true);
    setErr('');
    try {
      const body = {
        ...form,
        recurrence: form.recurrence || null,
        recurrence_end_at: form.recurrence_end_at || null,
      };
      if (editing) {
        await apiFetch(`/admin/notif/scheduled/${editing}`, { method: 'PATCH', body });
      } else {
        await apiFetch('/admin/notif/scheduled', { method: 'POST', body });
      }
      setShowForm(false);
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id) {
    if (!window.confirm('Annuler cette notification planifiée ?')) return;
    try {
      await apiFetch(`/admin/notif/scheduled/${id}/cancel`, { method: 'POST' });
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  const statusColor = { pending: '#2563eb', sent: '#15803d', cancelled: '#6b7280', error: '#b91c1c' };

  if (loading) return <div style={{ color: '#6b7280', padding: 20 }}>Chargement…</div>;

  return (
    <div>
      {err && <div style={{ color: '#b91c1c', marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {showForm && (
        <div style={{ ...S.card, borderColor: '#2563eb', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>{editing ? 'Modifier' : 'Nouvelle notification planifiée'}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>Nom <span style={{ color: '#b91c1c' }}>*</span></label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>Date / heure d'envoi</label>
              <input className="input" type="datetime-local" value={form.scheduled_at}
                onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>Récurrence</label>
              <select className="input" value={form.recurrence || ''}
                onChange={e => setForm(f => ({ ...f, recurrence: e.target.value || null }))}>
                <option value="">Aucune (une seule fois)</option>
                <option value="daily">Quotidienne</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="monthly">Mensuelle</option>
              </select>
            </div>
            {form.recurrence && (
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>Fin de récurrence</label>
                <input className="input" type="datetime-local" value={form.recurrence_end_at || ''}
                  onChange={e => setForm(f => ({ ...f, recurrence_end_at: e.target.value || null }))} />
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.push_enabled}
                  onChange={e => setForm(f => ({ ...f, push_enabled: e.target.checked }))} />
                Push (iOS / Android)
              </label>
              <input className="input" placeholder="Titre push" value={form.push_title}
                onChange={e => setForm(f => ({ ...f, push_title: e.target.value }))} style={{ marginBottom: 8 }} />
              <textarea className="input" placeholder="Corps push" rows={3} value={form.push_body}
                onChange={e => setForm(f => ({ ...f, push_body: e.target.value }))}
                style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.email_enabled}
                  onChange={e => setForm(f => ({ ...f, email_enabled: e.target.checked }))} />
                E-mail
              </label>
              <input className="input" placeholder="Sujet e-mail" value={form.email_subject}
                onChange={e => setForm(f => ({ ...f, email_subject: e.target.value }))} />
            </div>
          </div>

          {form.email_enabled && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Corps e-mail (HTML)</div>
              <EmailEditor value={form.email_html} onChange={v => setForm(f => ({ ...f, email_html: v }))} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
            <button className="btn" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={openCreate}>+ Planifier</button>
      </div>

      {items.length === 0 && !showForm && (
        <div style={{ color: '#6b7280', textAlign: 'center', padding: 32 }}>Aucune notification planifiée.</div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '8px 6px' }}>Nom</th>
            <th style={{ padding: '8px 6px' }}>Statut</th>
            <th style={{ padding: '8px 6px' }}>Date prévue</th>
            <th style={{ padding: '8px 6px' }}>Récurrence</th>
            <th style={{ padding: '8px 6px' }}>Exécutions</th>
            <th style={{ padding: '8px 6px', width: 120 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '8px 6px', fontWeight: 500 }}>{item.name}</td>
              <td style={{ padding: '8px 6px' }}>
                <span style={S.badge(statusColor[item.status] || '#6b7280')}>{item.status}</span>
              </td>
              <td style={{ padding: '8px 6px', fontSize: 12, color: '#374151' }}>
                {item.next_run_at
                  ? new Date(item.next_run_at).toLocaleString('fr-FR')
                  : (item.scheduled_at ? new Date(item.scheduled_at).toLocaleString('fr-FR') : '—')}
              </td>
              <td style={{ padding: '8px 6px', color: '#6b7280', fontSize: 12 }}>{item.recurrence || '—'}</td>
              <td style={{ padding: '8px 6px', color: '#6b7280', fontSize: 12 }}>{item.run_count}</td>
              <td style={{ padding: '8px 6px' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => openEdit(item)}>Modifier</button>
                  {item.status === 'pending' && (
                    <button className="btn" style={{ fontSize: 11, padding: '2px 8px', color: '#b91c1c' }} onClick={() => cancel(item.id)}>Annuler</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sous-onglet 4 : Journaux ────────────────────────────────────────────────

function LogsTab({ defaultSource = 'auto' }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const url = defaultSource === 'auto' ? '/admin/notif/auto-log' : '/admin/notif/sys-log';
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) });
      const data = await apiFetch(`${url}?${p}`);
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [defaultSource, page]);

  useEffect(() => { setPage(0); }, [defaultSource]);
  useEffect(() => { load(); }, [load]);

  const statusColor = { sent: '#15803d', failed: '#b91c1c', skipped_cooldown: '#d97706', skipped_disabled: '#6b7280', skipped_no_recipient: '#6b7280', skipped_smtp_off: '#d97706' };
  const totalPages = Math.ceil(total / PAGE);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <button className="btn" style={{ fontSize: 12 }} onClick={load}>Rafraîchir</button>
        <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 12 }}>{total} entrées</span>
      </div>

      {err && <div style={{ color: '#b91c1c', marginBottom: 12, fontSize: 13 }}>{err}</div>}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '6px 6px' }}>Date</th>
            <th style={{ padding: '6px 6px' }}>Événement</th>
            <th style={{ padding: '6px 6px' }}>Canal</th>
            <th style={{ padding: '6px 6px' }}>Destinataire</th>
            <th style={{ padding: '6px 6px' }}>Statut</th>
            <th style={{ padding: '6px 6px' }}>Erreur</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', padding: 20 }}>Chargement…</td></tr>
          )}
          {!loading && rows.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid #f9fafb' }}>
              <td style={{ padding: '5px 6px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                {new Date(r.sent_at).toLocaleString('fr-FR')}
              </td>
              <td style={{ padding: '5px 6px', fontFamily: 'monospace' }}>{r.event_key || r.trigger_type || '—'}</td>
              <td style={{ padding: '5px 6px' }}>{r.channel}</td>
              <td style={{ padding: '5px 6px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.recipient || '—'}
              </td>
              <td style={{ padding: '5px 6px' }}>
                <span style={S.badge(statusColor[r.status] || '#6b7280')}>{r.status}</span>
              </td>
              <td style={{ padding: '5px 6px', color: '#b91c1c', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.error || ''}
              </td>
            </tr>
          ))}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', padding: 20 }}>Aucun log.</td></tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
          <button className="btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Précédent</button>
          <span style={{ padding: '6px 12px', fontSize: 13, color: '#374151' }}>{page + 1} / {totalPages}</span>
          <button className="btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Suivant ›</button>
        </div>
      )}
    </div>
  );
}

// ─── Exports ────────────────────────────────────────────────────────────────

export { LogsTab };

// ─── Composant principal NotifAutoTab ────────────────────────────────────────

export default function NotifAutoTab() {
  const [sub, setSub] = useState('templates');

  const SUBS = [
    ['templates', 'Templates auto'],
    ['sys-rules', 'Règles système'],
    ['scheduled', 'Planifiés'],
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
        {SUBS.map(([key, label]) => (
          <button key={key} onClick={() => setSub(key)} style={S.subTab(sub === key)}>{label}</button>
        ))}
      </div>

      {sub === 'templates'  && <TemplatesTab />}
      {sub === 'sys-rules'  && <SysRulesTab />}
      {sub === 'scheduled'  && <ScheduledTab />}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

/* ---- Constantes ---- */
const DIRECTIONS = ['inbound', 'outbound'];
const FORMATS    = ['json', 'text', 'binary'];
const DATA_TYPES = ['number', 'string', 'boolean'];
const OPS        = ['>', '>=', '<', '<=', '==', '!=', 'contains', 'notcontains'];
const DEFAULT_TITLE_TPL = '{device_name} — Alerte !';
const DEFAULT_BODY_TPL  = '{field_label} {op} {threshold} {unit} — valeur : {current_value} {unit}';

/* ================================================================
 *  Sous-composant : formulaire d'un champ de trame
 * ================================================================ */
function FieldForm({ frameId, initial, onSaved, onCancel }) {
  const [f, setF] = useState(initial ? {
    name: initial.name, label: initial.label || '', data_type: initial.data_type || 'number',
    unit: initial.unit || '', min_value: initial.min_value ?? '', max_value: initial.max_value ?? '',
    is_primary_metric: !!initial.is_primary_metric, description: initial.description || '',
    sort_order: String(initial.sort_order ?? 0),
  } : { name: '', label: '', data_type: 'number', unit: '', min_value: '', max_value: '', is_primary_metric: false, description: '', sort_order: '0' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!f.name.trim()) return;
    setSaving(true);
    try {
      const body = { ...f, min_value: f.min_value !== '' ? parseFloat(f.min_value) : null, max_value: f.max_value !== '' ? parseFloat(f.max_value) : null, sort_order: parseInt(f.sort_order, 10) || 0 };
      if (initial?.id) await apiFetch(`/admin/fields/${initial.id}`, { method: 'PUT', body });
      else             await apiFetch(`/admin/frames/${frameId}/fields`, { method: 'POST', body });
      onSaved();
    } catch (e) { setErr(e?.data?.error || e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginTop: 8 }}>
      {err && <div style={{ color: '#b91c1c', marginBottom: 6, fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['name','Nom *','text','soundPct'],['label','Label','text','Niveau sonore'],['unit','Unité','text','%'],['min_value','Min','number','0'],['max_value','Max','number','100'],['sort_order','Ordre','number','0']].map(([key, lbl, type, ph]) => (
          <div key={key} style={{ flex: key === 'name' || key === 'label' ? '1 1 120px' : '0 0 70px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{lbl}</div>
            <input className="input" type={type} value={f[key]} placeholder={ph}
              onChange={e => setF(v => ({ ...v, [key]: e.target.value }))} />
          </div>
        ))}
        <div style={{ flex: '0 0 100px' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Type</div>
          <select className="input" value={f.data_type} onChange={e => setF(v => ({ ...v, data_type: e.target.value }))}>
            {DATA_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={f.is_primary_metric} onChange={e => setF(v => ({ ...v, is_primary_metric: e.target.checked }))} />
            Primaire (last_db)
          </label>
        </div>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={save} disabled={saving || !f.name.trim()} style={{ fontSize: 12 }}>
          {saving ? '…' : initial?.id ? 'Modifier' : 'Ajouter'}
        </button>
        <button className="btn secondary" onClick={onCancel} style={{ fontSize: 12 }}>Annuler</button>
      </div>
    </div>
  );
}

/* ================================================================
 *  Sous-composant : section trames d'un type (dans le panneau édition)
 * ================================================================ */
function FramesSection({ typeId }) {
  const [frames, setFrames] = useState([]);
  const [newFrame, setNewFrame] = useState({ name: '', topic_suffix: '', direction: 'inbound', format: 'json', description: '' });
  const [openFrameId, setOpenFrameId] = useState(null);
  const [fields, setFields] = useState({});
  const [addField, setAddField] = useState(null);
  const [editField, setEditField] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editingFrameId, setEditingFrameId] = useState(null);
  const [frameForm, setFrameForm] = useState({ name: '', topic_suffix: '', description: '' });
  const [savingFrame, setSavingFrame] = useState(false);

  useEffect(() => { loadFrames(); }, [typeId]);

  async function loadFrames() {
    try { setFrames(await apiFetch(`/admin/device-types/${typeId}/frames`)); }
    catch { /* noop */ }
  }

  async function loadFields(frameId) {
    try {
      const result = await apiFetch(`/admin/frames/${frameId}/fields`);
      setFields(f => ({ ...f, [frameId]: result }));
    } catch { /* noop */ }
  }

  async function toggleFrame(frameId) {
    if (openFrameId === frameId) { setOpenFrameId(null); return; }
    setOpenFrameId(frameId);
    if (!fields[frameId]) await loadFields(frameId);
  }

  async function createFrame() {
    if (!newFrame.name.trim() || !newFrame.topic_suffix.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/device-types/${typeId}/frames`, { method: 'POST', body: newFrame });
      setNewFrame({ name: '', topic_suffix: '', direction: 'inbound', format: 'json', description: '' });
      await loadFrames();
    } catch { /* noop */ }
    finally { setSaving(false); }
  }

  async function deleteFrame(id) {
    if (!window.confirm('Supprimer cette trame et tous ses champs ?')) return;
    await apiFetch(`/admin/frames/${id}`, { method: 'DELETE' });
    setOpenFrameId(null);
    await loadFrames();
  }

  async function saveFrameRename(frame) {
    if (!frameForm.name.trim() || !frameForm.topic_suffix.trim()) return;
    setSavingFrame(true);
    try {
      await apiFetch(`/admin/frames/${frame.id}`, {
        method: 'PUT',
        body: { name: frameForm.name.trim(), topic_suffix: frameForm.topic_suffix.trim(), direction: frame.direction, format: frame.format, description: frameForm.description || null },
      });
      setEditingFrameId(null);
      await loadFrames();
    } catch { /* noop */ }
    finally { setSavingFrame(false); }
  }

  async function deleteField(frameId, fieldId) {
    if (!window.confirm('Supprimer ce champ ?')) return;
    await apiFetch(`/admin/fields/${fieldId}`, { method: 'DELETE' });
    await loadFields(frameId);
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#374151' }}>Trames MQTT</div>

      {/* Liste des trames */}
      {frames.map(frame => (
        <div key={frame.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 8 }}>
          {editingFrameId === frame.id ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#f9fafb', flexWrap: 'wrap' }}>
              <input className="input" style={{ width: 120, fontSize: 12, padding: '4px 8px' }} value={frameForm.name}
                     onChange={e => setFrameForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom *" />
              <input className="input" style={{ width: 120, fontSize: 12, padding: '4px 8px' }} value={frameForm.topic_suffix}
                     onChange={e => setFrameForm(f => ({ ...f, topic_suffix: e.target.value }))} placeholder="Suffixe *" />
              <input className="input" style={{ width: 160, fontSize: 12, padding: '4px 8px' }} value={frameForm.description}
                     onChange={e => setFrameForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" />
              <button className="btn primary" style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => saveFrameRename(frame)}
                      disabled={savingFrame || !frameForm.name.trim() || !frameForm.topic_suffix.trim()}>
                {savingFrame ? '…' : 'Enregistrer'}
              </button>
              <button className="btn secondary" style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => setEditingFrameId(null)}>Annuler</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#f9fafb', cursor: 'pointer' }}
                 onClick={() => toggleFrame(frame.id)}>
              <span style={{ color: '#9ca3af', fontSize: 12 }}>{openFrameId === frame.id ? '▾' : '▸'}</span>
              <b style={{ fontSize: 13, minWidth: 0 }}>{frame.name}</b>
              <code style={{ fontSize: 11, background: '#e5e7eb', padding: '1px 6px', borderRadius: 4 }}>{frame.topic_suffix}</code>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{frame.direction} · {frame.format}</span>
              <span className="badge" style={{ fontSize: 11 }}>{frame.field_count} champ{frame.field_count !== 1 ? 's' : ''}</span>
              <button className="btn secondary" style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
                      onClick={e => { e.stopPropagation(); setFrameForm({ name: frame.name, topic_suffix: frame.topic_suffix, description: frame.description || '' }); setEditingFrameId(frame.id); }}>Renommer</button>
              <button className="btn danger" style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
                      onClick={e => { e.stopPropagation(); deleteFrame(frame.id); }}>Suppr.</button>
            </div>
          )}


          {openFrameId === frame.id && (
            <div style={{ padding: '10px 12px' }}>
              <table className="table" style={{ fontSize: 12 }}>
                <thead><tr><th>Champ</th><th>Label</th><th>Type</th><th>Unité</th><th>Min/Max</th><th></th></tr></thead>
                <tbody>
                  {(fields[frame.id] || []).map(ff => (
                    <tr key={ff.id}>
                      <td>
                        <code style={{ fontSize: 11 }}>{ff.name}</code>
                        {ff.is_primary_metric && <span style={{ marginLeft: 5, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontSize: 10, padding: '1px 5px', borderRadius: 999 }}>primaire</span>}
                      </td>
                      <td>{ff.label || '—'}</td>
                      <td>{ff.data_type}</td>
                      <td>{ff.unit || '—'}</td>
                      <td>{ff.min_value ?? '—'} / {ff.max_value ?? '—'}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn secondary" style={{ fontSize: 11, padding: '2px 7px' }}
                                onClick={() => { setEditField(ff); setAddField(null); }}>Mod.</button>
                        <button className="btn danger" style={{ fontSize: 11, padding: '2px 7px' }}
                                onClick={() => deleteField(frame.id, ff.id)}>Suppr.</button>
                      </td>
                    </tr>
                  ))}
                  {!(fields[frame.id] || []).length && (
                    <tr><td colSpan="6" style={{ color: '#9ca3af', padding: 10 }}>Aucun champ.</td></tr>
                  )}
                </tbody>
              </table>

              {editField && editField.frame_id === frame.id && (
                <FieldForm frameId={frame.id} initial={editField}
                  onSaved={() => { setEditField(null); loadFields(frame.id); }}
                  onCancel={() => setEditField(null)} />
              )}
              {addField === frame.id && !editField && (
                <FieldForm frameId={frame.id} initial={null}
                  onSaved={() => { setAddField(null); loadFields(frame.id); }}
                  onCancel={() => setAddField(null)} />
              )}
              {addField !== frame.id && !editField && (
                <button className="btn secondary" style={{ marginTop: 8, fontSize: 12 }}
                        onClick={() => { setAddField(frame.id); setEditField(null); }}>
                  + Ajouter un champ
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Nouvelle trame */}
      <div style={{ border: '1px dashed #d1d5db', borderRadius: 8, padding: '10px 12px', marginTop: 8 }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, fontWeight: 600 }}>Nouvelle trame</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {[['name','Nom *','status'],['topic_suffix','Suffixe topic *','status'],['description','Description','Trame de statut']].map(([key, lbl, ph]) => (
            <div key={key} style={{ flex: key === 'description' ? '2 1 180px' : '1 1 100px' }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{lbl}</div>
              <input className="input" value={newFrame[key]} placeholder={ph}
                onChange={e => setNewFrame(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <div style={{ flex: '0 0 100px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Direction</div>
            <select className="input" value={newFrame.direction} onChange={e => setNewFrame(f => ({ ...f, direction: e.target.value }))}>
              {DIRECTIONS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ flex: '0 0 80px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Format</div>
            <select className="input" value={newFrame.format} onChange={e => setNewFrame(f => ({ ...f, format: e.target.value }))}>
              {FORMATS.map(fm => <option key={fm}>{fm}</option>)}
            </select>
          </div>
          <button className="btn primary" onClick={createFrame} disabled={saving || !newFrame.name.trim() || !newFrame.topic_suffix.trim()} style={{ fontSize: 12, flexShrink: 0 }}>
            {saving ? '…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

const OPS_BY_TYPE = {
  number:  ['>','>=','<','<=','==','!='],
  boolean: ['==','!='],
  string:  ['==','!=','contains','notcontains'],
};

/* ================================================================
 *  Sous-composant : modèles de règles d'un type
 * ================================================================ */
function RuleTemplatesSection({ typeId }) {
  const [templates, setTemplates]   = useState([]);
  const [availFields, setAvailFields] = useState([]);
  const [form, setForm]             = useState({ name: '', description: '', field: '', cooldown_min_sec: '60', sort_order: '0' });
  const [editId, setEditId]         = useState(null);
  const [saving, setSaving]         = useState(false);

  useEffect(() => { load(); loadFields(); }, [typeId]);

  async function load() {
    try { setTemplates(await apiFetch(`/admin/device-types/${typeId}/rule-templates`)); }
    catch { /* noop */ }
  }

  async function loadFields() {
    try { setAvailFields(await apiFetch(`/admin/device-types/${typeId}/available-fields`)); }
    catch { setAvailFields([]); }
  }

  function opsFor(fieldName) {
    const meta = availFields.find(f => f.name === fieldName);
    return OPS_BY_TYPE[meta?.data_type || 'number'] || OPS;
  }

  function onFieldChange(fieldName) {
    const ops = opsFor(fieldName);
    setForm(f => ({
      ...f,
      field: fieldName,
      op: ops.includes(f.op) ? f.op : ops[0],
    }));
  }

  function startEdit(t) {
    setEditId(t.id);
    setForm({
      name: t.name,
      description: t.description || '',
      field: t.field,
      cooldown_min_sec: String(t.cooldown_min_sec ?? 60),
      sort_order: String(t.sort_order ?? 0),
    });
  }

  function cancelEdit() {
    setEditId(null);
    setForm({ name: '', description: '', field: '', cooldown_min_sec: '60', sort_order: '0' });
  }

  async function save() {
    if (!form.name.trim() || !form.field.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description || null,
        field: form.field.trim(),
        cooldown_min_sec: parseInt(form.cooldown_min_sec, 10) || 60,
        sort_order: parseInt(form.sort_order, 10) || 0,
      };
      if (editId) await apiFetch(`/admin/rule-templates/${editId}`, { method: 'PUT', body });
      else        await apiFetch(`/admin/device-types/${typeId}/rule-templates`, { method: 'POST', body });
      cancelEdit();
      await load();
    } catch { /* noop */ }
    finally { setSaving(false); }
  }

  async function del(id) {
    if (!window.confirm('Supprimer ce modèle ?')) return;
    await apiFetch(`/admin/rule-templates/${id}`, { method: 'DELETE' });
    await load();
  }

  const currentFieldMeta = availFields.find(f => f.name === form.field);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#374151' }}>
        Modèles de règles
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
        Présentés dans l'app lors de la création d'une alerte. L'utilisateur choisit librement le seuil et le cooldown (≥ cooldown min).
      </div>

      {templates.length > 0 && (
        <table className="table" style={{ fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr><th>Nom (admin)</th><th>Champ exposé</th><th>Cooldown min</th><th>Description</th><th></th></tr>
          </thead>
          <tbody>
            {templates.map(t => {
              const fieldMeta = availFields.find(f => f.name === t.field);
              return (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td>
                  <td>
                    <code style={{ fontSize: 11 }}>{t.field}</code>
                    {fieldMeta && (
                      <span style={{ marginLeft: 5, fontSize: 10, color: '#6b7280' }}>
                        {fieldMeta.label || ''}{fieldMeta.unit ? ` (${fieldMeta.unit})` : ''} · {fieldMeta.data_type}
                      </span>
                    )}
                  </td>
                  <td>{t.cooldown_min_sec}s</td>
                  <td style={{ color: '#6b7280' }}>{t.description || '—'}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="btn secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => startEdit(t)}>Mod.</button>
                    <button className="btn danger"    style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => del(t.id)}>Suppr.</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Formulaire ajout / édition */}
      <div style={{ border: `1px ${editId ? 'solid #374151' : 'dashed #d1d5db'}`, borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, fontWeight: 600 }}>
          {editId ? 'Modifier le modèle' : 'Nouveau modèle de règle'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          {/* Nom admin */}
          <div style={{ flex: '1 1 130px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Nom (admin) *</div>
            <input className="input" value={form.name} placeholder="Bruit élevé" onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          {/* Champ — dropdown des champs de la trame inbound */}
          <div style={{ flex: '0 0 160px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Champ *</div>
            {availFields.length > 0 ? (
              <select
                className="input"
                value={form.field}
                onChange={e => onFieldChange(e.target.value)}
                style={{ fontSize: 13 }}
              >
                <option value="">— choisir —</option>
                {availFields.map(f => (
                  <option key={f.name} value={f.name}>
                    {f.name}{f.label ? ` — ${f.label}` : ''}{f.unit ? ` (${f.unit})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input" value={form.field} placeholder="soundPct" onChange={e => setForm(f => ({ ...f, field: e.target.value }))} />
            )}
            {currentFieldMeta && (
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                {currentFieldMeta.data_type}
                {currentFieldMeta.min_value != null ? ` · [${currentFieldMeta.min_value}–${currentFieldMeta.max_value}]` : ''}
              </div>
            )}
          </div>

          {/* Cooldown min */}
          <div style={{ flex: '0 0 100px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Cooldown min (s)</div>
            <input className="input" type="number" value={form.cooldown_min_sec} placeholder="60" min={0}
              onChange={e => setForm(f => ({ ...f, cooldown_min_sec: e.target.value }))} />
          </div>

          {/* Description */}
          <div style={{ flex: '2 1 180px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Description</div>
            <input className="input" value={form.description} placeholder="Alerte bruit excessif" onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <button className="btn primary" onClick={save} disabled={saving || !form.name.trim() || !form.field.trim()} style={{ fontSize: 12, flexShrink: 0, marginTop: 'auto' }}>
            {saving ? '…' : editId ? 'Modifier' : 'Ajouter'}
          </button>
          {editId && <button className="btn secondary" onClick={cancelEdit} style={{ fontSize: 12 }}>Annuler</button>}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
 *  Page principale
 * ================================================================ */
export default function DeviceTypes() {
  const [rows, setRows]     = useState([]);
  const [err, setErr]       = useState('');
  const [editRow, setEditRow] = useState(null); // type en cours d'édition
  const [form, setForm]     = useState({ name: '', description: '', notif_title_tpl: '', notif_body_tpl: '' });
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false); // affiche le formulaire de création

  async function load() {
    setErr('');
    try { setRows(await apiFetch('/admin/device-types')); }
    catch (e) { setErr(e?.data?.error || e.message); }
  }

  useEffect(() => { load(); }, []);

  function openEdit(row) {
    setEditRow(row);
    setForm({ name: row.name, description: row.description || '', notif_title_tpl: row.notif_title_tpl || '', notif_body_tpl: row.notif_body_tpl || '' });
    setCreating(false);
  }

  function closeEdit() { setEditRow(null); }

  async function saveEdit() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/device-types/${editRow.id}`, { method: 'PUT', body: form });
      await load();
      setEditRow(r => ({ ...r, ...form })); // met à jour le panneau en place
    } catch (e) { setErr(e?.data?.error || e.message); }
    finally { setSaving(false); }
  }

  async function create() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/admin/device-types', { method: 'POST', body: form });
      setCreating(false);
      setForm({ name: '', description: '', notif_title_tpl: '', notif_body_tpl: '' });
      await load();
    } catch (e) { setErr(e?.data?.error || e.message); }
    finally { setSaving(false); }
  }

  async function del(id) {
    if (!window.confirm('Supprimer ce type ? Les trames et patterns associés seront supprimés.')) return;
    try {
      await apiFetch(`/admin/device-types/${id}`, { method: 'DELETE' });
      if (editRow?.id === id) setEditRow(null);
      await load();
    } catch (e) { setErr(e?.data?.error || e.message); }
  }

  /* ---- Vue détail (panneau d'édition) ---- */
  if (editRow) {
    const previewTitle = (form.notif_title_tpl || DEFAULT_TITLE_TPL)
      .replace(/{device_name}/g, 'Salon').replace(/{field_label}/g, 'Niveau sonore')
      .replace(/{unit}/g, '%').replace(/{op}/g, '>').replace(/{threshold}/g, '70').replace(/{current_value}/g, '82');
    const previewBody = (form.notif_body_tpl || DEFAULT_BODY_TPL)
      .replace(/{device_name}/g, 'Salon').replace(/{field_label}/g, 'Niveau sonore')
      .replace(/{unit}/g, '%').replace(/{op}/g, '>').replace(/{threshold}/g, '70').replace(/{current_value}/g, '82');

    return (
      <div className="container">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button className="btn secondary" style={{ flexShrink: 0 }} onClick={closeEdit}>← Retour</button>
          <h2 style={{ margin: 0 }}>{editRow.name}</h2>
          <button className="btn danger" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={() => del(editRow.id)}>
            Supprimer ce type
          </button>
        </div>

        {err && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{err}</div>}

        <div className="row">
          {/* Colonne gauche : infos + templates */}
          <div style={{ flex: '1 1 320px' }}>
            <div className="card">
              <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Informations
              </h3>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Nom *</div>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ESP32-SoundSense" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Description</div>
                <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Capteur de niveau sonore" />
              </div>

              <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Templates de notification push
              </h3>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
                Variables : <code style={{ fontSize: 11 }}>{'{device_name}'}</code> <code style={{ fontSize: 11 }}>{'{field_label}'}</code> <code style={{ fontSize: 11 }}>{'{unit}'}</code> <code style={{ fontSize: 11 }}>{'{op}'}</code> <code style={{ fontSize: 11 }}>{'{threshold}'}</code> <code style={{ fontSize: 11 }}>{'{current_value}'}</code>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Titre</div>
                <input className="input" value={form.notif_title_tpl} onChange={e => setForm(f => ({ ...f, notif_title_tpl: e.target.value }))} placeholder={DEFAULT_TITLE_TPL} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Corps du message</div>
                <input className="input" value={form.notif_body_tpl} onChange={e => setForm(f => ({ ...f, notif_body_tpl: e.target.value }))} placeholder={DEFAULT_BODY_TPL} />
              </div>

              {/* Aperçu */}
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#374151', marginBottom: 14 }}>
                <b>Aperçu (exemple) :</b><br />
                <span style={{ color: '#6b7280' }}>Titre : </span>{previewTitle}<br />
                <span style={{ color: '#6b7280' }}>Corps : </span>{previewBody}
              </div>

              <button className="btn primary" onClick={saveEdit} disabled={saving || !form.name.trim()}>
                {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </button>
            </div>
          </div>

          {/* Colonne droite : trames + modèles de règles */}
          <div style={{ flex: '2 1 420px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <FramesSection typeId={editRow.id} />
            </div>
            <div className="card">
              <RuleTemplatesSection typeId={editRow.id} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Vue liste ---- */
  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Types de devices IoT</h2>
        <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => { setCreating(c => !c); setForm({ name: '', description: '', notif_title_tpl: '', notif_body_tpl: '' }); }}>
          {creating ? 'Annuler' : '+ Nouveau type'}
        </button>
      </div>

      {err && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{err}</div>}

      {creating && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Nouveau type</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Nom *</div>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ESP32-SoundSense" />
            </div>
            <div style={{ flex: '2 1 240px' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Description</div>
              <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Capteur de niveau sonore" />
            </div>
            <button className="btn primary" onClick={create} disabled={saving || !form.name.trim()} style={{ flexShrink: 0 }}>
              {saving ? '…' : 'Créer'}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Description</th>
              <th>Template notif titre</th>
              <th>Trames</th>
              <th>ESP</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="tr-hover" style={{ cursor: 'pointer' }} onClick={() => openEdit(r)}>
                <td><b>{r.name}</b></td>
                <td style={{ color: '#6b7280', fontSize: 13 }}>{r.description || '—'}</td>
                <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.notif_title_tpl || <span style={{ color: '#9ca3af' }}>Défaut</span>}
                </td>
                <td><span className="badge">{r.frame_count}</span></td>
                <td>{r.esp_count}</td>
                <td>
                  <button className="btn secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={e => { e.stopPropagation(); openEdit(r); }}>
                    Modifier →
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan="6" style={{ color: '#9ca3af', padding: 16 }}>Aucun type configuré. Créez-en un ci-dessus.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

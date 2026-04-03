import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

const DIRECTIONS = ['inbound', 'outbound'];
const FORMATS    = ['json', 'text', 'binary'];
const DATA_TYPES = ['number', 'string', 'boolean'];

function FieldRow({ field, onEdit, onDelete }) {
  return (
    <tr>
      <td>
        <code style={{ fontSize: 11 }}>{field.name}</code>
        {field.is_primary_metric && (
          <span style={{ marginLeft: 6, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontSize: 11, padding: '1px 6px', borderRadius: 999, fontWeight: 600 }}>
            primaire
          </span>
        )}
      </td>
      <td>{field.label || '—'}</td>
      <td>{field.data_type}</td>
      <td>{field.unit || '—'}</td>
      <td>{field.min_value ?? '—'} / {field.max_value ?? '—'}</td>
      <td style={{ display: 'flex', gap: 6 }}>
        <button className="btn secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => onEdit(field)}>Modifier</button>
        <button className="btn danger"    style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => onDelete(field.id)}>Suppr.</button>
      </td>
    </tr>
  );
}

function FieldForm({ frameId, initial, onSaved, onCancel }) {
  const empty = { name: '', label: '', data_type: 'number', unit: '', min_value: '', max_value: '', is_primary_metric: false, description: '', sort_order: '0' };
  const [f, setF] = useState(initial ? {
    name: initial.name,
    label: initial.label || '',
    data_type: initial.data_type || 'number',
    unit: initial.unit || '',
    min_value: initial.min_value ?? '',
    max_value: initial.max_value ?? '',
    is_primary_metric: !!initial.is_primary_metric,
    description: initial.description || '',
    sort_order: String(initial.sort_order ?? 0),
  } : empty);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!f.name.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...f,
        min_value: f.min_value !== '' ? parseFloat(f.min_value) : null,
        max_value: f.max_value !== '' ? parseFloat(f.max_value) : null,
        sort_order: parseInt(f.sort_order, 10) || 0,
      };
      if (initial?.id) {
        await apiFetch(`/admin/fields/${initial.id}`, { method: 'PUT', body });
      } else {
        await apiFetch(`/admin/frames/${frameId}/fields`, { method: 'POST', body });
      }
      onSaved();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally { setSaving(false); }
  }

  const inp = (key, placeholder, type = 'text') => (
    <input
      className="input"
      type={type}
      value={f[key]}
      onChange={e => setF(v => ({ ...v, [key]: type === 'checkbox' ? e.target.checked : e.target.value }))}
      placeholder={placeholder}
      style={{ marginBottom: 0 }}
    />
  );

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginTop: 10 }}>
      {err && <div style={{ color: '#b91c1c', marginBottom: 8, fontSize: 13 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Nom *</div>
          {inp('name', 'soundPct')}
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Label</div>
          {inp('label', 'Niveau sonore')}
        </div>
        <div style={{ flex: '0 0 110px' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Type</div>
          <select className="input" value={f.data_type} onChange={e => setF(v => ({ ...v, data_type: e.target.value }))}>
            {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ flex: '0 0 80px' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Unité</div>
          {inp('unit', '%')}
        </div>
        <div style={{ flex: '0 0 80px' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Min</div>
          {inp('min_value', '0', 'number')}
        </div>
        <div style={{ flex: '0 0 80px' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Max</div>
          {inp('max_value', '100', 'number')}
        </div>
        <div style={{ flex: '0 0 60px' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Ordre</div>
          {inp('sort_order', '0', 'number')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4 }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.is_primary_metric} onChange={e => setF(v => ({ ...v, is_primary_metric: e.target.checked }))} />
            Métrique primaire (last_db)
          </label>
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={save} disabled={saving || !f.name.trim()} style={{ fontSize: 13 }}>
          {saving ? '…' : initial?.id ? 'Modifier' : 'Ajouter le champ'}
        </button>
        <button className="btn secondary" onClick={onCancel} style={{ fontSize: 13 }}>Annuler</button>
      </div>
    </div>
  );
}

function FrameCard({ typeId, frame: initialFrame, onDeleted }) {
  const [frame, setFrame]   = useState(initialFrame);
  const [fields, setFields] = useState([]);
  const [open, setOpen]     = useState(false);
  const [addField, setAddField]   = useState(false);
  const [editField, setEditField] = useState(null);
  const [editingFrame, setEditingFrame] = useState(false);
  const [frameForm, setFrameForm] = useState({ name: frame.name, topic_suffix: frame.topic_suffix, description: frame.description || '' });
  const [savingFrame, setSavingFrame] = useState(false);
  const [frameErr, setFrameErr] = useState('');

  async function loadFields() {
    try { setFields(await apiFetch(`/admin/frames/${frame.id}/fields`)); }
    catch { /* noop */ }
  }

  useEffect(() => { if (open) loadFields(); }, [open]);

  async function deleteField(id) {
    if (!window.confirm('Supprimer ce champ ?')) return;
    await apiFetch(`/admin/fields/${id}`, { method: 'DELETE' });
    loadFields();
  }

  async function deleteFrame() {
    if (!window.confirm(`Supprimer la trame "${frame.name}" et ses champs ?`)) return;
    await apiFetch(`/admin/frames/${frame.id}`, { method: 'DELETE' });
    onDeleted();
  }

  async function saveFrameEdit() {
    if (!frameForm.name.trim() || !frameForm.topic_suffix.trim()) return;
    setSavingFrame(true); setFrameErr('');
    try {
      const updated = await apiFetch(`/admin/frames/${frame.id}`, {
        method: 'PUT',
        body: { name: frameForm.name.trim(), topic_suffix: frameForm.topic_suffix.trim(), direction: frame.direction, format: frame.format, description: frameForm.description || null },
      });
      setFrame(f => ({ ...f, ...updated }));
      setEditingFrame(false);
    } catch (e) { setFrameErr(e?.data?.error || e.message); }
    finally { setSavingFrame(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, color: '#111' }}
          onClick={() => setOpen(o => !o)}
        >
          {open ? '▾' : '▸'}
        </button>
        {editingFrame ? (
          <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Nom *</div>
              <input className="input" style={{ width: 130 }} value={frameForm.name} onChange={e => setFrameForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Suffixe topic *</div>
              <input className="input" style={{ width: 130 }} value={frameForm.topic_suffix} onChange={e => setFrameForm(f => ({ ...f, topic_suffix: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Description</div>
              <input className="input" style={{ width: 200 }} value={frameForm.description} onChange={e => setFrameForm(f => ({ ...f, description: e.target.value }))} placeholder="Optionnelle" />
            </div>
            {frameErr && <span style={{ color: '#b91c1c', fontSize: 12 }}>{frameErr}</span>}
            <button className="btn primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={saveFrameEdit} disabled={savingFrame || !frameForm.name.trim() || !frameForm.topic_suffix.trim()}>
              {savingFrame ? '…' : 'Enregistrer'}
            </button>
            <button className="btn secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => { setEditingFrame(false); setFrameErr(''); }}>Annuler</button>
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <b>{frame.name}</b>
            <code style={{ marginLeft: 8, fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
              {frame.topic_suffix}
            </code>
            <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>{frame.direction} · {frame.format}</span>
            <span className="badge" style={{ marginLeft: 8 }}>{frame.field_count} champ{frame.field_count !== 1 ? 's' : ''}</span>
            {frame.description && <span style={{ marginLeft: 8, fontSize: 12, color: '#9ca3af' }}>{frame.description}</span>}
          </div>
        )}
        {!editingFrame && (
          <button className="btn secondary" style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0 }} onClick={() => { setFrameForm({ name: frame.name, topic_suffix: frame.topic_suffix, description: frame.description || '' }); setEditingFrame(true); }}>Renommer</button>
        )}
        {!editingFrame && (
          <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0 }} onClick={deleteFrame}>Supprimer</button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr><th>Champ</th><th>Label</th><th>Type</th><th>Unité</th><th>Min / Max</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {fields.map(ff => (
                <FieldRow key={ff.id} field={ff}
                  onEdit={f => { setEditField(f); setAddField(false); }}
                  onDelete={deleteField}
                />
              ))}
              {!fields.length && (
                <tr><td colSpan="6" style={{ color: '#9ca3af', padding: 12 }}>Aucun champ défini.</td></tr>
              )}
            </tbody>
          </table>

          {editField && (
            <FieldForm
              frameId={frame.id}
              initial={editField}
              onSaved={() => { setEditField(null); loadFields(); }}
              onCancel={() => setEditField(null)}
            />
          )}
          {!editField && !addField && (
            <button className="btn secondary" style={{ marginTop: 10, fontSize: 13 }} onClick={() => setAddField(true)}>
              + Ajouter un champ
            </button>
          )}
          {addField && !editField && (
            <FieldForm
              frameId={frame.id}
              initial={null}
              onSaved={() => { setAddField(false); loadFields(); }}
              onCancel={() => setAddField(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function DiagnosticTool({ typeId }) {
  const [suffix, setSuffix]   = useState('status');
  const [payload, setPayload] = useState('{"soundPct":75,"soundAvg":70}');
  const [result, setResult]   = useState(null);
  const [err, setErr]         = useState('');

  async function run() {
    setErr(''); setResult(null);
    try {
      const data = await apiFetch('/admin/mqtt/parse-test', {
        method: 'POST',
        body: { device_type_id: typeId, topic_suffix: suffix, payload_json: payload },
      });
      setResult(data);
    } catch (e) { setErr(e?.data?.error || e.message); }
  }

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        Diagnostic — Test de parsing
      </h3>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: '0 0 140px' }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Suffixe de topic</div>
          <input className="input" value={suffix} onChange={e => setSuffix(e.target.value)} placeholder="status" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Payload JSON</div>
          <input className="input" value={payload} onChange={e => setPayload(e.target.value)} placeholder='{"soundPct":75}' />
        </div>
        <button className="btn primary" style={{ alignSelf: 'flex-end', flexShrink: 0 }} onClick={run}>
          Tester
        </button>
      </div>
      {err && <div style={{ color: '#b91c1c', fontSize: 13 }}>{err}</div>}
      {result && (
        <div style={{ marginTop: 10 }}>
          {!result.found ? (
            <div style={{ color: '#92400e', background: '#fef3c7', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
              {result.message}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                Trame : <b>{result.frame_name}</b> · suffix : <code style={{ fontSize: 11 }}>{result.topic_suffix}</code>
              </div>
              <table className="table" style={{ fontSize: 13 }}>
                <thead><tr><th>Champ</th><th>Valeur extraite</th></tr></thead>
                <tbody>
                  {Object.entries(result.extracted).map(([k, v]) => (
                    <tr key={k}>
                      <td><code style={{ fontSize: 12 }}>{k}</code></td>
                      <td>
                        {v === undefined ? (
                          <span style={{ color: '#ef4444', fontSize: 12 }}>absent du payload</span>
                        ) : (
                          <span style={{ color: '#166534', fontWeight: 600 }}>{String(v)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                Clés dans le payload : {result.raw_keys.join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MqttFrames() {
  const { typeId } = useParams();
  const location = useLocation();
  const nav = useNavigate();
  const typeName = location.state?.typeName || 'Type de device';

  const [frames, setFrames]   = useState([]);
  const [err, setErr]         = useState('');
  const [form, setForm]       = useState({ name: '', topic_suffix: '', direction: 'inbound', format: 'json', description: '' });
  const [saving, setSaving]   = useState(false);

  async function load() {
    setErr('');
    try { setFrames(await apiFetch(`/admin/device-types/${typeId}/frames`)); }
    catch (e) { setErr(e?.data?.error || e.message); }
  }

  useEffect(() => { load(); }, [typeId]);

  async function createFrame() {
    if (!form.name.trim() || !form.topic_suffix.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/device-types/${typeId}/frames`, { method: 'POST', body: form });
      setForm({ name: '', topic_suffix: '', direction: 'inbound', format: 'json', description: '' });
      await load();
    } catch (e) { setErr(e?.data?.error || e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn secondary" style={{ flexShrink: 0 }} onClick={() => nav('/device-types')}>← Retour</button>
        <h2 style={{ margin: 0 }}>Trames MQTT — {typeName}</h2>
      </div>

      {err ? <div style={{ color: '#b91c1c', marginBottom: 12 }}>{err}</div> : null}

      {/* Nouvelle trame */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Nouvelle trame
        </h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 130px' }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Nom *</div>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="status" />
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Suffixe topic *</div>
            <input className="input" value={form.topic_suffix} onChange={e => setForm(f => ({ ...f, topic_suffix: e.target.value }))} placeholder="status" />
          </div>
          <div style={{ flex: '0 0 110px' }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Direction</div>
            <select className="input" value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
              {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ flex: '0 0 90px' }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Format</div>
            <select className="input" value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}>
              {FORMATS.map(fm => <option key={fm} value={fm}>{fm}</option>)}
            </select>
          </div>
          <div style={{ flex: '2 1 200px' }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Description</div>
            <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Trame de statut périodique" />
          </div>
          <button className="btn primary" onClick={createFrame} disabled={saving || !form.name.trim() || !form.topic_suffix.trim()} style={{ flexShrink: 0 }}>
            {saving ? '…' : 'Créer'}
          </button>
        </div>
      </div>

      {/* Liste des trames */}
      {frames.length === 0 && (
        <div style={{ color: '#9ca3af', padding: 16 }}>Aucune trame définie pour ce type.</div>
      )}
      {frames.map(frame => (
        <FrameCard key={frame.id} typeId={typeId} frame={frame} onDeleted={load} />
      ))}

      {/* Outil de diagnostic */}
      <DiagnosticTool typeId={typeId} />
    </div>
  );
}

import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../api.js';

// Opérateurs disponibles par type de données
const OPS_BY_TYPE = {
  number:  ['>','>=','<','<=','==','!='],
  boolean: ['==','!='],
  string:  ['==','!=','contains','notcontains'],
};
const ALL_OPS = ['>','>=','<','<=','==','!=','contains','notcontains'];

function opsForType(dataType) {
  return OPS_BY_TYPE[dataType] || ALL_OPS;
}

// Est-ce que l'op utilise un seuil numérique ?
function isNumericOp(op) {
  return ['>', '>=', '<', '<='].includes(op);
}

export default function Rules() {
  const [rows, setRows]   = useState([]);
  const [err, setErr]     = useState('');
  const [editId, setEditId] = useState(null);   // id de la règle en cours d'édition
  const [editForm, setEditForm] = useState({});
  const [availFields, setAvailFields] = useState([]); // champs dispo pour l'ESP en cours d'édition
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setErr('');
    try {
      const data = await apiFetch('/admin/rules?limit=300&offset=0');
      setRows(data || []);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  useEffect(() => { load(); }, []);

  // Ouvrir l'édition d'une règle
  async function startEdit(r) {
    setEditId(r.id);
    setEditForm({
      field:         r.field,
      op:            r.op,
      threshold_num: r.threshold_num ?? '',
      threshold_str: r.threshold_str ?? '',
      cooldown_sec:  r.cooldown_sec,
      enabled:       r.enabled,
    });
    setAvailFields([]);
    if (r.esp_id) {
      setFieldsLoading(true);
      try {
        const fields = await apiFetch(`/admin/esp-devices/${r.esp_id}/available-fields`);
        setAvailFields(fields || []);
      } catch {
        setAvailFields([]);
      } finally {
        setFieldsLoading(false);
      }
    }
  }

  function cancelEdit() {
    setEditId(null);
    setEditForm({});
    setAvailFields([]);
  }

  // Quand on change le champ sélectionné, on adapte l'op et le seuil
  function onFieldChange(fieldName) {
    const fieldMeta = availFields.find(f => f.name === fieldName);
    const ops = opsForType(fieldMeta?.data_type || 'number');
    const currentOp = editForm.op;
    const newOp = ops.includes(currentOp) ? currentOp : ops[0];
    setEditForm(prev => ({
      ...prev,
      field: fieldName,
      op: newOp,
      threshold_num: fieldMeta?.data_type !== 'string' ? (prev.threshold_num ?? '') : '',
      threshold_str: fieldMeta?.data_type === 'string'  ? (prev.threshold_str ?? '') : '',
    }));
  }

  // Quand on change l'op, on adapte le type de seuil
  function onOpChange(op) {
    const fieldMeta = availFields.find(f => f.name === editForm.field);
    const isStr = fieldMeta?.data_type === 'string' || ['contains','notcontains','==','!='].includes(op) && fieldMeta?.data_type === 'string';
    setEditForm(prev => ({
      ...prev,
      op,
      threshold_num: isStr ? '' : prev.threshold_num,
      threshold_str: isStr ? prev.threshold_str : '',
    }));
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const fieldMeta = availFields.find(f => f.name === editForm.field);
      const useNum = fieldMeta ? fieldMeta.data_type === 'number' : !['contains','notcontains'].includes(editForm.op);
      const payload = {
        field:         editForm.field,
        op:            editForm.op,
        threshold_num: useNum && editForm.threshold_num !== '' ? Number(editForm.threshold_num) : null,
        threshold_str: !useNum && editForm.threshold_str !== '' ? editForm.threshold_str : null,
        cooldown_sec:  Number(editForm.cooldown_sec) || 60,
        enabled:       editForm.enabled,
      };
      await apiFetch(`/admin/rules/${editId}`, { method: 'PATCH', body: payload });
      setEditId(null);
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id) {
    if (!confirm('Supprimer cette règle ?')) return;
    try {
      await apiFetch(`/admin/rules/${id}`, { method: 'DELETE' });
      if (editId === id) cancelEdit();
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  async function toggleEnabled(r) {
    try {
      await apiFetch(`/admin/rules/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } });
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  // Détermine les champs disponibles pour l'affichage du select
  const currentFieldMeta = availFields.find(f => f.name === editForm.field);
  const availOps = opsForType(currentFieldMeta?.data_type || 'number');
  const isStrField = currentFieldMeta?.data_type === 'string';

  return (
    <div className="container">
      <h2>Règles d'alerte</h2>

      {err ? <div style={{ color: '#b91c1c', marginBottom: 10 }}>{err}</div> : null}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>ESP</th>
              <th>Type device</th>
              <th>Type alerte</th>
              <th>Op</th>
              <th>Seuil</th>
              <th>Cooldown</th>
              <th>Actif</th>
              <th>Dernier envoi</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isEditing = editId === r.id;
              return (
                <React.Fragment key={r.id}>
                  <tr style={{ background: isEditing ? '#eff6ff' : '' }}>
                    <td style={{ fontSize: 12 }}>{r.user_email}</td>
                    <td>
                      <div style={{ fontSize: 12 }}><code>{r.esp_uid}</code></div>
                      {r.esp_name && <div style={{ fontSize: 11, color: '#6b7280' }}>{r.esp_name}</div>}
                    </td>
                    <td style={{ fontSize: 12, color: '#6b7280' }}>{r.device_type_name || '—'}</td>
                    <td>
                      {r.template_name
                        ? <span style={{ fontSize: 12 }}>{r.template_name}</span>
                        : <code style={{ fontSize: 12, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>{r.field}</code>
                      }
                      <div style={{ fontSize: 10, color: '#9ca3af' }}><code>{r.field}</code></div>
                    </td>
                    <td style={{ fontSize: 13 }}>{r.op}</td>
                    <td style={{ fontSize: 13 }}>{r.threshold_num ?? r.threshold_str ?? '—'}</td>
                    <td style={{ fontSize: 12, color: '#6b7280' }}>{r.cooldown_sec}s</td>
                    <td>
                      <button
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
                          opacity: saving ? 0.5 : 1,
                        }}
                        title={r.enabled ? 'Désactiver' : 'Activer'}
                        onClick={() => toggleEnabled(r)}
                      >
                        {r.enabled ? '✅' : '⬜'}
                      </button>
                    </td>
                    <td style={{ fontSize: 11, color: '#6b7280' }}>
                      {r.last_sent ? new Date(r.last_sent).toLocaleString('fr-FR') : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {!isEditing && (
                          <button className="btn secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => startEdit(r)}>
                            Éditer
                          </button>
                        )}
                        <button
                          className="btn secondary"
                          style={{ padding: '3px 8px', fontSize: 12, color: '#b91c1c' }}
                          onClick={() => deleteRule(r.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isEditing && (
                    <tr style={{ background: '#eff6ff' }}>
                      <td colSpan={10} style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>

                          {/* Sélecteur de champ */}
                          <div>
                            <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>
                              Type alerte {r.device_type_name && <span style={{ color: '#3b82f6' }}>({r.device_type_name})</span>}
                            </label>
                            {fieldsLoading ? (
                              <div style={{ fontSize: 12, color: '#6b7280', padding: '6px 10px' }}>Chargement…</div>
                            ) : availFields.length > 0 ? (
                              <select
                                className="input"
                                style={{ minWidth: 160, padding: '5px 8px', fontSize: 13 }}
                                value={editForm.field}
                                onChange={e => onFieldChange(e.target.value)}
                              >
                                {availFields.map(f => (
                                  <option key={f.name} value={f.name}>
                                    {f.label || f.name}{f.unit ? ` (${f.unit})` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className="input"
                                style={{ width: 140, padding: '5px 8px', fontSize: 13 }}
                                value={editForm.field}
                                onChange={e => setEditForm(prev => ({ ...prev, field: e.target.value }))}
                                placeholder="nom du champ"
                              />
                            )}
                            {currentFieldMeta && (
                              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                                {currentFieldMeta.data_type}
                                {currentFieldMeta.unit ? ` · ${currentFieldMeta.unit}` : ''}
                                {currentFieldMeta.min_value != null ? ` · [${currentFieldMeta.min_value}–${currentFieldMeta.max_value}]` : ''}
                              </div>
                            )}
                          </div>

                          {/* Opérateur */}
                          <div>
                            <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Opérateur</label>
                            <select
                              className="input"
                              style={{ width: 100, padding: '5px 8px', fontSize: 13 }}
                              value={editForm.op}
                              onChange={e => onOpChange(e.target.value)}
                            >
                              {availOps.map(op => <option key={op} value={op}>{op}</option>)}
                            </select>
                          </div>

                          {/* Seuil */}
                          <div>
                            <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>
                              Seuil {currentFieldMeta?.unit ? `(${currentFieldMeta.unit})` : ''}
                            </label>
                            {isStrField ? (
                              <input
                                className="input"
                                style={{ width: 120, padding: '5px 8px', fontSize: 13 }}
                                value={editForm.threshold_str}
                                onChange={e => setEditForm(prev => ({ ...prev, threshold_str: e.target.value }))}
                                placeholder="valeur"
                              />
                            ) : (
                              <input
                                className="input"
                                type="number"
                                style={{ width: 100, padding: '5px 8px', fontSize: 13 }}
                                value={editForm.threshold_num}
                                onChange={e => setEditForm(prev => ({ ...prev, threshold_num: e.target.value }))}
                                placeholder="0"
                                step="any"
                              />
                            )}
                          </div>

                          {/* Cooldown */}
                          <div>
                            <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Cooldown (s)</label>
                            <input
                              className="input"
                              type="number"
                              style={{ width: 90, padding: '5px 8px', fontSize: 13 }}
                              value={editForm.cooldown_sec}
                              onChange={e => setEditForm(prev => ({ ...prev, cooldown_sec: e.target.value }))}
                              min={0}
                            />
                          </div>

                          {/* Boutons */}
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn" onClick={saveEdit} disabled={saving}>
                              {saving ? 'Enreg…' : 'Enregistrer'}
                            </button>
                            <button className="btn secondary" onClick={cancelEdit}>Annuler</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={10} style={{ color: '#666', textAlign: 'center' }}>Aucune règle.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

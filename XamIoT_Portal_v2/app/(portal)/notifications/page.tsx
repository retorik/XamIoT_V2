'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useLang } from '@/lib/useLang';

interface Device { id: string; esp_uid: string; name: string; }

interface RuleTemplate {
  id: string; name: string; description: string; field: string;
  field_label: string; field_data_type: string; field_unit: string | null;
  field_operators: string[]; cooldown_min_sec: number;
}

interface DeviceMeta {
  esp_id: string; esp_name: string; rule_templates: RuleTemplate[];
}

interface AlertRule {
  id: number; esp_id: string; field: string; op: string;
  threshold_num: number | null; threshold_str: string | null;
  enabled: boolean; cooldown_sec: number;
  user_label: string | null; template_name: string | null; template_id: string | null;
}

const T = {
  fr: {
    title: "Règles d'alerte", subtitle: 'Gérez vos règles de notification par appareil',
    no_devices: 'Aucun appareil trouvé.',
    error: 'Impossible de charger les données.',
    modal_edit: 'Modifier la règle', modal_new: 'Nouvelle règle',
    rule_name: 'Nom (optionnel)', rule_name_ph: 'Ex: Alerte bruit fort',
    rule_type: "Type d'alerte", no_type: 'Aucun type disponible',
    operator: 'Opérateur', threshold: 'Seuil', cooldown: 'Cooldown (secondes)',
    minimum: 'minimum', cancel: 'Annuler', modify: 'Modifier', create: 'Créer',
    select_type: "Sélectionnez un type d'alerte.", error_save: 'Erreur lors de la sauvegarde.',
    add: '+ Ajouter', no_rules: 'Aucune règle configurée.',
    cooldown_label: 'Cooldown :', edit: 'Modifier', delete: 'Suppr.',
    confirm_delete: 'Supprimer cette règle ?',
  },
  en: {
    title: 'Alert rules', subtitle: 'Manage your notification rules per device',
    no_devices: 'No device found.',
    error: 'Unable to load data.',
    modal_edit: 'Edit rule', modal_new: 'New rule',
    rule_name: 'Name (optional)', rule_name_ph: 'E.g. Loud noise alert',
    rule_type: 'Alert type', no_type: 'No type available',
    operator: 'Operator', threshold: 'Threshold', cooldown: 'Cooldown (seconds)',
    minimum: 'minimum', cancel: 'Cancel', modify: 'Update', create: 'Create',
    select_type: 'Select an alert type.', error_save: 'Error saving.',
    add: '+ Add', no_rules: 'No rules configured.',
    cooldown_label: 'Cooldown:', edit: 'Edit', delete: 'Del.',
    confirm_delete: 'Delete this rule?',
  },
  es: {
    title: 'Reglas de alerta', subtitle: 'Gestione sus reglas de notificación por dispositivo',
    no_devices: 'No se encontraron dispositivos.',
    error: 'No se pueden cargar los datos.',
    modal_edit: 'Editar regla', modal_new: 'Nueva regla',
    rule_name: 'Nombre (opcional)', rule_name_ph: 'Ej: Alerta de ruido fuerte',
    rule_type: 'Tipo de alerta', no_type: 'No hay tipos disponibles',
    operator: 'Operador', threshold: 'Umbral', cooldown: 'Cooldown (segundos)',
    minimum: 'mínimo', cancel: 'Cancelar', modify: 'Actualizar', create: 'Crear',
    select_type: 'Seleccione un tipo de alerta.', error_save: 'Error al guardar.',
    add: '+ Añadir', no_rules: 'Ninguna regla configurada.',
    cooldown_label: 'Cooldown:', edit: 'Editar', delete: 'Elim.',
    confirm_delete: '¿Eliminar esta regla?',
  },
};

export default function NotificationsPage() {
  const lang = useLang();
  const t = T[lang];

  const [devices, setDevices] = useState<Device[]>([]);
  const [rules, setRules] = useState<Record<string, AlertRule[]>>({});
  const [metas, setMetas] = useState<Record<string, DeviceMeta>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ deviceId: string; rule?: AlertRule } | null>(null);
  const [form, setForm] = useState({ user_label: '', template_id: '', op: '>', threshold: '', cooldown_sec: '90' });
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const devs = await apiFetch<Device[]>('/esp-devices');
      setDevices(devs);
      const rulesMap: Record<string, AlertRule[]> = {};
      const metasMap: Record<string, DeviceMeta> = {};
      await Promise.all(devs.map(async (d) => {
        rulesMap[d.id] = await apiFetch<AlertRule[]>(`/esp-rules?esp_id=${d.id}`).catch(() => []);
        metasMap[d.id] = await apiFetch<DeviceMeta>(`/esp-devices/${d.id}/meta`).catch(() => ({ esp_id: d.id, esp_name: d.name, rule_templates: [] }));
      }));
      setRules(rulesMap);
      setMetas(metasMap);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }

  function getTemplates(deviceId: string): RuleTemplate[] { return metas[deviceId]?.rule_templates || []; }
  function getTemplate(deviceId: string, templateId: string) { return getTemplates(deviceId).find(t => t.id === templateId); }

  function openAdd(deviceId: string) {
    const templates = getTemplates(deviceId);
    const first = templates[0];
    setEditing({ deviceId });
    setForm({ user_label: '', template_id: first?.id || '', op: first?.field_operators?.[0] || '>', threshold: '', cooldown_sec: String(first?.cooldown_min_sec || 90) });
    setFormMsg('');
  }

  function openEdit(deviceId: string, rule: AlertRule) {
    const templates = getTemplates(deviceId);
    const matchingTemplate = rule.template_id ? templates.find(t => t.id === rule.template_id) : templates.find(t => t.field === rule.field);
    setEditing({ deviceId, rule });
    setForm({ user_label: rule.user_label || '', template_id: matchingTemplate?.id || '', op: rule.op, threshold: String(rule.threshold_num ?? rule.threshold_str ?? ''), cooldown_sec: String(rule.cooldown_sec) });
    setFormMsg('');
  }

  function closeForm() { setEditing(null); setFormMsg(''); }

  function onTemplateChange(templateId: string) {
    if (!editing) return;
    const tpl = getTemplate(editing.deviceId, templateId);
    setForm(prev => ({ ...prev, template_id: templateId, op: tpl?.field_operators?.[0] || prev.op, cooldown_sec: String(Math.max(Number(prev.cooldown_sec) || 0, tpl?.cooldown_min_sec || 90)) }));
  }

  function onCooldownChange(val: string) {
    if (!editing) return;
    const tpl = getTemplate(editing.deviceId, form.template_id);
    setForm(prev => ({ ...prev, cooldown_sec: String(Math.max(Number(val) || 0, tpl?.cooldown_min_sec || 0)) }));
  }

  async function saveRule() {
    if (!editing) return;
    const tpl = getTemplate(editing.deviceId, form.template_id);
    if (!tpl) { setFormMsg(t.select_type); return; }
    setSaving(true); setFormMsg('');
    const body: Record<string, unknown> = {
      field: tpl.field, op: form.op,
      threshold_num: isNaN(Number(form.threshold)) ? null : Number(form.threshold),
      threshold_str: isNaN(Number(form.threshold)) ? form.threshold : null,
      cooldown_sec: Math.max(Number(form.cooldown_sec), tpl.cooldown_min_sec),
      user_label: form.user_label || null, template_id: tpl.id,
    };
    try {
      if (editing.rule) {
        await apiFetch(`/esp-rules/${editing.rule.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        body.esp_id = editing.deviceId; body.enabled = true;
        await apiFetch('/esp-rules', { method: 'POST', body: JSON.stringify(body) });
      }
      await loadAll(); closeForm();
    } catch { setFormMsg(t.error_save); }
    finally { setSaving(false); }
  }

  async function deleteRule(ruleId: number) {
    if (!confirm(t.confirm_delete)) return;
    try { await apiFetch(`/esp-rules/${ruleId}`, { method: 'DELETE' }); await loadAll(); } catch { /* silent */ }
  }

  async function toggleRule(ruleId: number, enabled: boolean) {
    try {
      await apiFetch(`/esp-rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
      setRules(prev => {
        const next = { ...prev };
        for (const k of Object.keys(next)) next[k] = next[k].map(r => r.id === ruleId ? { ...r, enabled } : r);
        return next;
      });
    } catch { /* silent */ }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  );

  const selectedTemplate = editing ? getTemplate(editing.deviceId, form.template_id) : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.subtitle}</p>
      </div>

      {error && <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {devices.length === 0 && !error && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">{t.no_devices}</p>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) closeForm(); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">{editing.rule ? t.modal_edit : t.modal_new}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t.rule_name}</label>
                <input type="text" value={form.user_label} onChange={e => setForm(p => ({ ...p, user_label: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={t.rule_name_ph} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t.rule_type}</label>
                <select value={form.template_id} onChange={e => onTemplateChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                  {getTemplates(editing.deviceId).length === 0 && <option value="">{t.no_type}</option>}
                  {getTemplates(editing.deviceId).map(tpl => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}{tpl.field_unit ? ` (${tpl.field_unit})` : ''}</option>
                  ))}
                </select>
                {selectedTemplate?.description && <p className="text-xs text-slate-400 mt-1">{selectedTemplate.description}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t.operator}</label>
                  <select value={form.op} onChange={e => setForm(p => ({ ...p, op: e.target.value }))}
                    className="w-full px-2 py-2 rounded-lg border border-slate-200 text-sm">
                    {(selectedTemplate?.field_operators || ['>', '>=', '<', '<=', '==', '!=']).map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t.threshold}{selectedTemplate?.field_unit ? ` (${selectedTemplate.field_unit})` : ''}</label>
                  <input type="text" value={form.threshold} onChange={e => setForm(p => ({ ...p, threshold: e.target.value }))}
                    className="w-full px-2 py-2 rounded-lg border border-slate-200 text-sm" placeholder="50" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  {t.cooldown}{selectedTemplate ? ` — ${t.minimum} ${selectedTemplate.cooldown_min_sec}s` : ''}
                </label>
                <input type="number" min={selectedTemplate?.cooldown_min_sec || 1} value={form.cooldown_sec}
                  onChange={e => onCooldownChange(e.target.value)}
                  onBlur={() => { const min = selectedTemplate?.cooldown_min_sec || 1; if (Number(form.cooldown_sec) < min) setForm(p => ({ ...p, cooldown_sec: String(min) })); }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
              </div>
            </div>
            {formMsg && <p className="text-xs text-red-600 mt-2">{formMsg}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={closeForm} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg">{t.cancel}</button>
              <button onClick={saveRule} disabled={saving || !form.template_id || !form.threshold}
                className="px-4 py-2 text-sm text-white bg-brand-600 rounded-lg font-medium disabled:bg-slate-200 disabled:text-slate-400">
                {saving ? '…' : editing.rule ? t.modify : t.create}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {devices.map(device => {
          const devRules = rules[device.id] || [];
          return (
            <div key={device.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.008v.008H12V20zm3.889-4.596a5.5 5.5 0 00-7.778 0M12 12a3 3 0 110-6 3 3 0 010 6z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{device.name || device.esp_uid}</h2>
                    <p className="text-xs text-slate-400">{device.esp_uid}</p>
                  </div>
                </div>
                <button onClick={() => openAdd(device.id)} disabled={getTemplates(device.id).length === 0}
                  className="px-3 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 rounded-lg hover:bg-brand-100 transition disabled:opacity-50 disabled:cursor-not-allowed">
                  {t.add}
                </button>
              </div>
              {devRules.length === 0 ? (
                <div className="px-6 py-6 text-center text-sm text-slate-400">{t.no_rules}</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {devRules.map(rule => (
                    <div key={rule.id} className="px-6 py-4 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{rule.user_label || rule.template_name || rule.field}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {rule.field} {rule.op} {rule.threshold_num ?? rule.threshold_str ?? '—'} · {t.cooldown_label} {rule.cooldown_sec}s
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(device.id, rule)} className="text-xs text-slate-500 hover:text-brand-600 px-2 py-1 rounded hover:bg-slate-50">{t.edit}</button>
                        <button onClick={() => deleteRule(rule.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">{t.delete}</button>
                        <button type="button" onClick={() => toggleRule(rule.id, !rule.enabled)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${rule.enabled ? 'bg-brand-600' : 'bg-slate-200'}`}>
                          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${rule.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import { usePortalConfig } from '@/lib/portalConfig';
import SoundChart from '@/components/SoundChart';
import { useLang } from '@/lib/useLang';

interface DeviceMeta {
  esp_id: string; esp_name: string;
  device_type: { id: string; name: string; description: string } | null;
  available_fields: { name: string; label: string; data_type: string; unit: string | null }[];
  rule_templates: RuleTemplate[];
}

interface RuleTemplate {
  id: string; name: string; description: string; field: string;
  field_label: string; field_data_type: string; field_unit: string | null;
  field_operators: string[]; cooldown_min_sec: number;
}

interface DeviceInfo {
  id: string; esp_uid: string; name: string; last_seen: string | null;
  last_db: number | null; device_type_name: string | null;
}

interface SoundEntry { level: number; dbfs: number | null; timestamp: string; }

interface AlertRule {
  id: number; field: string; op: string; threshold_num: number | null;
  threshold_str: string | null; enabled: boolean; cooldown_sec: number;
  user_label: string | null; template_name: string | null; template_id: string | null;
}

const T = {
  fr: {
    back: 'Mes appareils',
    tab_measures: 'Mesures', tab_rules: (n: number) => `Règles d'alerte (${n})`,
    metric_measures: 'Mesures', metric_avg: 'Niveau moyen', metric_max: 'Niveau max',
    history_title: 'Historique — 50 dernières mesures', no_data: 'Aucune donnée disponible.',
    config: 'Configuration', device_name: "Nom de l'appareil", save: 'Enregistrer',
    name_saved: 'Nom enregistré.', error_save: 'Erreur lors de la sauvegarde.',
    modal_edit: 'Modifier la règle', modal_new: 'Nouvelle règle',
    rule_name: 'Nom (optionnel)', rule_name_ph: 'Ex: Alerte bruit fort',
    rule_type: "Type d'alerte", no_type: 'Aucun type disponible',
    operator: 'Opérateur', threshold: 'Seuil', cooldown: 'Cooldown (secondes)',
    minimum: 'minimum', cancel: 'Annuler', modify: 'Modifier', create: 'Créer',
    select_type: "Sélectionnez un type d'alerte.", error_rule: 'Erreur lors de la sauvegarde.',
    rules_title: 'Règles configurées', add: '+ Ajouter', no_rules: "Aucune règle d'alerte configurée pour cet appareil.",
    cooldown_label: 'Cooldown :', edit: 'Modifier', delete: 'Suppr.',
    confirm_delete: 'Supprimer cette règle ?', last_activity: 'Dernière activité :',
    error: 'Impossible de charger les données de cet appareil.',
  },
  en: {
    back: 'My devices',
    tab_measures: 'Measurements', tab_rules: (n: number) => `Alert rules (${n})`,
    metric_measures: 'Measurements', metric_avg: 'Average level', metric_max: 'Max level',
    history_title: 'History — last 50 measurements', no_data: 'No data available.',
    config: 'Configuration', device_name: 'Device name', save: 'Save',
    name_saved: 'Name saved.', error_save: 'Error saving.',
    modal_edit: 'Edit rule', modal_new: 'New rule',
    rule_name: 'Name (optional)', rule_name_ph: 'E.g. Loud noise alert',
    rule_type: 'Alert type', no_type: 'No type available',
    operator: 'Operator', threshold: 'Threshold', cooldown: 'Cooldown (seconds)',
    minimum: 'minimum', cancel: 'Cancel', modify: 'Update', create: 'Create',
    select_type: 'Select an alert type.', error_rule: 'Error saving.',
    rules_title: 'Configured rules', add: '+ Add', no_rules: 'No alert rules configured for this device.',
    cooldown_label: 'Cooldown:', edit: 'Edit', delete: 'Del.',
    confirm_delete: 'Delete this rule?', last_activity: 'Last activity:',
    error: 'Unable to load device data.',
  },
  es: {
    back: 'Mis dispositivos',
    tab_measures: 'Mediciones', tab_rules: (n: number) => `Reglas de alerta (${n})`,
    metric_measures: 'Mediciones', metric_avg: 'Nivel promedio', metric_max: 'Nivel máximo',
    history_title: 'Historial — últimas 50 mediciones', no_data: 'No hay datos disponibles.',
    config: 'Configuración', device_name: 'Nombre del dispositivo', save: 'Guardar',
    name_saved: 'Nombre guardado.', error_save: 'Error al guardar.',
    modal_edit: 'Editar regla', modal_new: 'Nueva regla',
    rule_name: 'Nombre (opcional)', rule_name_ph: 'Ej: Alerta de ruido fuerte',
    rule_type: 'Tipo de alerta', no_type: 'No hay tipos disponibles',
    operator: 'Operador', threshold: 'Umbral', cooldown: 'Cooldown (segundos)',
    minimum: 'mínimo', cancel: 'Cancelar', modify: 'Actualizar', create: 'Crear',
    select_type: 'Seleccione un tipo de alerta.', error_rule: 'Error al guardar.',
    rules_title: 'Reglas configuradas', add: '+ Añadir', no_rules: 'Ninguna regla de alerta configurada para este dispositivo.',
    cooldown_label: 'Cooldown:', edit: 'Editar', delete: 'Elim.',
    confirm_delete: '¿Eliminar esta regla?', last_activity: 'Última actividad:',
    error: 'No se pueden cargar los datos del dispositivo.',
  },
};

export default function DeviceDetailPage() {
  const params = useParams();
  const deviceId = params.id as string;
  const { refresh_interval_sec, idle_timeout_sec } = usePortalConfig();
  const lang = useLang();
  const t = T[lang];
  const dateLocale = lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'fr-FR';

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [meta, setMeta] = useState<DeviceMeta | null>(null);
  const [history, setHistory] = useState<SoundEntry[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'mesures' | 'regles'>('mesures');
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState('');
  const [editing, setEditing] = useState<{ rule?: AlertRule } | null>(null);
  const [form, setForm] = useState({ user_label: '', template_id: '', op: '>', threshold: '', cooldown_sec: '90' });
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState('');

  const loadDevice = useCallback(async () => {
    if (!deviceId) return;
    try {
      const dev = await apiFetch<DeviceInfo>(`/esp-devices/${deviceId}`);
      setDevice(dev);
      setEditName(prev => prev || dev.name || '');
      const [devMeta, histData, devRules] = await Promise.all([
        apiFetch<DeviceMeta>(`/esp-devices/${deviceId}/meta`).catch(() => null),
        apiFetch<{ history: SoundEntry[] }>(`/sound-history?esp_id=${deviceId}&limit=50`).catch(() => ({ history: [] })),
        apiFetch<AlertRule[]>(`/esp-rules?esp_id=${deviceId}`).catch(() => []),
      ]);
      if (devMeta) setMeta(devMeta);
      setHistory(histData.history);
      setRules(devRules);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [deviceId, t.error]);

  useEffect(() => { loadDevice(); }, [loadDevice]);
  useAutoRefresh(loadDevice, refresh_interval_sec * 1000, idle_timeout_sec * 1000);

  async function saveName() {
    if (!editName.trim()) return;
    setSavingName(true); setNameMsg('');
    try {
      await apiFetch(`/esp-devices/${deviceId}`, { method: 'PATCH', body: JSON.stringify({ name: editName.trim() }) });
      setDevice(prev => prev ? { ...prev, name: editName.trim() } : prev);
      setNameMsg(t.name_saved);
    } catch { setNameMsg(t.error_save); }
    finally { setSavingName(false); }
  }

  async function toggleRule(ruleId: number, enabled: boolean) {
    try {
      await apiFetch(`/esp-rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled } : r));
    } catch { /* silent */ }
  }

  const templates = meta?.rule_templates || [];
  function getTemplate(templateId: string) { return templates.find(tp => tp.id === templateId); }

  function openAddRule() {
    const first = templates[0];
    setEditing({});
    setForm({ user_label: '', template_id: first?.id || '', op: first?.field_operators?.[0] || '>', threshold: '', cooldown_sec: String(first?.cooldown_min_sec || 90) });
    setFormMsg('');
  }

  function openEditRule(rule: AlertRule) {
    const tpl = rule.template_id ? templates.find(tp => tp.id === rule.template_id) : templates.find(tp => tp.field === rule.field);
    setEditing({ rule });
    setForm({ user_label: rule.user_label || '', template_id: tpl?.id || '', op: rule.op, threshold: String(rule.threshold_num ?? rule.threshold_str ?? ''), cooldown_sec: String(rule.cooldown_sec) });
    setFormMsg('');
  }

  function closeRuleForm() { setEditing(null); setFormMsg(''); }

  function onTemplateChange(templateId: string) {
    const tpl = getTemplate(templateId);
    setForm(prev => ({ ...prev, template_id: templateId, op: tpl?.field_operators?.[0] || prev.op, cooldown_sec: String(Math.max(Number(prev.cooldown_sec) || 0, tpl?.cooldown_min_sec || 90)) }));
  }

  async function saveRule() {
    if (!editing) return;
    const tpl = getTemplate(form.template_id);
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
        body.esp_id = deviceId; body.enabled = true;
        await apiFetch('/esp-rules', { method: 'POST', body: JSON.stringify(body) });
      }
      await loadDevice(); closeRuleForm();
    } catch { setFormMsg(t.error_rule); }
    finally { setSaving(false); }
  }

  async function deleteRule(ruleId: number) {
    if (!confirm(t.confirm_delete)) return;
    try { await apiFetch(`/esp-rules/${ruleId}`, { method: 'DELETE' }); await loadDevice(); } catch { /* silent */ }
  }

  const selectedTemplate = editing ? getTemplate(form.template_id) : null;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
  );

  const avgLevel = history.length ? Math.round(history.reduce((s, e) => s + Number(e.level), 0) / history.length) : null;
  const maxLevel = history.length ? Math.max(...history.map(e => Number(e.level))) : null;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
        <Link href="/devices" className="hover:text-brand-600 transition">{t.back}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">{device?.name || device?.esp_uid}</span>
      </div>

      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-7 h-7 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.008v.008H12V20zm3.889-4.596a5.5 5.5 0 00-7.778 0M12 12a3 3 0 110-6 3 3 0 010 6z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{device?.name || device?.esp_uid}</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{device?.esp_uid}</span>
            {device?.device_type_name && <span className="text-sm text-slate-400">{device.device_type_name}</span>}
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {(['mesures', 'regles'] as const).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === tb ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {tb === 'mesures' ? t.tab_measures : t.tab_rules(rules.length)}
          </button>
        ))}
      </div>

      {tab === 'mesures' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400 mb-1">{t.metric_measures}</p>
              <p className="text-2xl font-bold text-slate-900">{history.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400 mb-1">{t.metric_avg}</p>
              <p className="text-2xl font-bold text-slate-900">{avgLevel ?? '—'}<span className="text-sm font-normal text-slate-400"> %</span></p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400 mb-1">{t.metric_max}</p>
              <p className={`text-2xl font-bold ${maxLevel && maxLevel >= 80 ? 'text-red-600' : maxLevel && maxLevel >= 60 ? 'text-amber-600' : 'text-slate-900'}`}>
                {maxLevel ?? '—'}<span className="text-sm font-normal text-slate-400"> %</span>
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">{t.history_title}</h2>
            {history.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">{t.no_data}</p>
            ) : <SoundChart data={history} />}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">{t.config}</h2>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">{t.device_name}</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
              </div>
              <button onClick={saveName} disabled={savingName || editName.trim() === (device?.name || '')}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg disabled:bg-slate-200 disabled:text-slate-400 transition">
                {savingName ? '…' : t.save}
              </button>
            </div>
            {nameMsg && <p className="text-xs mt-2 text-brand-600">{nameMsg}</p>}
          </div>
        </>
      )}

      {tab === 'regles' && (
        <>
          {editing && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) closeRuleForm(); }}>
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
                      {templates.length === 0 && <option value="">{t.no_type}</option>}
                      {templates.map(tp => <option key={tp.id} value={tp.id}>{tp.name}{tp.field_unit ? ` (${tp.field_unit})` : ''}</option>)}
                    </select>
                    {selectedTemplate?.description && <p className="text-xs text-slate-400 mt-1">{selectedTemplate.description}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">{t.operator}</label>
                      <select value={form.op} onChange={e => setForm(p => ({ ...p, op: e.target.value }))}
                        className="w-full px-2 py-2 rounded-lg border border-slate-200 text-sm">
                        {(selectedTemplate?.field_operators || ['>', '>=', '<', '<=', '==', '!=']).map(o => <option key={o} value={o}>{o}</option>)}
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
                      onChange={e => { const min = selectedTemplate?.cooldown_min_sec || 0; setForm(p => ({ ...p, cooldown_sec: String(Math.max(Number(e.target.value) || 0, min)) })); }}
                      onBlur={() => { const min = selectedTemplate?.cooldown_min_sec || 1; if (Number(form.cooldown_sec) < min) setForm(p => ({ ...p, cooldown_sec: String(min) })); }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                  </div>
                </div>
                {formMsg && <p className="text-xs text-red-600 mt-2">{formMsg}</p>}
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={closeRuleForm} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg">{t.cancel}</button>
                  <button onClick={saveRule} disabled={saving || !form.template_id || !form.threshold}
                    className="px-4 py-2 text-sm text-white bg-brand-600 rounded-lg font-medium disabled:bg-slate-200 disabled:text-slate-400">
                    {saving ? '…' : editing.rule ? t.modify : t.create}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">{t.rules_title}</p>
              <button onClick={openAddRule} disabled={templates.length === 0}
                className="px-3 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 rounded-lg hover:bg-brand-100 transition disabled:opacity-50 disabled:cursor-not-allowed">
                {t.add}
              </button>
            </div>
            {rules.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-slate-400">{t.no_rules}</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {rules.map(rule => (
                  <div key={rule.id} className="px-6 py-4 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{rule.user_label || rule.template_name || rule.field}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {rule.field} {rule.op} {rule.threshold_num ?? rule.threshold_str ?? '—'} · {t.cooldown_label} {rule.cooldown_sec}s
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEditRule(rule)} className="text-xs text-slate-500 hover:text-brand-600 px-2 py-1 rounded hover:bg-slate-50">{t.edit}</button>
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
        </>
      )}
    </div>
  );
}

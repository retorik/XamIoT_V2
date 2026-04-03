'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Device { id: string; esp_uid: string; name: string; }

interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  field: string;
  field_label: string;
  field_data_type: string;
  field_unit: string | null;
  field_operators: string[];
  cooldown_min_sec: number;
}

interface DeviceMeta {
  esp_id: string;
  esp_name: string;
  rule_templates: RuleTemplate[];
}

interface AlertRule {
  id: number;
  esp_id: string;
  field: string;
  op: string;
  threshold_num: number | null;
  threshold_str: string | null;
  enabled: boolean;
  cooldown_sec: number;
  user_label: string | null;
  template_name: string | null;
  template_id: string | null;
}

export default function NotificationsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [rules, setRules] = useState<Record<string, AlertRule[]>>({});
  const [metas, setMetas] = useState<Record<string, DeviceMeta>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Formulaire
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
      setError('Impossible de charger les données.');
    } finally {
      setLoading(false);
    }
  }

  function getTemplates(deviceId: string): RuleTemplate[] {
    return metas[deviceId]?.rule_templates || [];
  }

  function getTemplate(deviceId: string, templateId: string): RuleTemplate | undefined {
    return getTemplates(deviceId).find(t => t.id === templateId);
  }

  function openAdd(deviceId: string) {
    const templates = getTemplates(deviceId);
    const first = templates[0];
    setEditing({ deviceId });
    setForm({
      user_label: '',
      template_id: first?.id || '',
      op: first?.field_operators?.[0] || '>',
      threshold: '',
      cooldown_sec: String(first?.cooldown_min_sec || 90),
    });
    setFormMsg('');
  }

  function openEdit(deviceId: string, rule: AlertRule) {
    // Trouver le template correspondant au field de la règle
    const templates = getTemplates(deviceId);
    const matchingTemplate = rule.template_id
      ? templates.find(t => t.id === rule.template_id)
      : templates.find(t => t.field === rule.field);

    setEditing({ deviceId, rule });
    setForm({
      user_label: rule.user_label || '',
      template_id: matchingTemplate?.id || '',
      op: rule.op,
      threshold: String(rule.threshold_num ?? rule.threshold_str ?? ''),
      cooldown_sec: String(rule.cooldown_sec),
    });
    setFormMsg('');
  }

  function closeForm() { setEditing(null); setFormMsg(''); }

  function onTemplateChange(templateId: string) {
    if (!editing) return;
    const tpl = getTemplate(editing.deviceId, templateId);
    setForm(prev => ({
      ...prev,
      template_id: templateId,
      op: tpl?.field_operators?.[0] || prev.op,
      cooldown_sec: String(Math.max(Number(prev.cooldown_sec) || 0, tpl?.cooldown_min_sec || 90)),
    }));
  }

  function onCooldownChange(val: string) {
    if (!editing) return;
    const tpl = getTemplate(editing.deviceId, form.template_id);
    const minSec = tpl?.cooldown_min_sec || 0;
    const num = Number(val) || 0;
    setForm(prev => ({ ...prev, cooldown_sec: String(Math.max(num, minSec)) }));
  }

  async function saveRule() {
    if (!editing) return;
    const tpl = getTemplate(editing.deviceId, form.template_id);
    if (!tpl) { setFormMsg('Sélectionnez un type d\'alerte.'); return; }

    setSaving(true); setFormMsg('');
    const body: Record<string, unknown> = {
      field: tpl.field,
      op: form.op,
      threshold_num: isNaN(Number(form.threshold)) ? null : Number(form.threshold),
      threshold_str: isNaN(Number(form.threshold)) ? form.threshold : null,
      cooldown_sec: Math.max(Number(form.cooldown_sec), tpl.cooldown_min_sec),
      user_label: form.user_label || null,
      template_id: tpl.id,
    };

    try {
      if (editing.rule) {
        await apiFetch(`/esp-rules/${editing.rule.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        body.esp_id = editing.deviceId;
        body.enabled = true;
        await apiFetch('/esp-rules', { method: 'POST', body: JSON.stringify(body) });
      }
      await loadAll();
      closeForm();
    } catch {
      setFormMsg('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(ruleId: number) {
    if (!confirm('Supprimer cette règle ?')) return;
    try {
      await apiFetch(`/esp-rules/${ruleId}`, { method: 'DELETE' });
      await loadAll();
    } catch { /* silent */ }
  }

  async function toggleRule(ruleId: number, enabled: boolean) {
    try {
      await apiFetch(`/esp-rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
      setRules(prev => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          next[k] = next[k].map(r => r.id === ruleId ? { ...r, enabled } : r);
        }
        return next;
      });
    } catch { /* silent */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  const selectedTemplate = editing ? getTemplate(editing.deviceId, form.template_id) : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Règles d&apos;alerte</h1>
        <p className="text-slate-500 text-sm mt-1">Gérez vos règles de notification par appareil</p>
      </div>

      {error && <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {devices.length === 0 && !error && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">Aucun appareil trouvé.</p>
        </div>
      )}

      {/* Modal formulaire */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) closeForm(); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {editing.rule ? 'Modifier la règle' : 'Nouvelle règle'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Nom (optionnel)</label>
                <input type="text" value={form.user_label} onChange={e => setForm(p => ({ ...p, user_label: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder="Ex: Alerte bruit fort" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Type d&apos;alerte</label>
                <select value={form.template_id} onChange={e => onTemplateChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                  {getTemplates(editing.deviceId).length === 0 && (
                    <option value="">Aucun type disponible</option>
                  )}
                  {getTemplates(editing.deviceId).map(t => (
                    <option key={t.id} value={t.id}>{t.name}{t.field_unit ? ` (${t.field_unit})` : ''}</option>
                  ))}
                </select>
                {selectedTemplate?.description && (
                  <p className="text-xs text-slate-400 mt-1">{selectedTemplate.description}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Opérateur</label>
                  <select value={form.op} onChange={e => setForm(p => ({ ...p, op: e.target.value }))}
                    className="w-full px-2 py-2 rounded-lg border border-slate-200 text-sm">
                    {(selectedTemplate?.field_operators || ['>', '>=', '<', '<=', '==', '!=']).map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Seuil{selectedTemplate?.field_unit ? ` (${selectedTemplate.field_unit})` : ''}
                  </label>
                  <input type="text" value={form.threshold} onChange={e => setForm(p => ({ ...p, threshold: e.target.value }))}
                    className="w-full px-2 py-2 rounded-lg border border-slate-200 text-sm" placeholder="Ex: 50" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Cooldown (secondes){selectedTemplate ? ` — minimum ${selectedTemplate.cooldown_min_sec}s` : ''}
                </label>
                <input type="number"
                  min={selectedTemplate?.cooldown_min_sec || 1}
                  value={form.cooldown_sec}
                  onChange={e => onCooldownChange(e.target.value)}
                  onBlur={() => {
                    const minSec = selectedTemplate?.cooldown_min_sec || 1;
                    if (Number(form.cooldown_sec) < minSec) {
                      setForm(p => ({ ...p, cooldown_sec: String(minSec) }));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
              </div>
            </div>
            {formMsg && <p className="text-xs text-red-600 mt-2">{formMsg}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={closeForm} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg">Annuler</button>
              <button onClick={saveRule} disabled={saving || !form.template_id || !form.threshold}
                className="px-4 py-2 text-sm text-white bg-brand-600 rounded-lg font-medium disabled:bg-slate-200 disabled:text-slate-400">
                {saving ? '…' : editing.rule ? 'Modifier' : 'Créer'}
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
                <button onClick={() => openAdd(device.id)}
                  disabled={getTemplates(device.id).length === 0}
                  className="px-3 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 rounded-lg hover:bg-brand-100 transition disabled:opacity-50 disabled:cursor-not-allowed">
                  + Ajouter
                </button>
              </div>

              {devRules.length === 0 ? (
                <div className="px-6 py-6 text-center text-sm text-slate-400">
                  Aucune règle configurée.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {devRules.map(rule => (
                    <div key={rule.id} className="px-6 py-4 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {rule.user_label || rule.template_name || rule.field}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {rule.field} {rule.op} {rule.threshold_num ?? rule.threshold_str ?? '—'} · Cooldown : {rule.cooldown_sec}s
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(device.id, rule)}
                          className="text-xs text-slate-500 hover:text-brand-600 px-2 py-1 rounded hover:bg-slate-50">
                          Modifier
                        </button>
                        <button onClick={() => deleteRule(rule.id)}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
                          Suppr.
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleRule(rule.id, !rule.enabled)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                            rule.enabled ? 'bg-brand-600' : 'bg-slate-200'
                          }`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                            rule.enabled ? 'translate-x-5' : 'translate-x-0'
                          }`} />
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

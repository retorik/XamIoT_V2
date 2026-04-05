import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';
import NotifAutoTab from './NotifAutoTab.jsx';

const PAGE_SIZE = 50;

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Notifications() {
  const [tab, setTab] = useState('send');

  // ── Formulaire ──────────────────────────────────────────
  const [sendTypes, setSendTypes] = useState({ push: true, email: false });
  const [title, setTitle] = useState('');
  const [body,  setBody]  = useState('');

  // ── Filtres ─────────────────────────────────────────────
  const [search,         setSearch]         = useState('');
  const [espTypeId,      setEspTypeId]      = useState('');
  const [mobilePlatform, setMobilePlatform] = useState('');
  const [hasPush,        setHasPush]        = useState(false);
  const [deviceTypes,    setDeviceTypes]    = useState([]);

  // ── Destinataires ────────────────────────────────────────
  const [recipients,        setRecipients]        = useState([]);
  const [total,             setTotal]             = useState(0);
  const [page,              setPage]              = useState(0);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // ── Sélection ────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ── Envoi ────────────────────────────────────────────────
  const [confirm,  setConfirm]  = useState(false);
  const [sending,  setSending]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [err,      setErr]      = useState('');

  // ── Historique ───────────────────────────────────────────
  const [historySource,  setHistorySource]  = useState('all');
  const [historyRows,    setHistoryRows]    = useState([]);
  const [historyTotal,   setHistoryTotal]   = useState(0);
  const [historyPage,    setHistoryPage]    = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  // Charge les types de devices une seule fois
  useEffect(() => {
    apiFetch('/admin/device-types').then(d => setDeviceTypes(d || [])).catch(() => {});
  }, []);

  // Charge les destinataires à chaque changement de filtre / page
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingRecipients(true);
      setErr('');
      try {
        const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
        if (debouncedSearch) p.set('search', debouncedSearch);
        if (espTypeId)       p.set('esp_type_id', espTypeId);
        if (mobilePlatform)  p.set('mobile_platform', mobilePlatform);
        if (hasPush)         p.set('has_push', 'true');
        const data = await apiFetch(`/admin/campaigns/recipients?${p}`);
        if (!cancelled) {
          setRecipients(data.rows || []);
          setTotal(data.total || 0);
        }
      } catch (e) {
        if (!cancelled) setErr(e?.data?.error || e.message);
      } finally {
        if (!cancelled) setLoadingRecipients(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [debouncedSearch, espTypeId, mobilePlatform, hasPush, page]);

  // Charge l'historique quand l'onglet, le filtre ou la page changent
  useEffect(() => {
    if (tab !== 'history') return;
    loadHistory();
  }, [tab, historySource, historyPage]);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const LIMIT = 50;
      const offset = historyPage * LIMIT;
      const p = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });

      // Normalise chaque source en format commun
      function normManual(h) {
        const channels = (h.send_types || []).join(', ');
        const ok = (h.success_push || 0) + (h.success_email || 0);
        const ko = (h.fail_push || 0) + (h.fail_email || 0);
        const st = ko > 0 ? 'failed' : ok > 0 ? 'sent' : 'sent';
        return { _id: h.id, date: h.sent_at, source: 'manual', description: h.title || h.subject || '—', channel: channels, recipient: h.sent_by || '—', status: st, detail: `${ok} OK${ko > 0 ? ` / ${ko} KO` : ''}` };
      }
      function normAuto(r) {
        return { _id: `a-${r.id}`, date: r.sent_at, source: 'auto', description: r.event_key, channel: r.channel, recipient: r.recipient || '—', status: r.status, detail: r.error || '' };
      }
      function normSys(r) {
        return { _id: `s-${r.id}`, date: r.sent_at, source: 'sys', description: r.rule_name || r.trigger_type, channel: r.channel, recipient: r.recipient || '—', status: r.status, detail: r.error || '' };
      }

      let rows = [], total = 0;

      if (historySource === 'manual') {
        const d = await apiFetch(`/admin/campaigns?limit=${LIMIT}&offset=${offset}`);
        rows = (d || []).map(normManual);
        total = rows.length + offset; // campaigns n'a pas de total — approx
      } else if (historySource === 'auto') {
        const d = await apiFetch(`/admin/notif/auto-log?${p}`);
        rows = (d.rows || []).map(normAuto);
        total = d.total || 0;
      } else if (historySource === 'sys') {
        const d = await apiFetch(`/admin/notif/sys-log?${p}`);
        rows = (d.rows || []).map(normSys);
        total = d.total || 0;
      } else {
        // Tous — charge les 3 en parallèle (50 chacun) et fusionne par date desc
        const pAll = new URLSearchParams({ limit: '50', offset: '0' });
        const [manual, autoLog, sysLog] = await Promise.all([
          apiFetch(`/admin/campaigns?limit=50`).catch(() => []),
          apiFetch(`/admin/notif/auto-log?${pAll}`).catch(() => ({ rows: [] })),
          apiFetch(`/admin/notif/sys-log?${pAll}`).catch(() => ({ rows: [] })),
        ]);
        rows = [
          ...(manual || []).map(normManual),
          ...(autoLog.rows || []).map(normAuto),
          ...(sysLog.rows || []).map(normSys),
        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, LIMIT);
        total = rows.length;
      }

      setHistoryRows(rows);
      setHistoryTotal(total);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setLoadingHistory(false);
    }
  }

  function toggleSelected(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const allSelected = recipients.every(r => selectedIds.has(r.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      recipients.forEach(r => allSelected ? next.delete(r.id) : next.add(r.id));
      return next;
    });
  }

  function resetFilter(setter) {
    return (val) => { setter(val); setPage(0); };
  }

  async function send() {
    setSending(true);
    setResult(null);
    setErr('');
    try {
      const send_types = Object.keys(sendTypes).filter(k => sendTypes[k]);
      const data = await apiFetch('/admin/campaigns/send', {
        method: 'POST',
        body: {
          send_types,
          title:   title.trim() || undefined,
          subject: title.trim() || undefined,
          body:    body.trim(),
          user_ids: [...selectedIds],
        },
      });
      setResult(data);
      setConfirm(false);
      setSelectedIds(new Set());
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setSending(false);
    }
  }

  const activeTypes       = Object.keys(sendTypes).filter(k => sendTypes[k]);
  const allOnPageSelected = recipients.length > 0 && recipients.every(r => selectedIds.has(r.id));
  const totalPages        = Math.ceil(total / PAGE_SIZE);
  const canSend           = selectedIds.size > 0 && activeTypes.length > 0 && body.trim().length > 0;

  return (
    <div className="container">
      <h2>Notifications</h2>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
        {[['send', 'Envoi manuel'], ['auto', 'Envoi auto'], ['history', 'Historique']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: tab === key ? '2px solid #2563eb' : '2px solid transparent',
            color: tab === key ? '#2563eb' : '#6b7280',
            fontWeight: tab === key ? 600 : 400,
            marginBottom: -1,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ Envoi manuel ══ */}
      {tab === 'send' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

          {/* Colonne gauche : formulaire + envoi */}
          <div>
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Canaux d'envoi</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 14 }}>
                <input type="checkbox" checked={sendTypes.push}
                  onChange={e => setSendTypes(p => ({ ...p, push: e.target.checked }))} />
                Push (iOS / Android)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={sendTypes.email}
                  onChange={e => setSendTypes(p => ({ ...p, email: e.target.checked }))} />
                E-mail
              </label>
            </div>

            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Contenu</div>
              {(sendTypes.push || sendTypes.email) && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, display: 'block', marginBottom: 4, color: '#374151' }}>
                    Titre / Sujet {sendTypes.push && <span style={{ color: '#b91c1c' }}>*</span>}
                  </label>
                  <input className="input" value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="Titre de la notification / sujet de l'e-mail" />
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4, color: '#374151' }}>
                  Corps du message <span style={{ color: '#b91c1c' }}>*</span>
                </label>
                <textarea className="input" value={body} onChange={e => setBody(e.target.value)}
                  placeholder="Texte du message..." rows={5}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>

            {/* Résultat */}
            {result && (
              <div className="card" style={{ padding: 14, marginBottom: 12, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: '#15803d', fontSize: 13 }}>Envoi terminé</div>
                {(result.success_push + result.fail_push) > 0 && (
                  <div style={{ fontSize: 13 }}>
                    Push : <b style={{ color: '#15803d' }}>{result.success_push} OK</b>
                    {result.fail_push > 0 && <span style={{ color: '#b91c1c' }}> / {result.fail_push} échec</span>}
                  </div>
                )}
                {(result.success_email + result.fail_email) > 0 && (
                  <div style={{ fontSize: 13 }}>
                    E-mail : <b style={{ color: '#15803d' }}>{result.success_email} OK</b>
                    {result.fail_email > 0 && <span style={{ color: '#b91c1c' }}> / {result.fail_email} échec</span>}
                  </div>
                )}
              </div>
            )}

            {err && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{err}</div>}

            {/* Résumé & confirmation */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
                {selectedIds.size === 0
                  ? <span style={{ color: '#9ca3af' }}>Aucun destinataire sélectionné</span>
                  : <><b>{selectedIds.size}</b> destinataire{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
                    {activeTypes.length > 0 && <span style={{ color: '#6b7280' }}> — {activeTypes.join(' + ')}</span>}
                  </>
                }
              </div>
              {!confirm ? (
                <button className="btn" disabled={!canSend} onClick={() => setConfirm(true)} style={{ width: '100%' }}>
                  Envoyer
                </button>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
                    Confirmer l'envoi à <b>{selectedIds.size}</b> destinataire{selectedIds.size > 1 ? 's' : ''} via <b>{activeTypes.join(' + ')}</b> ?
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={send} disabled={sending} style={{ flex: 1 }}>
                      {sending ? 'Envoi en cours…' : 'Confirmer'}
                    </button>
                    <button onClick={() => setConfirm(false)} style={{ flex: 1, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb', cursor: 'pointer' }}>
                      Annuler
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Colonne droite : filtres + table */}
          <div>
            <div className="card" style={{ padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: 12, display: 'block', marginBottom: 4, color: '#374151' }}>Recherche</label>
                  <input className="input" value={search}
                    onChange={e => { setSearch(e.target.value); setPage(0); }}
                    placeholder="Email, nom…" />
                </div>
                <div>
                  <label style={{ fontSize: 12, display: 'block', marginBottom: 4, color: '#374151' }}>Type ESP</label>
                  <select className="input" value={espTypeId} onChange={e => resetFilter(setEspTypeId)(e.target.value)}>
                    <option value="">Tous</option>
                    {deviceTypes.map(dt => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, display: 'block', marginBottom: 4, color: '#374151' }}>Plateforme mobile</label>
                  <select className="input" value={mobilePlatform} onChange={e => resetFilter(setMobilePlatform)(e.target.value)}>
                    <option value="">Toutes</option>
                    <option value="iOS">iOS</option>
                    <option value="Android">Android</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 3, cursor: 'pointer' }}>
                  <input type="checkbox" checked={hasPush} onChange={e => { setHasPush(e.target.checked); setPage(0); }} />
                  Token push
                </label>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 13, color: '#6b7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{total} utilisateur{total !== 1 ? 's' : ''} correspondant{total !== 1 ? 's' : ''}</span>
                {selectedIds.size > 0 && (
                  <span style={{ color: '#2563eb', fontWeight: 600 }}>
                    {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} />
                    </th>
                    <th>Email</th>
                    <th>Nom</th>
                    <th>Push</th>
                    <th>Plateformes</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRecipients ? (
                    <tr><td colSpan="5" style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Chargement…</td></tr>
                  ) : recipients.length === 0 ? (
                    <tr><td colSpan="5" style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Aucun résultat.</td></tr>
                  ) : recipients.map(r => (
                    <tr key={r.id} style={{ background: selectedIds.has(r.id) ? '#eff6ff' : undefined, cursor: 'pointer' }}
                      onClick={() => toggleSelected(r.id)}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelected(r.id)} />
                      </td>
                      <td style={{ fontSize: 13 }}>{r.email}</td>
                      <td style={{ fontSize: 13 }}>{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</td>
                      <td style={{ fontSize: 12 }}>
                        {r.push_count > 0
                          ? <span style={{ color: '#15803d' }}>{r.push_count} token{r.push_count > 1 ? 's' : ''}</span>
                          : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: '#6b7280' }}>{r.platforms || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <button className="btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}
                    style={{ padding: '3px 10px' }}>←</button>
                  <span style={{ color: '#6b7280' }}>Page {page + 1} / {totalPages}</span>
                  <button className="btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                    style={{ padding: '3px 10px' }}>→</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Historique ══ */}
      {tab === 'history' && (() => {
        const sourceLabel = { manual: 'Envoi manuel', auto: 'Transactionnel', sys: 'Règle système' };
        const sourceBadge = { manual: '#2563eb', auto: '#9333ea', sys: '#d97706' };
        const statusColor = { sent: '#15803d', failed: '#b91c1c', skipped_cooldown: '#d97706', skipped_disabled: '#6b7280', skipped_no_recipient: '#6b7280', skipped_smtp_off: '#d97706' };
        const totalPages  = Math.ceil(historyTotal / 50);
        return (
          <div>
            {/* Filtres */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Source :</span>
              {[['all', 'Tous'], ['manual', 'Envoi manuel'], ['auto', 'Transactionnel'], ['sys', 'Règle système']].map(([key, label]) => (
                <button key={key} onClick={() => { setHistorySource(key); setHistoryPage(0); }} style={{
                  padding: '4px 14px', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  background: historySource === key ? '#2563eb' : '#fff',
                  color: historySource === key ? '#fff' : '#374151',
                }}>{label}</button>
              ))}
              <button className="btn" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={loadHistory} disabled={loadingHistory}>
                Rafraîchir
              </button>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{historyTotal > 0 ? `${historyTotal} entrée${historyTotal > 1 ? 's' : ''}` : ''}</span>
            </div>

            {/* Tableau unifié */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Source</th>
                    <th>Description</th>
                    <th>Canal</th>
                    <th>Destinataire</th>
                    <th>Statut</th>
                    <th>Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingHistory ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Chargement…</td></tr>
                  ) : historyRows.length === 0 ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Aucun envoi enregistré.</td></tr>
                  ) : historyRows.map(r => (
                    <tr key={r._id}>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: '#6b7280' }}>
                        {new Date(r.date).toLocaleString('fr-FR')}
                      </td>
                      <td>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: (sourceBadge[r.source] || '#6b7280') + '22', color: sourceBadge[r.source] || '#6b7280' }}>
                          {sourceLabel[r.source] || r.source}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.description}
                      </td>
                      <td style={{ fontSize: 12, color: '#374151' }}>{r.channel}</td>
                      <td style={{ fontSize: 12, color: '#6b7280', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.recipient}
                      </td>
                      <td>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: (statusColor[r.status] || '#6b7280') + '22', color: statusColor[r.status] || '#6b7280' }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: r.detail && r.detail.includes('KO') ? '#b91c1c' : '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                <button className="btn" disabled={historyPage === 0} onClick={() => setHistoryPage(p => p - 1)}>← Précédent</button>
                <span style={{ padding: '6px 12px', fontSize: 13, color: '#374151' }}>{historyPage + 1} / {totalPages}</span>
                <button className="btn" disabled={historyPage >= totalPages - 1} onClick={() => setHistoryPage(p => p + 1)}>Suivant →</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ Envoi auto ══ */}
      {tab === 'auto' && <NotifAutoTab />}
    </div>
  );
}

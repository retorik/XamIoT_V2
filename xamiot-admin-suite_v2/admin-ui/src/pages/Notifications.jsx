import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

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
  const [history,        setHistory]        = useState([]);
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

  // Charge l'historique quand l'onglet bascule
  useEffect(() => {
    if (tab !== 'history') return;
    loadHistory();
  }, [tab]);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const data = await apiFetch('/admin/campaigns?limit=50');
      setHistory(data || []);
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
        {[['send', 'Envoi manuel'], ['history', 'Historique']].map(([key, label]) => (
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
      {tab === 'history' && (
        <div>
          <div style={{ textAlign: 'right', marginBottom: 12 }}>
            <button className="btn" onClick={loadHistory} disabled={loadingHistory}>Rafraîchir</button>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Par</th>
                  <th>Canaux</th>
                  <th>Titre / Sujet</th>
                  <th style={{ textAlign: 'right' }}>Cibles</th>
                  <th style={{ textAlign: 'right' }}>Push OK</th>
                  <th style={{ textAlign: 'right' }}>Push KO</th>
                  <th style={{ textAlign: 'right' }}>Email OK</th>
                  <th style={{ textAlign: 'right' }}>Email KO</th>
                  <th style={{ textAlign: 'right' }}>Erreurs</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory ? (
                  <tr><td colSpan="10" style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Chargement…</td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan="10" style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Aucun envoi enregistré.</td></tr>
                ) : history.map(h => (
                  <tr key={h.id}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(h.sent_at).toLocaleString('fr-FR')}</td>
                    <td style={{ fontSize: 12 }}>{h.sent_by || '—'}</td>
                    <td style={{ fontSize: 12 }}>{(h.send_types || []).join(', ')}</td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.title || h.subject || <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{h.target_count}</td>
                    <td style={{ textAlign: 'right', color: h.success_push > 0 ? '#15803d' : '#d1d5db' }}>{h.success_push}</td>
                    <td style={{ textAlign: 'right', color: h.fail_push > 0 ? '#b91c1c' : '#d1d5db' }}>{h.fail_push}</td>
                    <td style={{ textAlign: 'right', color: h.success_email > 0 ? '#15803d' : '#d1d5db' }}>{h.success_email}</td>
                    <td style={{ textAlign: 'right', color: h.fail_email > 0 ? '#b91c1c' : '#d1d5db' }}>{h.fail_email}</td>
                    <td style={{ textAlign: 'right', color: h.error_count > 0 ? '#b91c1c' : '#d1d5db' }}>{h.error_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

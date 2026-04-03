import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../api.js';

const STATUS_LABEL = { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu', closed: 'Fermé' };
const STATUS_COLOR = {
  open:        { background: '#dbeafe', color: '#1d4ed8' },
  in_progress: { background: '#fef9c3', color: '#a16207' },
  resolved:    { background: '#dcfce7', color: '#15803d' },
  closed:      { background: '#f3f4f6', color: '#6b7280' },
};

const PRIORITY_LABEL = { low: 'Basse', normal: 'Normale', high: 'Haute', urgent: 'Urgent' };
const PRIORITY_COLOR = {
  low:    { background: '#f3f4f6', color: '#6b7280' },
  normal: { background: '#eff6ff', color: '#3b82f6' },
  high:   { background: '#fff7ed', color: '#ea580c' },
  urgent: { background: '#fef2f2', color: '#dc2626' },
};

function Badge({ label, style }) {
  return (
    <span style={{ ...style, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, display: 'inline-block' }}>
      {label}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TicketsManager() {
  const [tickets, setTickets]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [msg, setMsg]               = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(null);
  const [detail, setDetail]         = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyBody, setReplyBody]   = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [newStatus, setNewStatus]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const data = await apiFetch(`/admin/tickets?${params}`);
      setTickets(data);
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function openDetail(ticket) {
    setSelected(ticket);
    setDetail(null);
    setReplyBody('');
    setNewStatus(ticket.status);
    setDetailLoading(true);
    try {
      const data = await apiFetch(`/admin/tickets/${ticket.id}`);
      setDetail(data);
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelected(null);
    setDetail(null);
  }

  async function sendReply() {
    if (!replyBody.trim()) return;
    setReplyLoading(true);
    try {
      await apiFetch(`/admin/tickets/${selected.id}/messages`, { method: 'POST', body: { body: replyBody } });
      setReplyBody('');
      const data = await apiFetch(`/admin/tickets/${selected.id}`);
      setDetail(data);
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setReplyLoading(false);
    }
  }

  async function updateStatus() {
    if (!newStatus || newStatus === detail?.status) return;
    try {
      await apiFetch(`/admin/tickets/${selected.id}`, { method: 'PATCH', body: { status: newStatus } });
      const data = await apiFetch(`/admin/tickets/${selected.id}`);
      setDetail(data);
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  const filtered = tickets.filter(t => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (t.subject || '').toLowerCase().includes(s) ||
      (t.user_email || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Support — Tickets</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher sujet, email…"
            style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: 220 }}
          />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
          >
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: '10px 16px', borderRadius: 6, marginBottom: 16, fontSize: 14,
          background: msg.type === 'error' ? '#fef2f2' : '#f0fdf4',
          color:      msg.type === 'error' ? '#dc2626' : '#15803d',
          border:     `1px solid ${msg.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
        }}>
          {msg.text}
          <button onClick={() => setMsg(null)} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'inherit' }}>✕</button>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#6b7280' }}>Chargement…</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Sujet', 'Utilisateur', 'Statut', 'Priorité', 'Messages', 'Créé le', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Aucun ticket trouvé</td>
                </tr>
              )}
              {filtered.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 12px', maxWidth: 260 }}>
                    <span style={{ fontWeight: 500, color: '#111827' }}>{t.subject}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>{t.user_email || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <Badge label={STATUS_LABEL[t.status] || t.status} style={STATUS_COLOR[t.status] || {}} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <Badge label={PRIORITY_LABEL[t.priority] || t.priority} style={PRIORITY_COLOR[t.priority] || {}} />
                  </td>
                  <td style={{ padding: '10px 12px', color: '#6b7280', textAlign: 'center' }}>{t.message_count}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(t.created_at)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      onClick={() => openDetail(t)}
                      style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 13, cursor: 'pointer' }}
                    >
                      Voir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modale détail ticket */}
      {selected && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '40px 16px', overflowY: 'auto',
        }}>
          <div style={{
            background: '#fff', borderRadius: 10, width: '100%', maxWidth: 680,
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)', padding: 28,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 18, color: '#111827' }}>{selected.subject}</h3>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{selected.user_email} — {selected.category}</span>
              </div>
              <button
                onClick={closeDetail}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
              <Badge label={STATUS_LABEL[selected.status] || selected.status} style={STATUS_COLOR[selected.status] || {}} />
              <Badge label={PRIORITY_LABEL[selected.priority] || selected.priority} style={PRIORITY_COLOR[selected.priority] || {}} />
            </div>

            {detailLoading ? (
              <p style={{ color: '#6b7280', textAlign: 'center' }}>Chargement…</p>
            ) : detail ? (
              <>
                {/* Messages */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
                  {detail.messages.length === 0 && (
                    <p style={{ padding: 16, color: '#9ca3af', textAlign: 'center', margin: 0 }}>Aucun message</p>
                  )}
                  {detail.messages.map(m => (
                    <div
                      key={m.id}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #f3f4f6',
                        background: m.is_staff ? '#eff6ff' : '#f9fafb',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: m.is_staff ? '#2563eb' : '#374151' }}>
                          {m.is_staff ? 'Staff' : (m.author_email || 'Utilisateur')}
                        </span>
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDate(m.created_at)}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 14, color: '#374151', whiteSpace: 'pre-wrap' }}>{m.body}</p>
                    </div>
                  ))}
                </div>

                {/* Zone de réponse */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 6 }}>
                    Répondre
                  </label>
                  <textarea
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                    rows={4}
                    placeholder="Votre réponse…"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, resize: 'vertical' }}
                  />
                  <button
                    onClick={sendReply}
                    disabled={replyLoading || !replyBody.trim()}
                    style={{
                      marginTop: 8, background: '#2563eb', color: '#fff', border: 'none',
                      borderRadius: 6, padding: '8px 20px', fontSize: 14, cursor: replyLoading ? 'not-allowed' : 'pointer',
                      opacity: replyLoading ? 0.7 : 1,
                    }}
                  >
                    {replyLoading ? 'Envoi…' : 'Répondre'}
                  </button>
                </div>

                {/* Changement de statut */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Statut :</label>
                  <select
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                  >
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button
                    onClick={updateStatus}
                    style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 14, cursor: 'pointer' }}
                  >
                    Enregistrer
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

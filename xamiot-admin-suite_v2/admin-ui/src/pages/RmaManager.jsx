import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../api.js';

const STATUS_LABEL = {
  pending:  'En attente',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  received: 'Reçu',
  refunded: 'Remboursé',
  replaced: 'Remplacé',
};
const STATUS_COLOR = {
  pending:  { background: '#fef9c3', color: '#a16207' },
  approved: { background: '#dcfce7', color: '#15803d' },
  rejected: { background: '#fef2f2', color: '#dc2626' },
  received: { background: '#eff6ff', color: '#1d4ed8' },
  refunded: { background: '#f5f3ff', color: '#7c3aed' },
  replaced: { background: '#f0fdf4', color: '#166534' },
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

function truncate(str, n = 80) {
  if (!str) return '—';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

export default function RmaManager() {
  const [rmaList, setRmaList]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [msg, setMsg]                 = useState(null);
  const [selected, setSelected]       = useState(null);
  const [editNotes, setEditNotes]     = useState('');
  const [editStatus, setEditStatus]   = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/admin/rma');
      setRmaList(data);
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openDetail(rma) {
    setSelected(rma);
    setEditNotes(rma.admin_notes || '');
    setEditStatus(rma.status);
  }

  function closeDetail() {
    setSelected(null);
  }

  async function save() {
    if (!selected) return;
    setSaveLoading(true);
    try {
      await apiFetch(`/admin/rma/${selected.id}`, {
        method: 'PATCH',
        body: { status: editStatus, admin_notes: editNotes },
      });
      await load();
      // Mettre à jour la ligne locale
      setSelected(prev => prev ? { ...prev, status: editStatus, admin_notes: editNotes } : null);
      setMsg({ type: 'success', text: 'RMA mise à jour.' });
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Support — Demandes RMA</h2>
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
                {['SKU Produit', 'Utilisateur', 'Raison', 'Statut', 'Date', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rmaList.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Aucune demande RMA</td>
                </tr>
              )}
              {rmaList.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500, color: '#111827' }}>{r.product_sku}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>{r.user_email || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280', maxWidth: 240 }}>{truncate(r.reason)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <Badge label={STATUS_LABEL[r.status] || r.status} style={STATUS_COLOR[r.status] || {}} />
                  </td>
                  <td style={{ padding: '10px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      onClick={() => openDetail(r)}
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

      {/* Modale détail RMA */}
      {selected && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '40px 16px', overflowY: 'auto',
        }}>
          <div style={{
            background: '#fff', borderRadius: 10, width: '100%', maxWidth: 560,
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)', padding: 28,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: '#111827' }}>RMA — {selected.product_sku}</h3>
              <button
                onClick={closeDetail}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>Utilisateur</div>
                <div style={{ fontSize: 14, color: '#111827' }}>{selected.user_email || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>Ticket lié</div>
                <div style={{ fontSize: 14, color: '#111827' }}>{selected.ticket_subject || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>Créé le</div>
                <div style={{ fontSize: 14, color: '#111827' }}>{fmtDate(selected.created_at)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>Commande</div>
                <div style={{ fontSize: 14, color: '#111827' }}>{selected.order_id || '—'}</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Motif</div>
              <div style={{ fontSize: 14, color: '#374151', background: '#f9fafb', borderRadius: 6, padding: '10px 14px', border: '1px solid #e5e7eb' }}>
                {selected.reason}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Statut
              </label>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: '100%' }}
              >
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Notes admin
              </label>
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                rows={4}
                placeholder="Notes internes…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={closeDetail}
                style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 14, cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={save}
                disabled={saveLoading}
                style={{
                  background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '8px 20px', fontSize: 14, cursor: saveLoading ? 'not-allowed' : 'pointer',
                  opacity: saveLoading ? 0.7 : 1,
                }}
              >
                {saveLoading ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api.js';

const STATUS_LABEL = { draft: 'Brouillon', published: 'Publié', archived: 'Archivé' };
const STATUS_COLOR = { draft: '#f59e0b', published: '#16a34a', archived: '#6b7280' };

function fmtPrice(cents) {
  if (!cents && cents !== 0) return '—';
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

export default function ProductsManager({ embedded } = {}) {
  const nav = useNavigate();
  const [products, setProducts]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [msg, setMsg]                 = useState(null);
  const [filter, setFilter]           = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch('/admin/products');
      setProducts(data);
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(p) {
    const newStatus = p.status === 'published' ? 'draft' : 'published';
    try {
      await apiFetch(`/admin/products/${p.id}`, { method: 'PATCH', body: { status: newStatus } });
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  async function deleteProduct(id) {
    try {
      await apiFetch(`/admin/products/${id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  const filtered = filter
    ? products.filter(p =>
        (p.name_fr || '').toLowerCase().includes(filter.toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(filter.toLowerCase())
      )
    : products;

  const content = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        {!embedded && <h2 style={{ margin: 0 }}>Boutique — Produits</h2>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filtrer par nom ou SKU…"
            style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: 220 }}
          />
          <button
            onClick={() => nav('/boutique/produits/new')}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}
          >
            + Nouveau produit
          </button>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8,
          background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
          color:      msg.type === 'success' ? '#15803d' : '#b91c1c',
          fontSize: 14,
        }}>{msg.text}</div>
      )}

      {loading ? (
        <p style={{ color: '#6b7280' }}>Chargement…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Aucun produit.{filter ? ' Modifiez le filtre.' : ''}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              {['Nom (FR)', 'SKU', 'Catégorie', 'Prix', 'Stock', 'Statut', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px', fontWeight: 500 }}>
                  {p.name_fr || <span style={{ color: '#9ca3af' }}>—</span>}
                </td>
                <td style={{ padding: '10px', fontFamily: 'monospace', color: '#6b7280', fontSize: 13 }}>
                  {p.sku}
                </td>
                <td style={{ padding: '10px', color: '#6b7280', fontSize: 13 }}>
                  {p.category_name || '—'}
                </td>
                <td style={{ padding: '10px', fontWeight: 500 }}>
                  {fmtPrice(p.price_cents)}
                  {p.compare_price_cents > p.price_cents && (
                    <span style={{ marginLeft: 6, fontSize: 12, color: '#9ca3af', textDecoration: 'line-through' }}>
                      {fmtPrice(p.compare_price_cents)}
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px', textAlign: 'center', color: p.stock_qty === 0 ? '#b91c1c' : '#374151' }}>
                  {p.stock_qty}
                </td>
                <td style={{ padding: '10px' }}>
                  <span style={{
                    background: STATUS_COLOR[p.status] + '20',
                    color: STATUS_COLOR[p.status],
                    padding: '3px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                  }}>
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                </td>
                <td style={{ padding: '10px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => nav(`/boutique/produits/${p.id}`)}
                      style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
                    >
                      Éditer
                    </button>
                    <button
                      onClick={() => toggleStatus(p)}
                      style={{
                        background: p.status === 'published' ? '#fef3c7' : '#dcfce7',
                        border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                        color: p.status === 'published' ? '#92400e' : '#15803d',
                      }}
                    >
                      {p.status === 'published' ? 'Dépublier' : 'Publier'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(p)}
                      style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#b91c1c' }}
                    >
                      Suppr.
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 380, width: '90%' }}>
            <h3 style={{ margin: '0 0 12px' }}>Supprimer ce produit ?</h3>
            <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 20px' }}>
              <strong>{confirmDelete.name_fr || confirmDelete.sku}</strong> sera définitivement supprimé.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={() => deleteProduct(confirmDelete.id)} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer' }}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return content;
  return <div className="container">{content}</div>;
}

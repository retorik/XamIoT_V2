import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

const fmtCents = c => (c / 100).toFixed(2).replace('.', ',') + ' €';

export default function CountriesManager() {
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterSubregion, setFilterSubregion] = useState('');
  const [regions, setRegions] = useState({}); // { region: [subregion, ...] }
  const [editing, setEditing] = useState(null); // country code
  const [editData, setEditData] = useState({});

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterActive === 'true' || filterActive === 'false') params.set('active', filterActive);
      if (filterRegion) params.set('region', filterRegion);
      if (filterSubregion) params.set('subregion', filterSubregion);
      const data = await apiFetch(`/admin/countries?${params}`);
      setCountries(data);
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterActive, filterRegion, filterSubregion]);

  useEffect(() => {
    apiFetch('/admin/countries/regions').then(setRegions).catch(() => {});
  }, []);

  function startEdit(c) {
    setEditing(c.code);
    setEditData({
      is_active: c.is_active,
      is_blocked: c.is_blocked,
      shipping_cents: c.shipping_cents || 0,
      tax_rate_pct: c.tax_rate_pct || '0',
      customs_cents: c.customs_cents || 0,
      customs_note: c.customs_note || '',
      message_client: c.message_client || '',
    });
  }

  async function saveEdit() {
    setMsg(null);
    try {
      await apiFetch(`/admin/countries/${editing}`, {
        method: 'PATCH',
        body: {
          ...editData,
          shipping_cents: Number(editData.shipping_cents),
          tax_rate_pct: parseFloat(editData.tax_rate_pct) || 0,
          customs_cents: Number(editData.customs_cents),
        },
      });
      setEditing(null);
      setMsg({ type: 'success', text: 'Pays mis à jour.' });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  async function toggleActive(code, current) {
    try {
      await apiFetch(`/admin/countries/${code}`, { method: 'PATCH', body: { is_active: !current } });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  const filtered = countries.filter(c =>
    !search || c.name_fr.toLowerCase().includes(search.toLowerCase()) ||
    c.name_en.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container" style={{ maxWidth: 1100 }}>
      <h2>Pays &amp; Livraison</h2>

      {msg && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8,
          background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: msg.type === 'success' ? '#15803d' : '#b91c1c', fontSize: 14,
        }}>{msg.text}</div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Rechercher un pays…"
          style={{ flex: 1, minWidth: 200, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
        <select value={filterActive} onChange={e => setFilterActive(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
          <option value="">Tous</option>
          <option value="true">Actifs</option>
          <option value="false">Inactifs</option>
        </select>
        <select value={filterRegion} onChange={e => { setFilterRegion(e.target.value); setFilterSubregion(''); }}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
          <option value="">Toutes les régions</option>
          {Object.keys(regions).sort().map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {filterRegion && regions[filterRegion]?.length > 0 && (
          <select value={filterSubregion} onChange={e => setFilterSubregion(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
            <option value="">Toutes les sous-régions</option>
            {regions[filterRegion].sort().map(sr => <option key={sr} value={sr}>{sr}</option>)}
          </select>
        )}
        <button onClick={load} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>
          Rechercher
        </button>
      </div>

      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
        {filtered.length} pays — {filtered.filter(c => c.is_active).length} actifs
      </div>

      {loading ? <p>Chargement…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Code</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Pays</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Région</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>Actif</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>Bloqué</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>Port</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>TVA %</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>Douane</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <React.Fragment key={c.code}>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 500 }}>{c.code}</td>
                  <td style={{ padding: '6px 10px' }}>{c.name_fr}</td>
                  <td style={{ padding: '6px 10px', fontSize: 12, color: '#6b7280' }}>{c.subregion || c.region || '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                    <button onClick={() => toggleActive(c.code, c.is_active)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>
                      {c.is_active ? '✅' : '⬜'}
                    </button>
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'center', color: c.is_blocked ? '#ef4444' : '#9ca3af' }}>
                    {c.is_blocked ? '🚫' : '—'}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{c.shipping_cents ? fmtCents(c.shipping_cents) : '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{parseFloat(c.tax_rate_pct) ? `${c.tax_rate_pct}%` : '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{c.customs_cents ? fmtCents(c.customs_cents) : '—'}</td>
                  <td style={{ padding: '6px 10px' }}>
                    <button onClick={() => editing === c.code ? setEditing(null) : startEdit(c)}
                      style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}>
                      {editing === c.code ? 'Fermer' : 'Modifier'}
                    </button>
                  </td>
                </tr>
                {editing === c.code && (
                  <tr>
                    <td colSpan={9} style={{ padding: '12px 10px', background: '#f0f9ff', borderBottom: '2px solid #bfdbfe' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
                        <label style={{ fontSize: 13 }}>
                          <input type="checkbox" checked={editData.is_active} onChange={e => setEditData(d => ({ ...d, is_active: e.target.checked }))} />
                          {' '}Actif
                        </label>
                        <label style={{ fontSize: 13 }}>
                          <input type="checkbox" checked={editData.is_blocked} onChange={e => setEditData(d => ({ ...d, is_blocked: e.target.checked }))} />
                          {' '}Bloqué
                        </label>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280' }}>Frais de port (centimes)</label>
                          <input type="number" min="0" value={editData.shipping_cents}
                            onChange={e => setEditData(d => ({ ...d, shipping_cents: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280' }}>TVA (%)</label>
                          <input type="number" min="0" step="0.01" value={editData.tax_rate_pct}
                            onChange={e => setEditData(d => ({ ...d, tax_rate_pct: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280' }}>Douane (centimes)</label>
                          <input type="number" min="0" value={editData.customs_cents}
                            onChange={e => setEditData(d => ({ ...d, customs_cents: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280' }}>Note interne douane</label>
                          <input value={editData.customs_note} onChange={e => setEditData(d => ({ ...d, customs_note: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280' }}>Message client</label>
                          <input value={editData.message_client} onChange={e => setEditData(d => ({ ...d, message_client: e.target.value }))}
                            placeholder="Message affiché au client lors du checkout"
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <button onClick={saveEdit}
                        style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        Enregistrer
                      </button>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

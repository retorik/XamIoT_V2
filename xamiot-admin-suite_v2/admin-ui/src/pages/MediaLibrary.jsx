import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://apixam.holiceo.com';
const MIME_ICONS = { 'image': '🖼', 'application/pdf': '📄', 'video': '🎬' };
function mimeIcon(type) {
  if (type?.startsWith('image/')) return '🖼';
  if (type === 'application/pdf') return '📄';
  if (type?.startsWith('video/')) return '🎬';
  return '📎';
}
function fmtSize(b) {
  if (!b) return '—';
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
  return `${(b / 1024 / 1024).toFixed(1)} Mo`;
}

export default function MediaLibrary({ embedded } = {}) {
  const [files, setFiles]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected]   = useState(null);
  const [editAlt, setEditAlt]     = useState('');
  const [msg, setMsg]             = useState(null);
  const [filter, setFilter]       = useState('');
  const inputRef = useRef();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch('/admin/cms/media');
      setFiles(data);
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setLoading(false);
    }
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('xamiot_admin_token');
      const resp = await fetch(`${API_BASE}/admin/cms/media/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.error || 'upload_failed'); }
      const created = await resp.json();
      setFiles(prev => [created, ...prev]);
      setMsg({ type: 'success', text: `${file.name} uploadé.` });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function saveAlt() {
    try {
      const updated = await apiFetch(`/admin/cms/media/${selected.id}`, { method: 'PATCH', body: { alt_text: editAlt } });
      setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
      setSelected(updated);
      setMsg({ type: 'success', text: 'Alt text mis à jour.' });
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  async function deleteFile(id) {
    if (!confirm('Supprimer ce fichier ? Cette action est irréversible.')) return;
    try {
      await apiFetch(`/admin/cms/media/${id}`, { method: 'DELETE' });
      setFiles(prev => prev.filter(f => f.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  const filtered = filter
    ? files.filter(f => f.original_name.toLowerCase().includes(filter.toLowerCase()) || f.mime_type?.includes(filter.toLowerCase()))
    : files;

  const content = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        {!embedded && <h2 style={{ margin: 0 }}>Médiathèque</h2>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filtrer par nom ou type…"
            style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: 220 }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}
          >
            {uploading ? 'Upload en cours…' : '+ Upload'}
          </button>
          <input ref={inputRef} type="file" accept="image/*,application/pdf,video/mp4" onChange={upload} style={{ display: 'none' }} />
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

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 320px' : '1fr', gap: 20 }}>

        {/* Grille de fichiers */}
        <div>
          {loading ? (
            <p style={{ color: '#6b7280' }}>Chargement…</p>
          ) : filtered.length === 0 ? (
            <p style={{ color: '#6b7280' }}>Aucun fichier.{filter ? ' Modifiez le filtre.' : ' Uploadez votre premier fichier.'}</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {filtered.map(f => (
                <div
                  key={f.id}
                  onClick={() => { setSelected(f); setEditAlt(f.alt_text || ''); }}
                  style={{
                    border: selected?.id === f.id ? '2px solid #2563eb' : '2px solid transparent',
                    borderRadius: 8, cursor: 'pointer', background: '#f9fafb', overflow: 'hidden',
                    transition: 'border-color .15s',
                  }}
                >
                  {f.mime_type?.startsWith('image/') ? (
                    <img
                      src={`${API_BASE}${f.url_path}`}
                      alt={f.alt_text || f.original_name}
                      style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>
                      {mimeIcon(f.mime_type)}
                    </div>
                  )}
                  <div style={{ padding: '6px 8px' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.original_name}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{fmtSize(f.size_bytes)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panneau de détail */}
        {selected && (
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, border: '1px solid #e5e7eb', height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Détail</span>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 16 }}>✕</button>
            </div>

            {selected.mime_type?.startsWith('image/') && (
              <img
                src={`${API_BASE}${selected.url_path}`}
                alt={selected.alt_text || selected.original_name}
                style={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 6, marginBottom: 12, background: '#fff' }}
              />
            )}

            <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
              <div style={{ marginBottom: 4 }}><strong>Nom :</strong> {selected.original_name}</div>
              <div style={{ marginBottom: 4 }}><strong>Type :</strong> {selected.mime_type}</div>
              <div style={{ marginBottom: 4 }}><strong>Taille :</strong> {fmtSize(selected.size_bytes)}</div>
              {selected.width_px && <div style={{ marginBottom: 4 }}><strong>Dimensions :</strong> {selected.width_px}×{selected.height_px}px</div>}
              <div style={{ marginBottom: 4, wordBreak: 'break-all' }}>
                <strong>URL :</strong>{' '}
                <code style={{ fontSize: 11 }}>{selected.url_path}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(`${API_BASE}${selected.url_path}`); setMsg({ type: 'success', text: 'URL copiée !' }); }}
                  style={{ marginLeft: 6, fontSize: 11, padding: '2px 6px', background: '#e5e7eb', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                >
                  Copier
                </button>
              </div>
            </div>

            <label style={{ display: 'block', fontWeight: 500, fontSize: 13, marginBottom: 4 }}>Alt text (accessibilité / SEO)</label>
            <input
              value={editAlt}
              onChange={e => setEditAlt(e.target.value)}
              placeholder="Description de l'image…"
              style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveAlt} style={{ flex: 1, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '7px', fontSize: 13, cursor: 'pointer' }}>
                Enregistrer alt
              </button>
              <button onClick={() => deleteFile(selected.id)} style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 6, padding: '7px 10px', fontSize: 13, cursor: 'pointer' }}>
                Suppr.
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) return content;
  return <div className="container">{content}</div>;
}

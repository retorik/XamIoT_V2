import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api.js';

const STATUS_LABEL = { draft: 'Brouillon', published: 'Publié', archived: 'Archivé' };
const STATUS_COLOR = { draft: '#f59e0b', published: '#16a34a', archived: '#6b7280' };

export default function PagesManager({ embedded } = {}) {
  const nav = useNavigate();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  // Drag & drop
  const dragIdx = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch('/admin/cms/pages');
      setPages(data);
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(page) {
    const newStatus = page.status === 'published' ? 'draft' : 'published';
    try {
      await apiFetch(`/admin/cms/pages/${page.id}`, { method: 'PATCH', body: { status: newStatus } });
      setPages(prev => prev.map(p => p.id === page.id ? { ...p, status: newStatus } : p));
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  async function toggleField(page, field) {
    const newVal = !page[field];
    // Optimistic update
    setPages(prev => prev.map(p => p.id === page.id ? { ...p, [field]: newVal } : p));
    try {
      await apiFetch(`/admin/cms/pages/${page.id}`, { method: 'PATCH', body: { [field]: newVal } });
    } catch (e) {
      // Rollback
      setPages(prev => prev.map(p => p.id === page.id ? { ...p, [field]: page[field] } : p));
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  async function deletePage(id) {
    try {
      await apiFetch(`/admin/cms/pages/${id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      setPages(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  async function duplicatePage(page) {
    try {
      // Charger la page complète — les traductions sont dans full.translations[]
      const full = await apiFetch(`/admin/cms/pages/${page.id}`);
      const trans = full.translations || [];
      const byLang = (lang) => trans.find(t => t.lang === lang) || {};

      const suffixes = { fr: ' (copie)', en: ' (copy)', es: ' (copia)' };

      const translations = ['fr', 'en', 'es'].map(lang => {
        const t = byLang(lang);
        return {
          lang,
          title: t.title ? `${t.title}${suffixes[lang]}` : '',
          content: t.content || null,
          content_after: t.content_after || null,
          seo_title: t.seo_title || null,
          seo_description: t.seo_description || null,
          menu_label: t.menu_label || null,
        };
      }).filter(t => t.title); // n'inclure que les langues qui ont un titre

      const created = await apiFetch('/admin/cms/pages', {
        method: 'POST',
        body: {
          slug: `${full.slug}-copie-${Date.now()}`,
          status: 'draft',
          show_in_menu: false,
          show_in_footer: false,
          translations,
        },
      });

      // Enrichir avec les titres pour l'affichage dans la liste
      const frTitle = translations.find(t => t.lang === 'fr')?.title || created.slug;
      created.title_fr = frTitle;
      created.title_en = translations.find(t => t.lang === 'en')?.title || '';
      created.title_es = translations.find(t => t.lang === 'es')?.title || '';
      setPages(prev => [...prev, created]);
      setMsg({ type: 'success', text: `Page « ${created.title_fr} » créée.` });
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
  }

  // ---- Drag & drop reordering ----

  function handleDragStart(e, idx) {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(idx);
  }

  function handleDragLeave() {
    setDragOver(null);
  }

  async function handleDrop(e, targetIdx) {
    e.preventDefault();
    setDragOver(null);
    const fromIdx = dragIdx.current;
    dragIdx.current = null;
    if (fromIdx === null || fromIdx === targetIdx) return;

    // Reorder local array
    const reordered = [...pages];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    // Assign sequential sort_order
    const updated = reordered.map((p, i) => ({ ...p, sort_order: i }));
    setPages(updated);

    // Persist only changed pages
    setSaving(true);
    try {
      const changed = updated.filter((p, i) => p.sort_order !== pages[i]?.sort_order || p.id !== pages[i]?.id);
      await Promise.all(
        updated.map((p, i) => {
          if (pages.findIndex(x => x.id === p.id) !== i) {
            return apiFetch(`/admin/cms/pages/${p.id}`, { method: 'PATCH', body: { sort_order: i } });
          }
          return Promise.resolve();
        })
      );
    } catch (e) {
      setMsg({ type: 'error', text: 'Erreur lors de la sauvegarde de l\'ordre.' });
      load(); // revert
    } finally {
      setSaving(false);
    }
  }

  function handleDragEnd() {
    dragIdx.current = null;
    setDragOver(null);
  }

  const content = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        {!embedded && <h2 style={{ margin: 0 }}>
          Pages CMS
          {saving && <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 12, fontWeight: 400 }}>Sauvegarde…</span>}
        </h2>}
        {embedded && saving && <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>Sauvegarde…</span>}
        <Link to="/cms/pages/new" style={{
          background: '#2563eb', color: '#fff', padding: '8px 18px',
          borderRadius: 6, textDecoration: 'none', fontSize: 14, fontWeight: 500, marginLeft: 'auto',
        }}>
          + Nouvelle page
        </Link>
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
      ) : pages.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Aucune page créée.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={thStyle} title="Glisser pour réordonner"></th>
              {['Titre (FR)', 'Slug', 'Statut', 'Menu nav', 'Pied de page', 'Langues', 'Actions'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pages.map((p, idx) => (
              <tr
                key={p.id}
                draggable
                onDragStart={e => handleDragStart(e, idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                style={{
                  borderBottom: dragOver === idx ? '2px solid #2563eb' : '1px solid #f3f4f6',
                  background: dragIdx.current === idx
                    ? '#f0f9ff'
                    : dragOver === idx
                      ? '#dbeafe'
                      : 'transparent',
                  boxShadow: dragOver === idx ? 'inset 0 -2px 0 #2563eb' : 'none',
                  opacity: dragIdx.current === idx ? 0.5 : 1,
                  transition: 'background 0.1s, opacity 0.1s',
                  cursor: 'grab',
                }}
              >
                {/* Handle de déplacement */}
                <td style={{ padding: '10px 8px', color: '#93c5fd', textAlign: 'center', cursor: 'grab', userSelect: 'none', fontSize: 18 }}>
                  ⠿
                </td>
                <td style={{ padding: '10px', fontWeight: 500 }}>
                  {p.title_fr || <span style={{ color: '#9ca3af' }}>—</span>}
                </td>
                <td style={{ padding: '10px', fontFamily: 'monospace', color: '#6b7280', fontSize: 13 }}>
                  /{p.slug}
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

                {/* Toggle Menu nav */}
                <td style={{ padding: '10px', textAlign: 'center' }}>
                  <button
                    onClick={() => toggleField(p, 'show_in_menu')}
                    title={p.show_in_menu ? 'Retirer du menu nav' : 'Ajouter au menu nav'}
                    style={{
                      width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: p.show_in_menu ? '#2563eb' : '#d1d5db',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2,
                      left: p.show_in_menu ? 18 : 2,
                      width: 16, height: 16, borderRadius: '50%',
                      background: '#fff', transition: 'left 0.2s',
                      display: 'block',
                    }} />
                  </button>
                </td>

                {/* Toggle Pied de page */}
                <td style={{ padding: '10px', textAlign: 'center' }}>
                  <button
                    onClick={() => toggleField(p, 'show_in_footer')}
                    title={p.show_in_footer ? 'Retirer du pied de page' : 'Ajouter au pied de page'}
                    style={{
                      width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: p.show_in_footer ? '#2563eb' : '#d1d5db',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2,
                      left: p.show_in_footer ? 18 : 2,
                      width: 16, height: 16, borderRadius: '50%',
                      background: '#fff', transition: 'left 0.2s',
                      display: 'block',
                    }} />
                  </button>
                </td>

                <td style={{ padding: '10px' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {[p.title_fr && 'FR', p.title_en && 'EN', p.title_es && 'ES'].filter(Boolean).join(' · ') || '—'}
                  </span>
                </td>
                <td style={{ padding: '10px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => nav(`/cms/pages/${p.id}`)}
                      style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
                    >
                      Éditer
                    </button>
                    <button
                      onClick={() => duplicatePage(p)}
                      title="Dupliquer cette page"
                      style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#1d4ed8' }}
                    >
                      Dupliquer
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

      {/* Modale de confirmation suppression */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 380, width: '90%' }}>
            <h3 style={{ margin: '0 0 12px' }}>Supprimer cette page ?</h3>
            <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 20px' }}>
              La page <strong>/{confirmDelete.slug}</strong> et toutes ses traductions seront définitivement supprimées.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={() => deletePage(confirmDelete.id)} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer' }}>
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

const thStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid #e5e7eb',
  color: '#374151',
};

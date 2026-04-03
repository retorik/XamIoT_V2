import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { apiFetch } from '../api.js';

const LANGS = ['fr', 'en', 'es'];
const LANG_LABEL = { fr: '🇫🇷 Français', en: '🇬🇧 English', es: '🇪🇸 Español' };

function Toolbar({ editor }) {
  if (!editor) return null;
  const btn = (action, label, active) => (
    <button
      onMouseDown={e => { e.preventDefault(); action(); }}
      style={{
        background: active ? '#2563eb' : '#f3f4f6',
        color: active ? '#fff' : '#374151',
        border: '1px solid #d1d5db', borderRadius: 4,
        padding: '4px 9px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
      }}
    >{label}</button>
  );
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '8px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderRadius: '6px 6px 0 0' }}>
      {btn(() => editor.chain().focus().toggleBold().run(),      'G',  editor.isActive('bold'))}
      {btn(() => editor.chain().focus().toggleItalic().run(),    'I',  editor.isActive('italic'))}
      {btn(() => editor.chain().focus().toggleUnderline().run(), 'U',  editor.isActive('underline'))}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'H2', editor.isActive('heading', { level: 2 }))}
      {btn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'H3', editor.isActive('heading', { level: 3 }))}
      {btn(() => editor.chain().focus().toggleBulletList().run(),  '• Liste', editor.isActive('bulletList'))}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), '1. Liste', editor.isActive('orderedList'))}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => { const url = prompt('URL :'); if (url) editor.chain().focus().setLink({ href: url }).run(); }, '🔗', false)}
      {btn(() => { const url = prompt('URL image :'); if (url) editor.chain().focus().setImage({ src: url }).run(); }, '🖼', false)}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => editor.chain().focus().undo().run(), '↩', false)}
      {btn(() => editor.chain().focus().redo().run(), '↪', false)}
    </div>
  );
}

export default function ProductEditor() {
  const { id } = useParams();
  const nav     = useNavigate();
  const isNew   = !id || id === 'new';

  const [activeLang, setActiveLang] = useState('fr');
  const activeLangRef = useRef('fr');
  useEffect(() => { activeLangRef.current = activeLang; }, [activeLang]);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState(null);
  const [categories, setCategories] = useState([]);

  // Données produit
  const [sku, setSku]                     = useState('');
  const [slug, setSlug]                   = useState('');
  const [categoryId, setCategoryId]       = useState('');
  const [status, setStatus]               = useState('draft');
  const [priceCents, setPriceCents]       = useState('');
  const [compareCents, setCompareCents]   = useState('');
  const [stockQty, setStockQty]           = useState(0);
  const [isPhysical, setIsPhysical]       = useState(true);
  const [sortOrder, setSortOrder]         = useState(0);

  const [translations, setTranslations] = useState({
    fr: { name: '', description: '', seo_title: '', seo_description: '' },
    en: { name: '', description: '', seo_title: '', seo_description: '' },
    es: { name: '', description: '', seo_title: '', seo_description: '' },
  });

  const editor = useEditor({
    extensions: [StarterKit, Underline, Image, Link.configure({ openOnClick: false }), TextAlign.configure({ types: ['heading', 'paragraph'] })],
    content: translations[activeLang]?.description || '',
    onUpdate: ({ editor: e }) => {
      const lang = activeLangRef.current;
      setTranslations(prev => ({ ...prev, [lang]: { ...prev[lang], description: e.getHTML() } }));
    },
  });

  useEffect(() => {
    apiFetch('/admin/product-categories').then(setCategories).catch(() => {});
    if (!isNew) {
      apiFetch(`/admin/products/${id}`)
        .then(p => {
          setSku(p.sku);
          setSlug(p.slug);
          setCategoryId(p.category_id || '');
          setStatus(p.status);
          setPriceCents(p.price_cents ? (p.price_cents / 100).toFixed(2) : '');
          setCompareCents(p.compare_price_cents ? (p.compare_price_cents / 100).toFixed(2) : '');
          setStockQty(p.stock_qty ?? 0);
          setIsPhysical(p.is_physical ?? true);
          setSortOrder(p.sort_order ?? 0);
          const trans = { fr: {}, en: {}, es: {} };
          for (const t of (p.translations || [])) {
            trans[t.lang] = { name: t.name || '', description: t.description || '', seo_title: t.seo_title || '', seo_description: t.seo_description || '' };
          }
          setTranslations(trans);
        })
        .catch(e => setMsg({ type: 'error', text: e?.data?.error || e.message }));
    }
  }, [id]);

  useEffect(() => {
    if (editor && translations[activeLang]) {
      const html = translations[activeLang].description || '';
      if (editor.getHTML() !== html) editor.commands.setContent(html, false);
    }
  }, [activeLang]);

  function updateTrans(field, value) {
    setTranslations(prev => ({ ...prev, [activeLang]: { ...prev[activeLang], [field]: value } }));
  }

  function toSlug(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      if (!sku.trim())  { setMsg({ type: 'error', text: 'Le SKU est obligatoire.' }); setSaving(false); return; }
      if (!slug.trim()) { setMsg({ type: 'error', text: 'Le slug est obligatoire.' }); setSaving(false); return; }
      if (!translations.fr.name?.trim()) { setMsg({ type: 'error', text: 'Le nom FR est obligatoire.' }); setSaving(false); return; }

      const translationsArr = LANGS
        .map(lang => ({ lang, ...translations[lang] }))
        .filter(t => t.name?.trim());

      const payload = {
        sku: sku.trim(),
        slug: slug.trim(),
        category_id: categoryId || null,
        status,
        price_cents: priceCents ? Math.round(parseFloat(priceCents) * 100) : 0,
        compare_price_cents: compareCents ? Math.round(parseFloat(compareCents) * 100) : null,
        stock_qty: Number(stockQty),
        is_physical: isPhysical,
        sort_order: Number(sortOrder),
        translations: translationsArr,
      };

      if (isNew) {
        await apiFetch('/admin/products', { method: 'POST', body: payload });
        nav('/boutique/produits');
      } else {
        await apiFetch(`/admin/products/${id}`, { method: 'PATCH', body: payload });
        setMsg({ type: 'success', text: 'Produit enregistré.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setSaving(false);
    }
  }

  async function autoTranslate() {
    if (isNew) { setMsg({ type: 'error', text: 'Enregistrez d\'abord le produit avant de traduire.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const result = await apiFetch(`/admin/products/${id}/translate`, { method: 'POST' });
      // Recharger les traductions
      const p = await apiFetch(`/admin/products/${id}`);
      const trans = { fr: {}, en: {}, es: {} };
      for (const t of (p.translations || [])) {
        trans[t.lang] = { name: t.name || '', description: t.description || '', seo_title: t.seo_title || '', seo_description: t.seo_description || '' };
      }
      setTranslations(trans);
      setMsg({ type: 'success', text: 'Traductions mises à jour via DeepL.' });
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => nav('/boutique/produits')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 14 }}>
          ← Retour
        </button>
        <h2 style={{ margin: 0 }}>{isNew ? 'Nouveau produit' : `Éditer — ${sku}`}</h2>
      </div>

      {msg && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8,
          background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
          color:      msg.type === 'success' ? '#15803d' : '#b91c1c',
          fontSize: 14,
        }}>{msg.text}</div>
      )}

      {/* Métadonnées produit */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, padding: 16, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>SKU *</label>
          <input value={sku} onChange={e => setSku(e.target.value.toUpperCase())}
            placeholder="ex: XAM-ESP32-C3-01"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Slug *</label>
          <input value={slug} onChange={e => setSlug(toSlug(e.target.value))}
            placeholder="ex: capteur-sonore-esp32-c3"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Catégorie</label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
            <option value="">— Sans catégorie —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name_fr || c.slug}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Statut</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
            <option value="draft">Brouillon</option>
            <option value="published">Publié</option>
            <option value="archived">Archivé</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Prix (€)</label>
          <input type="number" min="0" step="0.01" value={priceCents} onChange={e => setPriceCents(e.target.value)}
            placeholder="49.90"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Prix barré (€)</label>
          <input type="number" min="0" step="0.01" value={compareCents} onChange={e => setCompareCents(e.target.value)}
            placeholder="optionnel"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Stock</label>
          <input type="number" min="0" value={stockQty} onChange={e => setStockQty(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 22 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={isPhysical} onChange={e => setIsPhysical(e.target.checked)} />
            Produit physique
          </label>
          <div>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Ordre : </span>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)}
              style={{ width: 60, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
          </div>
        </div>
      </div>

      {/* Onglets langue */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 20 }}>
        {LANGS.map(lang => (
          <button key={lang} onClick={() => setActiveLang(lang)}
            style={{
              padding: '8px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              background: 'none', border: 'none',
              color: activeLang === lang ? '#2563eb' : '#6b7280',
              borderBottom: activeLang === lang ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2,
            }}>
            {LANG_LABEL[lang]}
            {translations[lang]?.name && <span style={{ marginLeft: 4, fontSize: 10, color: '#16a34a' }}>✓</span>}
          </button>
        ))}
        {!isNew && (
          <button onClick={autoTranslate} disabled={saving}
            style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', cursor: 'pointer', color: '#374151' }}>
            🌐 Auto-traduire (DeepL)
          </button>
        )}
      </div>

      {/* Formulaire traduction */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>
          Nom {activeLang === 'fr' ? '*' : ''}
        </label>
        <input value={translations[activeLang]?.name || ''} onChange={e => {
          updateTrans('name', e.target.value);
          if (isNew && activeLang === 'fr') setSlug(toSlug(e.target.value));
        }}
          placeholder={`Nom en ${LANG_LABEL[activeLang]}`}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }} />

        <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Description</label>
        <div style={{ border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 12 }}>
          <Toolbar editor={editor} />
          <EditorContent editor={editor} style={{ minHeight: 200, padding: '12px', outline: 'none' }} />
        </div>

        <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Titre SEO</label>
        <input value={translations[activeLang]?.seo_title || ''} onChange={e => updateTrans('seo_title', e.target.value)}
          placeholder="Optionnel"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }} />

        <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Méta-description SEO</label>
        <textarea value={translations[activeLang]?.seo_description || ''} onChange={e => updateTrans('seo_description', e.target.value)}
          rows={2}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={save} disabled={saving}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={() => nav('/boutique/produits')}
          style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}>
          Annuler
        </button>
      </div>

      <style>{`
        .tiptap { outline: none; }
        .tiptap h2 { font-size: 1.3em; font-weight: 600; margin: .7em 0 .3em; }
        .tiptap h3 { font-size: 1.1em; font-weight: 600; margin: .6em 0 .3em; }
        .tiptap p  { margin: .5em 0; line-height: 1.6; }
        .tiptap ul, .tiptap ol { padding-left: 1.5em; margin: .5em 0; }
        .tiptap a  { color: #2563eb; text-decoration: underline; }
        .tiptap img { max-width: 100%; height: auto; border-radius: 6px; }
      `}</style>
    </div>
  );
}

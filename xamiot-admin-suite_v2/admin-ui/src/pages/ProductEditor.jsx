import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import { apiFetch } from '../api.js';

const cellAttrs = parent => ({
  ...parent?.(),
  backgroundColor: { default: null, parseHTML: el => el.style.backgroundColor || null,  renderHTML: a => a.backgroundColor ? { style: `background-color:${a.backgroundColor}` } : {} },
  verticalAlign:   { default: null, parseHTML: el => el.style.verticalAlign || null,     renderHTML: a => a.verticalAlign ? { style: `vertical-align:${a.verticalAlign}` } : {} },
  borderWidth:     { default: null, parseHTML: el => el.style.borderWidth ? parseFloat(el.style.borderWidth) : null, renderHTML: a => a.borderWidth != null ? { style: `border-width:${a.borderWidth}px;border-style:solid` } : {} },
  borderColor:     { default: null, parseHTML: el => el.style.borderColor || null,       renderHTML: a => a.borderColor ? { style: `border-color:${a.borderColor}` } : {} },
});

const TEXT_COLORS = [
  { label: '— Couleur texte —', value: '' },
  { label: 'Noir',     value: '#000000' }, { label: 'Blanc',  value: '#ffffff' },
  { label: 'Gris',     value: '#6b7280' }, { label: 'Rouge',  value: '#dc2626' },
  { label: 'Orange',   value: '#ea580c' }, { label: 'Ambre',  value: '#ca8a04' },
  { label: 'Vert',     value: '#16a34a' }, { label: 'Bleu',   value: '#2563eb' },
  { label: 'Indigo',   value: '#4338ca' }, { label: 'Violet', value: '#9333ea' },
  { label: 'Rose',     value: '#db2777' },
];
const CELL_BG_COLORS = [
  { label: '— Fond cellule —', value: '' }, { label: 'Aucun fond', value: 'none' },
  { label: 'Blanc',            value: '#ffffff' }, { label: 'Gris clair',  value: '#f1f5f9' },
  { label: 'Gris moyen',       value: '#e2e8f0' }, { label: 'Bleu clair',  value: '#dbeafe' },
  { label: 'Bleu moyen',       value: '#bfdbfe' }, { label: 'Vert clair',  value: '#dcfce7' },
  { label: 'Jaune clair',      value: '#fef9c3' }, { label: 'Orange clair',value: '#ffedd5' },
  { label: 'Rouge clair',      value: '#fee2e2' }, { label: 'Violet clair',value: '#f3e8ff' },
];
const CELL_BORDER_COLORS = [
  { label: '— Couleur trait —', value: '' }, { label: 'Noir',        value: '#000000' },
  { label: 'Gris foncé',        value: '#374151' }, { label: 'Gris clair',  value: '#d1d5db' },
  { label: 'Bleu',              value: '#3b82f6' }, { label: 'Bleu foncé',  value: '#1d4ed8' },
  { label: 'Rouge',             value: '#dc2626' }, { label: 'Vert',        value: '#16a34a' },
  { label: 'Orange',            value: '#f97316' }, { label: 'Transparent', value: 'transparent' },
];
function ColorSelect({ colors, currentValue, onSelect, pickerTitle }) {
  const preview = (currentValue && currentValue !== 'none')
    ? currentValue
    : 'linear-gradient(135deg,#fff 42%,#dc2626 42%,#dc2626 58%,#fff 58%)';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <div style={{ width: 14, height: 14, flexShrink: 0, background: preview, border: '1px solid #9ca3af', borderRadius: 2 }} />
      <select value={currentValue || ''} onChange={e => { const v = e.target.value; onSelect(v === 'none' ? null : (v || null)); }}
        style={{ fontSize: 11, border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 2px', cursor: 'pointer', height: 22, maxWidth: 120 }}>
        {colors.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <input type="color" defaultValue={currentValue && currentValue !== 'none' ? currentValue : '#000000'}
        title={pickerTitle || 'Couleur personnalisée'}
        style={{ width: 18, height: 22, padding: 0, border: '1px solid #9ca3af', borderRadius: 2, cursor: 'pointer', flexShrink: 0 }}
        onChange={e => onSelect(e.target.value)} />
    </div>
  );
}
const TableCellExt   = TableCell.extend({   addAttributes() { return cellAttrs(this.parent); } });
const TableHeaderExt = TableHeader.extend({ addAttributes() { return cellAttrs(this.parent); } });

const API_BASE = import.meta.env.VITE_API_BASE || 'https://apixam.holiceo.com';
const LANGS = ['fr', 'en', 'es'];
const LANG_LABEL = { fr: '🇫🇷 Français', en: '🇬🇧 English', es: '🇪🇸 Español' };

/* ── Picker Médiathèque (modal) ── */
function MediaPicker({ open, onSelect, onClose }) {
  const [media, setMedia] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    apiFetch('/admin/cms/media').then(setMedia).catch(() => {});
  }, [open]);

  if (!open) return null;
  const filtered = media.filter(m =>
    m.mime_type?.startsWith('image/') &&
    (!search || m.original_name?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 800, maxHeight: '80vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Choisir une image</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          {filtered.map(m => (
            <div key={m.id} onClick={() => onSelect(m)}
              style={{ cursor: 'pointer', border: '2px solid transparent', borderRadius: 8, overflow: 'hidden', background: '#f3f4f6' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#2563eb'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
              <img src={`${API_BASE}${m.url_path}`} alt={m.alt_text || m.original_name}
                style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
              <div style={{ padding: '4px 6px', fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.original_name}
              </div>
            </div>
          ))}
          {!filtered.length && <div style={{ color: '#9ca3af', gridColumn: '1/-1', textAlign: 'center', padding: 20 }}>Aucune image trouvée</div>}
        </div>
      </div>
    </div>
  );
}

function MediaPickerModal({ onPick, onClose }) {
  const [files, setFiles] = React.useState([]);
  const [search, setSearch] = React.useState('');
  React.useEffect(() => {
    apiFetch('/admin/cms/media').then(setFiles).catch(() => {});
  }, []);
  const filtered = files.filter(f => f.mime_type?.startsWith('image/') && f.original_name?.toLowerCase().includes(search.toLowerCase()));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 20, width: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong>Choisir une image</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
          style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', marginBottom: 12, fontSize: 13 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, overflowY: 'auto' }}>
          {filtered.map(f => (
            <div key={f.id} onClick={() => { onPick(`${API_BASE}${f.url_path}`); onClose(); }}
              style={{ cursor: 'pointer', border: '2px solid transparent', borderRadius: 6, overflow: 'hidden' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#2563eb'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
              <img src={`${API_BASE}${f.url_path}`} alt={f.alt_text || f.original_name}
                style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} />
              <div style={{ padding: '3px 5px', fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {f.original_name}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#9ca3af', padding: 24 }}>Aucune image</div>
          )}
        </div>
      </div>
    </div>
  );
}

const FONTS = [
  { label: 'Police (défaut)', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif" },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Garamond', value: 'Garamond, serif' },
  { label: 'Courier New', value: "'Courier New', monospace" },
  { label: 'Lucida Console', value: "'Lucida Console', monospace" },
];

function Toolbar({ editor, isInTable, isImage, fontFamily, onOpenImagePicker }) {
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
  function resizeImage() {
    const { selection } = editor.state;
    if (selection.node?.type.name !== 'image') return;
    const pos     = selection.from;
    const current = selection.node.attrs.width || '';
    const val = prompt('Largeur de l\'image (ex: 300px, 50%, auto) :', current || '100%');
    if (val === null) return;
    const tr = editor.state.tr.setNodeMarkup(pos, null, { ...selection.node.attrs, width: val });
    editor.view.dispatch(tr);
  }
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
      {btn(() => onOpenImagePicker(url => editor.chain().focus().setImage({ src: url }).run()), '🖼', false)}
      {isImage && btn(resizeImage, '↔ Taille', false)}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {/* Police */}
      <select value={fontFamily}
        onChange={e => { const v = e.target.value; v ? editor.chain().focus().setFontFamily(v).run() : editor.chain().focus().unsetFontFamily().run(); }}
        style={{ fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 4px', cursor: 'pointer', height: 26 }}>
        {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      <ColorSelect
        colors={TEXT_COLORS}
        currentValue={editor.getAttributes('textStyle')?.color || ''}
        onSelect={v => v ? editor.chain().focus().setColor(v).run() : editor.chain().focus().unsetColor().run()}
        pickerTitle="Couleur texte personnalisée"
      />
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), '⊞ Tableau', false)}
      {isInTable && <>
        {btn(() => editor.chain().focus().addColumnAfter().run(),  '+ Col', false)}
        {btn(() => editor.chain().focus().deleteColumn().run(),    '− Col', false)}
        {btn(() => editor.chain().focus().addRowAfter().run(),     '+ Ligne', false)}
        {btn(() => editor.chain().focus().deleteRow().run(),       '− Ligne', false)}
        {btn(() => editor.chain().focus().mergeOrSplit().run(),    '⇔ Fusionner/Scinder', false)}
        {btn(() => editor.chain().focus().deleteTable().run(),     '✕ Tab', false)}
        <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
        {/* Fond de cellule */}
        <ColorSelect colors={CELL_BG_COLORS} currentValue="" onSelect={v => editor.chain().focus().setCellAttribute('backgroundColor', v).run()} pickerTitle="Fond personnalisé" />
        <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
        {/* Épaisseur bordure */}
        {[0,1,2,3].map(w => btn(() => editor.chain().focus().setCellAttribute('borderWidth', w).run(), `${w}px`, false))}
        {/* Couleur bordure */}
        <ColorSelect colors={CELL_BORDER_COLORS} currentValue="" onSelect={v => editor.chain().focus().setCellAttribute('borderColor', v).run()} pickerTitle="Couleur trait personnalisée" />
      </>}
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
  const [imagePickerCb, setImagePickerCb] = useState(null);
  const [categories, setCategories] = useState([]);
  const [dataReady, setDataReady]   = useState(isNew);

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
  const [featuredMedia, setFeaturedMedia] = useState(null); // { id, url_path, alt_text }
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  const [translations, setTranslations] = useState({
    fr: { name: '', description: '', seo_title: '', seo_description: '' },
    en: { name: '', description: '', seo_title: '', seo_description: '' },
    es: { name: '', description: '', seo_title: '', seo_description: '' },
  });

  const editor = useEditor({
    extensions: [StarterKit, Underline, Image.extend({ addAttributes() { return { ...this.parent?.(), width: { default: null, parseHTML: el => el.getAttribute('width'), renderHTML: attrs => attrs.width ? { width: attrs.width, style: `width:${attrs.width}` } : {} } }; } }), Link.configure({ openOnClick: false }), TextAlign.configure({ types: ['heading', 'paragraph'] }), Table.configure({ resizable: true }), TableRow, TableHeaderExt, TableCellExt, TextStyle, Color.configure({ types: ['textStyle'] }), FontFamily.configure({ types: ['textStyle'] })],
    content: translations[activeLang]?.description || '',
    onUpdate: ({ editor: e }) => {
      const lang = activeLangRef.current;
      setTranslations(prev => ({ ...prev, [lang]: { ...prev[lang], description: e.getHTML() } }));
    },
  });

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      isInTable:  e?.isActive('table') ?? false,
      isImage:    e?.state?.selection.node?.type.name === 'image',
      fontFamily: e?.getAttributes('textStyle')?.fontFamily ?? '',
    }),
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
          if (p.featured_media_id && p.featured_media_url) {
            setFeaturedMedia({ id: p.featured_media_id, url_path: p.featured_media_url, alt_text: p.featured_media_alt || '' });
          }
          const trans = { fr: {}, en: {}, es: {} };
          for (const t of (p.translations || [])) {
            trans[t.lang] = { name: t.name || '', description: t.description || '', seo_title: t.seo_title || '', seo_description: t.seo_description || '' };
          }
          setTranslations(trans);
          setDataReady(true);
        })
        .catch(e => setMsg({ type: 'error', text: e?.data?.error || e.message }));
    }
  }, [id]);

  useEffect(() => {
    if (editor && translations[activeLang]) {
      const html = translations[activeLang].description || '';
      if (editor.getHTML() !== html) editor.commands.setContent(html, false);
    }
  }, [activeLang, dataReady, editor]);

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
        featured_media_id: featuredMedia?.id || null,
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

      {/* Image principale */}
      <div style={{ marginBottom: 20, padding: 16, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 8 }}>Image principale</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {featuredMedia ? (
            <div style={{ position: 'relative' }}>
              <img src={`${API_BASE}${featuredMedia.url_path}`} alt={featuredMedia.alt_text || ''}
                style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #d1d5db' }} />
              <button onClick={() => setFeaturedMedia(null)}
                style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, fontSize: 12, cursor: 'pointer', lineHeight: '22px', textAlign: 'center' }}>
                ✕
              </button>
            </div>
          ) : (
            <div style={{ width: 120, height: 120, background: '#e5e7eb', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 32 }}>
              📦
            </div>
          )}
          <button onClick={() => setShowMediaPicker(true)}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            {featuredMedia ? 'Changer l\'image' : 'Choisir depuis la médiathèque'}
          </button>
        </div>
      </div>

      <MediaPicker open={showMediaPicker}
        onSelect={m => { setFeaturedMedia(m); setShowMediaPicker(false); }}
        onClose={() => setShowMediaPicker(false)} />

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
          <Toolbar editor={editor} isInTable={toolbarState?.isInTable ?? false} isImage={toolbarState?.isImage ?? false} fontFamily={toolbarState?.fontFamily ?? ''} onOpenImagePicker={cb => setImagePickerCb(() => cb)} />
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
        .tiptap table { border-collapse: collapse; width: 100%; margin: .8em 0; }
        .tiptap table th { background: #f3f4f6; font-weight: 600; text-align: left; padding: 6px 10px; border: 1px solid #d1d5db; box-shadow: inset 0 0 0 1px #e2e8f0; position: relative; }
        .tiptap table td { padding: 6px 10px; border: 1px solid #d1d5db; box-shadow: inset 0 0 0 1px #e2e8f0; position: relative; }
        .tiptap table tr:nth-child(even) td { background: #f9fafb; }
        .tiptap .selectedCell:after { background: rgba(37,99,235,.12); content: ''; position: absolute; inset: 0; pointer-events: none; }
        .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: #93c5fd; pointer-events: none; }
        .resize-cursor { cursor: col-resize; }
        .tableWrapper { overflow-x: auto; }
      `}</style>
      {imagePickerCb && (
        <MediaPickerModal onPick={imagePickerCb} onClose={() => setImagePickerCb(null)} />
      )}
    </div>
  );
}

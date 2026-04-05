import React, { useEffect, useRef, useState, useCallback } from 'react';
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

// Extensions TableCell/TableHeader enrichis (backgroundColor, borderWidth, borderColor)
const cellAttrs = parent => ({
  ...parent?.(),
  backgroundColor: { default: null, parseHTML: el => el.style.backgroundColor || null,  renderHTML: a => a.backgroundColor ? { style: `background-color:${a.backgroundColor}` } : {} },
  verticalAlign:   { default: null, parseHTML: el => el.style.verticalAlign || null,     renderHTML: a => a.verticalAlign ? { style: `vertical-align:${a.verticalAlign}` } : {} },
  borderWidth:     { default: null, parseHTML: el => el.style.borderWidth ? parseFloat(el.style.borderWidth) : null, renderHTML: a => a.borderWidth != null ? { style: `border-width:${a.borderWidth}px;border-style:solid` } : {} },
  borderColor:     { default: null, parseHTML: el => el.style.borderColor || null,       renderHTML: a => a.borderColor ? { style: `border-color:${a.borderColor}` } : {} },
});
const TableCellExt   = TableCell.extend({   addAttributes() { return cellAttrs(this.parent); } });
const TableHeaderExt = TableHeader.extend({ addAttributes() { return cellAttrs(this.parent); } });

const API_BASE = import.meta.env.VITE_API_BASE || 'https://apixam.holiceo.com';
const LANGS = ['fr', 'en', 'es'];
const LANG_LABEL = { fr: '🇫🇷 Français', en: '🇬🇧 English', es: '🇪🇸 Español' };

/* ── Picker médiathèque (modal inline) ─────────────────── */
function MediaPickerModal({ onPick, onClose }) {
  const [files, setFiles] = React.useState([]);
  const [search, setSearch] = React.useState('');
  React.useEffect(() => {
    apiFetch('/admin/cms/media').then(setFiles).catch(() => {});
  }, []);
  const filtered = files.filter(f =>
    f.original_name?.toLowerCase().includes(search.toLowerCase())
  );
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
          {filtered.filter(f => f.mime_type?.startsWith('image/')).map(f => (
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
          {filtered.filter(f => f.mime_type?.startsWith('image/')).length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#9ca3af', padding: 24 }}>Aucune image</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Modal d'insertion de lien ─────────────────────────── */
function LinkModal({ editor, onClose }) {
  const [tab, setTab]           = React.useState('url');
  const [url, setUrl]           = React.useState('');
  const [newTab, setNewTab]     = React.useState(false);
  const [selectedSlug, setSelectedSlug] = React.useState('');
  const [pages, setPages]       = React.useState([]);

  const existingHref = editor.getAttributes('link').href || '';

  React.useEffect(() => {
    if (existingHref) {
      if (existingHref.startsWith('/') && !existingHref.startsWith('//')) {
        setTab('page');
        setSelectedSlug(existingHref.replace(/^\//, ''));
      } else {
        setTab('url');
        setUrl(existingHref);
      }
      setNewTab(editor.getAttributes('link').target === '_blank');
    }
  }, []);

  React.useEffect(() => {
    apiFetch('/admin/cms/pages').then(data => setPages(data || [])).catch(() => {});
  }, []);

  function apply() {
    const href = tab === 'url' ? url.trim() : (selectedSlug ? `/${selectedSlug}` : '');
    if (!href) return;
    editor.chain().focus().setLink({ href, target: newTab ? '_blank' : null }).run();
    onClose();
  }

  function remove() {
    editor.chain().focus().unsetLink().run();
    onClose();
  }

  const tabBtn = (t, label) => (
    <button onMouseDown={e => { e.preventDefault(); setTab(t); }}
      style={{ padding: '5px 14px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: '1px solid #d1d5db', cursor: 'pointer',
        background: tab === t ? '#2563eb' : '#f3f4f6', color: tab === t ? '#fff' : '#374151' }}>
      {label}
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 20, width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <strong style={{ fontSize: 15 }}>Insérer un lien</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {tabBtn('url', 'URL')}
          {tabBtn('page', 'Page du site')}
        </div>
        {tab === 'url' ? (
          <input
            autoFocus
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            onKeyDown={e => { if (e.key === 'Enter') apply(); }}
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, marginBottom: 10 }}
          />
        ) : (
          <select
            value={selectedSlug}
            onChange={e => setSelectedSlug(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, marginBottom: 10 }}
          >
            <option value="">— Choisir une page —</option>
            {pages.map(p => {
              const title = p.translations?.find(t => t.lang === 'fr')?.title || p.slug;
              return <option key={p.id} value={p.slug}>{title}</option>;
            })}
          </select>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={newTab} onChange={e => setNewTab(e.target.checked)} />
          Ouvrir dans un nouvel onglet
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onMouseDown={e => { e.preventDefault(); apply(); }}
            style={{ padding: '6px 18px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
            Appliquer
          </button>
          {existingHref && (
            <button onMouseDown={e => { e.preventDefault(); remove(); }}
              style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#b91c1c', cursor: 'pointer' }}>
              Supprimer
            </button>
          )}
          <button onMouseDown={e => { e.preventDefault(); onClose(); }}
            style={{ padding: '6px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', color: '#374151', cursor: 'pointer' }}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Palettes de couleurs ───────────────────────────────── */
const TEXT_COLORS = [
  { label: '— Couleur texte —', value: '' },
  { label: 'Noir',          value: '#000000' },
  { label: 'Blanc',         value: '#ffffff' },
  { label: 'Gris',          value: '#6b7280' },
  { label: 'Rouge',         value: '#dc2626' },
  { label: 'Orange',        value: '#ea580c' },
  { label: 'Ambre',         value: '#ca8a04' },
  { label: 'Vert',          value: '#16a34a' },
  { label: 'Bleu',          value: '#2563eb' },
  { label: 'Indigo',        value: '#4338ca' },
  { label: 'Violet',        value: '#9333ea' },
  { label: 'Rose',          value: '#db2777' },
];

const CELL_BG_COLORS = [
  { label: '— Fond cellule —', value: '' },
  { label: 'Aucun fond',       value: 'none' },
  { label: 'Blanc',            value: '#ffffff' },
  { label: 'Gris très clair',  value: '#f8fafc' },
  { label: 'Gris clair',       value: '#f1f5f9' },
  { label: 'Gris moyen',       value: '#e2e8f0' },
  { label: 'Bleu clair',       value: '#dbeafe' },
  { label: 'Bleu moyen',       value: '#bfdbfe' },
  { label: 'Vert clair',       value: '#dcfce7' },
  { label: 'Jaune clair',      value: '#fef9c3' },
  { label: 'Orange clair',     value: '#ffedd5' },
  { label: 'Rouge clair',      value: '#fee2e2' },
  { label: 'Rose clair',       value: '#fce7f3' },
  { label: 'Violet clair',     value: '#f3e8ff' },
];

const CELL_BORDER_COLORS = [
  { label: '— Couleur trait —', value: '' },
  { label: 'Noir',              value: '#000000' },
  { label: 'Gris foncé',        value: '#374151' },
  { label: 'Gris clair',        value: '#d1d5db' },
  { label: 'Bleu',              value: '#3b82f6' },
  { label: 'Bleu foncé',        value: '#1d4ed8' },
  { label: 'Rouge',             value: '#dc2626' },
  { label: 'Vert',              value: '#16a34a' },
  { label: 'Orange',            value: '#f97316' },
  { label: 'Violet',            value: '#9333ea' },
  { label: 'Transparent',       value: 'transparent' },
];

/* Sélecteur couleur avec carré préview + liste déroulante + picker libre */
function ColorSelect({ colors, currentValue, onSelect, pickerTitle }) {
  const preview = (currentValue && currentValue !== 'none')
    ? currentValue
    : 'linear-gradient(135deg,#fff 42%,#dc2626 42%,#dc2626 58%,#fff 58%)';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <div style={{ width: 14, height: 14, flexShrink: 0, background: preview, border: '1px solid #9ca3af', borderRadius: 2 }} />
      <select
        value={currentValue || ''}
        onChange={e => {
          const v = e.target.value;
          onSelect(v === 'none' ? null : (v || null));
        }}
        style={{ fontSize: 11, border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 2px', cursor: 'pointer', height: 22, maxWidth: 120 }}
      >
        {colors.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <input type="color" defaultValue={currentValue && currentValue !== 'none' ? currentValue : '#000000'}
        title={pickerTitle || 'Couleur personnalisée'}
        style={{ width: 18, height: 22, padding: 0, border: '1px solid #9ca3af', borderRadius: 2, cursor: 'pointer', flexShrink: 0 }}
        onChange={e => onSelect(e.target.value)} />
    </div>
  );
}

/* ── Barre d'outils TipTap ─────────────────────────────── */
// isInTable et isImage sont calculés dans le parent (useEditorState) et passés en props
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

function Toolbar({ editor, isInTable, isImage, fontFamily, onOpenImagePicker, sticky }) {
  const [linkModalOpen, setLinkModalOpen] = React.useState(false);
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

  function addImage() { onOpenImagePicker(url => editor.chain().focus().setImage({ src: url }).run()); }

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
    <>
    {linkModalOpen && <LinkModal editor={editor} onClose={() => setLinkModalOpen(false)} />}
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '8px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderRadius: '6px 6px 0 0', ...(sticky ? { position: 'sticky', top: 36, zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,.06)' } : {}) }}>
      {btn(() => editor.chain().focus().toggleBold().run(),        'G',  editor.isActive('bold'))}
      {btn(() => editor.chain().focus().toggleItalic().run(),      'I',  editor.isActive('italic'))}
      {btn(() => editor.chain().focus().toggleUnderline().run(),   'U',  editor.isActive('underline'))}
      {btn(() => editor.chain().focus().toggleStrike().run(),      'S',  editor.isActive('strike'))}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'H1', editor.isActive('heading', { level: 1 }))}
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'H2', editor.isActive('heading', { level: 2 }))}
      {btn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'H3', editor.isActive('heading', { level: 3 }))}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => editor.chain().focus().toggleBulletList().run(),    '• Liste', editor.isActive('bulletList'))}
      {btn(() => editor.chain().focus().toggleOrderedList().run(),   '1. Liste', editor.isActive('orderedList'))}
      {btn(() => editor.chain().focus().toggleBlockquote().run(),    '❝', editor.isActive('blockquote'))}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => editor.chain().focus().setTextAlign('left').run(),   '⬅', editor.isActive({ textAlign: 'left' }))}
      {btn(() => editor.chain().focus().setTextAlign('center').run(), '↔', editor.isActive({ textAlign: 'center' }))}
      {btn(() => editor.chain().focus().setTextAlign('right').run(),  '➡', editor.isActive({ textAlign: 'right' }))}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => setLinkModalOpen(true), editor.isActive('link') ? '🔗 Modifier' : '🔗', editor.isActive('link'))}
      {btn(addImage, '🖼 Insérer', false)}
      {isImage && btn(resizeImage, '↔ Taille', false)}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {/* Police */}
      <select value={fontFamily}
        onChange={e => { const v = e.target.value; v ? editor.chain().focus().setFontFamily(v).run() : editor.chain().focus().unsetFontFamily().run(); }}
        style={{ fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 4px', cursor: 'pointer', height: 26 }}>
        {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {/* Couleur texte */}
      <ColorSelect
        colors={TEXT_COLORS}
        currentValue={editor.getAttributes('textStyle')?.color || ''}
        onSelect={v => v ? editor.chain().focus().setColor(v).run() : editor.chain().focus().unsetColor().run()}
        pickerTitle="Couleur texte personnalisée"
      />
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), '⊞ Tableau', false)}
      {isInTable && <>
        {btn(() => editor.chain().focus().addColumnAfter().run(),   '+ Col', false)}
        {btn(() => editor.chain().focus().deleteColumn().run(),     '− Col', false)}
        {btn(() => editor.chain().focus().addRowAfter().run(),      '+ Ligne', false)}
        {btn(() => editor.chain().focus().deleteRow().run(),        '− Ligne', false)}
        {btn(() => editor.chain().focus().mergeOrSplit().run(),     '⇔ Fus/Scind', false)}
        {btn(() => editor.chain().focus().toggleHeaderRow().run(),  'En-tête', false)}
        {btn(() => editor.chain().focus().deleteTable().run(),      '✕ Tab', false)}
        <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
        {/* Alignement vertical cellule */}
        {[['top','↑'],['middle','↕'],['bottom','↓']].map(([v,lbl]) => btn(
          () => editor.chain().focus().setCellAttribute('verticalAlign', v).run(), lbl, false
        ))}
        {/* Alignement horizontal texte */}
        {btn(() => editor.chain().focus().setTextAlign('left').run(),   '←', false)}
        {btn(() => editor.chain().focus().setTextAlign('center').run(), '↔', false)}
        {btn(() => editor.chain().focus().setTextAlign('right').run(),  '→', false)}
        <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
        {/* Fond de cellule */}
        <ColorSelect
          colors={CELL_BG_COLORS}
          currentValue=""
          onSelect={v => editor.chain().focus().setCellAttribute('backgroundColor', v).run()}
          pickerTitle="Fond personnalisé"
        />
        <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
        {/* Épaisseur bordure */}
        {[0,1,2,3].map(w => btn(() => editor.chain().focus().setCellAttribute('borderWidth', w).run(), `${w}px`, false))}
        {/* Couleur bordure */}
        <ColorSelect
          colors={CELL_BORDER_COLORS}
          currentValue=""
          onSelect={v => editor.chain().focus().setCellAttribute('borderColor', v).run()}
          pickerTitle="Couleur trait personnalisée"
        />
      </>}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => editor.chain().focus().undo().run(), '↩', false)}
      {btn(() => editor.chain().focus().redo().run(), '↪', false)}
    </div>
    </>
  );
}

/* ── Composant principal ───────────────────────────────── */
export default function PageEditor() {
  const { id } = useParams();
  const nav     = useNavigate();
  const isNew   = !id || id === 'new';

  const [activeLang, setActiveLang] = useState('fr');
  const activeLangRef = useRef('fr');
  useEffect(() => { activeLangRef.current = activeLang; }, [activeLang]);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState(null);
  const [imagePickerCb, setImagePickerCb] = useState(null);

  // Données page
  const [slug, setSlug]           = useState('');
  const [status, setStatus]       = useState('draft');
  const [sortOrder, setSortOrder] = useState(0);
  const [showInMenu, setShowInMenu] = useState(true);
  const [showInFooter, setShowInFooter] = useState(false);

  // Traductions (fr/en/es)
  const [translations, setTranslations] = useState({
    fr: { title: '', content: '', content_after: '', seo_title: '', seo_description: '', menu_label: '' },
    en: { title: '', content: '', content_after: '', seo_title: '', seo_description: '', menu_label: '' },
    es: { title: '', content: '', content_after: '', seo_title: '', seo_description: '', menu_label: '' },
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.extend({ addAttributes() { return { ...this.parent?.(), width: { default: null, parseHTML: el => el.getAttribute('width'), renderHTML: attrs => attrs.width ? { width: attrs.width, style: `width:${attrs.width}` } : {} } }; } }),
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeaderExt,
      TableCellExt,
      TextStyle,
      Color.configure({ types: ['textStyle'] }),
      FontFamily.configure({ types: ['textStyle'] }),
    ],
    content: translations[activeLang]?.content || '',
    onUpdate: ({ editor: e }) => {
      const lang = activeLangRef.current;
      setTranslations(prev => ({
        ...prev,
        [lang]: { ...prev[lang], content: e.getHTML() },
      }));
    },
  });

  const editorAfter = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.extend({ addAttributes() { return { ...this.parent?.(), width: { default: null, parseHTML: el => el.getAttribute('width'), renderHTML: attrs => attrs.width ? { width: attrs.width, style: `width:${attrs.width}` } : {} } }; } }),
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeaderExt,
      TableCellExt,
      TextStyle,
      Color.configure({ types: ['textStyle'] }),
      FontFamily.configure({ types: ['textStyle'] }),
    ],
    content: translations[activeLang]?.content_after || '',
    onUpdate: ({ editor: e }) => {
      const lang = activeLangRef.current;
      setTranslations(prev => ({
        ...prev,
        [lang]: { ...prev[lang], content_after: e.getHTML() },
      }));
    },
  });

  // État réactif des toolbars — calculé ici (même composant que useEditor) et passé en props
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      isInTable:  e?.isActive('table') ?? false,
      isImage:    e?.state?.selection.node?.type.name === 'image',
      fontFamily: e?.getAttributes('textStyle')?.fontFamily ?? '',
    }),
  });
  const toolbarAfterState = useEditorState({
    editor: editorAfter,
    selector: ({ editor: e }) => ({
      isInTable:  e?.isActive('table') ?? false,
      isImage:    e?.state?.selection.node?.type.name === 'image',
      fontFamily: e?.getAttributes('textStyle')?.fontFamily ?? '',
    }),
  });

  // Charger la page existante
  useEffect(() => {
    if (!isNew) {
      apiFetch(`/admin/cms/pages/${id}`)
        .then(page => {
          setSlug(page.slug);
          setStatus(page.status);
          setSortOrder(page.sort_order);
          setShowInMenu(page.show_in_menu);
          setShowInFooter(page.show_in_footer ?? false);
          const trans = { fr: {}, en: {}, es: {} };
          for (const t of (page.translations || [])) {
            trans[t.lang] = {
              title: t.title || '',
              content: t.content || '',
              content_after: t.content_after || '',
              seo_title: t.seo_title || '',
              seo_description: t.seo_description || '',
              menu_label: t.menu_label || '',
            };
          }
          setTranslations(trans);
        })
        .catch(e => setMsg({ type: 'error', text: e?.data?.error || e.message }));
    }
  }, [id]);

  // Synchroniser le contenu de l'éditeur quand on change de langue ou quand les traductions sont chargées
  useEffect(() => {
    if (editor && translations[activeLang]) {
      const html = translations[activeLang].content || '';
      if (editor.getHTML() !== html) {
        editor.commands.setContent(html, false);
      }
    }
  }, [activeLang, translations, editor]);

  useEffect(() => {
    if (editorAfter && translations[activeLang]) {
      const html = translations[activeLang].content_after || '';
      if (editorAfter.getHTML() !== html) {
        editorAfter.commands.setContent(html, false);
      }
    }
  }, [activeLang, translations, editorAfter]);

  function updateTrans(field, value) {
    setTranslations(prev => ({
      ...prev,
      [activeLang]: { ...prev[activeLang], [field]: value },
    }));
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      if (!slug.trim()) { setMsg({ type: 'error', text: 'Le slug est obligatoire.' }); setSaving(false); return; }
      if (!translations.fr.title.trim()) { setMsg({ type: 'error', text: 'Le titre FR est obligatoire.' }); setSaving(false); return; }

      // Toutes les traductions renseignées (titre requis)
      const translationsArr = LANGS
        .map(lang => ({ lang, ...translations[lang] }))
        .filter(t => t.title?.trim());

      const payload = {
        slug: slug.trim(), status,
        sort_order: Number(sortOrder),
        show_in_menu: showInMenu,
        show_in_footer: showInFooter,
        translations: translationsArr,
      };

      if (isNew) {
        await apiFetch('/admin/cms/pages', { method: 'POST', body: payload });
        nav('/cms/pages');
      } else {
        await apiFetch(`/admin/cms/pages/${id}`, { method: 'PATCH', body: payload });
        setMsg({ type: 'success', text: 'Page enregistrée.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setSaving(false);
    }
  }

  async function autoTranslate() {
    if (!id) { setMsg({ type: 'error', text: 'Enregistrez d\'abord la page avant de traduire.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const result = await apiFetch(`/admin/cms/pages/${id}/translate`, { method: 'POST' });
      setMsg({ type: 'success', text: result.message || 'Traduction en cours…' });
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => nav('/cms/pages')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 14 }}>
          ← Retour
        </button>
        <h2 style={{ margin: 0 }}>{isNew ? 'Nouvelle page' : `Éditer /${slug}`}</h2>
      </div>

      {msg && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8,
          background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
          color:      msg.type === 'success' ? '#15803d' : '#b91c1c',
          fontSize: 14,
        }}>{msg.text}</div>
      )}

      {/* Métadonnées page */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Slug *</label>
          <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            placeholder="ex: a-propos"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
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
          <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Ordre dans le menu</label>
          <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 22 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" id="showInMenu" checked={showInMenu} onChange={e => setShowInMenu(e.target.checked)} />
            <span style={{ fontWeight: 500, fontSize: 14 }}>Menu de navigation (en-tête)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" id="showInFooter" checked={showInFooter} onChange={e => setShowInFooter(e.target.checked)} />
            <span style={{ fontWeight: 500, fontSize: 14 }}>Pied de page</span>
          </label>
          {(showInMenu || showInFooter) && status !== 'published' && (
            <div style={{ fontSize: 12, color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, padding: '6px 10px' }}>
              ⚠️ La page doit être en statut <strong>Publié</strong> pour apparaître sur le site.
            </div>
          )}
        </div>
      </div>

      {/* Onglets de langue */}
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
            {translations[lang]?.title && <span style={{ marginLeft: 4, fontSize: 10, color: '#16a34a' }}>✓</span>}
          </button>
        ))}
        {!isNew && (
          <button onClick={autoTranslate} disabled={saving}
            style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', cursor: 'pointer', color: '#374151' }}>
            🌐 Auto-traduire (DeepL)
          </button>
        )}
      </div>

      {/* Formulaire de traduction */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>
          Titre {activeLang === 'fr' ? '*' : ''}
        </label>
        <input value={translations[activeLang]?.title || ''} onChange={e => updateTrans('title', e.target.value)}
          placeholder={`Titre en ${LANG_LABEL[activeLang]}`}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }} />

        <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Label menu</label>
        <input value={translations[activeLang]?.menu_label || ''} onChange={e => updateTrans('menu_label', e.target.value)}
          placeholder="Si différent du titre (optionnel)"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }} />

        {slug === 'contact' && (
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
            padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#1d4ed8',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>📬</span>
            <div>
              <strong>Page avec formulaire de contact intégré</strong>
              <div style={{ marginTop: 3, color: '#3b82f6' }}>
                Le formulaire (Prénom, Nom, Téléphone, Email, Message) est affiché automatiquement
                entre le contenu principal et le contenu secondaire.
                Les paramètres du rate limit sont dans <strong>Paramètres → Rate Limiting</strong>.
              </div>
            </div>
          </div>
        )}

        <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Contenu (avant formulaire)</label>
        <div style={{ border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 12 }}>
          <Toolbar editor={editor} isInTable={toolbarState?.isInTable ?? false} isImage={toolbarState?.isImage ?? false} fontFamily={toolbarState?.fontFamily ?? ''} onOpenImagePicker={cb => setImagePickerCb(() => cb)} sticky />
          <EditorContent editor={editor} style={{ minHeight: 250, padding: '12px', outline: 'none' }} className="tiptap-editor" />
        </div>

        <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>
          Contenu secondaire
          <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280', marginLeft: 6 }}>
            (affiché après un éventuel formulaire intégré — ex : page Contact)
          </span>
        </label>
        <div style={{ border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 12 }}>
          <Toolbar editor={editorAfter} isInTable={toolbarAfterState?.isInTable ?? false} isImage={toolbarAfterState?.isImage ?? false} fontFamily={toolbarAfterState?.fontFamily ?? ''} onOpenImagePicker={cb => setImagePickerCb(() => cb)} />
          <EditorContent editor={editorAfter} style={{ minHeight: 120, padding: '12px', outline: 'none' }} className="tiptap-editor" />
        </div>

        <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Titre SEO</label>
        <input value={translations[activeLang]?.seo_title || ''} onChange={e => updateTrans('seo_title', e.target.value)}
          placeholder="Titre pour les moteurs de recherche (optionnel)"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }} />

        <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Méta-description SEO</label>
        <textarea value={translations[activeLang]?.seo_description || ''} onChange={e => updateTrans('seo_description', e.target.value)}
          placeholder="Description pour les moteurs de recherche (optionnel, 150-160 chars)"
          rows={3}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }} />
        {translations[activeLang]?.seo_description && (
          <span style={{ fontSize: 12, color: translations[activeLang].seo_description.length > 160 ? '#b91c1c' : '#6b7280' }}>
            {translations[activeLang].seo_description.length} / 160 caractères
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={save} disabled={saving}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={() => nav('/cms/pages')}
          style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}>
          Annuler
        </button>
      </div>

      {/* Style TipTap minimal */}
      <style>{`
        .tiptap { outline: none; }
        .tiptap h1 { font-size: 1.6em; font-weight: 700; margin: .8em 0 .4em; }
        .tiptap h2 { font-size: 1.3em; font-weight: 600; margin: .7em 0 .3em; }
        .tiptap h3 { font-size: 1.1em; font-weight: 600; margin: .6em 0 .3em; }
        .tiptap p  { margin: .5em 0; line-height: 1.6; }
        .tiptap ul, .tiptap ol { padding-left: 1.5em; margin: .5em 0; }
        .tiptap li { margin: .3em 0; }
        .tiptap a  { color: #2563eb; text-decoration: underline; }
        .tiptap img { max-width: 100%; height: auto; border-radius: 6px; }
        .tiptap blockquote { border-left: 4px solid #e5e7eb; padding-left: 1em; margin: .8em 0; color: #6b7280; }
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

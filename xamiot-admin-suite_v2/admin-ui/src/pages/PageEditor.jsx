import React, { useEffect, useRef, useState, useCallback } from 'react';
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

/* ── Barre d'outils TipTap ─────────────────────────────── */
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

  function addLink() {
    const url = prompt('URL du lien :');
    if (url) editor.chain().focus().setLink({ href: url }).run();
  }

  function addImage() {
    const url = prompt('URL de l\'image :');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '8px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderRadius: '6px 6px 0 0' }}>
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
      {btn(addLink,  '🔗', false)}
      {btn(addImage, '🖼', false)}
      <span style={{ borderLeft: '1px solid #d1d5db', margin: '0 2px' }} />
      {btn(() => editor.chain().focus().undo().run(), '↩', false)}
      {btn(() => editor.chain().focus().redo().run(), '↪', false)}
    </div>
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
      Image,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
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
      Image,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
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
          <Toolbar editor={editor} />
          <EditorContent editor={editor} style={{ minHeight: 250, padding: '12px', outline: 'none' }} />
        </div>

        <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>
          Contenu secondaire
          <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280', marginLeft: 6 }}>
            (affiché après un éventuel formulaire intégré — ex : page Contact)
          </span>
        </label>
        <div style={{ border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 12 }}>
          <Toolbar editor={editorAfter} />
          <EditorContent editor={editorAfter} style={{ minHeight: 120, padding: '12px', outline: 'none' }} />
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
      `}</style>
    </div>
  );
}

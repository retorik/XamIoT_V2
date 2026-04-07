import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../api.js';

const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://xamsite.holiceo.com';

const CONFIG_MARKER     = '/* STYLE_EDITOR_CONFIG:';
const CONFIG_MARKER_END = '*/';

const DEFAULT_VARS = {
  // Marque
  brandColor:      '#2563eb',
  brandHover:      '#1d4ed8',
  brandText:       '#ffffff',
  brandTextHover:  '#ffffff',
  // Corps
  bodyBg:          '#ffffff',
  bodyText:        '#111827',
  bodyFontSize:    '16',
  fontBody:        'Inter, ui-sans-serif, system-ui, sans-serif',
  // Titres
  headingColor:    '#111827',
  fontHeading:     '',
  // Liens
  linkColor:       '#2563eb',
  linkHoverColor:  '#1d4ed8',
  // Header
  headerBg:            '#ffffff',
  headerText:          '#374151',
  headerLinkColor:     '#2563eb',
  headerLinkHoverColor:'#1d4ed8',
  headerFontSize:      '14',
  fontHeader:          '',
  // Footer
  footerBg:            '#f9fafb',
  footerText:          '#6b7280',
  footerLinkColor:     '#2563eb',
  footerLinkHoverColor:'#1d4ed8',
  footerFontSize:      '14',
  fontFooter:          '',
  // Arrondis
  borderRadius:    '8',
};

const GOOGLE_FONTS = [
  { label: 'Inter (défaut)',   value: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  { label: 'Roboto',           value: "'Roboto', sans-serif" },
  { label: 'Open Sans',        value: "'Open Sans', sans-serif" },
  { label: 'Lato',             value: "'Lato', sans-serif" },
  { label: 'Montserrat',       value: "'Montserrat', sans-serif" },
  { label: 'Poppins',          value: "'Poppins', sans-serif" },
  { label: 'Raleway',          value: "'Raleway', sans-serif" },
  { label: 'Source Sans 3',    value: "'Source Sans 3', sans-serif" },
  { label: 'Nunito',           value: "'Nunito', sans-serif" },
  { label: 'Georgia (serif)',  value: "Georgia, 'Times New Roman', serif" },
  { label: 'Merriweather',     value: "'Merriweather', Georgia, serif" },
  { label: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
];

const FONT_NONE = { label: '— Identique au corps —', value: '' };

function buildGoogleFontsLink(font) {
  const name = font.match(/'([^']+)'/)?.[1];
  if (!name || name === 'Inter') return null;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@400;500;600;700&display=swap`;
}

function varsToCSS(v) {
  const imports = [v.fontBody, v.fontHeading, v.fontHeader, v.fontFooter]
    .filter(Boolean)
    .map(buildGoogleFontsLink)
    .filter(Boolean)
    .map(u => `@import url('${u}');`)
    .join('\n');

  const radius = `${v.borderRadius}px`;

  return `${imports}

/* ── Corps de page ── */
body {
  background-color: ${v.bodyBg} !important;
  color: ${v.bodyText} !important;
  font-family: ${v.fontBody} !important;
  font-size: ${v.bodyFontSize}px !important;
}

/* ── Titres ── */
h1, h2, h3, h4, h5, h6 {
  color: ${v.headingColor} !important;
  ${v.fontHeading ? `font-family: ${v.fontHeading} !important;` : ''}
}

/* ── Liens (y compris liens Tailwind text-gray-* et contenu .prose) ── */
a, a[class], .prose a, .prose a[class] {
  color: ${v.linkColor} !important;
}
a:hover, a[class]:hover, .prose a:hover,
.hover\\:text-brand-600:hover,
.hover\\:text-brand-700:hover {
  color: ${v.linkHoverColor} !important;
}

/* ── Couleur de marque ── */
.text-brand-600, .text-brand-500 { color: ${v.brandColor} !important; }
.bg-brand-600  { background-color: ${v.brandColor} !important; color: ${v.brandText} !important; }
.bg-brand-700  { background-color: ${v.brandHover} !important; color: ${v.brandTextHover} !important; }
.border-brand-600, .border-brand-500 { border-color: ${v.brandColor} !important; }
.hover\\:bg-brand-700:hover   { background-color: ${v.brandHover} !important; color: ${v.brandTextHover} !important; }
.hover\\:text-brand-600:hover { color: ${v.brandColor} !important; }
.focus\\:ring-brand-600:focus { --tw-ring-color: ${v.brandColor} !important; }

/* ── En-tête ── */
header, header.bg-white, header.sticky {
  background-color: ${v.headerBg} !important;
}
header, header p, header span, header button {
  color: ${v.headerText} !important;
  font-size: ${v.headerFontSize}px !important;
  ${v.fontHeader ? `font-family: ${v.fontHeader} !important;` : ''}
}
header a, header a[class], header nav a {
  color: ${v.headerLinkColor} !important;
  font-size: ${v.headerFontSize}px !important;
  ${v.fontHeader ? `font-family: ${v.fontHeader} !important;` : ''}
}
header a:hover, header a[class]:hover, header nav a:hover {
  color: ${v.headerLinkHoverColor} !important;
}

/* ── Pied de page ── */
footer, footer.bg-gray-50 {
  background-color: ${v.footerBg} !important;
}
footer, footer p, footer span, footer .text-gray-500 {
  color: ${v.footerText} !important;
  font-size: ${v.footerFontSize}px !important;
  ${v.fontFooter ? `font-family: ${v.fontFooter} !important;` : ''}
}
footer a, footer a[class] {
  color: ${v.footerLinkColor} !important;
  font-size: ${v.footerFontSize}px !important;
  ${v.fontFooter ? `font-family: ${v.fontFooter} !important;` : ''}
}
footer a:hover, footer a[class]:hover {
  color: ${v.footerLinkHoverColor} !important;
}

/* ── Arrondis ── */
.rounded-lg  { border-radius: ${radius} !important; }
.rounded-xl  { border-radius: calc(${radius} * 1.33) !important; }
.rounded-2xl { border-radius: calc(${radius} * 2) !important; }
`.trimStart();
}

function parseVarsFromCSS(css) {
  if (!css.includes(CONFIG_MARKER)) return null;
  try {
    const start = css.indexOf(CONFIG_MARKER) + CONFIG_MARKER.length;
    const end   = css.indexOf(CONFIG_MARKER_END, start);
    return JSON.parse(css.substring(start, end).trim());
  } catch { return null; }
}

function embedVarsInCSS(vars, extraCSS) {
  const config    = `${CONFIG_MARKER}${JSON.stringify(vars)}${CONFIG_MARKER_END}`;
  const generated = varsToCSS(vars);
  return [config, '', generated, '', '/* ── CSS supplémentaire ── */', extraCSS || ''].join('\n');
}

function extractExtraCSS(css) {
  const marker = '/* ── CSS supplémentaire ── */';
  const idx = css.indexOf(marker);
  return idx === -1 ? '' : css.substring(idx + marker.length).trim();
}

// ─── Divider redimensionnable ─────────────────────────────────────────────────

function ResizableSplit({ leftWidth, onResize, children }) {
  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(leftWidth);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = leftWidth;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [leftWidth]);

  useEffect(() => {
    function onMouseMove(e) {
      if (!dragging.current) return;
      const next = Math.max(260, Math.min(720, startW.current + e.clientX - startX.current));
      onResize(next);
    }
    function onMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onResize]);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {children[0]}
      <div onMouseDown={onMouseDown}
        style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: '#e5e7eb', position: 'relative' }}
        onMouseEnter={e => e.currentTarget.style.background = '#93c5fd'}
        onMouseLeave={e => e.currentTarget.style.background = '#e5e7eb'}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', gap: 3, pointerEvents: 'none' }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 2, height: 14, background: '#9ca3af', borderRadius: 1 }} />)}
        </div>
      </div>
      {children[1]}
    </div>
  );
}

// ─── Composants de formulaire ─────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <label style={{ fontSize: 12, color: '#6b7280', width: 140, flexShrink: 0, textAlign: 'right' }}>{label}</label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 34, height: 26, border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', padding: 2 }} />
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 78, border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 6px', fontSize: 12, fontFamily: 'monospace' }} />
    </Field>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <Field label={label}>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 6px', fontSize: 12 }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

function RangeField({ label, value, onChange, min = 10, max = 28, unit = 'px' }) {
  return (
    <Field label={`${label} (${value}${unit})`}>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(e.target.value)}
        style={{ flex: 1 }} />
    </Field>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: 10, paddingBottom: 5, borderBottom: '1px solid #f3f4f6' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── Éditeur graphique ────────────────────────────────────────────────────────

function GraphicEditor({ vars, onChange }) {
  const set = key => val => onChange({ ...vars, [key]: val });
  return (
    <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1 }}>

      <Section title="Couleurs de marque">
        <ColorField label="Couleur principale"  value={vars.brandColor}     onChange={set('brandColor')} />
        <ColorField label="Survol / secondaire" value={vars.brandHover}     onChange={set('brandHover')} />
        <ColorField label="Texte normal"        value={vars.brandText}      onChange={set('brandText')} />
        <ColorField label="Texte au survol"     value={vars.brandTextHover} onChange={set('brandTextHover')} />
      </Section>

      <Section title="Corps de page">
        <ColorField   label="Fond de page"  value={vars.bodyBg}   onChange={set('bodyBg')} />
        <ColorField   label="Couleur texte" value={vars.bodyText} onChange={set('bodyText')} />
        <RangeField   label="Taille texte"  value={vars.bodyFontSize} onChange={set('bodyFontSize')} min={12} max={24} />
        <SelectField  label="Police"        value={vars.fontBody} onChange={set('fontBody')} options={GOOGLE_FONTS} />
      </Section>

      <Section title="Titres (h1–h6)">
        <ColorField  label="Couleur"       value={vars.headingColor} onChange={set('headingColor')} />
        <SelectField label="Police titres" value={vars.fontHeading}  onChange={set('fontHeading')} options={[FONT_NONE, ...GOOGLE_FONTS]} />
      </Section>

      <Section title="Liens">
        <ColorField label="Couleur lien"  value={vars.linkColor}      onChange={set('linkColor')} />
        <ColorField label="Survol lien"   value={vars.linkHoverColor} onChange={set('linkHoverColor')} />
      </Section>

      <Section title="En-tête (header)">
        <ColorField  label="Fond"               value={vars.headerBg}            onChange={set('headerBg')} />
        <ColorField  label="Texte"              value={vars.headerText}          onChange={set('headerText')} />
        <ColorField  label="Couleur liens"      value={vars.headerLinkColor}     onChange={set('headerLinkColor')} />
        <ColorField  label="Survol liens"       value={vars.headerLinkHoverColor} onChange={set('headerLinkHoverColor')} />
        <RangeField  label="Taille texte"       value={vars.headerFontSize}      onChange={set('headerFontSize')} min={11} max={20} />
        <SelectField label="Police"             value={vars.fontHeader}          onChange={set('fontHeader')} options={[FONT_NONE, ...GOOGLE_FONTS]} />
      </Section>

      <Section title="Pied de page (footer)">
        <ColorField  label="Fond"               value={vars.footerBg}            onChange={set('footerBg')} />
        <ColorField  label="Texte"              value={vars.footerText}          onChange={set('footerText')} />
        <ColorField  label="Couleur liens"      value={vars.footerLinkColor}     onChange={set('footerLinkColor')} />
        <ColorField  label="Survol liens"       value={vars.footerLinkHoverColor} onChange={set('footerLinkHoverColor')} />
        <RangeField  label="Taille texte"       value={vars.footerFontSize}      onChange={set('footerFontSize')} min={10} max={20} />
        <SelectField label="Police"             value={vars.fontFooter}          onChange={set('fontFooter')} options={[FONT_NONE, ...GOOGLE_FONTS]} />
      </Section>

      <Section title="Arrondis">
        <RangeField label="Rayon" value={vars.borderRadius} onChange={set('borderRadius')} min={0} max={24} />
      </Section>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function StyleEditor() {
  const [css, setCss]                   = useState('');
  const [vars, setVars]                 = useState(DEFAULT_VARS);
  const [activeTab, setActiveTab]       = useState('graphique');
  const [pages, setPages]               = useState([]);
  const [selectedPage, setSelectedPage] = useState('');
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [iframeKey, setIframeKey]       = useState(0);
  const [loading, setLoading]           = useState(true);
  const [leftWidth, setLeftWidth]       = useState(420);

  useEffect(() => {
    Promise.all([
      apiFetch('/admin/app-config/custom_css')
        .then(r => {
          const raw    = r?.value || '';
          const parsed = parseVarsFromCSS(raw);
          if (parsed) { setVars({ ...DEFAULT_VARS, ...parsed }); setCss(extractExtraCSS(raw)); }
          else setCss(raw);
        })
        .catch(() => {}),
      apiFetch('/admin/cms/pages')
        .then(r => setPages((r || []).filter(p => p.status === 'published')))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await apiFetch('/admin/app-config/custom_css', { method: 'PUT', body: { value: embedVarsInCSS(vars, css) } });
      setSaved(true);
      setIframeKey(k => k + 1);
      setTimeout(() => setSaved(false), 3000);
    } finally { setSaving(false); }
  }

  const iframeSrc = selectedPage
    ? `${SITE_URL}/${selectedPage}?nocache=${iframeKey}`
    : `${SITE_URL}/?nocache=${iframeKey}`;

  const tabBtn = active => ({
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '7px 14px', fontSize: 13, fontWeight: 500,
    color: active ? '#2563eb' : '#6b7280',
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    marginBottom: -1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 500 }}>
      <ResizableSplit leftWidth={leftWidth} onResize={setLeftWidth}>

        {/* ── Panneau gauche ── */}
        <div style={{ width: leftWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Onglets */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', paddingLeft: 10, background: '#f9fafb', flexShrink: 0 }}>
            <button style={tabBtn(activeTab === 'graphique')} onClick={() => setActiveTab('graphique')}>Éditeur visuel</button>
            <button style={tabBtn(activeTab === 'brut')}     onClick={() => setActiveTab('brut')}>CSS brut</button>
          </div>

          {/* Contenu */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {loading ? (
              <div style={{ padding: 16, color: '#9ca3af', fontSize: 13 }}>Chargement…</div>
            ) : activeTab === 'graphique' ? (
              <GraphicEditor vars={vars} onChange={setVars} />
            ) : (
              <>
                <div style={{ padding: '6px 14px', background: '#1e1e2e', fontSize: 11, color: '#71717a', flexShrink: 0 }}>
                  CSS supplémentaire — s'ajoute après les réglages de l'éditeur visuel
                </div>
                <textarea
                  value={css}
                  onChange={e => setCss(e.target.value)}
                  spellCheck={false}
                  style={{
                    flex: 1, border: 'none', outline: 'none', resize: 'none',
                    fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
                    fontSize: 12, lineHeight: 1.6, padding: '12px 14px',
                    background: '#1e1e2e', color: '#cdd6f4', boxSizing: 'border-box', tabSize: 2,
                  }}
                  onKeyDown={e => {
                    if (e.key !== 'Tab') return;
                    e.preventDefault();
                    const s = e.target.selectionStart, en = e.target.selectionEnd;
                    const v = css.substring(0, s) + '  ' + css.substring(en);
                    setCss(v);
                    requestAnimationFrame(() => { e.target.selectionStart = e.target.selectionEnd = s + 2; });
                  }}
                  placeholder="/* CSS supplémentaire ici */"
                />
              </>
            )}
          </div>

          {/* Actions */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={handleSave} disabled={saving || loading} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? 'Sauvegarde…' : saved ? '✓ Sauvegardé' : 'Sauvegarder et prévisualiser'}
            </button>
            <button onClick={() => { if (window.confirm('Réinitialiser tous les styles ?')) { setVars(DEFAULT_VARS); setCss(''); } }}
              disabled={saving} className="btn"
              style={{ padding: '6px 10px', color: '#ef4444', borderColor: '#fca5a5' }} title="Réinitialiser">✕</button>
          </div>
        </div>

        {/* ── Panneau droit : aperçu ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>Page :</span>
            <select value={selectedPage} onChange={e => setSelectedPage(e.target.value)}
              style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}>
              <option value="">— Accueil (/) —</option>
              {pages.map(p => <option key={p.slug} value={p.slug}>{p.title_fr || p.slug}</option>)}
            </select>
            <button onClick={() => setIframeKey(k => k + 1)} className="btn" style={{ padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>↺ Actualiser</button>
            <a href={iframeSrc.split('?')[0]} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: '#2563eb', whiteSpace: 'nowrap', textDecoration: 'none' }}>↗ Ouvrir</a>
          </div>
          <div style={{ flex: 1 }}>
            <iframe key={iframeKey} src={iframeSrc} title="Aperçu site"
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              sandbox="allow-scripts allow-same-origin allow-forms" />
          </div>
        </div>

      </ResizableSplit>
    </div>
  );
}

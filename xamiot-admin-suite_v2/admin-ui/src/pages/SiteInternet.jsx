import React, { useState } from 'react';
import PagesManager from './PagesManager.jsx';
import MediaLibrary from './MediaLibrary.jsx';
import { AppConfigSection } from './Settings.jsx';

const TABS = [
  { key: 'pages',  label: 'Pages' },
  { key: 'media',  label: 'Médias' },
  { key: 'config', label: 'Configuration' },
];

export default function SiteInternet() {
  const [tab, setTab] = useState('pages');

  return (
    <div className="container">
      <h2>Site internet</h2>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e5e7eb', paddingBottom: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '8px 16px', fontSize: 14, fontWeight: 500,
              color: tab === t.key ? '#2563eb' : '#6b7280',
              borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pages'  && <PagesManager embedded />}
      {tab === 'media'  && <MediaLibrary embedded />}
      {tab === 'config' && <AppConfigSection />}
    </div>
  );
}

// Devices.jsx — Onglets Périphériques / Règles / Alertes
import React, { useState } from 'react';
import EspDevices from './EspDevices.jsx';
import Rules from './Rules.jsx';
import Alerts from './Alerts.jsx';

const TABS = [
  { label: 'Périphériques', component: <EspDevices /> },
  { label: 'Règles',        component: <Rules /> },
  { label: 'Alertes',       component: <Alerts /> },
];

const tabBtn = (active) => ({
  border: 'none', background: 'none', padding: '10px 22px', cursor: 'pointer',
  borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
  color: active ? '#2563eb' : '#6b7280',
  fontWeight: active ? 600 : 400,
  fontSize: 14,
  marginBottom: -2,
});

export default function Devices() {
  const [tab, setTab] = useState(0);

  return (
    <div>
      <div style={{ borderBottom: '2px solid #e5e7eb', display: 'flex', paddingLeft: 16, paddingTop: 8 }}>
        {TABS.map(({ label }, i) => (
          <button key={label} style={tabBtn(tab === i)} onClick={() => setTab(i)}>
            {label}
          </button>
        ))}
      </div>
      <div key={tab}>
        {TABS[tab].component}
      </div>
    </div>
  );
}

// Logs.jsx — Onglets Logs MQTT / Audit logs
import React, { useState } from 'react';
import MqttLogs from './MqttLogs.jsx';
import AuditLogs from './AuditLogs.jsx';

const TABS = [
  { label: 'Logs MQTT',   component: <MqttLogs /> },
  { label: 'Audit logs',  component: <AuditLogs /> },
];

const tabBtn = (active) => ({
  border: 'none', background: 'none', padding: '10px 22px', cursor: 'pointer',
  borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
  color: active ? '#2563eb' : '#6b7280',
  fontWeight: active ? 600 : 400,
  fontSize: 14,
  marginBottom: -2,
});

export default function Logs() {
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

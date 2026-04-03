import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

function Stat({ title, value, sub }) {
  return (
    <div className="card" style={{flex: '1 1 200px'}}>
      <div style={{color:'#555', fontSize: 13}}>{title}</div>
      <div style={{fontSize: 28, fontWeight: 800, marginTop: 6}}>{value ?? '-'}</div>
      {sub ? <div style={{color:'#555', fontSize: 13, marginTop: 6}}>{sub}</div> : null}
    </div>
  );
}

function StatSplit({ title, left, right }) {
  return (
    <div className="card" style={{flex: '1 1 200px'}}>
      <div style={{color:'#555', fontSize: 13, marginBottom: 8}}>{title}</div>
      <div style={{display:'flex', gap: 12, alignItems: 'flex-end'}}>
        <div style={{flex: 1}}>
          <div style={{fontSize: 22, fontWeight: 800, color: '#2563eb'}}>{left.value ?? '-'}</div>
          <div style={{fontSize: 12, color: '#888', marginTop: 2}}>{left.label}</div>
        </div>
        <div style={{color: '#ddd', fontWeight: 300, fontSize: 24, paddingBottom: 2}}>/</div>
        <div style={{flex: 1}}>
          <div style={{fontSize: 22, fontWeight: 800}}>{right.value ?? '-'}</div>
          <div style={{fontSize: 12, color: '#888', marginTop: 2}}>{right.label}</div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [s, setS] = useState(null);

  useEffect(() => {
    apiFetch('/admin/summary').then(setS).catch(() => setS(null));
  }, []);

  return (
    <div className="container">
      <h2>Dashboard</h2>
      <div className="row" style={{marginBottom: 8}}>
        <Stat title="Utilisateurs" value={s?.users_total} sub={`Actifs: ${s?.users_active ?? '-'}`} />
        <Stat title="Mobiles" value={s?.mobiles_total} sub={`Actifs: ${s?.mobiles_active ?? '-'}`} />
        <Stat title="Capteurs ESP" value={s?.esp_total} />
        <Stat title="Règles" value={s?.rules_total} sub={`Actives: ${s?.rules_active ?? '-'}`} />
        <Stat title="Alertes" value={s?.alerts_total} sub={`Dernière: ${s?.last_alert_at ?? '-'}`} />
      </div>
      <div className="row">
        <StatSplit
          title="Tickets support"
          left={{ value: s?.tickets_open, label: 'En cours' }}
          right={{ value: s?.tickets_total, label: 'Total' }}
        />
        <StatSplit
          title="RMA"
          left={{ value: s?.rma_open, label: 'En cours' }}
          right={{ value: s?.rma_total, label: 'Total' }}
        />
        <StatSplit
          title="Commandes"
          left={{ value: s?.orders_active, label: 'En cours' }}
          right={{ value: s?.orders_done, label: 'Terminées' }}
        />
      </div>
    </div>
  );
}

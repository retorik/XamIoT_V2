import React, { useState } from 'react';
import ProductsManager from './ProductsManager.jsx';
import OrdersManager from './OrdersManager.jsx';

const TABS = [
  { key: 'produits',   label: 'Produits' },
  { key: 'commandes',  label: 'Commandes' },
];

export default function BoutiqueWrapper() {
  const [tab, setTab] = useState('produits');

  return (
    <div className="container">
      <h2>Boutique</h2>

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

      {tab === 'produits'  && <ProductsManager embedded />}
      {tab === 'commandes' && <OrdersManager embedded />}
    </div>
  );
}

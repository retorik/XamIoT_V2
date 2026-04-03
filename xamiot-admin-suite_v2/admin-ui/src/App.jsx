import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import './styles.css';
import { getToken, setToken, apiFetch } from './api.js';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Users from './pages/Users.jsx';
import UserDetails from './pages/UserDetails.jsx';
import Alerts from './pages/Alerts.jsx';
import EspDevices from './pages/EspDevices.jsx';
import Rules from './pages/Rules.jsx';
import Notifications from './pages/Notifications.jsx';
import DeviceTypes from './pages/DeviceTypes.jsx';
import MqttFrames from './pages/MqttFrames.jsx';
import Settings from './pages/Settings.jsx';
import MqttLogs from './pages/MqttLogs.jsx';
import OtaUpdates from './pages/OtaUpdates.jsx';
import PagesManager from './pages/PagesManager.jsx';
import PageEditor from './pages/PageEditor.jsx';
import MediaLibrary from './pages/MediaLibrary.jsx';
import ProductsManager from './pages/ProductsManager.jsx';
import ProductEditor from './pages/ProductEditor.jsx';
import AuditLogs from './pages/AuditLogs.jsx';
import OrdersManager from './pages/OrdersManager.jsx';
import TicketsManager from './pages/TicketsManager.jsx';
import RmaManager from './pages/RmaManager.jsx';
import SiteInternet from './pages/SiteInternet.jsx';
import BoutiqueWrapper from './pages/BoutiqueWrapper.jsx';

const NAV_LINKS = [
  { to: '/dashboard',          label: 'Dashboard' },
  { to: '/site',               label: 'Site internet' },
  { to: '/boutique',           label: 'Boutique' },
  { to: '/support/tickets',    label: 'Support' },
  { to: '/support/rma',        label: 'RMA' },
  { to: '/users',              label: 'Utilisateurs' },
  { to: '/esp',                label: 'ESP' },
  { to: '/rules',              label: 'Règles' },
  { to: '/alerts',             label: 'Alertes' },
  { to: '/device-types',       label: 'Types devices' },
  { to: '/notifications',      label: 'Notifications' },
  { to: '/ota',                label: 'Mise à jour OTA' },
  { to: '/settings',           label: 'Paramètres' },
  { to: '/mqtt-logs',          label: 'Logs MQTT' },
  { to: '/audit',              label: 'Audit logs' },
];

function StatusDot({ status, tooltip }) {
  const TIPS = {
    ok:           'Opérationnel',
    error:        'Erreur',
    unconfigured: 'Non configuré',
    loading:      'Vérification…',
    stripe_test:  'Mode test (DEV)',
  };
  return (
    <div className="service-status-item">
      <span className={`service-status-dot ${status}`} />
      <span className="service-status-label">{tooltip}</span>
      <span className="status-tooltip">{TIPS[status] || status}</span>
    </div>
  );
}

function ServiceStatusBar() {
  const [services, setServices] = useState({
    api:    'ok',
    mqtt:   'loading',
    apns:   'loading',
    fcm:    'loading',
    smtp:   'unconfigured',
    stripe: 'loading',
  });

  const refresh = useCallback(async () => {
    const next = { api: 'ok' };

    try {
      const statusData = await apiFetch('/admin/status');
      next.mqtt = statusData?.db === 'ok' ? 'ok' : 'error';
    } catch {
      next.mqtt = 'error';
    }

    try {
      const apnsData = await apiFetch('/admin/apns');
      next.apns = apnsData?.configured ? 'ok' : 'unconfigured';
    } catch {
      next.apns = 'error';
    }

    try {
      const fcmData = await apiFetch('/admin/fcm');
      next.fcm = fcmData?.configured ? (fcmData?.ready ? 'ok' : 'error') : 'unconfigured';
    } catch {
      next.fcm = 'error';
    }

    try {
      const smtpData = await apiFetch('/admin/smtp');
      next.smtp = smtpData?.configured ? (smtpData?.ready ? 'ok' : 'error') : 'unconfigured';
    } catch {
      next.smtp = 'error';
    }

    try {
      const stripeData = await apiFetch('/admin/stripe');
      const sMode = stripeData?.active_mode || 'test';
      const sInfo = stripeData?.[sMode];
      if (!sInfo?.configured) {
        next.stripe = 'unconfigured';
      } else {
        next.stripe = sMode === 'live' ? 'ok' : 'stripe_test';
      }
    } catch {
      next.stripe = 'error';
    }

    setServices(prev => ({ ...prev, ...next }));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="service-status-bar">
      <StatusDot status={services.api}  tooltip="API" />
      <StatusDot status={services.mqtt} tooltip="MQTT" />
      <StatusDot status={services.apns} tooltip="iOS" />
      <StatusDot status={services.fcm}  tooltip="Android" />
      <StatusDot status={services.smtp}   tooltip="SMTP" />
      <StatusDot status={services.stripe === 'stripe_test' ? 'stripe_test' : services.stripe} tooltip="Stripe" />
    </div>
  );
}

// Alias de routes : /site couvre aussi /cms/*
const ROUTE_ALIASES = {
  '/site': ['/cms/'],
  '/boutique': ['/boutique/'],
};

function Sidebar({ user, onLogout, open, onClose }) {
  const { pathname } = useLocation();

  function isLinkActive(to, routerIsActive) {
    if (routerIsActive) return true;
    const aliases = ROUTE_ALIASES[to];
    if (aliases) return aliases.some(prefix => pathname.startsWith(prefix));
    return false;
  }

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar${open ? ' sidebar--open' : ''}`}>
        <div className="sidebar-logo">XamIoT Admin</div>

        <nav className="sidebar-nav">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `sidebar-link${isLinkActive(to, isActive) ? ' sidebar-link--active' : ''}`}
              onClick={onClose}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {user && (
            <div className="sidebar-user">{user.email}</div>
          )}
          <button className="btn secondary sidebar-logout" onClick={onLogout}>
            Déconnexion
          </button>
        </div>
      </aside>
    </>
  );
}

export default function App() {
  const nav = useNavigate();
  const [ready, setReady]       = useState(false);
  const [user, setUser]         = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (!t) { setReady(true); return; }
    apiFetch('/admin/me')
      .then((data) => { setUser(data); setReady(true); })
      .catch(() => {
        setToken('');
        setReady(true);
        nav('/login');
      });
  }, []);

  function logout() {
    setToken('');
    setUser(null);
    nav('/login');
  }

  if (!ready) return <div className="container">Chargement...</div>;

  const authed = !!getToken();

  if (!authed) {
    return (
      <Routes>
        <Route path="/*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar
        user={user}
        onLogout={logout}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="app-content">
        <div className="app-topstrip">
          <button
            className="sidebar-toggle btn secondary"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Menu"
          >
            ☰
          </button>
        </div>

        <Routes>
          <Route path="/dashboard"           element={<Dashboard />} />
          <Route path="/site"                element={<SiteInternet />} />
          <Route path="/cms/pages"           element={<SiteInternet />} />
          <Route path="/cms/pages/new"       element={<PageEditor />} />
          <Route path="/cms/pages/:id"       element={<PageEditor />} />
          <Route path="/cms/media"           element={<MediaLibrary />} />
          <Route path="/boutique"            element={<BoutiqueWrapper />} />
          <Route path="/boutique/produits"   element={<BoutiqueWrapper />} />
          <Route path="/boutique/produits/new"    element={<ProductEditor />} />
          <Route path="/boutique/produits/:id"    element={<ProductEditor />} />
          <Route path="/boutique/commandes"  element={<BoutiqueWrapper />} />
          <Route path="/support/tickets"          element={<TicketsManager />} />
          <Route path="/support/rma"              element={<RmaManager />} />
          <Route path="/users"               element={<Users />} />
          <Route path="/users/:id"           element={<UserDetails />} />
          <Route path="/esp"                 element={<EspDevices />} />
          <Route path="/rules"               element={<Rules />} />
          <Route path="/alerts"              element={<Alerts />} />
          <Route path="/notifications"       element={<Notifications />} />
          <Route path="/apns"                element={<Notifications />} />
          <Route path="/device-types"        element={<DeviceTypes />} />
          <Route path="/mqtt-frames/:typeId" element={<MqttFrames />} />
          <Route path="/settings"            element={<Settings />} />
          <Route path="/ota"                 element={<OtaUpdates />} />
          <Route path="/mqtt-logs"           element={<MqttLogs />} />
          <Route path="/audit"               element={<AuditLogs />} />
          <Route path="*"                    element={<Dashboard />} />
        </Routes>
      </div>

      {/* Onglet de statut flottant — centré en haut, overlay au-dessus du contenu */}
      <ServiceStatusBar />
    </div>
  );
}

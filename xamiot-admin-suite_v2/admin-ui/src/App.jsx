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
import Devices from './pages/Devices.jsx';
import Support from './pages/Support.jsx';
import Logs from './pages/Logs.jsx';
import PaymentLogs from './pages/PaymentLogs.jsx';
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
import CountriesManager from './pages/CountriesManager.jsx';

const NAV_LINKS = [
  { to: '/dashboard',       label: 'Dashboard' },
  { to: '/users',           label: 'Utilisateurs' },
  { to: '/boutique',        label: 'Boutique' },
  { to: '/support',         label: 'Support' },
  { to: '/devices',         label: 'Périphériques' },
  { to: '/device-types',    label: 'Types de périphériques' },
  { to: '/notifications',   label: 'Notifications' },
  { to: '/ota',             label: 'Mise à jour OTA' },
  { to: '/site',            label: 'Site internet' },
  { to: '/settings',        label: 'Paramètres' },
  { to: '/logs',            label: 'Journaux' },
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

function MetricItem({ icon, label, value, sub, tooltip }) {
  return (
    <div className="service-status-item" style={{ gap: 5 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span className="service-status-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
        {label}
      </span>
      <span style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{value ?? '—'}</span>
      {sub != null && (
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>/ {sub}</span>
      )}
      {tooltip && <span className="status-tooltip">{tooltip}</span>}
    </div>
  );
}

function ServiceStatusBar() {
  const [services, setServices] = useState({
    api:       'ok',
    mqtt:      'loading',
    apns:      'loading',
    fcm:       'loading',
    smtp:      'unconfigured',
    stripe:    'loading',
    ratelimit: 'loading',
  });
  const [metrics, setMetrics] = useState({ tickets: null, rma: null, orders: null });

  const refresh = useCallback(async () => {
    const next = { api: 'ok' };

    try {
      const statusData = await apiFetch('/admin/status');
      next.mqtt = statusData?.db === 'ok' ? 'ok' : 'error';
    } catch { next.mqtt = 'error'; }

    try {
      const apnsData = await apiFetch('/admin/apns');
      next.apns = apnsData?.configured ? 'ok' : 'unconfigured';
    } catch { next.apns = 'error'; }

    try {
      const fcmData = await apiFetch('/admin/fcm');
      next.fcm = fcmData?.configured ? (fcmData?.ready ? 'ok' : 'error') : 'unconfigured';
    } catch { next.fcm = 'error'; }

    try {
      const smtpData = await apiFetch('/admin/smtp');
      // healthy = config remplie + dernier envoi/verify connu OK
      // ready = config remplie (ancien comportement, garde-fou si healthy absent)
      if (!smtpData?.configured) next.smtp = 'unconfigured';
      else if (smtpData?.healthy === false) next.smtp = 'error';
      else if (smtpData?.healthy === true) next.smtp = 'ok';
      else next.smtp = smtpData?.ready ? 'ok' : 'error';
    } catch { next.smtp = 'error'; }

    try {
      const stripeData = await apiFetch('/admin/stripe');
      const sMode = stripeData?.active_mode || 'test';
      const sInfo = stripeData?.[sMode];
      next.stripe = !sInfo?.configured ? 'unconfigured' : sMode === 'live' ? 'ok' : 'stripe_test';
    } catch { next.stripe = 'error'; }

    try {
      const rlLogs = await apiFetch('/admin/rate-limit/logs');
      next.ratelimit = Array.isArray(rlLogs) && rlLogs.length > 0 ? 'error' : 'ok';
    } catch { next.ratelimit = 'error'; }

    setServices(prev => ({ ...prev, ...next }));

    // Métriques métier (tickets, RMA, commandes)
    try {
      const [tStats, rStats, oStats] = await Promise.all([
        apiFetch('/admin/tickets/stats'),
        apiFetch('/admin/rma/stats'),
        apiFetch('/admin/orders/stats'),
      ]);
      const ordersActive    = (oStats?.paid || 0) + (oStats?.processing || 0) + (oStats?.shipped || 0);
      const ordersDone      = (oStats?.completed || 0) + (oStats?.delivered || 0);
      setMetrics({
        tickets: { active: tStats?.active ?? 0, total: tStats?.total ?? 0 },
        rma:     { active: rStats?.active ?? 0, total: rStats?.total ?? 0 },
        orders:  { active: ordersActive, done: ordersDone },
      });
    } catch { /* métriques non critiques */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="service-status-bar">
      {/* Section services */}
      <div className="status-section">
        <StatusDot status={services.api}       tooltip="API" />
        <StatusDot status={services.mqtt}      tooltip="MQTT" />
        <StatusDot status={services.apns}      tooltip="iOS" />
        <StatusDot status={services.fcm}       tooltip="Android" />
        <StatusDot status={services.smtp}      tooltip="SMTP" />
        <StatusDot status={services.stripe === 'stripe_test' ? 'stripe_test' : services.stripe} tooltip="Stripe" />
        <StatusDot status={services.ratelimit} tooltip="Rate limit" />
      </div>

      <span className="status-divider" />

      {/* Section métriques métier */}
      <div className="status-section">
        <MetricItem
          icon="🎫"
          label="Tickets"
          value={metrics.tickets?.active ?? '…'}
          sub={metrics.tickets?.total ?? '…'}
          tooltip={`Tickets : ${metrics.tickets?.active ?? '?'} en cours (ouvert/en cours) sur ${metrics.tickets?.total ?? '?'} au total`}
        />
        <MetricItem
          icon="📦"
          label="RMA"
          value={metrics.rma?.active ?? '…'}
          sub={metrics.rma?.total ?? '…'}
          tooltip={`RMA : ${metrics.rma?.active ?? '?'} actives (en attente / approuvées / reçues) sur ${metrics.rma?.total ?? '?'} au total`}
        />
        <MetricItem
          icon="🛒"
          label="Commandes"
          value={`${metrics.orders?.active ?? '…'} en cours`}
          sub={`${metrics.orders?.done ?? '…'} terminées`}
          tooltip={`Commandes : ${metrics.orders?.active ?? '?'} en cours (payées / expédiées) — ${metrics.orders?.done ?? '?'} terminées`}
        />
      </div>
    </div>
  );
}

// Alias de routes : /site couvre aussi /cms/*, /support couvre tickets+rma, /devices couvre esp+rules+alerts
const ROUTE_ALIASES = {
  '/site':     ['/cms/', '/site'],
  '/boutique': ['/boutique/'],
  '/support':  ['/support/'],
  '/devices':  ['/esp', '/rules', '/alerts'],
  '/logs':     ['/mqtt-logs', '/audit'],
};

function Sidebar({ user, onLogout, open, onClose, logoUrl, logoHeight }) {
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
        <div className="sidebar-logo">
          {logoUrl
            ? <img src={logoUrl} alt="XamIoT" style={{ height: logoHeight, maxWidth: '100%', objectFit: 'contain', display: 'block', filter: 'brightness(0) invert(1)' }} />
            : 'XamIoT Admin'}
        </div>

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
  const [logoUrl, setLogoUrl]       = useState('');
  const [logoHeight, setLogoHeight] = useState(40);

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
    apiFetch('/admin/app-config')
      .then(cfg => {
        const map = Object.fromEntries((cfg || []).map(r => [r.key, r.value]));
        if (map.logo_url) setLogoUrl(map.logo_url);
        if (map.logo_height) setLogoHeight(parseInt(map.logo_height, 10) || 40);
      })
      .catch(() => {});
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
        logoUrl={logoUrl}
        logoHeight={logoHeight}
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
          <Route path="/boutique/pays"       element={<CountriesManager />} />
          <Route path="/orders"              element={<OrdersManager />} />
          <Route path="/support"             element={<Support />} />
          <Route path="/support/tickets"     element={<Support />} />
          <Route path="/support/rma"         element={<Support />} />
          <Route path="/users"               element={<Users />} />
          <Route path="/users/:id"           element={<UserDetails />} />
          <Route path="/devices"             element={<Devices />} />
          <Route path="/esp"                 element={<Devices />} />
          <Route path="/rules"               element={<Devices />} />
          <Route path="/alerts"              element={<Devices />} />
          <Route path="/notifications"       element={<Notifications />} />
          <Route path="/apns"                element={<Notifications />} />
          <Route path="/device-types"        element={<DeviceTypes />} />
          <Route path="/mqtt-frames/:typeId" element={<MqttFrames />} />
          <Route path="/settings"            element={<Settings />} />
          <Route path="/ota"                 element={<OtaUpdates />} />
          <Route path="/logs"                element={<Logs />} />
          <Route path="/mqtt-logs"           element={<Logs />} />
          <Route path="/audit"               element={<Logs />} />
          <Route path="*"                    element={<Dashboard />} />
        </Routes>
      </div>

      {/* Onglet de statut flottant — centré en haut, overlay au-dessus du contenu */}
      <ServiceStatusBar />
    </div>
  );
}

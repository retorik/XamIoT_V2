import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../api.js';

const ERROR_LABELS = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  account_inactive:    'Ce compte est inactif.',
  admin_required:      'Ce compte n\u2019a pas les droits administrateur.',
  too_many_requests:   'Trop de tentatives. Attendez quelques minutes avant de r\u00e9essayer.',
};

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr]           = useState('');
  const [loading, setLoading]   = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await adminLogin(email, password);
      nav('/dashboard');
    } catch (ex) {
      const code = ex?.data?.error || ex.message || '';
      setErr(ERROR_LABELS[code] || 'Une erreur est survenue. Veuillez r\u00e9essayer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f7f7f8',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div className="card">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <img src="/logo.png" alt="XamIoT" style={{ height: 72, marginBottom: 14 }} />
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>XamIoT Admin</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Espace réservé aux administrateurs.</div>
          </div>

          <form onSubmit={submit}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
                Email
              </label>
              <input
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@exemple.com"
                required
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
                Mot de passe
              </label>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {err && (
              <div style={{
                background: '#fee2e2',
                color: '#b91c1c',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                marginBottom: 14,
              }}>
                {err}
              </div>
            )}

            <button className="btn primary" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}


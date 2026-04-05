'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authLogin, authSignup, authResendActivation, authRequestPasswordReset } from '@/lib/api';
import { setToken, setUser, isAuthenticated, getUser, clearAuth } from '@/lib/auth';

type Tab = 'login' | 'signup';
type Status = 'idle' | 'loading' | 'success' | 'error' | 'verify';
type ResetStatus = 'idle' | 'loading' | 'sent' | 'error';

const T = {
  login: 'Se connecter', signup: 'Créer un compte',
  email: 'Email', password: 'Mot de passe', confirm: 'Confirmer le mot de passe',
  first_name: 'Prénom', last_name: 'Nom', phone: 'Téléphone (optionnel)',
  submit_login: 'Connexion', submit_signup: 'Créer mon compte',
  err_fields: 'Veuillez remplir tous les champs obligatoires.',
  err_match: 'Les mots de passe ne correspondent pas.',
  err_short: 'Le mot de passe doit contenir au moins 8 caractères.',
  err_invalid: 'Email ou mot de passe incorrect.',
  err_inactive: 'Votre compte n\'est pas encore activé. Vérifiez votre email ou renvoyez le lien.',
  err_exists: 'Un compte existe déjà avec cet email.',
  err_rate_limit: 'Trop de tentatives. Veuillez patienter quelques minutes.',
  err_generic: 'Une erreur est survenue. Vérifiez votre connexion et réessayez.',
  success_signup: 'Compte créé ! Un email de vérification a été envoyé à votre adresse.',
  resend: 'Renvoyer l\'email de vérification',
  resend_ok: 'Email renvoyé. Vérifiez votre boîte mail.',
};

export default function ComptePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('login');
  const [status, setStatus] = useState<Status>('idle');
  const [msg, setMsg] = useState('');
  const [mounted, setMounted] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<{ email: string; first_name?: string; last_name?: string } | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState<ResetStatus>('idle');
  const [resetMsg, setResetMsg] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPassword, setSPassword] = useState('');
  const [sConfirm, setSConfirm] = useState('');
  const [sFirstName, setSFirstName] = useState('');
  const [sLastName, setSLastName] = useState('');
  const [sPhone, setSPhone] = useState('');

  useEffect(() => {
    setMounted(true);
    if (isAuthenticated()) {
      const user = getUser();
      if (user) setLoggedInUser(user as any);
    }
  }, []);

  function handleLogout() {
    clearAuth();
    setLoggedInUser(null);
    setMounted(false);
    setTimeout(() => setMounted(true), 10);
  }

  function handleGoToCheckout() {
    router.push('/checkout');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { setMsg(T.err_fields); setStatus('error'); return; }
    setStatus('loading'); setMsg('');
    try {
      const data = await authLogin(email, password);
      setToken(data.token);
      setUser(data.user);
      setStatus('success');
      const pending = localStorage.getItem('xamiot_checkout_pending');
      setTimeout(() => router.push(pending ? '/checkout' : '/boutique'), 300);
    } catch (err: any) {
      setStatus('error');
      if (err?.error === 'account_inactive') setMsg(T.err_inactive);
      else if (err?.error === 'invalid_credentials') setMsg(T.err_invalid);
      else if (err?.error === 'auth' || err?.error === 'portal_login' || err?.error === 'global') setMsg(T.err_rate_limit);
      else setMsg(err?.message || T.err_generic);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!sEmail || !sPassword || !sFirstName || !sLastName) { setMsg(T.err_fields); setStatus('error'); return; }
    if (sPassword.length < 8) { setMsg(T.err_short); setStatus('error'); return; }
    if (sPassword !== sConfirm) { setMsg(T.err_match); setStatus('error'); return; }
    setStatus('loading'); setMsg('');
    try {
      await authSignup(sEmail, sPassword, sFirstName, sLastName, sPhone || undefined);
      setStatus('verify');
      setMsg(T.success_signup);
    } catch (err: any) {
      setStatus('error');
      if (err?.error === 'email_exists') setMsg(T.err_exists);
      else if (err?.error === 'auth' || err?.error === 'global') setMsg(T.err_rate_limit);
      else setMsg(err?.message || T.err_generic);
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail) return;
    setResetStatus('loading'); setResetMsg('');
    try {
      await authRequestPasswordReset(resetEmail);
      setResetStatus('sent');
      setResetMsg('Si un compte existe avec cet email, un lien de réinitialisation valable 15 minutes vous a été envoyé.');
    } catch {
      setResetStatus('sent'); // Volontaire : ne pas révéler si l'email existe
      setResetMsg('Si un compte existe avec cet email, un lien de réinitialisation valable 15 minutes vous a été envoyé.');
    }
  }

  async function handleResend() {
    try {
      await authResendActivation(sEmail || email);
      setMsg(T.resend_ok);
    } catch {
      setMsg(T.err_generic);
    }
  }

  const inputStyle = 'w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';
  const btnStyle = 'w-full py-3 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50';

  if (!mounted) return null;

  // ── État : connecté ─────────────────────────────────────────────────────
  if (loggedInUser) {
    const pending = typeof window !== 'undefined' && !!localStorage.getItem('xamiot_checkout_pending');
    const displayName = [loggedInUser.first_name, loggedInUser.last_name].filter(Boolean).join(' ') || loggedInUser.email;

    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold mb-1">Bonjour, {displayName} !</h1>
          <p className="text-gray-500 text-sm mb-6">{loggedInUser.email}</p>

          <div className="space-y-3">
            {pending && (
              <button
                onClick={handleGoToCheckout}
                className="w-full py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition"
              >
                Continuer ma commande →
              </button>
            )}
            <Link
              href="/boutique"
              className="block w-full py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition text-center"
            >
              Aller à la boutique
            </Link>
            <a
              href={process.env.NEXT_PUBLIC_PORTAL_URL || 'https://xamcli.holiceo.com'}
              className="block w-full py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition text-center text-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              Mon espace client (portail)
            </a>
            <button
              onClick={handleLogout}
              className="w-full py-2.5 text-sm text-red-500 hover:text-red-700 transition"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── État : non connecté ─────────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="flex mb-8 border-b border-gray-200">
        {(['login', 'signup'] as Tab[]).map(key => (
          <button key={key}
            onClick={() => { setTab(key); setStatus('idle'); setMsg(''); }}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${
              tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {T[key]}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`mb-6 p-4 rounded-lg text-sm ${
          status === 'success' || status === 'verify' ? 'bg-green-50 text-green-700 border border-green-200' :
          status === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700'
        }`}>
          {msg}
          {status === 'verify' && (
            <button onClick={handleResend} className="block mt-2 text-blue-600 underline text-xs">
              {T.resend}
            </button>
          )}
        </div>
      )}

      {tab === 'login' && !resetMode && (
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="email" placeholder={T.email} value={email} onChange={e => setEmail(e.target.value)}
            className={inputStyle} autoComplete="email" required />
          <input type="password" placeholder={T.password} value={password} onChange={e => setPassword(e.target.value)}
            className={inputStyle} autoComplete="current-password" required />
          <button type="submit" disabled={status === 'loading'} className={btnStyle}>
            {status === 'loading' ? '…' : T.submit_login}
          </button>
          <div className="text-center">
            <button type="button" onClick={() => { setResetMode(true); setResetEmail(email); setResetStatus('idle'); setResetMsg(''); }}
              className="text-sm text-blue-600 hover:underline">
              Mot de passe oublié ?
            </button>
          </div>
        </form>
      )}

      {tab === 'login' && resetMode && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-800">Réinitialiser le mot de passe</h3>
          {resetStatus === 'sent' ? (
            <div className="p-4 rounded-lg bg-green-50 text-green-700 border border-green-200 text-sm">
              {resetMsg}
            </div>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <p className="text-sm text-gray-500">Entrez votre adresse email et nous vous enverrons un lien valable 15 minutes.</p>
              <input type="email" placeholder={T.email} value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                className={inputStyle} autoComplete="email" required />
              {resetMsg && <p className="text-sm text-red-600">{resetMsg}</p>}
              <button type="submit" disabled={resetStatus === 'loading'} className={btnStyle}>
                {resetStatus === 'loading' ? '…' : 'Envoyer le lien'}
              </button>
            </form>
          )}
          <div className="text-center">
            <button type="button" onClick={() => setResetMode(false)} className="text-sm text-gray-500 hover:underline">
              ← Retour à la connexion
            </button>
          </div>
        </div>
      )}

      {tab === 'signup' && status !== 'verify' && (
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder={T.first_name} value={sFirstName} onChange={e => setSFirstName(e.target.value)}
              className={inputStyle} required />
            <input placeholder={T.last_name} value={sLastName} onChange={e => setSLastName(e.target.value)}
              className={inputStyle} required />
          </div>
          <input type="email" placeholder={T.email} value={sEmail} onChange={e => setSEmail(e.target.value)}
            className={inputStyle} autoComplete="email" required />
          <input placeholder={T.phone} value={sPhone} onChange={e => setSPhone(e.target.value)}
            className={inputStyle} />
          <input type="password" placeholder={T.password} value={sPassword} onChange={e => setSPassword(e.target.value)}
            className={inputStyle} autoComplete="new-password" required minLength={8} />
          <input type="password" placeholder={T.confirm} value={sConfirm} onChange={e => setSConfirm(e.target.value)}
            className={inputStyle} autoComplete="new-password" required />
          <button type="submit" disabled={status === 'loading'} className={btnStyle}>
            {status === 'loading' ? '…' : T.submit_signup}
          </button>
        </form>
      )}
    </div>
  );
}

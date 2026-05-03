'use client';

import { Suspense, useState, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import LangSelector from '@/components/LangSelector';
import { useLang } from '@/lib/useLang';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';

const T = {
  fr: {
    subtitle: 'Connectez-vous à votre espace client',
    email: 'Adresse e-mail',
    email_placeholder: 'vous@exemple.com',
    password: 'Mot de passe',
    password_placeholder: '••••••••',
    submit: 'Se connecter',
    submitting: 'Connexion en cours…',
    forgot: 'Mot de passe oublié ?',
    delete_account: 'Supprimer mon compte',
    idle: 'Vous avez été déconnecté pour inactivité.',
    error_credentials: 'Identifiants invalides',
    error_generic: 'Une erreur est survenue. Veuillez réessayer.',
    error_inactive: 'Votre compte n\'est pas encore activé. Vérifiez votre boîte mail (et vos spams) pour le lien d\'activation.',
    resend_activation: 'Renvoyer l\'email d\'activation',
    resend_sending: 'Envoi…',
    resend_sent: 'Si un compte existe avec cet email, un nouveau lien d\'activation vient d\'être envoyé.',
    reset_title: 'Réinitialiser le mot de passe',
    reset_desc: 'Le lien envoyé par email est valable 15 minutes et à usage unique.',
    reset_sent: 'Si un compte existe avec cet email, un lien de réinitialisation vous a été envoyé.',
    reset_submit: 'Envoyer le lien',
    reset_submitting: 'Envoi…',
    back: '← Retour à la connexion',
  },
  en: {
    subtitle: 'Sign in to your customer portal',
    email: 'Email address',
    email_placeholder: 'you@example.com',
    password: 'Password',
    password_placeholder: '••••••••',
    submit: 'Sign in',
    submitting: 'Signing in…',
    forgot: 'Forgot password?',
    delete_account: 'Delete my account',
    idle: 'You were signed out due to inactivity.',
    error_credentials: 'Invalid credentials',
    error_generic: 'An error occurred. Please try again.',
    error_inactive: 'Your account is not yet activated. Please check your inbox (and spam folder) for the activation link.',
    resend_activation: 'Resend activation email',
    resend_sending: 'Sending…',
    resend_sent: 'If an account exists with this email, a new activation link has just been sent.',
    reset_title: 'Reset password',
    reset_desc: 'The link sent by email is valid for 15 minutes and can only be used once.',
    reset_sent: 'If an account exists with this email, a reset link has been sent.',
    reset_submit: 'Send link',
    reset_submitting: 'Sending…',
    back: '← Back to sign in',
  },
  es: {
    subtitle: 'Inicie sesión en su portal de cliente',
    email: 'Correo electrónico',
    email_placeholder: 'usted@ejemplo.com',
    password: 'Contraseña',
    password_placeholder: '••••••••',
    submit: 'Iniciar sesión',
    submitting: 'Iniciando sesión…',
    forgot: '¿Olvidó su contraseña?',
    delete_account: 'Eliminar mi cuenta',
    idle: 'Se cerró su sesión por inactividad.',
    error_credentials: 'Credenciales inválidas',
    error_generic: 'Se produjo un error. Por favor, inténtelo de nuevo.',
    error_inactive: 'Su cuenta aún no está activada. Compruebe su bandeja de entrada (y la carpeta de spam) para encontrar el enlace de activación.',
    resend_activation: 'Reenviar correo de activación',
    resend_sending: 'Enviando…',
    resend_sent: 'Si existe una cuenta con este correo, se acaba de enviar un nuevo enlace de activación.',
    reset_title: 'Restablecer contraseña',
    reset_desc: 'El enlace enviado por correo es válido 15 minutos y de un solo uso.',
    reset_sent: 'Si existe una cuenta con este correo, se ha enviado un enlace de restablecimiento.',
    reset_submit: 'Enviar enlace',
    reset_submitting: 'Enviando…',
    back: '← Volver al inicio de sesión',
  },
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const idleLogout = searchParams.get('reason') === 'idle';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [accountInactive, setAccountInactive] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  const lang = useLang();
  const t = T[lang];

  async function handleResetRequest(e: FormEvent) {
    e.preventDefault();
    setResetLoading(true);
    try {
      await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
    } finally {
      setResetLoading(false);
      setResetSent(true);
    }
  }

  async function handleResendActivation() {
    if (!email || resendLoading) return;
    setResendLoading(true);
    try {
      await fetch(`${API_BASE}/auth/resend-activation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } finally {
      setResendLoading(false);
      setResendSent(true);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAccountInactive(false);
    setResendSent(false);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'account_inactive') {
          setAccountInactive(true);
          setError('');
        } else {
          setError(data.error === 'invalid_credentials' || !data.error ? t.error_credentials : t.error_credentials);
        }
        return;
      }

      const data = await res.json();
      const token: string = data.token;

      localStorage.setItem('token', token);
      document.cookie = `token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
      localStorage.setItem('user', JSON.stringify(data.user));

      window.location.href = '/dashboard';
    } catch {
      setError(t.error_generic);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="absolute top-4 right-4">
        <LangSelector currentLang={lang} dropUp={false} large />
      </div>
      <div className="w-full max-w-md px-4">
        {/* Logo / titre */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">XamIoT Portal</h1>
          <p className="text-slate-500 mt-1 text-sm">{t.subtitle}</p>
        </div>

        {/* Carte formulaire */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          {!resetMode ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t.email}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition text-sm"
                  placeholder={t.email_placeholder}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t.password}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition text-sm"
                  placeholder={t.password_placeholder}
                />
              </div>

              {idleLogout && !error && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                  {t.idle}
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {accountInactive && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-3">
                  <p>{t.error_inactive}</p>
                  {resendSent ? (
                    <p className="text-amber-700">{t.resend_sent}</p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendActivation}
                      disabled={resendLoading}
                      className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-medium rounded-md transition text-sm"
                    >
                      {resendLoading ? t.resend_sending : t.resend_activation}
                    </button>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-medium rounded-lg transition text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
              >
                {loading ? t.submitting : t.submit}
              </button>

              <div className="text-center space-y-2">
                <button type="button" onClick={() => { setResetMode(true); setResetEmail(email); setResetSent(false); }}
                  className="text-sm text-brand-600 hover:underline block w-full">
                  {t.forgot}
                </button>
                <Link href="/supprimer-compte" className="text-xs text-red-500 hover:underline block">
                  {t.delete_account}
                </Link>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900 mb-1">{t.reset_title}</h2>
                <p className="text-sm text-slate-500">{t.reset_desc}</p>
              </div>

              {resetSent ? (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                  {t.reset_sent}
                </div>
              ) : (
                <form onSubmit={handleResetRequest} className="space-y-4">
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition text-sm"
                    placeholder={t.email_placeholder}
                  />
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-medium rounded-lg transition text-sm"
                  >
                    {resetLoading ? t.reset_submitting : t.reset_submit}
                  </button>
                </form>
              )}

              <div className="text-center">
                <button type="button" onClick={() => setResetMode(false)}
                  className="text-sm text-slate-500 hover:underline">
                  {t.back}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

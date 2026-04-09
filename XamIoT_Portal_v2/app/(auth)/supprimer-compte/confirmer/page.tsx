'use client';

import { Suspense, useState, useEffect, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import LangSelector from '@/components/LangSelector';
import { useLang } from '@/lib/useLang';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';

const T = {
  fr: {
    title: 'Confirmer la suppression',
    subtitle: 'Saisissez le code reçu par e-mail',
    email: 'Adresse e-mail',
    email_placeholder: 'vous@exemple.com',
    code: 'Code de vérification (8 caractères)',
    code_placeholder: 'ABCD1234',
    submit: 'Supprimer définitivement mon compte',
    submitting: 'Suppression en cours…',
    error_invalid: 'Code invalide ou expiré. Recommencez depuis le début.',
    error_generic: 'Une erreur est survenue. Veuillez réessayer.',
    success_title: 'Compte supprimé',
    success_desc: 'Votre compte et toutes vos données ont été définitivement supprimés.',
    back_login: 'Retour à la connexion',
    back_request: '← Recommencer',
  },
  en: {
    title: 'Confirm deletion',
    subtitle: 'Enter the code received by email',
    email: 'Email address',
    email_placeholder: 'you@example.com',
    code: 'Verification code (8 characters)',
    code_placeholder: 'ABCD1234',
    submit: 'Permanently delete my account',
    submitting: 'Deleting…',
    error_invalid: 'Invalid or expired code. Please start over.',
    error_generic: 'An error occurred. Please try again.',
    success_title: 'Account deleted',
    success_desc: 'Your account and all your data have been permanently deleted.',
    back_login: 'Back to sign in',
    back_request: '← Start over',
  },
  es: {
    title: 'Confirmar eliminación',
    subtitle: 'Introduzca el código recibido por correo',
    email: 'Correo electrónico',
    email_placeholder: 'usted@ejemplo.com',
    code: 'Código de verificación (8 caracteres)',
    code_placeholder: 'ABCD1234',
    submit: 'Eliminar permanentemente mi cuenta',
    submitting: 'Eliminando…',
    error_invalid: 'Código inválido o caducado. Vuelva a empezar.',
    error_generic: 'Se produjo un error. Por favor, inténtelo de nuevo.',
    success_title: 'Cuenta eliminada',
    success_desc: 'Su cuenta y todos sus datos han sido eliminados permanentemente.',
    back_login: 'Volver al inicio de sesión',
    back_request: '← Volver a empezar',
  },
};

export default function ConfirmDeletePage() {
  return (
    <Suspense>
      <ConfirmDeleteForm />
    </Suspense>
  );
}

function ConfirmDeleteForm() {
  const searchParams = useSearchParams();
  const lang = useLang();
  const t = T[lang];

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const emailParam = searchParams.get('email') || '';
    const codeParam = searchParams.get('code') || '';
    if (emailParam) setEmail(decodeURIComponent(emailParam));
    if (codeParam) setCode(decodeURIComponent(codeParam).toUpperCase());
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/confirm-account-deletion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim().toUpperCase() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error === 'invalid_code' ? t.error_invalid : t.error_generic);
        return;
      }

      setDone(true);
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
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
          <p className="text-slate-500 mt-1 text-sm">{t.subtitle}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          {done ? (
            <div className="space-y-5 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mx-auto">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-slate-900">{t.success_title}</p>
                <p className="text-sm text-slate-500 mt-1">{t.success_desc}</p>
              </div>
              <Link href="/login" className="block text-sm text-brand-600 hover:underline">
                {t.back_login}
              </Link>
            </div>
          ) : (
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
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition text-sm"
                  placeholder={t.email_placeholder}
                />
              </div>

              <div>
                <label htmlFor="code" className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t.code}
                </label>
                <input
                  id="code"
                  type="text"
                  autoComplete="one-time-code"
                  required
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition text-sm font-mono tracking-widest text-center text-lg uppercase"
                  placeholder={t.code_placeholder}
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim() || code.length !== 8}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-medium rounded-lg transition text-sm focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
              >
                {loading ? t.submitting : t.submit}
              </button>

              <div className="text-center">
                <Link href="/supprimer-compte" className="text-sm text-slate-500 hover:underline">
                  {t.back_request}
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

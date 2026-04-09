'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import LangSelector from '@/components/LangSelector';
import { useLang } from '@/lib/useLang';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';

const T = {
  fr: {
    title: 'Supprimer mon compte',
    subtitle: 'Saisir votre adresse e-mail pour continuer',
    warning: 'La suppression est définitive. Toutes vos données seront effacées : appareils, règles d\'alerte, historique, commandes, adresses et notifications.',
    email: 'Adresse e-mail',
    email_placeholder: 'vous@exemple.com',
    submit: 'Envoyer le code de vérification',
    submitting: 'Envoi en cours…',
    sent_title: 'Code envoyé',
    sent_desc: (email: string) => `Un code de vérification à 8 caractères a été envoyé à ${email}. Saisissez-le sur la page suivante ou cliquez sur le lien dans l'e-mail.`,
    sent_cta: 'Saisir le code →',
    error_generic: 'Une erreur est survenue. Veuillez réessayer.',
    back: '← Retour à la connexion',
  },
  en: {
    title: 'Delete my account',
    subtitle: 'Enter your email address to continue',
    warning: 'Deletion is permanent. All your data will be erased: devices, alert rules, history, orders, addresses and notifications.',
    email: 'Email address',
    email_placeholder: 'you@example.com',
    submit: 'Send verification code',
    submitting: 'Sending…',
    sent_title: 'Code sent',
    sent_desc: (email: string) => `An 8-character verification code has been sent to ${email}. Enter it on the next page or click the link in the email.`,
    sent_cta: 'Enter the code →',
    error_generic: 'An error occurred. Please try again.',
    back: '← Back to sign in',
  },
  es: {
    title: 'Eliminar mi cuenta',
    subtitle: 'Introduzca su dirección de correo electrónico para continuar',
    warning: 'La eliminación es permanente. Todos sus datos serán borrados: dispositivos, reglas de alerta, historial, pedidos, direcciones y notificaciones.',
    email: 'Correo electrónico',
    email_placeholder: 'usted@ejemplo.com',
    submit: 'Enviar código de verificación',
    submitting: 'Enviando…',
    sent_title: 'Código enviado',
    sent_desc: (email: string) => `Se ha enviado un código de verificación de 8 caracteres a ${email}. Introdúzcalo en la página siguiente o haga clic en el enlace del correo.`,
    sent_cta: 'Introducir el código →',
    error_generic: 'Se produjo un error. Por favor, inténtelo de nuevo.',
    back: '← Volver al inicio de sesión',
  },
};

export default function DeleteAccountPage() {
  const lang = useLang();
  const t = T[lang];

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await fetch(`${API_BASE}/auth/request-account-deletion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Réponse toujours neutre côté API (évite énumération d'emails)
      setSent(true);
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
          {sent ? (
            <div className="space-y-5">
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <p className="font-semibold mb-1">{t.sent_title}</p>
                <p>{t.sent_desc(email)}</p>
              </div>
              <Link
                href={`/supprimer-compte/confirmer?email=${encodeURIComponent(email)}`}
                className="block w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition text-sm text-center"
              >
                {t.sent_cta}
              </Link>
              <div className="text-center">
                <Link href="/login" className="text-sm text-slate-500 hover:underline">{t.back}</Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {t.warning}
              </div>

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

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-medium rounded-lg transition text-sm focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
              >
                {loading ? t.submitting : t.submit}
              </button>

              <div className="text-center">
                <Link href="/login" className="text-sm text-slate-500 hover:underline">{t.back}</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

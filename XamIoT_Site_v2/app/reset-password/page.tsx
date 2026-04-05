'use client';

import { Suspense, useState, FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { authResetPassword } from '@/lib/api';

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const inputStyle = 'w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';
  const btnStyle = 'w-full py-3 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    try {
      await authResetPassword(token, password);
      setSuccess(true);
      setTimeout(() => router.push('/compte'), 3000);
    } catch (err: any) {
      setError(
        err?.error === 'invalid_or_expired_token'
          ? 'Ce lien est invalide ou expiré (valable 15 min, usage unique). Faites une nouvelle demande.'
          : 'Une erreur est survenue. Veuillez réessayer.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <h1 className="text-xl font-bold mb-1 text-gray-900">Nouveau mot de passe</h1>
        <p className="text-gray-500 text-sm mb-6">Le lien est valable 15 minutes et à usage unique.</p>

        {!token ? (
          <div className="p-4 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm">
            Lien invalide. Faites une nouvelle demande depuis la page de connexion.
          </div>
        ) : success ? (
          <div className="p-4 rounded-lg bg-green-50 text-green-700 border border-green-200 text-sm">
            Mot de passe modifié avec succès. Redirection vers la connexion…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="password" placeholder="Nouveau mot de passe (8 car. min.)" value={password}
              onChange={e => setPassword(e.target.value)} className={inputStyle} autoComplete="new-password" required minLength={8} />
            <input type="password" placeholder="Confirmer le mot de passe" value={confirm}
              onChange={e => setConfirm(e.target.value)} className={inputStyle} autoComplete="new-password" required />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className={btnStyle}>
              {loading ? '…' : 'Définir le nouveau mot de passe'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

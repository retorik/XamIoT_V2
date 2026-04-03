'use client';

import { useEffect, useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/api';

interface UserProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  is_active: boolean;
  activated_at: string | null;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Édition profil
  const [editMode, setEditMode] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: string; text: string } | null>(null);

  // Changement mot de passe
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => {
    apiFetch<UserProfile>('/me/profile')
      .then((data) => {
        setProfile(data);
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setPhone(data.phone || '');
      })
      .catch(() => setError('Impossible de charger votre profil.'))
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileSaving(true); setProfileMsg(null);
    try {
      const data = await apiFetch<UserProfile>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ first_name: firstName, last_name: lastName, phone }),
      });
      setProfile(data);
      setEditMode(false);
      setProfileMsg({ type: 'success', text: 'Profil mis à jour.' });
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error || 'Erreur de sauvegarde.';
      setProfileMsg({ type: 'error', text: msg });
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwdMsg(null);
    if (newPassword.length < 8) {
      setPwdMsg({ type: 'error', text: 'Le mot de passe doit contenir au moins 8 caractères.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas.' });
      return;
    }
    setPwdSaving(true);
    try {
      await apiFetch('/me/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPwdMsg({ type: 'success', text: 'Mot de passe modifié avec succès.' });
    } catch (err: unknown) {
      const errData = err as { data?: { error?: string } };
      const msg = errData?.data?.error === 'wrong_password' ? 'Mot de passe actuel incorrect.' : 'Erreur lors du changement.';
      setPwdMsg({ type: 'error', text: msg });
    } finally {
      setPwdSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Mon profil</h1>
        <p className="text-slate-500 text-sm mt-1">Informations de votre compte</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Informations du profil */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Informations du compte</h2>
          {!editMode && profile && (
            <button onClick={() => setEditMode(true)}
              className="text-sm text-brand-600 hover:text-brand-800 font-medium">
              Modifier
            </button>
          )}
        </div>

        {profileMsg && (
          <div className={`mb-4 rounded-lg px-3 py-2 text-xs ${profileMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {profileMsg.text}
          </div>
        )}

        {editMode ? (
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prénom</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" placeholder="+33 6 12 34 56 78" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={profile?.email || ''} disabled
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-400 cursor-not-allowed" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={profileSaving}
                className="px-4 py-2.5 bg-brand-600 text-white font-medium rounded-lg text-sm disabled:bg-slate-200 disabled:text-slate-400 transition">
                {profileSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button type="button" onClick={() => {
                setEditMode(false);
                setFirstName(profile?.first_name || '');
                setLastName(profile?.last_name || '');
                setPhone(profile?.phone || '');
              }} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm">
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <dl className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <dt className="text-sm text-slate-500">Prénom</dt>
              <dd className="text-sm font-medium text-slate-900">{profile?.first_name || '—'}</dd>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <dt className="text-sm text-slate-500">Nom</dt>
              <dd className="text-sm font-medium text-slate-900">{profile?.last_name || '—'}</dd>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <dt className="text-sm text-slate-500">Téléphone</dt>
              <dd className="text-sm font-medium text-slate-900">{profile?.phone || '—'}</dd>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <dt className="text-sm text-slate-500">Email</dt>
              <dd className="text-sm font-medium text-slate-900">{profile?.email || '—'}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-sm text-slate-500">Membre depuis</dt>
              <dd className="text-sm font-medium text-slate-900">
                {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* Changement de mot de passe */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Changer le mot de passe</h2>

        {pwdMsg && (
          <div className={`mb-4 rounded-lg px-3 py-2 text-xs ${pwdMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {pwdMsg.text}
          </div>
        )}

        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Mot de passe actuel</label>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" placeholder="••••••••" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nouveau mot de passe</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" placeholder="••••••••" required minLength={8} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmer</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" placeholder="••••••••" required />
          </div>
          <button type="submit" disabled={pwdSaving || !currentPassword || !newPassword || !confirmPassword}
            className="px-4 py-2.5 bg-brand-600 text-white font-medium rounded-lg text-sm disabled:bg-slate-200 disabled:text-slate-400 transition">
            {pwdSaving ? 'Modification…' : 'Mettre à jour le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}

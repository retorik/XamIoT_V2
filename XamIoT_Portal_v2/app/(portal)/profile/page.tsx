'use client';

import { useEffect, useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/api';
import { useLang } from '@/lib/useLang';

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

const T = {
  fr: {
    title: 'Mon profil', subtitle: 'Informations de votre compte',
    account_info: 'Informations du compte', edit: 'Modifier',
    first_name: 'Prénom', last_name: 'Nom', phone: 'Téléphone', email: 'Email',
    member_since: 'Membre depuis',
    save: 'Enregistrer', saving: 'Enregistrement…', cancel: 'Annuler',
    profile_saved: 'Profil mis à jour.', error_save: 'Erreur de sauvegarde.',
    change_pwd: 'Changer le mot de passe',
    current_pwd: 'Mot de passe actuel', new_pwd: 'Nouveau mot de passe', confirm_pwd: 'Confirmer',
    update_pwd: 'Mettre à jour le mot de passe', updating: 'Modification…',
    pwd_short: 'Le mot de passe doit contenir au moins 8 caractères.',
    pwd_match: 'Les mots de passe ne correspondent pas.',
    pwd_wrong: 'Mot de passe actuel incorrect.',
    pwd_updated: 'Mot de passe modifié avec succès.',
    error_profile: 'Impossible de charger votre profil.',
    error_change: 'Erreur lors du changement.',
  },
  en: {
    title: 'My profile', subtitle: 'Your account information',
    account_info: 'Account information', edit: 'Edit',
    first_name: 'First name', last_name: 'Last name', phone: 'Phone', email: 'Email',
    member_since: 'Member since',
    save: 'Save', saving: 'Saving…', cancel: 'Cancel',
    profile_saved: 'Profile updated.', error_save: 'Error saving.',
    change_pwd: 'Change password',
    current_pwd: 'Current password', new_pwd: 'New password', confirm_pwd: 'Confirm',
    update_pwd: 'Update password', updating: 'Updating…',
    pwd_short: 'Password must be at least 8 characters.',
    pwd_match: 'Passwords do not match.',
    pwd_wrong: 'Incorrect current password.',
    pwd_updated: 'Password updated successfully.',
    error_profile: 'Unable to load your profile.',
    error_change: 'Error changing password.',
  },
  es: {
    title: 'Mi perfil', subtitle: 'Información de su cuenta',
    account_info: 'Información de cuenta', edit: 'Editar',
    first_name: 'Nombre', last_name: 'Apellido', phone: 'Teléfono', email: 'Email',
    member_since: 'Miembro desde',
    save: 'Guardar', saving: 'Guardando…', cancel: 'Cancelar',
    profile_saved: 'Perfil actualizado.', error_save: 'Error al guardar.',
    change_pwd: 'Cambiar contraseña',
    current_pwd: 'Contraseña actual', new_pwd: 'Nueva contraseña', confirm_pwd: 'Confirmar',
    update_pwd: 'Actualizar contraseña', updating: 'Actualizando…',
    pwd_short: 'La contraseña debe tener al menos 8 caracteres.',
    pwd_match: 'Las contraseñas no coinciden.',
    pwd_wrong: 'Contraseña actual incorrecta.',
    pwd_updated: 'Contraseña actualizada con éxito.',
    error_profile: 'No se puede cargar su perfil.',
    error_change: 'Error al cambiar la contraseña.',
  },
};

export default function ProfilePage() {
  const lang = useLang();
  const t = T[lang];

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: string; text: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: string; text: string } | null>(null);

  const dateLocale = lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'fr-FR';

  useEffect(() => {
    apiFetch<UserProfile>('/me/profile')
      .then((data) => {
        setProfile(data);
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setPhone(data.phone || '');
      })
      .catch(() => setError(t.error_profile))
      .finally(() => setLoading(false));
  }, [t.error_profile]);

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
      setProfileMsg({ type: 'success', text: t.profile_saved });
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error || t.error_save;
      setProfileMsg({ type: 'error', text: msg });
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwdMsg(null);
    if (newPassword.length < 8) { setPwdMsg({ type: 'error', text: t.pwd_short }); return; }
    if (newPassword !== confirmPassword) { setPwdMsg({ type: 'error', text: t.pwd_match }); return; }
    setPwdSaving(true);
    try {
      await apiFetch('/me/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPwdMsg({ type: 'success', text: t.pwd_updated });
    } catch (err: unknown) {
      const errData = err as { data?: { error?: string } };
      const msg = errData?.data?.error === 'wrong_password' ? t.pwd_wrong : t.error_change;
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
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.subtitle}</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">{t.account_info}</h2>
          {!editMode && profile && (
            <button onClick={() => setEditMode(true)} className="text-sm text-brand-600 hover:text-brand-800 font-medium">
              {t.edit}
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
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.first_name}</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.last_name}</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.phone}</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" placeholder="+33 6 12 34 56 78" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.email}</label>
              <input type="email" value={profile?.email || ''} disabled
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-400 cursor-not-allowed" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={profileSaving}
                className="px-4 py-2.5 bg-brand-600 text-white font-medium rounded-lg text-sm disabled:bg-slate-200 disabled:text-slate-400 transition">
                {profileSaving ? t.saving : t.save}
              </button>
              <button type="button" onClick={() => {
                setEditMode(false);
                setFirstName(profile?.first_name || '');
                setLastName(profile?.last_name || '');
                setPhone(profile?.phone || '');
              }} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm">
                {t.cancel}
              </button>
            </div>
          </form>
        ) : (
          <dl className="space-y-3">
            {[
              { label: t.first_name, value: profile?.first_name },
              { label: t.last_name, value: profile?.last_name },
              { label: t.phone, value: profile?.phone },
              { label: t.email, value: profile?.email },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-slate-100">
                <dt className="text-sm text-slate-500">{label}</dt>
                <dd className="text-sm font-medium text-slate-900">{value || '—'}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between py-2">
              <dt className="text-sm text-slate-500">{t.member_since}</dt>
              <dd className="text-sm font-medium text-slate-900">
                {profile?.created_at ? new Date(profile.created_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">{t.change_pwd}</h2>

        {pwdMsg && (
          <div className={`mb-4 rounded-lg px-3 py-2 text-xs ${pwdMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {pwdMsg.text}
          </div>
        )}

        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.current_pwd}</label>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" placeholder="••••••••" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.new_pwd}</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" placeholder="••••••••" required minLength={8} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.confirm_pwd}</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" placeholder="••••••••" required />
          </div>
          <button type="submit" disabled={pwdSaving || !currentPassword || !newPassword || !confirmPassword}
            className="px-4 py-2.5 bg-brand-600 text-white font-medium rounded-lg text-sm disabled:bg-slate-200 disabled:text-slate-400 transition">
            {pwdSaving ? t.updating : t.update_pwd}
          </button>
        </form>
      </div>
    </div>
  );
}

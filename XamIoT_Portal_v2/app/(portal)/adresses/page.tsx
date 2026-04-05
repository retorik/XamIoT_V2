'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';

interface Address {
  id: string;
  label: string | null;
  type: 'shipping' | 'billing';
  is_default: boolean;
  first_name: string;
  last_name: string;
  company: string | null;
  line1: string;
  line2: string | null;
  postal_code: string;
  city: string;
  region: string | null;
  country_code: string;
  country_name: string | null;
  phone: string | null;
  created_at: string;
}

interface Country {
  code: string;
  name: string;
}

const TYPE_LABELS: Record<string, string> = {
  shipping: 'Livraison',
  billing: 'Facturation',
};

const emptyForm = () => ({
  label: '',
  type: 'shipping' as 'shipping' | 'billing',
  is_default: false,
  first_name: '',
  last_name: '',
  company: '',
  line1: '',
  line2: '',
  postal_code: '',
  city: '',
  region: '',
  country_code: 'FR',
  phone: '',
});

export default function AdressesPage() {
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    loadAddresses();
    loadCountries();
  }, []);

  async function loadAddresses() {
    setLoading(true);
    try {
      const data = await apiFetch<Address[]>('/me/addresses');
      setAddresses(data);
    } catch {
      setError('Impossible de charger vos adresses.');
    } finally {
      setLoading(false);
    }
  }

  async function loadCountries() {
    try {
      const data = await apiFetch<Country[]>('/public/countries?lang=fr');
      setCountries(data);
    } catch { /* fallback : pas de liste pays */ }
  }

  function openNew() {
    setForm(emptyForm());
    setEditId(null);
    setShowForm(true);
    setError(''); setSuccess('');
  }

  function openEdit(addr: Address) {
    setForm({
      label: addr.label || '',
      type: addr.type,
      is_default: addr.is_default,
      first_name: addr.first_name,
      last_name: addr.last_name,
      company: addr.company || '',
      line1: addr.line1,
      line2: addr.line2 || '',
      postal_code: addr.postal_code,
      city: addr.city,
      region: addr.region || '',
      country_code: addr.country_code,
      phone: addr.phone || '',
    });
    setEditId(addr.id);
    setShowForm(true);
    setError(''); setSuccess('');
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      const body = {
        ...form,
        label: form.label || null,
        company: form.company || null,
        line2: form.line2 || null,
        region: form.region || null,
        phone: form.phone || null,
      };
      if (editId) {
        await apiFetch(`/me/addresses/${editId}`, { method: 'PATCH', body: JSON.stringify(body) });
        setSuccess('Adresse mise à jour.');
      } else {
        await apiFetch('/me/addresses', { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Adresse ajoutée.');
      }
      closeForm();
      loadAddresses();
    } catch (err: any) {
      setError(err?.data?.error || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette adresse ?')) return;
    try {
      await apiFetch(`/me/addresses/${id}`, { method: 'DELETE' });
      setSuccess('Adresse supprimée.');
      loadAddresses();
    } catch {
      setError('Erreur lors de la suppression.');
    }
  }

  const upd = (field: string, val: any) => setForm(f => ({ ...f, [field]: val }));

  const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none';

  const shippingAddresses = addresses.filter(a => a.type === 'shipping');
  const billingAddresses = addresses.filter(a => a.type === 'billing');

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mes adresses</h1>
          <p className="text-slate-500 text-sm mt-1">Adresses de livraison et de facturation</p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2.5 bg-brand-600 text-white font-medium rounded-lg text-sm hover:bg-brand-700 transition">
          + Ajouter
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{success}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Adresses livraison */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Livraison</h2>
            {shippingAddresses.length === 0 ? (
              <p className="text-slate-400 text-sm py-4">Aucune adresse de livraison enregistrée.</p>
            ) : (
              <div className="space-y-3">
                {shippingAddresses.map(addr => (
                  <AddressCard key={addr.id} addr={addr} onEdit={() => openEdit(addr)} onDelete={() => handleDelete(addr.id)} />
                ))}
              </div>
            )}
          </div>

          {/* Adresses facturation */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Facturation</h2>
            {billingAddresses.length === 0 ? (
              <p className="text-slate-400 text-sm py-4">Aucune adresse de facturation enregistrée.</p>
            ) : (
              <div className="space-y-3">
                {billingAddresses.map(addr => (
                  <AddressCard key={addr.id} addr={addr} onEdit={() => openEdit(addr)} onDelete={() => handleDelete(addr.id)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal formulaire */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">{editId ? 'Modifier l\'adresse' : 'Nouvelle adresse'}</h2>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                  <select value={form.type} onChange={e => upd('type', e.target.value)} className={inputCls}>
                    <option value="shipping">Livraison</option>
                    <option value="billing">Facturation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Libellé (optionnel)</label>
                  <input value={form.label} onChange={e => upd('label', e.target.value)} className={inputCls} placeholder="Ex: Bureau, Domicile" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Prénom *</label>
                  <input value={form.first_name} onChange={e => upd('first_name', e.target.value)} className={inputCls} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nom *</label>
                  <input value={form.last_name} onChange={e => upd('last_name', e.target.value)} className={inputCls} required />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Société</label>
                <input value={form.company} onChange={e => upd('company', e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Adresse ligne 1 *</label>
                <input value={form.line1} onChange={e => upd('line1', e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Adresse ligne 2</label>
                <input value={form.line2} onChange={e => upd('line2', e.target.value)} className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Code postal *</label>
                  <input value={form.postal_code} onChange={e => upd('postal_code', e.target.value)} className={inputCls} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Ville *</label>
                  <input value={form.city} onChange={e => upd('city', e.target.value)} className={inputCls} required />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Région / État</label>
                <input value={form.region} onChange={e => upd('region', e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Pays *</label>
                <select value={form.country_code} onChange={e => upd('country_code', e.target.value)} className={inputCls} required>
                  <option value="">— Choisir —</option>
                  {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Téléphone</label>
                <input type="tel" value={form.phone} onChange={e => upd('phone', e.target.value)} className={inputCls} />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_default} onChange={e => upd('is_default', e.target.checked)} />
                Adresse par défaut
              </label>
            </form>

            <div className="border-t border-slate-100 px-6 py-4 flex gap-3">
              <button onClick={handleSubmit} disabled={saving}
                className="flex-1 py-2.5 bg-brand-600 text-white font-medium rounded-lg text-sm disabled:opacity-50 transition hover:bg-brand-700">
                {saving ? 'Enregistrement…' : editId ? 'Mettre à jour' : 'Ajouter'}
              </button>
              <button onClick={closeForm} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200 transition">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddressCard({ addr, onEdit, onDelete }: { addr: Address; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {addr.is_default && (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-100 text-brand-700">
              Par défaut
            </span>
          )}
          {addr.label && (
            <span className="text-sm font-medium text-slate-700">{addr.label}</span>
          )}
        </div>
        <p className="text-sm text-slate-800 font-medium">{addr.first_name} {addr.last_name}</p>
        {addr.company && <p className="text-sm text-slate-500">{addr.company}</p>}
        <p className="text-sm text-slate-600">{addr.line1}</p>
        {addr.line2 && <p className="text-sm text-slate-600">{addr.line2}</p>}
        <p className="text-sm text-slate-600">
          {addr.postal_code} {addr.city}
          {addr.region && `, ${addr.region}`}
        </p>
        <p className="text-sm text-slate-500">{addr.country_name || addr.country_code}</p>
        {addr.phone && <p className="text-xs text-slate-400 mt-1">{addr.phone}</p>}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={onEdit}
          className="px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition">
          Modifier
        </button>
        <button onClick={onDelete}
          className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition">
          Supprimer
        </button>
      </div>
    </div>
  );
}

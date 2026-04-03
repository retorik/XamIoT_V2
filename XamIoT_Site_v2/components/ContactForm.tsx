'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';

export default function ContactForm({ lang = 'fr' }: { lang?: string }) {
  const [form, setForm]   = useState({ firstName: '', lastName: '', phone: '', email: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error' | 'rate_limit'>('idle');

  const t = {
    firstName:   lang === 'en' ? 'First name' : lang === 'es' ? 'Nombre' : 'Prénom',
    lastName:    lang === 'en' ? 'Last name'  : lang === 'es' ? 'Apellido' : 'Nom',
    phone:       lang === 'en' ? 'Phone'      : lang === 'es' ? 'Teléfono' : 'Téléphone',
    email:       'Email',
    message:     lang === 'en' ? 'Message'    : lang === 'es' ? 'Mensaje' : 'Message',
    send:        lang === 'en' ? 'Send'        : lang === 'es' ? 'Enviar' : 'Envoyer',
    sending:     lang === 'en' ? 'Sending…'   : lang === 'es' ? 'Enviando…' : 'Envoi en cours…',
    success:     lang === 'en' ? 'Your message has been sent. We will get back to you soon.' : lang === 'es' ? 'Tu mensaje ha sido enviado. Te responderemos pronto.' : 'Votre message a bien été envoyé. Nous vous répondrons dans les plus brefs délais.',
    error:       lang === 'en' ? 'An error occurred. Please try again.' : lang === 'es' ? 'Se produjo un error. Inténtalo de nuevo.' : 'Une erreur est survenue. Veuillez réessayer.',
    rate_limit:  lang === 'en' ? 'Too many requests. Please wait before trying again.' : lang === 'es' ? 'Demasiadas solicitudes. Espere antes de intentarlo de nuevo.' : 'Trop de tentatives. Veuillez patienter avant de réessayer.',
    required:    lang === 'en' ? 'required'   : lang === 'es' ? 'obligatorio' : 'obligatoire',
    optional:    lang === 'en' ? 'optional'   : lang === 'es' ? 'opcional' : 'optionnel',
  };

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch(`${API_BASE}/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.status === 429) { setStatus('rate_limit'); return; }
      if (!res.ok) { setStatus('error'); return; }
      setStatus('success');
      setForm({ firstName: '', lastName: '', phone: '', email: '', message: '' });
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 p-6 text-green-800 text-center">
        {t.success}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t.firstName} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.firstName}
            onChange={e => set('firstName', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t.lastName} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.lastName}
            onChange={e => set('lastName', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t.phone} <span className="text-gray-400 text-xs">({t.optional})</span>
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={e => set('phone', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t.email} <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            value={form.email}
            onChange={e => set('email', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t.message} <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          rows={5}
          value={form.message}
          onChange={e => set('message', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-vertical"
        />
      </div>

      {(status === 'error' || status === 'rate_limit') && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
          {status === 'rate_limit' ? t.rate_limit : t.error}
        </div>
      )}

      <div>
        <button
          type="submit"
          disabled={status === 'sending'}
          className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'sending' ? t.sending : t.send}
        </button>
      </div>
    </form>
  );
}

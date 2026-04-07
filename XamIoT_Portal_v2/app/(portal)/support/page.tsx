'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useLang } from '@/lib/useLang';

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketCategory = 'general' | 'technical' | 'billing' | 'rma' | 'other';

interface Ticket {
  id: string; subject: string; status: TicketStatus; priority: string;
  category: TicketCategory; created_at: string; updated_at: string; message_count: number;
}

interface Message {
  id: string; is_staff: boolean; body: string; created_at: string; author_email: string | null;
}

interface TicketDetail extends Ticket {
  messages: Message[]; resolved_at: string | null;
}

const STATUS_CLASS: Record<TicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700', in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700', closed: 'bg-slate-100 text-slate-500',
};

const T = {
  fr: {
    title: 'Support', subtitle: "Vos demandes d'assistance",
    new_ticket: '+ Nouveau ticket', new_ticket_title: 'Nouveau ticket',
    empty: 'Aucun ticket pour le moment.',
    status: { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu', closed: 'Fermé' } as Record<TicketStatus, string>,
    category: { general: 'Général', technical: 'Technique', billing: 'Facturation', rma: 'Retour (RMA)', other: 'Autre' } as Record<TicketCategory, string>,
    cat_label: 'Catégorie', priority: 'Priorité', created_at: 'Créé le', resolved_at: 'Résolu le',
    subject: 'Sujet *', subject_ph: 'Décrivez brièvement votre problème…',
    category_label: 'Catégorie', sku: 'Référence produit (SKU)', sku_ph: 'Ex: XAM-SS-001',
    message: 'Message *', message_ph: 'Décrivez votre problème en détail…',
    cancel: 'Annuler', send: 'Envoyer', sending: 'Envoi…',
    add_message: 'Ajouter un message', reply_ph: 'Votre message…',
    ticket_closed: (status: string) => `Ce ticket est ${status}. Pour une nouvelle demande, ouvrez un nouveau ticket.`,
    staff: 'Équipe support', you: 'Vous', no_messages: 'Aucun message',
    error_load: 'Impossible de charger vos tickets.', error_detail: 'Impossible de charger le ticket.',
    error_reply: "Erreur lors de l'envoi du message.", error_create: 'Erreur lors de la création du ticket.',
    error_form: 'Veuillez remplir le sujet et le message.',
    msg: 'msg',
  },
  en: {
    title: 'Support', subtitle: 'Your support requests',
    new_ticket: '+ New ticket', new_ticket_title: 'New ticket',
    empty: 'No tickets yet.',
    status: { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' } as Record<TicketStatus, string>,
    category: { general: 'General', technical: 'Technical', billing: 'Billing', rma: 'Return (RMA)', other: 'Other' } as Record<TicketCategory, string>,
    cat_label: 'Category', priority: 'Priority', created_at: 'Created on', resolved_at: 'Resolved on',
    subject: 'Subject *', subject_ph: 'Briefly describe your issue…',
    category_label: 'Category', sku: 'Product reference (SKU)', sku_ph: 'E.g. XAM-SS-001',
    message: 'Message *', message_ph: 'Describe your issue in detail…',
    cancel: 'Cancel', send: 'Send', sending: 'Sending…',
    add_message: 'Add a message', reply_ph: 'Your message…',
    ticket_closed: (status: string) => `This ticket is ${status}. To submit a new request, open a new ticket.`,
    staff: 'Support team', you: 'You', no_messages: 'No messages',
    error_load: 'Unable to load your tickets.', error_detail: 'Unable to load ticket.',
    error_reply: 'Error sending message.', error_create: 'Error creating ticket.',
    error_form: 'Please fill in the subject and message.',
    msg: 'msg',
  },
  es: {
    title: 'Soporte', subtitle: 'Sus solicitudes de asistencia',
    new_ticket: '+ Nuevo ticket', new_ticket_title: 'Nuevo ticket',
    empty: 'No hay tickets por el momento.',
    status: { open: 'Abierto', in_progress: 'En curso', resolved: 'Resuelto', closed: 'Cerrado' } as Record<TicketStatus, string>,
    category: { general: 'General', technical: 'Técnico', billing: 'Facturación', rma: 'Devolución (RMA)', other: 'Otro' } as Record<TicketCategory, string>,
    cat_label: 'Categoría', priority: 'Prioridad', created_at: 'Creado el', resolved_at: 'Resuelto el',
    subject: 'Asunto *', subject_ph: 'Describa brevemente su problema…',
    category_label: 'Categoría', sku: 'Referencia de producto (SKU)', sku_ph: 'Ej: XAM-SS-001',
    message: 'Mensaje *', message_ph: 'Describa su problema en detalle…',
    cancel: 'Cancelar', send: 'Enviar', sending: 'Enviando…',
    add_message: 'Añadir un mensaje', reply_ph: 'Su mensaje…',
    ticket_closed: (status: string) => `Este ticket está ${status}. Para una nueva solicitud, abra un nuevo ticket.`,
    staff: 'Equipo de soporte', you: 'Usted', no_messages: 'Sin mensajes',
    error_load: 'No se pueden cargar sus tickets.', error_detail: 'No se puede cargar el ticket.',
    error_reply: 'Error al enviar el mensaje.', error_create: 'Error al crear el ticket.',
    error_form: 'Por favor rellene el asunto y el mensaje.',
    msg: 'msg',
  },
};

export default function SupportPage() {
  const lang = useLang();
  const t = T[lang];
  const dateLocale = lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'fr-FR';

  function fmtDate(d: string) {
    return new Date(d).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [view, setView]         = useState<'list' | 'detail' | 'new'>('list');
  const [detail, setDetail]     = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [newSubject, setNewSubject]   = useState('');
  const [newBody, setNewBody]         = useState('');
  const [newCategory, setNewCategory] = useState<TicketCategory>('general');
  const [newSku, setNewSku]           = useState('');
  const [newLoading, setNewLoading]   = useState(false);
  const [newError, setNewError]       = useState('');

  async function loadTickets() {
    setLoading(true); setError('');
    try { setTickets(await apiFetch<Ticket[]>('/portal/tickets')); }
    catch { setError(t.error_load); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadTickets(); }, []);

  async function openDetail(ticket: Ticket) {
    setDetailLoading(true); setDetail(null); setReplyBody(''); setView('detail');
    try { setDetail(await apiFetch<TicketDetail>(`/portal/tickets/${ticket.id}`)); }
    catch { setError(t.error_detail); setView('list'); }
    finally { setDetailLoading(false); }
  }

  async function sendReply() {
    if (!replyBody.trim() || !detail) return;
    setReplyLoading(true);
    try {
      await apiFetch(`/portal/tickets/${detail.id}/messages`, { method: 'POST', body: JSON.stringify({ body: replyBody }) });
      setReplyBody('');
      setDetail(await apiFetch<TicketDetail>(`/portal/tickets/${detail.id}`));
      await loadTickets();
    } catch { setError(t.error_reply); }
    finally { setReplyLoading(false); }
  }

  async function createTicket() {
    if (!newSubject.trim() || !newBody.trim()) { setNewError(t.error_form); return; }
    setNewLoading(true); setNewError('');
    try {
      await apiFetch('/portal/tickets', { method: 'POST', body: JSON.stringify({ subject: newSubject, body: newBody, category: newCategory, ...(newSku.trim() ? { product_sku: newSku.trim() } : {}) }) });
      setNewSubject(''); setNewBody(''); setNewCategory('general'); setNewSku('');
      setView('list'); await loadTickets();
    } catch { setNewError(t.error_create); }
    finally { setNewLoading(false); }
  }

  if (view === 'list') {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
            <p className="text-slate-500 text-sm mt-1">{t.subtitle}</p>
          </div>
          <button onClick={() => setView('new')} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            {t.new_ticket}
          </button>
        </div>
        {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p className="text-sm">{t.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map(tk => (
              <button key={tk.id} onClick={() => openDetail(tk)}
                className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-brand-300 hover:shadow-sm transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{tk.subject}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{t.category[tk.category]} · {fmtDate(tk.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[tk.status]}`}>{t.status[tk.status]}</span>
                    <span className="text-xs text-slate-400">{tk.message_count} {t.msg}</span>
                    <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === 'new') {
    return (
      <div>
        <div className="mb-6 flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-slate-400 hover:text-slate-600 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-2xl font-bold text-slate-900">{t.new_ticket_title}</h1>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl">
          {newError && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{newError}</div>}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.subject}</label>
              <input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder={t.subject_ph}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.category_label}</label>
              <select value={newCategory} onChange={e => setNewCategory(e.target.value as TicketCategory)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
                {(Object.entries(t.category) as [TicketCategory, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {newCategory === 'rma' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.sku}</label>
                <input value={newSku} onChange={e => setNewSku(e.target.value)} placeholder={t.sku_ph}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.message}</label>
              <textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={6} placeholder={t.message_ph}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y" />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setView('list')} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition">{t.cancel}</button>
              <button onClick={createTicket} disabled={newLoading} className="px-4 py-2 text-sm text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition disabled:opacity-60">
                {newLoading ? t.sending : t.send}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => setView('list')} className="text-slate-400 hover:text-slate-600 transition">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="text-2xl font-bold text-slate-900 truncate">{detail?.subject || '…'}</h1>
        {detail && <span className={`flex-shrink-0 inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[detail.status]}`}>{t.status[detail.status]}</span>}
      </div>
      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {detailLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        </div>
      ) : detail ? (
        <div className="max-w-2xl space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-400 mb-0.5">{t.cat_label}</dt><dd className="text-slate-700 font-medium">{t.category[detail.category]}</dd></div>
              <div><dt className="text-xs text-slate-400 mb-0.5">{t.priority}</dt><dd className="text-slate-700 font-medium capitalize">{detail.priority}</dd></div>
              <div><dt className="text-xs text-slate-400 mb-0.5">{t.created_at}</dt><dd className="text-slate-700">{fmtDate(detail.created_at)}</dd></div>
              {detail.resolved_at && <div><dt className="text-xs text-slate-400 mb-0.5">{t.resolved_at}</dt><dd className="text-slate-700">{fmtDate(detail.resolved_at)}</dd></div>}
            </dl>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {detail.messages.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">{t.no_messages}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.messages.map(m => (
                  <div key={m.id} className={`p-4 ${m.is_staff ? 'bg-blue-50' : 'bg-white'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold ${m.is_staff ? 'text-blue-600' : 'text-slate-600'}`}>{m.is_staff ? t.staff : t.you}</span>
                      <span className="text-xs text-slate-400">{fmtDate(m.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {detail.status !== 'closed' && detail.status !== 'resolved' && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">{t.add_message}</label>
              <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} rows={4} placeholder={t.reply_ph}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y" />
              <div className="flex justify-end mt-3">
                <button onClick={sendReply} disabled={replyLoading || !replyBody.trim()}
                  className="px-4 py-2 text-sm text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition disabled:opacity-60">
                  {replyLoading ? t.sending : t.send}
                </button>
              </div>
            </div>
          )}
          {(detail.status === 'closed' || detail.status === 'resolved') && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-500 text-center">
              {t.ticket_closed(t.status[detail.status].toLowerCase())}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketCategory = 'general' | 'technical' | 'billing' | 'rma' | 'other';

interface Ticket {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: string;
  category: TicketCategory;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface Message {
  id: string;
  is_staff: boolean;
  body: string;
  created_at: string;
  author_email: string | null;
}

interface TicketDetail extends Ticket {
  messages: Message[];
  resolved_at: string | null;
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  open:        'Ouvert',
  in_progress: 'En cours',
  resolved:    'Résolu',
  closed:      'Fermé',
};

const STATUS_CLASS: Record<TicketStatus, string> = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved:    'bg-green-100 text-green-700',
  closed:      'bg-slate-100 text-slate-500',
};

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  general:   'Général',
  technical: 'Technique',
  billing:   'Facturation',
  rma:       'Retour (RMA)',
  other:     'Autre',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function SupportPage() {
  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [view, setView]         = useState<'list' | 'detail' | 'new'>('list');
  const [detail, setDetail]     = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);

  // Formulaire nouveau ticket
  const [newSubject, setNewSubject]   = useState('');
  const [newBody, setNewBody]         = useState('');
  const [newCategory, setNewCategory] = useState<TicketCategory>('general');
  const [newSku, setNewSku]           = useState('');
  const [newLoading, setNewLoading]   = useState(false);
  const [newError, setNewError]       = useState('');

  async function loadTickets() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<Ticket[]>('/portal/tickets');
      setTickets(data);
    } catch {
      setError('Impossible de charger vos tickets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTickets(); }, []);

  async function openDetail(ticket: Ticket) {
    setDetailLoading(true);
    setDetail(null);
    setReplyBody('');
    setView('detail');
    try {
      const data = await apiFetch<TicketDetail>(`/portal/tickets/${ticket.id}`);
      setDetail(data);
    } catch {
      setError('Impossible de charger le ticket.');
      setView('list');
    } finally {
      setDetailLoading(false);
    }
  }

  async function sendReply() {
    if (!replyBody.trim() || !detail) return;
    setReplyLoading(true);
    try {
      await apiFetch(`/portal/tickets/${detail.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: replyBody }),
      });
      setReplyBody('');
      const updated = await apiFetch<TicketDetail>(`/portal/tickets/${detail.id}`);
      setDetail(updated);
      await loadTickets();
    } catch {
      setError('Erreur lors de l\'envoi du message.');
    } finally {
      setReplyLoading(false);
    }
  }

  async function createTicket() {
    if (!newSubject.trim() || !newBody.trim()) {
      setNewError('Veuillez remplir le sujet et le message.');
      return;
    }
    setNewLoading(true);
    setNewError('');
    try {
      await apiFetch('/portal/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: newSubject,
          body: newBody,
          category: newCategory,
          ...(newSku.trim() ? { product_sku: newSku.trim() } : {}),
        }),
      });
      setNewSubject('');
      setNewBody('');
      setNewCategory('general');
      setNewSku('');
      setView('list');
      await loadTickets();
    } catch {
      setNewError('Erreur lors de la création du ticket.');
    } finally {
      setNewLoading(false);
    }
  }

  // Vue : liste
  if (view === 'list') {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Support</h1>
            <p className="text-slate-500 text-sm mt-1">Vos demandes d&apos;assistance</p>
          </div>
          <button
            onClick={() => setView('new')}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            + Nouveau ticket
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p className="text-sm">Aucun ticket pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map(t => (
              <button
                key={t.id}
                onClick={() => openDetail(t)}
                className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-brand-300 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{t.subject}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{CATEGORY_LABEL[t.category]} · {fmtDate(t.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                    <span className="text-xs text-slate-400">{t.message_count} msg</span>
                    <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Vue : nouveau ticket
  if (view === 'new') {
    return (
      <div>
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setView('list')}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-slate-900">Nouveau ticket</h1>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl">
          {newError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {newError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sujet *</label>
              <input
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
                placeholder="Décrivez brièvement votre problème…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value as TicketCategory)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              >
                {(Object.entries(CATEGORY_LABEL) as [TicketCategory, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {newCategory === 'rma' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Référence produit (SKU)</label>
                <input
                  value={newSku}
                  onChange={e => setNewSku(e.target.value)}
                  placeholder="Ex: XAM-SS-001"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Message *</label>
              <textarea
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                rows={6}
                placeholder="Décrivez votre problème en détail…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y"
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setView('list')}
                className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
              >
                Annuler
              </button>
              <button
                onClick={createTicket}
                disabled={newLoading}
                className="px-4 py-2 text-sm text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition disabled:opacity-60"
              >
                {newLoading ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Vue : détail ticket
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => setView('list')}
          className="text-slate-400 hover:text-slate-600 transition"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-slate-900 truncate">
          {detail?.subject || '…'}
        </h1>
        {detail && (
          <span className={`flex-shrink-0 inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[detail.status]}`}>
            {STATUS_LABEL[detail.status]}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {detailLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        </div>
      ) : detail ? (
        <div className="max-w-2xl space-y-4">
          {/* Infos ticket */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Catégorie</dt>
                <dd className="text-slate-700 font-medium">{CATEGORY_LABEL[detail.category]}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Priorité</dt>
                <dd className="text-slate-700 font-medium capitalize">{detail.priority}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Créé le</dt>
                <dd className="text-slate-700">{fmtDate(detail.created_at)}</dd>
              </div>
              {detail.resolved_at && (
                <div>
                  <dt className="text-xs text-slate-400 mb-0.5">Résolu le</dt>
                  <dd className="text-slate-700">{fmtDate(detail.resolved_at)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Messages */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {detail.messages.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">Aucun message</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.messages.map(m => (
                  <div
                    key={m.id}
                    className={`p-4 ${m.is_staff ? 'bg-blue-50' : 'bg-white'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold ${m.is_staff ? 'text-blue-600' : 'text-slate-600'}`}>
                        {m.is_staff ? 'Équipe support' : 'Vous'}
                      </span>
                      <span className="text-xs text-slate-400">{fmtDate(m.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Zone de réponse — masquée si ticket fermé/résolu */}
          {detail.status !== 'closed' && detail.status !== 'resolved' && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Ajouter un message</label>
              <textarea
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                rows={4}
                placeholder="Votre message…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y"
              />
              <div className="flex justify-end mt-3">
                <button
                  onClick={sendReply}
                  disabled={replyLoading || !replyBody.trim()}
                  className="px-4 py-2 text-sm text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition disabled:opacity-60"
                >
                  {replyLoading ? 'Envoi…' : 'Envoyer'}
                </button>
              </div>
            </div>
          )}

          {(detail.status === 'closed' || detail.status === 'resolved') && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-500 text-center">
              Ce ticket est {STATUS_LABEL[detail.status].toLowerCase()}. Pour une nouvelle demande, ouvrez un nouveau ticket.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// src/ticketsRouter.js
// Module Support/Tickets/RMA — routes admin et portail client.

import express from 'express';
import { q } from './db.js';
import { requireAuth } from './auth.js';

export const adminTicketsRouter = express.Router();
export const portalTicketsRouter = express.Router();

// =============================================
// ADMIN — TICKETS
// =============================================

// GET /admin/tickets — liste avec user email + nb messages + dernier message at
adminTicketsRouter.get('/tickets', requireAuth, async (req, res, next) => {
  try {
    const { status, priority } = req.query;
    const where = [];
    const params = [];
    let i = 1;

    if (status)   { where.push(`t.status = $${i++}`);   params.push(status); }
    if (priority) { where.push(`t.priority = $${i++}`); params.push(priority); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await q(
      `SELECT
         t.id, t.subject, t.status, t.priority, t.category,
         t.created_at, t.updated_at, t.resolved_at,
         u.email AS user_email,
         COUNT(m.id)::int AS message_count,
         MAX(m.created_at) AS last_message_at
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN ticket_messages m ON m.ticket_id = t.id
       ${whereClause}
       GROUP BY t.id, u.email
       ORDER BY t.updated_at DESC`,
      params
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /admin/tickets/:id — détail + messages + RMA liée
adminTicketsRouter.get('/tickets/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT
         t.id, t.subject, t.status, t.priority, t.category,
         t.created_at, t.updated_at, t.resolved_at, t.assigned_to,
         u.email AS user_email
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'ticket_not_found' });

    const ticket = rows[0];

    const { rows: messages } = await q(
      `SELECT
         m.id, m.is_staff, m.body, m.created_at,
         u.email AS author_email
       FROM ticket_messages m
       LEFT JOIN users u ON u.id = m.author_id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.id]
    );

    const { rows: rmaRows } = await q(
      `SELECT
         r.id, r.product_sku, r.reason, r.status, r.admin_notes,
         r.created_at, r.updated_at, r.order_id
       FROM rma_requests r
       WHERE r.ticket_id = $1`,
      [req.params.id]
    );

    res.json({ ...ticket, messages, rma: rmaRows[0] || null });
  } catch (e) { next(e); }
});

// PATCH /admin/tickets/:id — update status, priority, assigned_to
adminTicketsRouter.patch('/tickets/:id', requireAuth, async (req, res, next) => {
  try {
    const { status, priority, assigned_to } = req.body || {};
    const sets = [];
    const params = [];
    let i = 1;

    if (status      !== undefined) { sets.push(`status=$${i++}`);      params.push(status); }
    if (priority    !== undefined) { sets.push(`priority=$${i++}`);    params.push(priority); }
    if (assigned_to !== undefined) { sets.push(`assigned_to=$${i++}`); params.push(assigned_to || null); }

    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });

    if (status === 'resolved') sets.push(`resolved_at=now()`);
    sets.push(`updated_at=now()`);

    params.push(req.params.id);
    await q(
      `UPDATE support_tickets SET ${sets.join(', ')} WHERE id=$${i}`,
      params
    );

    const { rows } = await q('SELECT * FROM support_tickets WHERE id=$1', [req.params.id]);
    res.json(rows[0] || {});
  } catch (e) { next(e); }
});

// POST /admin/tickets/:id/messages — répondre au ticket (is_staff: true)
adminTicketsRouter.post('/tickets/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const { body } = req.body || {};
    if (!body?.trim()) return res.status(400).json({ error: 'body_required' });

    const { rows: check } = await q('SELECT id FROM support_tickets WHERE id=$1', [req.params.id]);
    if (!check.length) return res.status(404).json({ error: 'ticket_not_found' });

    const { rows } = await q(
      `INSERT INTO ticket_messages (ticket_id, author_id, is_staff, body)
       VALUES ($1, $2, true, $3)
       RETURNING *`,
      [req.params.id, req.user.sub, body.trim()]
    );

    // Mettre à jour updated_at du ticket
    await q('UPDATE support_tickets SET updated_at=now() WHERE id=$1', [req.params.id]);

    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /admin/tickets/:id — supprimer
adminTicketsRouter.delete('/tickets/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM support_tickets WHERE id=$1', [req.params.id]);
    res.json({ ok: rowCount > 0 });
  } catch (e) { next(e); }
});

// =============================================
// ADMIN — RMA
// =============================================

// GET /admin/rma — liste RMA avec user email + ticket subject
adminTicketsRouter.get('/rma', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT
         r.id, r.product_sku, r.reason, r.status, r.admin_notes,
         r.created_at, r.updated_at, r.order_id,
         u.email AS user_email,
         t.subject AS ticket_subject
       FROM rma_requests r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN support_tickets t ON t.id = r.ticket_id
       ORDER BY r.created_at DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /admin/rma/:id — détail RMA
adminTicketsRouter.get('/rma/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT
         r.id, r.product_sku, r.reason, r.status, r.admin_notes,
         r.created_at, r.updated_at, r.order_id, r.ticket_id,
         u.email AS user_email,
         t.subject AS ticket_subject
       FROM rma_requests r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN support_tickets t ON t.id = r.ticket_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'rma_not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// PATCH /admin/rma/:id — update status + admin_notes
adminTicketsRouter.patch('/rma/:id', requireAuth, async (req, res, next) => {
  try {
    const { status, admin_notes } = req.body || {};
    const sets = [];
    const params = [];
    let i = 1;

    if (status      !== undefined) { sets.push(`status=$${i++}`);      params.push(status); }
    if (admin_notes !== undefined) { sets.push(`admin_notes=$${i++}`); params.push(admin_notes ?? null); }

    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });

    sets.push(`updated_at=now()`);
    params.push(req.params.id);

    await q(`UPDATE rma_requests SET ${sets.join(', ')} WHERE id=$${i}`, params);

    const { rows } = await q('SELECT * FROM rma_requests WHERE id=$1', [req.params.id]);
    res.json(rows[0] || {});
  } catch (e) { next(e); }
});

// =============================================
// PORTAL — TICKETS
// =============================================

// GET /portal/tickets — tickets de l'utilisateur connecté
portalTicketsRouter.get('/tickets', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT
         t.id, t.subject, t.status, t.priority, t.category,
         t.created_at, t.updated_at,
         COUNT(m.id)::int AS message_count
       FROM support_tickets t
       LEFT JOIN ticket_messages m ON m.ticket_id = t.id
       WHERE t.user_id = $1
       GROUP BY t.id
       ORDER BY t.updated_at DESC`,
      [req.user.sub]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /portal/tickets — créer ticket + premier message
portalTicketsRouter.post('/tickets', requireAuth, async (req, res, next) => {
  try {
    const { subject, body, category = 'general', product_sku } = req.body || {};
    if (!subject?.trim()) return res.status(400).json({ error: 'subject_required' });
    if (!body?.trim())    return res.status(400).json({ error: 'body_required' });

    const validCategories = ['general', 'technical', 'billing', 'rma', 'other'];
    const cat = validCategories.includes(category) ? category : 'general';

    const { rows } = await q(
      `INSERT INTO support_tickets (user_id, subject, category)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user.sub, subject.trim(), cat]
    );
    const ticket = rows[0];

    await q(
      `INSERT INTO ticket_messages (ticket_id, author_id, is_staff, body)
       VALUES ($1, $2, false, $3)`,
      [ticket.id, req.user.sub, body.trim()]
    );

    // Si product_sku fourni et catégorie rma, créer automatiquement une entrée RMA
    if (product_sku && cat === 'rma') {
      await q(
        `INSERT INTO rma_requests (ticket_id, user_id, product_sku, reason)
         VALUES ($1, $2, $3, $4)`,
        [ticket.id, req.user.sub, product_sku, subject.trim()]
      );
    }

    res.status(201).json(ticket);
  } catch (e) { next(e); }
});

// GET /portal/tickets/:id — détail ticket + messages (vérifie ownership)
portalTicketsRouter.get('/tickets/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT id, subject, status, priority, category, created_at, updated_at, resolved_at
       FROM support_tickets
       WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'ticket_not_found' });

    const ticket = rows[0];

    const { rows: messages } = await q(
      `SELECT
         m.id, m.is_staff, m.body, m.created_at,
         u.email AS author_email
       FROM ticket_messages m
       LEFT JOIN users u ON u.id = m.author_id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.id]
    );

    res.json({ ...ticket, messages });
  } catch (e) { next(e); }
});

// POST /portal/tickets/:id/messages — ajouter message (is_staff: false, vérifie ownership)
portalTicketsRouter.post('/tickets/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const { body } = req.body || {};
    if (!body?.trim()) return res.status(400).json({ error: 'body_required' });

    const { rows: check } = await q(
      'SELECT id FROM support_tickets WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.sub]
    );
    if (!check.length) return res.status(404).json({ error: 'ticket_not_found' });

    const { rows } = await q(
      `INSERT INTO ticket_messages (ticket_id, author_id, is_staff, body)
       VALUES ($1, $2, false, $3)
       RETURNING *`,
      [req.params.id, req.user.sub, body.trim()]
    );

    await q(
      `UPDATE support_tickets SET status='in_progress', updated_at=now() WHERE id=$1 AND status='open'`,
      [req.params.id]
    );

    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// POST /portal/rma — créer demande RMA
portalTicketsRouter.post('/rma', requireAuth, async (req, res, next) => {
  try {
    const { ticket_id, product_sku, reason, order_id } = req.body || {};
    if (!product_sku?.trim()) return res.status(400).json({ error: 'product_sku_required' });
    if (!reason?.trim())      return res.status(400).json({ error: 'reason_required' });

    // Si ticket_id fourni, vérifier que l'utilisateur en est propriétaire
    if (ticket_id) {
      const { rows: check } = await q(
        'SELECT id FROM support_tickets WHERE id=$1 AND user_id=$2',
        [ticket_id, req.user.sub]
      );
      if (!check.length) return res.status(404).json({ error: 'ticket_not_found' });
    }

    const { rows } = await q(
      `INSERT INTO rma_requests (ticket_id, user_id, product_sku, reason, order_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [ticket_id || null, req.user.sub, product_sku.trim(), reason.trim(), order_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// GET /portal/rma — RMA de l'utilisateur
portalTicketsRouter.get('/rma', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT
         r.id, r.product_sku, r.reason, r.status, r.created_at, r.updated_at, r.order_id,
         t.subject AS ticket_subject
       FROM rma_requests r
       LEFT JOIN support_tickets t ON t.id = r.ticket_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.sub]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// src/adminNotifRouter.js
// Routes admin — Système 2 (auto_notif_templates) + Système 3 (sys_notif_rules) + Système 4 (scheduled_notifs)
// Montées sous /admin par adminRoutes.js

import express from 'express';
import { q } from './db.js';

export const adminNotifRouter = express.Router();

// ============================================================
// SYSTÈME 2 — auto_notif_templates (événements transactionnels)
// ============================================================

// GET /admin/notif/auto-templates — liste tous les templates
adminNotifRouter.get('/notif/auto-templates', async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT * FROM auto_notif_templates ORDER BY event_key ASC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /admin/notif/auto-templates/:event_key — détail
adminNotifRouter.get('/notif/auto-templates/:event_key', async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT * FROM auto_notif_templates WHERE event_key = $1`,
      [req.params.event_key]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// PATCH /admin/notif/auto-templates/:event_key — mise à jour partielle
adminNotifRouter.patch('/notif/auto-templates/:event_key', async (req, res, next) => {
  try {
    const allowed = [
      'push_enabled', 'email_enabled',
      'push_title_tpl', 'push_body_tpl',
      'email_subject_tpl', 'email_html_tpl',
    ];
    const sets = [];
    const params = [];
    let i = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        sets.push(`${k}=$${i++}`);
        params.push(req.body[k]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
    sets.push(`updated_at=now()`);
    params.push(req.params.event_key);

    const { rows } = await q(
      `UPDATE auto_notif_templates SET ${sets.join(',')} WHERE event_key=$${i} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// GET /admin/notif/auto-log — journal (paginated)
adminNotifRouter.get('/notif/auto-log', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    const { event_key, channel, status } = req.query;

    const where = [];
    const params = [];
    let idx = 1;
    if (event_key) { where.push(`event_key=$${idx++}`); params.push(event_key); }
    if (channel)   { where.push(`channel=$${idx++}`);   params.push(channel); }
    if (status)    { where.push(`status=$${idx++}`);    params.push(status); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await q(
      `SELECT * FROM auto_notif_log ${whereClause} ORDER BY sent_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    const { rows: total } = await q(
      `SELECT count(*)::int AS total FROM auto_notif_log ${whereClause}`, params
    );
    res.json({ rows, total: total[0]?.total ?? 0, limit, offset });
  } catch (e) { next(e); }
});

// ============================================================
// SYSTÈME 3 — sys_notif_rules (règles système admin)
// ============================================================

// GET /admin/notif/sys-rules — liste
adminNotifRouter.get('/notif/sys-rules', async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT r.*,
              COALESCE(json_agg(c ORDER BY c.sort_order) FILTER (WHERE c.id IS NOT NULL), '[]') AS conditions
         FROM sys_notif_rules r
         LEFT JOIN sys_notif_conditions c ON c.rule_id = r.id
         GROUP BY r.id
         ORDER BY r.created_at DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /admin/notif/sys-rules/:id
adminNotifRouter.get('/notif/sys-rules/:id', async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT r.*,
              COALESCE(json_agg(c ORDER BY c.sort_order) FILTER (WHERE c.id IS NOT NULL), '[]') AS conditions
         FROM sys_notif_rules r
         LEFT JOIN sys_notif_conditions c ON c.rule_id = r.id
         WHERE r.id = $1
         GROUP BY r.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// POST /admin/notif/sys-rules — créer
adminNotifRouter.post('/notif/sys-rules', async (req, res, next) => {
  try {
    const {
      name, description, enabled = true, trigger_type, logic_op = 'AND',
      scope_type = 'all', scope_device_type_id, scope_esp_id,
      offline_threshold_sec = 300, cooldown_sec = 300,
      channel_push = true, channel_email = false,
      push_title_tpl, push_body_tpl, email_subject_tpl, email_html_tpl,
      conditions = [],
    } = req.body || {};

    if (!name?.trim()) return res.status(400).json({ error: 'name_required' });
    const validTypes = ['sensor_threshold', 'device_offline', 'device_online', 'device_silence'];
    if (!validTypes.includes(trigger_type)) return res.status(400).json({ error: 'invalid_trigger_type' });

    const { rows } = await q(
      `INSERT INTO sys_notif_rules
         (name, description, enabled, trigger_type, logic_op,
          scope_type, scope_device_type_id, scope_esp_id,
          offline_threshold_sec, cooldown_sec,
          channel_push, channel_email,
          push_title_tpl, push_body_tpl, email_subject_tpl, email_html_tpl,
          created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        name.trim(), description || null, enabled, trigger_type, logic_op,
        scope_type, scope_device_type_id || null, scope_esp_id || null,
        offline_threshold_sec, cooldown_sec,
        channel_push, channel_email,
        push_title_tpl || '{device_name} — Alerte',
        push_body_tpl  || '{trigger_label}',
        email_subject_tpl || null,
        email_html_tpl    || null,
        req.user?.sub || null,
      ]
    );
    const rule = rows[0];

    // Insérer les conditions
    for (let idx = 0; idx < conditions.length; idx++) {
      const c = conditions[idx];
      if (!c.field || !c.op) continue;
      await q(
        `INSERT INTO sys_notif_conditions (rule_id, sort_order, field, op, threshold_num, threshold_str)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [rule.id, idx, c.field, c.op, c.threshold_num ?? null, c.threshold_str ?? null]
      );
    }

    res.status(201).json(rule);
  } catch (e) { next(e); }
});

// PATCH /admin/notif/sys-rules/:id — mise à jour + remplacement conditions
adminNotifRouter.patch('/notif/sys-rules/:id', async (req, res, next) => {
  try {
    const allowed = [
      'name', 'description', 'enabled', 'trigger_type', 'logic_op',
      'scope_type', 'scope_device_type_id', 'scope_esp_id',
      'offline_threshold_sec', 'cooldown_sec',
      'channel_push', 'channel_email',
      'push_title_tpl', 'push_body_tpl', 'email_subject_tpl', 'email_html_tpl',
    ];
    const sets = [];
    const params = [];
    let i = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        sets.push(`${k}=$${i++}`);
        params.push(req.body[k] ?? null);
      }
    }
    if (sets.length) {
      sets.push(`updated_at=now()`);
      params.push(req.params.id);
      const { rowCount } = await q(
        `UPDATE sys_notif_rules SET ${sets.join(',')} WHERE id=$${i}`, params
      );
      if (!rowCount) return res.status(404).json({ error: 'not_found' });
    }

    // Remplacement des conditions si fournies
    if (Array.isArray(req.body.conditions)) {
      await q('DELETE FROM sys_notif_conditions WHERE rule_id=$1', [req.params.id]);
      for (let idx = 0; idx < req.body.conditions.length; idx++) {
        const c = req.body.conditions[idx];
        if (!c.field || !c.op) continue;
        await q(
          `INSERT INTO sys_notif_conditions (rule_id, sort_order, field, op, threshold_num, threshold_str)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [req.params.id, idx, c.field, c.op, c.threshold_num ?? null, c.threshold_str ?? null]
        );
      }
    }

    const { rows } = await q(
      `SELECT r.*, COALESCE(json_agg(c ORDER BY c.sort_order) FILTER (WHERE c.id IS NOT NULL), '[]') AS conditions
         FROM sys_notif_rules r
         LEFT JOIN sys_notif_conditions c ON c.rule_id = r.id
         WHERE r.id = $1 GROUP BY r.id`,
      [req.params.id]
    );
    res.json(rows[0] || {});
  } catch (e) { next(e); }
});

// DELETE /admin/notif/sys-rules/:id
adminNotifRouter.delete('/notif/sys-rules/:id', async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM sys_notif_rules WHERE id=$1', [req.params.id]);
    res.json({ ok: rowCount > 0 });
  } catch (e) { next(e); }
});

// GET /admin/notif/sys-log — journal (paginated)
adminNotifRouter.get('/notif/sys-log', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    const { rule_id, trigger_type, status } = req.query;

    const where = [];
    const params = [];
    let idx = 1;
    if (rule_id)      { where.push(`rule_id=$${idx++}`);      params.push(rule_id); }
    if (trigger_type) { where.push(`trigger_type=$${idx++}`); params.push(trigger_type); }
    if (status)       { where.push(`status=$${idx++}`);       params.push(status); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await q(
      `SELECT * FROM sys_notif_log ${whereClause} ORDER BY sent_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    const { rows: total } = await q(
      `SELECT count(*)::int AS total FROM sys_notif_log ${whereClause}`, params
    );
    res.json({ rows, total: total[0]?.total ?? 0, limit, offset });
  } catch (e) { next(e); }
});

// ============================================================
// SYSTÈME 4 — scheduled_notifs (notifications planifiées)
// ============================================================

// GET /admin/notif/scheduled — liste
adminNotifRouter.get('/notif/scheduled', async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = status ? `WHERE status=$1` : '';
    const params = status ? [status] : [];
    const { rows } = await q(
      `SELECT * FROM scheduled_notifs ${where} ORDER BY created_at DESC`, params
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /admin/notif/scheduled/:id
adminNotifRouter.get('/notif/scheduled/:id', async (req, res, next) => {
  try {
    const { rows } = await q(
      'SELECT * FROM scheduled_notifs WHERE id=$1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// POST /admin/notif/scheduled — créer
adminNotifRouter.post('/notif/scheduled', async (req, res, next) => {
  try {
    const {
      name, description,
      push_enabled = true, email_enabled = false,
      push_title, push_body,
      email_subject, email_html,
      filter_user_ids, filter_device_type_id, filter_mobile_platform, filter_has_push,
      scheduled_at, recurrence, recurrence_end_at,
    } = req.body || {};

    if (!name?.trim()) return res.status(400).json({ error: 'name_required' });
    if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at_required' });

    const validRec = [null, undefined, 'daily', 'weekly', 'monthly'];
    if (!validRec.includes(recurrence)) return res.status(400).json({ error: 'invalid_recurrence' });

    const { rows } = await q(
      `INSERT INTO scheduled_notifs
         (name, description,
          push_enabled, email_enabled,
          push_title, push_body,
          email_subject, email_html,
          filter_user_ids, filter_device_type_id, filter_mobile_platform, filter_has_push,
          scheduled_at, recurrence, recurrence_end_at,
          status, next_run_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending',$13,$16)
       RETURNING *`,
      [
        name.trim(), description || null,
        push_enabled, email_enabled,
        push_title || null, push_body || null,
        email_subject || null, email_html || null,
        filter_user_ids || null, filter_device_type_id || null,
        filter_mobile_platform || null,
        filter_has_push ?? null,
        scheduled_at, recurrence || null, recurrence_end_at || null,
        req.user?.email || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// PATCH /admin/notif/scheduled/:id
adminNotifRouter.patch('/notif/scheduled/:id', async (req, res, next) => {
  try {
    const allowed = [
      'name', 'description', 'push_enabled', 'email_enabled',
      'push_title', 'push_body', 'email_subject', 'email_html',
      'filter_user_ids', 'filter_device_type_id', 'filter_mobile_platform', 'filter_has_push',
      'scheduled_at', 'recurrence', 'recurrence_end_at', 'status', 'next_run_at',
    ];
    const sets = [];
    const params = [];
    let i = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        sets.push(`${k}=$${i++}`);
        params.push(req.body[k] ?? null);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
    sets.push(`updated_at=now()`);
    params.push(req.params.id);

    const { rows } = await q(
      `UPDATE scheduled_notifs SET ${sets.join(',')} WHERE id=$${i} RETURNING *`, params
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /admin/notif/scheduled/:id
adminNotifRouter.delete('/notif/scheduled/:id', async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM scheduled_notifs WHERE id=$1', [req.params.id]);
    res.json({ ok: rowCount > 0 });
  } catch (e) { next(e); }
});

// POST /admin/notif/scheduled/:id/cancel — annuler
adminNotifRouter.post('/notif/scheduled/:id/cancel', async (req, res, next) => {
  try {
    const { rows } = await q(
      `UPDATE scheduled_notifs SET status='cancelled', updated_at=now() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

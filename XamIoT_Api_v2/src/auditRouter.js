// src/auditRouter.js
import express from 'express';
import { q } from './db.js';
import { requireAuth } from './auth.js';

export const auditRouter = express.Router();

// GET /admin/audit-logs?limit=50&offset=0&resource_type=page&action=DELETE&user_id=xxx&search=email
auditRouter.get('/audit-logs', requireAuth, async (req, res, next) => {
  try {
    const { limit = '50', offset = '0', resource_type, action, user_id, from, to, search } = req.query;
    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (resource_type) { conditions.push(`a.resource_type=$${idx++}`); params.push(resource_type); }
    if (action)         { conditions.push(`a.action=$${idx++}`);        params.push(action); }
    if (user_id)        { conditions.push(`a.user_id=$${idx++}`);       params.push(user_id); }
    if (from)           { conditions.push(`a.created_at>=$${idx++}`);   params.push(from); }
    if (to)             { conditions.push(`a.created_at<=$${idx++}`);   params.push(to); }
    if (search) {
      conditions.push(`(a.user_email ILIKE $${idx} OR u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(lim, off);

    const { rows } = await q(
      `SELECT a.id, a.user_id, a.user_email,
              u.first_name, u.last_name,
              a.action, a.resource_type, a.resource_id,
              a.ip_address, a.user_agent, a.details, a.created_at
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
         ${where}
        ORDER BY a.created_at DESC
        LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    res.json(rows);
  } catch (e) { next(e); }
});

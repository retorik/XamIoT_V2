// src/countriesRouter.js
// Routes pays — public (actifs) + admin (CRUD)
import express from 'express';
import { q } from './db.js';
import { requireAuth } from './auth.js';
import { getRealIp } from './auditMiddleware.js';

export const publicCountriesRouter = express.Router();
export const adminCountriesRouter  = express.Router();

/* =========================
 *  Routes publiques
 * ========================= */

// GET /public/countries — pays actifs et non bloqués (pour le checkout)
publicCountriesRouter.get('/countries', async (req, res, next) => {
  try {
    const lang = (req.query.lang || 'fr').toLowerCase();
    const nameCol = lang === 'en' ? 'name_en' : 'name_fr';
    const { rows } = await q(
      `SELECT code, code3, ${nameCol} AS name, name_fr, name_en,
              shipping_cents, tax_rate_pct, customs_cents, message_client,
              region, subregion
         FROM countries
        WHERE is_active = true AND is_blocked = false
        ORDER BY sort_order ASC, name_fr ASC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

/* =========================
 *  Routes admin
 * ========================= */

// GET /admin/countries/regions — régions et sous-régions distinctes
adminCountriesRouter.get('/countries/regions', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT DISTINCT region, subregion FROM countries WHERE region IS NOT NULL ORDER BY region, subregion`
    );
    const regions = {};
    for (const r of rows) {
      if (!regions[r.region]) regions[r.region] = [];
      if (r.subregion && !regions[r.region].includes(r.subregion)) {
        regions[r.region].push(r.subregion);
      }
    }
    res.json(regions);
  } catch (e) { next(e); }
});

// GET /admin/countries — tous les pays
adminCountriesRouter.get('/countries', requireAuth, async (req, res, next) => {
  try {
    const { search, active, blocked } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(name_fr ILIKE $${idx} OR name_en ILIKE $${idx} OR code ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (active !== undefined) {
      conditions.push(`is_active = $${idx}`);
      params.push(active === 'true');
      idx++;
    }
    if (blocked !== undefined) {
      conditions.push(`is_blocked = $${idx}`);
      params.push(blocked === 'true');
      idx++;
    }

    if (req.query.region) {
      conditions.push(`region = $${idx}`);
      params.push(req.query.region);
      idx++;
    }
    if (req.query.subregion) {
      conditions.push(`subregion = $${idx}`);
      params.push(req.query.subregion);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await q(
      `SELECT * FROM countries ${where} ORDER BY region ASC, subregion ASC, sort_order ASC, name_fr ASC`,
      params
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// PATCH /admin/countries/:code — modifier un pays
adminCountriesRouter.patch('/countries/:code', requireAuth, async (req, res, next) => {
  try {
    const allowed = [
      'is_active', 'is_blocked', 'shipping_cents', 'tax_rate_pct',
      'customs_cents', 'customs_note', 'message_client', 'sort_order',
      'region', 'subregion',
    ];
    const fields = [];
    const vals = [];
    let idx = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        fields.push(`${k}=$${idx++}`);
        vals.push(req.body[k]);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });
    fields.push('updated_at=now()');
    vals.push(req.params.code.toUpperCase());

    const { rows } = await q(
      `UPDATE countries SET ${fields.join(',')} WHERE code=$${idx} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'country_not_found' });

    // Audit
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, 'UPDATE', 'country', $3, $4, $5, $6)`,
      [
        req.user.sub, req.user.email,
        req.params.code.toUpperCase(),
        getRealIp(req),
        req.headers['user-agent'] || null,
        JSON.stringify(req.body),
      ]
    ).catch(err => console.error('[AUDIT] country update error:', err.message));

    res.json(rows[0]);
  } catch (e) { next(e); }
});

// POST /admin/countries/bulk — activation/désactivation en masse
adminCountriesRouter.post('/countries/bulk', requireAuth, async (req, res, next) => {
  try {
    const { codes, is_active, is_blocked } = req.body;
    if (!Array.isArray(codes) || !codes.length) {
      return res.status(400).json({ error: 'codes_required' });
    }
    if (is_active === undefined && is_blocked === undefined) {
      return res.status(400).json({ error: 'nothing_to_update' });
    }

    const sets = [];
    const params = [];
    let idx = 1;
    if (is_active !== undefined) { sets.push(`is_active=$${idx++}`); params.push(is_active); }
    if (is_blocked !== undefined) { sets.push(`is_blocked=$${idx++}`); params.push(is_blocked); }
    sets.push('updated_at=now()');
    params.push(codes.map(c => c.toUpperCase()));

    const { rowCount } = await q(
      `UPDATE countries SET ${sets.join(',')} WHERE code = ANY($${idx}::char(2)[])`,
      params
    );

    // Audit
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, 'UPDATE', 'country', 'bulk', $3, $4, $5)`,
      [
        req.user.sub, req.user.email,
        getRealIp(req),
        req.headers['user-agent'] || null,
        JSON.stringify({ codes, is_active, is_blocked, affected: rowCount }),
      ]
    ).catch(err => console.error('[AUDIT] country bulk error:', err.message));

    res.json({ updated: rowCount });
  } catch (e) { next(e); }
});

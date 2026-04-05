// src/addressesRouter.js
// Routes adresses utilisateur — CRUD pour le profil et le checkout
import express from 'express';
import { q } from './db.js';
import { requireAuth } from './auth.js';
import { getRealIp } from './auditMiddleware.js';

export const addressesRouter = express.Router();

// Validation des champs adresse
function validateAddress(body) {
  const { first_name, last_name, line1, postal_code, city, country_code } = body;
  if (!first_name?.trim()) return 'first_name requis';
  if (!last_name?.trim()) return 'last_name requis';
  if (!line1?.trim()) return 'line1 requis';
  if (!postal_code?.trim()) return 'postal_code requis';
  if (!city?.trim()) return 'city requis';
  if (!country_code?.trim() || country_code.trim().length !== 2) return 'country_code invalide (2 lettres)';
  return null;
}

// GET /me/addresses — toutes les adresses de l'utilisateur
addressesRouter.get('/me/addresses', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT a.*, c.name_fr AS country_name
         FROM user_addresses a
         LEFT JOIN countries c ON c.code = a.country_code
        WHERE a.user_id = $1
        ORDER BY a.is_default DESC, a.created_at DESC`,
      [req.user.sub]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /me/addresses — créer une adresse
addressesRouter.post('/me/addresses', requireAuth, async (req, res, next) => {
  try {
    const err = validateAddress(req.body);
    if (err) return res.status(400).json({ error: err });

    const {
      label, type = 'shipping', is_default = false,
      first_name, last_name, company,
      line1, line2, postal_code, city, region,
      country_code, phone,
    } = req.body;

    // Si is_default, retirer le default des autres du même type
    if (is_default) {
      await q(
        `UPDATE user_addresses SET is_default = false WHERE user_id = $1 AND type = $2`,
        [req.user.sub, type]
      );
    }

    const { rows } = await q(
      `INSERT INTO user_addresses
        (user_id, label, type, is_default, first_name, last_name, company,
         line1, line2, postal_code, city, region, country_code, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        req.user.sub, label || null, type, is_default,
        first_name.trim(), last_name.trim(), company || null,
        line1.trim(), line2 || null, postal_code.trim(), city.trim(),
        region || null, country_code.toUpperCase(), phone || null,
      ]
    );

    // Audit
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, 'ADDRESS_CREATE', 'address', $3, $4, $5, $6)`,
      [
        req.user.sub, req.user.email, rows[0].id,
        getRealIp(req), req.headers['user-agent'] || null,
        JSON.stringify({ type, country_code: country_code.toUpperCase(), city }),
      ]
    ).catch(err => console.error('[AUDIT] address create error:', err.message));

    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// PATCH /me/addresses/:id — modifier une adresse
addressesRouter.patch('/me/addresses/:id', requireAuth, async (req, res, next) => {
  try {
    // Vérifier propriété
    const { rows: check } = await q(
      'SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.sub]
    );
    if (!check.length) return res.status(404).json({ error: 'not_found' });

    const allowed = [
      'label', 'type', 'is_default', 'first_name', 'last_name', 'company',
      'line1', 'line2', 'postal_code', 'city', 'region', 'country_code', 'phone',
    ];
    const fields = [];
    const vals = [];
    let idx = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        const val = k === 'country_code' ? req.body[k].toUpperCase() :
                    typeof req.body[k] === 'string' ? req.body[k].trim() : req.body[k];
        fields.push(`${k}=$${idx++}`);
        vals.push(val === '' ? null : val);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });

    // Si is_default = true, retirer le default des autres du même type
    if (req.body.is_default === true) {
      const type = req.body.type || (await q('SELECT type FROM user_addresses WHERE id=$1', [req.params.id])).rows[0]?.type || 'shipping';
      await q(
        `UPDATE user_addresses SET is_default = false WHERE user_id = $1 AND type = $2 AND id != $3`,
        [req.user.sub, type, req.params.id]
      );
    }

    fields.push('updated_at=now()');
    vals.push(req.params.id);

    const { rows } = await q(
      `UPDATE user_addresses SET ${fields.join(',')} WHERE id=$${idx} AND user_id=$${idx + 1} RETURNING *`,
      [...vals, req.user.sub]
    );

    // Audit
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, 'ADDRESS_UPDATE', 'address', $3, $4, $5, $6)`,
      [
        req.user.sub, req.user.email, req.params.id,
        getRealIp(req), req.headers['user-agent'] || null,
        JSON.stringify(req.body),
      ]
    ).catch(err => console.error('[AUDIT] address update error:', err.message));

    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /me/addresses/:id — supprimer une adresse
addressesRouter.delete('/me/addresses/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await q(
      'DELETE FROM user_addresses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.sub]
    );
    if (!rowCount) return res.status(404).json({ error: 'not_found' });

    // Audit
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent)
       VALUES ($1, $2, 'ADDRESS_DELETE', 'address', $3, $4, $5)`,
      [
        req.user.sub, req.user.email, req.params.id,
        getRealIp(req), req.headers['user-agent'] || null,
      ]
    ).catch(err => console.error('[AUDIT] address delete error:', err.message));

    res.json({ ok: true });
  } catch (e) { next(e); }
});

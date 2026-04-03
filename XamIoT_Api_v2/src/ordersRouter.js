// src/ordersRouter.js
import express from 'express';
import { q } from './db.js';
import { requireAuth } from './auth.js';

export const adminOrdersRouter  = express.Router();
export const publicOrdersRouter = express.Router();
export const portalOrdersRouter = express.Router();

/* =========================
 *  Routes portail client
 * ========================= */

// GET /portal/orders — liste les commandes de l'utilisateur connecté
portalOrdersRouter.get('/orders', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT o.id, o.status, o.total_cents, o.created_at, o.paid_at,
              COUNT(oi.id)::int AS item_count
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = $1 OR o.email = $2
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT 50`,
      [req.user.sub, req.user.email]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /portal/orders/:id — détail d'une commande de l'utilisateur connecté
portalOrdersRouter.get('/orders/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT o.id, o.status, o.stripe_payment_status, o.total_cents, o.email,
              o.full_name, o.address_line1, o.city, o.postal_code, o.country,
              o.created_at, o.paid_at, o.tracking_number,
              json_agg(json_build_object(
                'id', oi.id,
                'name', oi.name,
                'sku', oi.sku,
                'quantity', oi.quantity,
                'unit_price_cents', oi.unit_price_cents,
                'total_cents', oi.total_cents
              ) ORDER BY oi.id) AS items
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.id = $1 AND (o.user_id = $2 OR o.email = $3)
        GROUP BY o.id`,
      [req.params.id, req.user.sub, req.user.email]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// ── Stripe lazy-init ────────────────────────────────────────────────────────
// Clé active (DB > env var). Réinitialisé si la clé DB change.
let stripe = null;
let _lastStripeKey = null;

async function getStripeKey() {
  // Lit le mode actif (test/live) puis la clé correspondante
  try {
    const { rows } = await q(
      `SELECT key, value FROM app_config WHERE key IN ('stripe_mode','stripe_test_secret_key','stripe_live_secret_key')`
    );
    const db = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const mode = db.stripe_mode || 'test';
    const key = db[`stripe_${mode}_secret_key`];
    if (key) return key;
  } catch { /* fallback env */ }
  return process.env.STRIPE_SECRET_KEY || null;
}

async function getWebhookSecret() {
  try {
    const { rows } = await q(
      `SELECT key, value FROM app_config WHERE key IN ('stripe_mode','stripe_test_webhook_secret','stripe_live_webhook_secret')`
    );
    const db = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const mode = db.stripe_mode || 'test';
    const secret = db[`stripe_${mode}_webhook_secret`];
    if (secret) return secret;
  } catch { /* fallback env */ }
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

async function getStripe() {
  const key = await getStripeKey();
  if (!key) throw new Error('STRIPE_SECRET_KEY non configurée');
  if (!stripe || key !== _lastStripeKey) {
    const Stripe = (await import('stripe')).default;
    stripe = new Stripe(key, { apiVersion: '2024-04-10' });
    _lastStripeKey = key;
  }
  return stripe;
}

/* =========================
 *  Routes publiques / portail
 * ========================= */

// POST /public/checkout/create-intent
// Crée un PaymentIntent Stripe à partir d'un panier
// Body: { items: [{product_id, quantity}], email, full_name, address }
publicOrdersRouter.post('/checkout/create-intent', async (req, res, next) => {
  try {
    const { items, email, full_name, address = {} } = req.body;
    if (!items?.length || !email) {
      return res.status(400).json({ error: 'missing_fields', message: 'items et email requis' });
    }

    // Récupérer les produits depuis la DB (prix autoritaire — jamais faire confiance au client)
    const productIds = items.map(i => i.product_id).filter(Boolean);
    const { rows: products } = await q(
      `SELECT id, sku, price_cents, stock_qty, status,
              (SELECT name FROM product_translations WHERE product_id=products.id AND lang='fr' LIMIT 1) AS name
         FROM products WHERE id = ANY($1::uuid[]) AND status='published'`,
      [productIds]
    );

    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    let subtotal = 0;
    const lineItems = [];

    for (const item of items) {
      const p = productMap[item.product_id];
      if (!p) return res.status(400).json({ error: 'product_not_found', product_id: item.product_id });
      if (p.stock_qty < item.quantity) {
        return res.status(400).json({ error: 'insufficient_stock', sku: p.sku });
      }
      const total = p.price_cents * item.quantity;
      subtotal += total;
      lineItems.push({ product_id: p.id, sku: p.sku, name: p.name, unit_price_cents: p.price_cents, quantity: item.quantity, total_cents: total });
    }

    const totalCents = subtotal; // pas de frais de port pour l'instant

    // Créer la commande en DB (statut pending)
    const { rows: [order] } = await q(
      `INSERT INTO orders (email, full_name, address_line1, city, postal_code, country,
                           subtotal_cents, total_cents, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'pending') RETURNING id`,
      [email, full_name || null, address.line1 || null, address.city || null,
       address.postal_code || null, address.country || 'FR', subtotal, totalCents]
    );

    for (const li of lineItems) {
      await q(
        `INSERT INTO order_items (order_id, product_id, sku, name, unit_price_cents, quantity, total_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, li.product_id, li.sku, li.name, li.unit_price_cents, li.quantity, li.total_cents]
      );
    }

    // Créer le PaymentIntent Stripe
    const s = await getStripe();
    const intent = await s.paymentIntents.create({
      amount: totalCents,
      currency: 'eur',
      receipt_email: email,
      metadata: { order_id: order.id },
    });

    // Stocker l'intent ID
    await q(
      `UPDATE orders SET stripe_payment_intent_id=$1, stripe_payment_status=$2, updated_at=now() WHERE id=$3`,
      [intent.id, intent.status, order.id]
    );

    // Audit — création commande + PaymentIntent
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES (NULL, $1, 'CHECKOUT_CREATE', 'order', $2, $3, $4, $5)`,
      [
        email,
        order.id,
        (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(),
        req.headers['user-agent'] || null,
        JSON.stringify({
          stripe_pi: intent.id,
          total_cents: totalCents,
          items: lineItems.map(li => ({ sku: li.sku, name: li.name, qty: li.quantity, total: li.total_cents })),
        }),
      ]
    ).catch(err => console.error('[AUDIT] checkout create error:', err.message));

    res.json({
      order_id: order.id,
      client_secret: intent.client_secret,
      total_cents: totalCents,
    });
  } catch (e) {
    if (e.message === 'STRIPE_SECRET_KEY non configurée') {
      return res.status(503).json({ error: 'stripe_not_configured', message: 'Paiement non disponible.' });
    }
    next(e);
  }
});

// POST /public/checkout/webhook — Stripe webhook
publicOrdersRouter.post('/checkout/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = await getWebhookSecret();
  if (!webhookSecret) return res.status(503).json({ error: 'webhook_not_configured' });

  let event;
  try {
    const s = await getStripe();
    event = s.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (e) {
    return res.status(400).json({ error: 'invalid_signature' });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      await q(
        `UPDATE orders
           SET stripe_payment_status='succeeded', status='paid', paid_at=now(), updated_at=now()
         WHERE stripe_payment_intent_id=$1`,
        [intent.id]
      );
      // Décrémenter le stock
      const { rows: items } = await q(
        `SELECT oi.product_id, oi.quantity, oi.sku FROM order_items oi
           JOIN orders o ON o.id=oi.order_id
         WHERE o.stripe_payment_intent_id=$1`,
        [intent.id]
      );
      for (const item of items) {
        if (item.product_id) {
          await q(
            'UPDATE products SET stock_qty = GREATEST(0, stock_qty - $1) WHERE id=$2',
            [item.quantity, item.product_id]
          );
        }
      }

      // Récupérer l'order_id et l'email pour l'audit
      const { rows: [paidOrder] } = await q(
        'SELECT id, email FROM orders WHERE stripe_payment_intent_id=$1',
        [intent.id]
      );

      // Audit — paiement réussi
      q(
        `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, details)
         VALUES (NULL, $1, 'PAYMENT_SUCCEEDED', 'order', $2, $3, $4)`,
        [
          paidOrder?.email || null,
          paidOrder?.id || null,
          req.headers['x-forwarded-for'] || req.ip || 'stripe-webhook',
          JSON.stringify({
            stripe_event_id: event.id,
            stripe_pi: intent.id,
            amount_cents: intent.amount,
            currency: intent.currency,
            stock_decremented: items.map(i => ({ sku: i.sku, qty: i.quantity })),
          }),
        ]
      ).catch(err => console.error('[AUDIT] payment succeeded error:', err.message));

    } else if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object;
      await q(
        `UPDATE orders SET stripe_payment_status='failed', status='cancelled', updated_at=now()
         WHERE stripe_payment_intent_id=$1`,
        [intent.id]
      );

      // Récupérer l'order_id et l'email pour l'audit
      const { rows: [failedOrder] } = await q(
        'SELECT id, email FROM orders WHERE stripe_payment_intent_id=$1',
        [intent.id]
      );

      // Audit — paiement échoué
      q(
        `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, details)
         VALUES (NULL, $1, 'PAYMENT_FAILED', 'order', $2, $3, $4)`,
        [
          failedOrder?.email || null,
          failedOrder?.id || null,
          req.headers['x-forwarded-for'] || req.ip || 'stripe-webhook',
          JSON.stringify({
            stripe_event_id: event.id,
            stripe_pi: intent.id,
            amount_cents: intent.amount,
            failure_message: intent.last_payment_error?.message || null,
          }),
        ]
      ).catch(err => console.error('[AUDIT] payment failed error:', err.message));
    }
    res.json({ received: true });
  } catch (e) { next(e); }
});

// GET /public/orders/:id — statut d'une commande (pour la page confirmation)
publicOrdersRouter.get('/orders/:id', async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT o.id, o.status, o.stripe_payment_status, o.total_cents, o.email,
              o.created_at, o.paid_at,
              json_agg(json_build_object('name',oi.name,'quantity',oi.quantity,'unit_price_cents',oi.unit_price_cents)) AS items
         FROM orders o
         JOIN order_items oi ON oi.order_id=o.id
        WHERE o.id=$1
        GROUP BY o.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/* =========================
 *  Statut Stripe
 * ========================= */

// GET /admin/stripe — état de la configuration Stripe
adminOrdersRouter.get('/stripe', requireAuth, async (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return res.json({ configured: false, mode: null, ready: false });
  const mode = key.startsWith('sk_live_') ? 'live' : key.startsWith('sk_test_') ? 'test' : 'unknown';
  res.json({ configured: true, mode, ready: true });
});

/* =========================
 *  Routes admin
 * ========================= */

// GET /admin/orders
adminOrdersRouter.get('/orders', requireAuth, async (req, res, next) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query;
    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;
    const where = status ? `WHERE o.status=$1` : '';
    const params = status ? [status, lim, off] : [lim, off];
    const statusIdx = status ? 2 : 1;

    const { rows } = await q(
      `SELECT o.id, o.email, o.full_name, o.status, o.stripe_payment_status,
              o.total_cents, o.created_at, o.paid_at,
              COUNT(oi.id) AS item_count
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id=o.id
         ${where}
         GROUP BY o.id
         ORDER BY o.created_at DESC
         LIMIT $${statusIdx} OFFSET $${statusIdx + 1}`,
      params
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /admin/orders/:id
adminOrdersRouter.get('/orders/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const order = rows[0];
    const { rows: items } = await q('SELECT * FROM order_items WHERE order_id=$1', [req.params.id]);
    order.items = items;
    res.json(order);
  } catch (e) { next(e); }
});

// PATCH /admin/orders/:id — update status + tracking
adminOrdersRouter.patch('/orders/:id', requireAuth, async (req, res, next) => {
  try {
    const allowed = ['status', 'tracking_number', 'notes'];
    const fields = [];
    const vals = [];
    let idx = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) { fields.push(`${k}=$${idx++}`); vals.push(req.body[k]); }
    }
    if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });
    if (req.body.status === 'shipped') { fields.push(`shipped_at=COALESCE(shipped_at,now())`); }
    fields.push(`updated_at=now()`);
    vals.push(req.params.id);
    const { rows } = await q(
      `UPDATE orders SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`, vals
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

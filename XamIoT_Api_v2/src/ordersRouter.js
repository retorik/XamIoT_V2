// src/ordersRouter.js
import express from 'express';
import { q } from './db.js';
import { requireAuth } from './auth.js';
import { createTransporter, buildFrom, isSmtpReady, recordSendOutcome } from './smtp.js';
import { generateInvoicePdf } from './invoiceGenerator.js';
import { dispatch, getStatusLabel } from './notifDispatcher.js';
import { config } from './config.js';

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
              o.shipped_at, o.delivered_at, o.completed_at, o.cancelled_at,
              o.tracking_number, o.carrier,
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

// GET /portal/orders/:id/invoice — téléchargement PDF facture
portalOrdersRouter.get('/orders/:id/invoice', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT o.*, json_agg(json_build_object(
         'name', oi.name, 'sku', oi.sku, 'quantity', oi.quantity,
         'unit_price_cents', oi.unit_price_cents, 'total_cents', oi.total_cents
       ) ORDER BY oi.id) AS items_json
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.id = $1 AND (o.user_id = $2 OR o.email = $3)
        GROUP BY o.id`,
      [req.params.id, req.user.sub, req.user.email]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });

    const order = rows[0];
    const items = order.items_json || [];

    const cfgRows = await q("SELECT key, value FROM app_config WHERE key IN ('site_name','support_email')");
    const siteCfg = Object.fromEntries(cfgRows.rows.map(r => [r.key, r.value]));

    const pdfBuffer = await generateInvoicePdf(order, items, siteCfg);
    const filename = `facture-${order.id.slice(0, 8).toUpperCase()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (e) { next(e); }
});

// GET /portal/orders/:id — détail d'une commande de l'utilisateur connecté
portalOrdersRouter.get('/orders/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT o.id, o.status, o.stripe_payment_status, o.total_cents, o.email,
              o.full_name, o.address_line1, o.city, o.postal_code, o.country,
              o.created_at, o.paid_at, o.shipped_at, o.delivered_at, o.completed_at, o.cancelled_at,
              o.tracking_number, o.carrier,
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
    const order = rows[0];
    const { rows: logs } = await q(
      `SELECT event_type, status_from, status_to, tracking_number, carrier, note, created_at
         FROM order_logs WHERE order_id=$1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    order.logs = logs;
    res.json(order);
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

// ── Helpers checkout ─────────────────────────────────────────────────────────

// Valide les items et retourne { subtotal, lineItems } ou null + envoie l'erreur
async function resolveCartItems(items, res) {
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
    if (!p) { res.status(400).json({ error: 'product_not_found', product_id: item.product_id }); return null; }
    if (p.stock_qty < item.quantity) { res.status(400).json({ error: 'insufficient_stock', sku: p.sku }); return null; }
    const total = p.price_cents * item.quantity;
    subtotal += total;
    lineItems.push({ product_id: p.id, sku: p.sku, name: p.name, unit_price_cents: p.price_cents, quantity: item.quantity, total_cents: total });
  }
  return { subtotal, lineItems };
}

// Calcule frais de port + taxes selon le pays
async function computeShippingAndTax(subtotal, countryCode) {
  const cc = (countryCode || 'FR').toUpperCase();
  const { rows } = await q(
    'SELECT shipping_cents, tax_rate_pct, customs_cents, is_blocked, message_client FROM countries WHERE code=$1 AND is_active=true',
    [cc]
  );
  if (!rows.length) return { error: 'country_not_available' };
  const c = rows[0];
  if (c.is_blocked) return { error: 'country_blocked', message: c.message_client || 'Livraison non disponible dans ce pays.' };

  const shippingCents = c.shipping_cents || 0;
  const taxCents = Math.round(subtotal * parseFloat(c.tax_rate_pct || 0) / 100);
  const customsCents = c.customs_cents || 0;
  const totalCents = subtotal + shippingCents + taxCents + customsCents;

  return { shippingCents, taxCents, customsCents, totalCents, taxRate: parseFloat(c.tax_rate_pct || 0), message: c.message_client };
}

// POST /public/checkout/calculate — preview frais avant paiement
publicOrdersRouter.post('/checkout/calculate', async (req, res, next) => {
  try {
    const { items, country_code } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'items_required' });

    const result = await resolveCartItems(items, res);
    if (!result) return; // erreur déjà envoyée
    const { subtotal, lineItems } = result;

    const fees = await computeShippingAndTax(subtotal, country_code);
    if (fees.error) return res.status(400).json(fees);

    res.json({
      subtotal_cents: subtotal,
      shipping_cents: fees.shippingCents,
      tax_cents: fees.taxCents,
      customs_cents: fees.customsCents,
      total_cents: fees.totalCents,
      tax_rate_pct: fees.taxRate,
      message: fees.message || null,
      items: lineItems.map(li => ({ sku: li.sku, name: li.name, qty: li.quantity, unit_price_cents: li.unit_price_cents, total_cents: li.total_cents })),
    });
  } catch (e) { next(e); }
});

// POST /public/checkout/create-intent
// Crée un PaymentIntent Stripe à partir d'un panier
// Body: { items, email, shipping_address, billing_address?, billing_same_as_shipping?, user_id? }
publicOrdersRouter.post('/checkout/create-intent', async (req, res, next) => {
  try {
    const { items, email, shipping_address = {}, billing_address, billing_same_as_shipping = true } = req.body;
    if (!items?.length || !email) {
      return res.status(400).json({ error: 'missing_fields', message: 'items et email requis' });
    }

    // Résoudre les produits
    const result = await resolveCartItems(items, res);
    if (!result) return;
    const { subtotal, lineItems } = result;

    // Calculer frais/taxes
    const countryCode = (shipping_address.country_code || shipping_address.country || 'FR').toUpperCase();
    const fees = await computeShippingAndTax(subtotal, countryCode);
    if (fees.error) return res.status(400).json(fees);
    const totalCents = fees.totalCents;

    // Extraire user_id si authentifié (optionnel)
    let userId = req.body.user_id || null;
    if (req.headers.authorization) {
      try {
        const jwt = (await import('jsonwebtoken')).default;
        const token = req.headers.authorization.replace(/^Bearer\s+/i, '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
        userId = decoded.sub || null;
      } catch { /* pas authentifié — pas grave */ }
    }

    // Rétrocompatibilité : full_name depuis shipping_address
    const fullName = [shipping_address.first_name, shipping_address.last_name].filter(Boolean).join(' ') || req.body.full_name || null;

    // Créer la commande en DB (statut pending)
    const { rows: [order] } = await q(
      `INSERT INTO orders (
        user_id, email, full_name,
        address_line1, city, postal_code, country,
        shipping_first_name, shipping_last_name, shipping_company,
        shipping_line1, shipping_line2, shipping_postal_code, shipping_city,
        shipping_region, shipping_country_code, shipping_phone,
        billing_same_as_shipping,
        billing_first_name, billing_last_name, billing_company,
        billing_line1, billing_line2, billing_postal_code, billing_city,
        billing_region, billing_country_code, billing_phone,
        subtotal_cents, shipping_cents, tax_cents, total_cents, status
      ) VALUES (
        $1,$2,$3,
        $4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
        $18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
        $29,$30,$31,$32,'pending'
      ) RETURNING id`,
      [
        userId, email, fullName,
        // Rétrocompat anciennes colonnes
        shipping_address.line1 || null, shipping_address.city || null,
        shipping_address.postal_code || null, countryCode,
        // Nouvelles colonnes shipping
        shipping_address.first_name || null, shipping_address.last_name || null,
        shipping_address.company || null, shipping_address.line1 || null,
        shipping_address.line2 || null, shipping_address.postal_code || null,
        shipping_address.city || null, shipping_address.region || null,
        countryCode, shipping_address.phone || null,
        // Billing
        billing_same_as_shipping,
        ...(billing_same_as_shipping ? [null,null,null,null,null,null,null,null,null,null] : [
          billing_address?.first_name || null, billing_address?.last_name || null,
          billing_address?.company || null, billing_address?.line1 || null,
          billing_address?.line2 || null, billing_address?.postal_code || null,
          billing_address?.city || null, billing_address?.region || null,
          (billing_address?.country_code || countryCode).toUpperCase(),
          billing_address?.phone || null,
        ]),
        // Montants
        subtotal, fees.shippingCents, fees.taxCents, totalCents,
      ]
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
       VALUES ($1, $2, 'CHECKOUT_CREATE', 'order', $3, $4, $5, $6)`,
      [
        userId, email, order.id,
        (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(),
        req.headers['user-agent'] || null,
        JSON.stringify({
          stripe_pi: intent.id,
          total_cents: totalCents,
          shipping_cents: fees.shippingCents,
          tax_cents: fees.taxCents,
          country: countryCode,
          items: lineItems.map(li => ({ sku: li.sku, name: li.name, qty: li.quantity, total: li.total_cents })),
        }),
      ]
    ).catch(err => console.error('[AUDIT] checkout create error:', err.message));

    res.json({
      order_id: order.id,
      client_secret: intent.client_secret,
      total_cents: totalCents,
      subtotal_cents: subtotal,
      shipping_cents: fees.shippingCents,
      tax_cents: fees.taxCents,
      customs_cents: fees.customsCents,
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
  const bodyType = Buffer.isBuffer(req.body) ? `Buffer(${req.body.length})` : typeof req.body;
  console.log(`[WEBHOOK] received sig=${!!sig} body_type=${bodyType}`);

  const webhookSecret = await getWebhookSecret();
  if (!webhookSecret) {
    console.warn('[WEBHOOK] webhook_not_configured');
    return res.status(503).json({ error: 'webhook_not_configured' });
  }

  let event;
  try {
    const s = await getStripe();
    event = s.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log(`[WEBHOOK] event type=${event.type} id=${event.id}`);
  } catch (e) {
    console.error(`[WEBHOOK] invalid_signature: ${e.message} — body_type=${bodyType}`);
    // Log dans audit_logs pour traçabilité
    q(`INSERT INTO audit_logs (user_id, user_email, action, resource_type, ip_address, details)
       VALUES (NULL, NULL, 'WEBHOOK_SIG_FAIL', 'order', $1, $2)`,
      [req.headers['x-forwarded-for'] || req.ip || 'stripe', JSON.stringify({ error: e.message, body_type: bodyType })]
    ).catch(() => {});
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

      // Récupérer l'order pour l'email + audit
      const { rows: [paidOrder] } = await q(
        `SELECT o.*, json_agg(json_build_object(
           'name', oi.name, 'sku', oi.sku, 'quantity', oi.quantity,
           'unit_price_cents', oi.unit_price_cents, 'total_cents', oi.total_cents
         ) ORDER BY oi.id) AS items_json
           FROM orders o
           JOIN order_items oi ON oi.order_id = o.id
          WHERE o.stripe_payment_intent_id=$1
          GROUP BY o.id`,
        [intent.id]
      );

      // Email de confirmation de commande
      if (paidOrder?.email && isSmtpReady()) {
        try {
          const transporter = await createTransporter();
          const from = buildFrom();
          if (transporter && from) {
            const cfgRows = await q("SELECT key, value FROM app_config WHERE key IN ('site_name','support_email')");
            const siteCfg = Object.fromEntries(cfgRows.rows.map(r => [r.key, r.value]));
            const siteName = siteCfg.site_name || 'XamIoT';
            const orderItems = paidOrder.items_json || [];
            const orderNum = paidOrder.id.replace(/-/g, '').slice(0, 10).toUpperCase();
            const fmtEur = (c) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
            const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

            const itemsHtml = orderItems.map(i =>
              `<tr>
                <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6">${i.name || i.sku || '—'}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:center">${i.quantity}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right">${fmtEur(i.unit_price_cents)}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right">${fmtEur(i.unit_price_cents * i.quantity)}</td>
              </tr>`
            ).join('');

            let totalsHtml = `<tr><td colspan="3" style="padding:6px 8px;text-align:right;color:#6b7280">Sous-total</td><td style="padding:6px 8px;text-align:right">${fmtEur(paidOrder.subtotal_cents || 0)}</td></tr>`;
            if (paidOrder.shipping_cents > 0) totalsHtml += `<tr><td colspan="3" style="padding:6px 8px;text-align:right;color:#6b7280">Livraison</td><td style="padding:6px 8px;text-align:right">${fmtEur(paidOrder.shipping_cents)}</td></tr>`;
            if (paidOrder.tax_cents > 0) totalsHtml += `<tr><td colspan="3" style="padding:6px 8px;text-align:right;color:#6b7280">TVA</td><td style="padding:6px 8px;text-align:right">${fmtEur(paidOrder.tax_cents)}</td></tr>`;
            totalsHtml += `<tr style="font-weight:bold"><td colspan="3" style="padding:8px;text-align:right;border-top:2px solid #e5e7eb">TOTAL</td><td style="padding:8px;text-align:right;border-top:2px solid #e5e7eb">${fmtEur(paidOrder.total_cents || 0)}</td></tr>`;

            const shipAddr = [
              [paidOrder.shipping_first_name, paidOrder.shipping_last_name].filter(Boolean).join(' '),
              paidOrder.shipping_line1, paidOrder.shipping_line2,
              [paidOrder.shipping_postal_code, paidOrder.shipping_city].filter(Boolean).join(' '),
              paidOrder.shipping_country_code,
            ].filter(Boolean).join('<br>');

            const htmlBody = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#1f2937;margin:0;padding:0;background:#f9fafb">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
  <div style="background:#1d4ed8;padding:28px 32px">
    <h1 style="margin:0;color:#fff;font-size:22px">${siteName}</h1>
  </div>
  <div style="padding:28px 32px">
    <h2 style="margin:0 0 8px;font-size:18px">Confirmation de commande</h2>
    <p style="margin:0 0 24px;color:#6b7280">Merci pour votre achat ! Votre paiement a bien été reçu.</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr style="background:#f3f4f6">
        <td style="padding:6px 8px;font-weight:bold">Commande</td>
        <td style="padding:6px 8px;font-weight:bold">Date</td>
      </tr>
      <tr>
        <td style="padding:6px 8px">${orderNum}</td>
        <td style="padding:6px 8px">${fmtDate(paidOrder.paid_at || paidOrder.created_at)}</td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
      <tr style="background:#f3f4f6">
        <td style="padding:6px 8px;font-weight:bold">Article</td>
        <td style="padding:6px 8px;font-weight:bold;text-align:center">Qté</td>
        <td style="padding:6px 8px;font-weight:bold;text-align:right">Prix unit.</td>
        <td style="padding:6px 8px;font-weight:bold;text-align:right">Total</td>
      </tr>
      ${itemsHtml}
      ${totalsHtml}
    </table>

    ${shipAddr ? `<div style="margin-top:24px"><p style="font-size:12px;color:#6b7280;font-weight:bold;margin-bottom:4px">ADRESSE DE LIVRAISON</p><p style="margin:0;line-height:1.6">${shipAddr}</p></div>` : ''}

    <div style="margin-top:28px;padding:16px;background:#f0fdf4;border-radius:8px;color:#15803d">
      ✓ Paiement confirmé — votre commande est en cours de traitement.
    </div>
  </div>
  <div style="padding:16px 32px;background:#f9fafb;text-align:center;font-size:12px;color:#9ca3af">
    ${siteName} — <a href="mailto:${siteCfg.support_email || 'support@xamiot.com'}" style="color:#9ca3af">${siteCfg.support_email || 'support@xamiot.com'}</a>
  </div>
</div>
</body></html>`;

            // Générer la facture PDF en pièce jointe
            let attachments = [];
            try {
              const pdfBuffer = await generateInvoicePdf(paidOrder, orderItems, siteCfg);
              attachments = [{
                filename: `facture-${orderNum}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
              }];
            } catch (pdfErr) {
              console.warn('[INVOICE] PDF non généré :', pdfErr.message);
            }

            await transporter.sendMail({
              from,
              to: paidOrder.email,
              subject: `[${siteName}] Confirmation de commande ${orderNum}`,
              html: htmlBody,
              attachments,
            });
            recordSendOutcome(true);
          }
        } catch (mailErr) {
          console.error('[ORDER MAIL] Erreur envoi email confirmation :', mailErr.message);
          recordSendOutcome(false, mailErr);
        }
      }

      // Notification système — confirmation commande
      if (paidOrder) {
        const orderNum = paidOrder.id.replace(/-/g, '').slice(0, 10).toUpperCase();
        const fmtEur = (c) => c != null ? (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '';
        dispatch('order_confirmed', paidOrder.user_id || null, {
          first_name: paidOrder.shipping_first_name || '',
          order_num: orderNum,
          total: fmtEur(paidOrder.total_cents),
          items_count: String((paidOrder.items_json || []).length),
          order_url: `${config.urls.orderBase}/${paidOrder.id}`,
        }, { resourceType: 'order', resourceId: paidOrder.id }).catch(() => {});
      }

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

// GET /admin/payment-logs — logs paiements (webhooks Stripe + créations commandes)
adminOrdersRouter.get('/order-logs', requireAuth, async (req, res, next) => {
  try {
    const { limit = '100', offset = '0', from, to, action } = req.query;
    const lim = Math.min(parseInt(limit) || 100, 500);
    const off = parseInt(offset) || 0;

    const ALL_ACTIONS = ['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'ORDER_CREATED', 'WEBHOOK_SIG_FAIL', 'ORDER_STATUS_UPDATE', 'CHECKOUT_CREATE'];
    const conds = [`a.action = ANY($1)`];
    const params = [ALL_ACTIONS];
    let i = 2;

    if (action && ALL_ACTIONS.includes(action)) { conds[0] = `a.action = $${i++}`; params[0] = action; }
    if (from) { conds.push(`a.created_at >= $${i++}`); params.push(from); }
    if (to)   { conds.push(`a.created_at <= $${i++}`); params.push(to); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(lim, off);

    const { rows } = await q(
      `SELECT a.id, a.action, a.resource_type, a.resource_id, a.user_email,
              a.ip_address, a.details, a.created_at,
              o.status AS order_status, o.stripe_payment_status, o.total_cents, o.email AS order_email
         FROM audit_logs a
         LEFT JOIN orders o ON o.id::text = a.resource_id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
      params
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// Rétro-compatibilité — redirige vers order-logs
adminOrdersRouter.get('/payment-logs', requireAuth, (req, res) => {
  const params = new URLSearchParams(req.query).toString();
  res.redirect(307, `/admin/order-logs${params ? '?' + params : ''}`);
});

// GET /admin/orders/stats — comptage par statut
adminOrdersRouter.get('/orders/stats', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status`
    );
    const stats = {};
    for (const r of rows) stats[r.status] = r.count;
    res.json(stats);
  } catch (e) { next(e); }
});

// GET /admin/orders
adminOrdersRouter.get('/orders', requireAuth, async (req, res, next) => {
  try {
    const { status, q: search, limit = '50', offset = '0' } = req.query;
    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;

    const conditions = [];
    const params = [];
    if (status) { conditions.push(`o.status=$${params.length + 1}`); params.push(status); }
    if (search?.trim()) {
      const like = `%${search.trim()}%`;
      conditions.push(`(o.email ILIKE $${params.length + 1} OR o.full_name ILIKE $${params.length + 1} OR o.id::text ILIKE $${params.length + 1})`);
      params.push(like);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(lim, off);

    const { rows } = await q(
      `SELECT o.id, o.email, o.full_name, o.status, o.stripe_payment_status,
              o.total_cents, o.created_at, o.paid_at, o.shipped_at,
              o.delivered_at, o.completed_at, o.cancelled_at,
              o.tracking_number, o.carrier,
              COUNT(oi.id)::int AS item_count
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id=o.id
         ${where}
         GROUP BY o.id
         ORDER BY o.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
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
    const { rows: logs } = await q(
      `SELECT event_type, status_from, status_to, tracking_number, carrier, note, created_by_email, created_at
         FROM order_logs WHERE order_id=$1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    order.items = items;
    order.logs = logs;
    res.json(order);
  } catch (e) { next(e); }
});

// DELETE /admin/orders/:id — suppression définitive avec traçabilité audit
adminOrdersRouter.delete('/orders/:id', requireAuth, async (req, res, next) => {
  try {
    // Récupérer la commande avant suppression pour l'audit
    const { rows } = await q('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const order = rows[0];

    const { rows: items } = await q('SELECT * FROM order_items WHERE order_id=$1', [req.params.id]);

    // Supprimer dans l'ordre : items puis commande
    await q('DELETE FROM order_items WHERE order_id=$1', [req.params.id]);
    await q('DELETE FROM orders WHERE id=$1', [req.params.id]);

    // Trace audit — irréversible, on garde tout
    const adminUser = req.user;
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, 'DELETE', 'order', $3, $4, $5, $6)`,
      [
        adminUser.sub,
        adminUser.email,
        req.params.id,
        (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(),
        req.headers['user-agent'] || null,
        JSON.stringify({
          deleted_by: adminUser.email,
          order_email: order.email,
          order_status: order.status,
          stripe_pi: order.stripe_payment_intent_id,
          total_cents: order.total_cents,
          paid_at: order.paid_at,
          items: items.map(i => ({ sku: i.sku, name: i.name, qty: i.quantity, total: i.total_cents })),
        }),
      ]
    ).catch(err => console.error('[AUDIT] order delete error:', err.message));

    res.json({ ok: true, id: req.params.id });
  } catch (e) { next(e); }
});

// PATCH /admin/orders/:id — update status + tracking + carrier
adminOrdersRouter.patch('/orders/:id', requireAuth, async (req, res, next) => {
  try {
    // Récupérer l'état actuel pour détecter les changements
    const { rows: current } = await q('SELECT status, tracking_number, carrier FROM orders WHERE id=$1', [req.params.id]);
    if (!current.length) return res.status(404).json({ error: 'not_found' });
    const prev = current[0];

    const allowed = ['status', 'tracking_number', 'carrier', 'notes'];
    const fields = [];
    const vals = [];
    let idx = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) { fields.push(`${k}=$${idx++}`); vals.push(req.body[k]); }
    }
    if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });

    // Timestamps automatiques selon le statut
    const newStatus = req.body.status;
    if (newStatus === 'shipped')   { fields.push(`shipped_at=COALESCE(shipped_at,now())`); }
    if (newStatus === 'delivered') { fields.push(`delivered_at=COALESCE(delivered_at,now())`); }
    if (newStatus === 'completed') { fields.push(`completed_at=COALESCE(completed_at,now())`); }
    if (newStatus === 'cancelled') { fields.push(`cancelled_at=COALESCE(cancelled_at,now())`); }
    if (newStatus === 'paid')      { fields.push(`paid_at=COALESCE(paid_at,now())`); }
    fields.push(`updated_at=now()`);

    vals.push(req.params.id);
    const { rows } = await q(
      `UPDATE orders SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`, vals
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });

    // Déterminer le type d'événement pour order_logs
    const statusChanged = newStatus && newStatus !== prev.status;
    const trackingChanged = req.body.tracking_number !== undefined && req.body.tracking_number !== prev.tracking_number;
    const carrierChanged = req.body.carrier !== undefined && req.body.carrier !== prev.carrier;

    let eventType = 'note';
    if (statusChanged) eventType = 'status_change';
    else if (trackingChanged || carrierChanged) eventType = 'shipping_update';

    // Insérer dans order_logs
    q(
      `INSERT INTO order_logs (order_id, event_type, status_from, status_to, tracking_number, carrier, note, created_by_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.params.id,
        eventType,
        statusChanged ? prev.status : null,
        statusChanged ? newStatus : null,
        trackingChanged ? req.body.tracking_number : null,
        carrierChanged ? req.body.carrier : (trackingChanged ? prev.carrier : null),
        req.body.notes || null,
        req.user.email,
      ]
    ).catch(err => console.error('[ORDER_LOG] insert error:', err.message));

    // Notifications automatiques — changement de statut / expédition
    if (statusChanged && rows[0].user_id) {
      const orderNum = rows[0].id.replace(/-/g, '').slice(0, 10).toUpperCase();
      const fmtEur = (c) => c != null ? (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '';
      const statusLabel = getStatusLabel('order', newStatus);
      const prevLabel   = getStatusLabel('order', prev.status);
      dispatch('order_status_changed', rows[0].user_id, {
        first_name: rows[0].shipping_first_name || '',
        order_num: orderNum,
        total: fmtEur(rows[0].total_cents),
        status_from: prevLabel,
        status_to: statusLabel,
        status_label: statusLabel,
        order_url: `${config.urls.orderBase}/${rows[0].id}`,
      }, { resourceType: 'order', resourceId: rows[0].id }).catch(() => {});

      if (newStatus === 'shipped') {
        dispatch('order_shipped', rows[0].user_id, {
          first_name: rows[0].shipping_first_name || '',
          order_num: orderNum,
          tracking_number: rows[0].tracking_number || '',
          carrier: rows[0].carrier || '',
          order_url: `${config.urls.orderBase}/${rows[0].id}`,
        }, { resourceType: 'order', resourceId: rows[0].id }).catch(() => {});
      }
    }

    // Audit log
    q(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, 'ORDER_STATUS_UPDATE', 'order', $3, $4, $5, $6)`,
      [
        req.user.sub,
        req.user.email,
        req.params.id,
        (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(),
        req.headers['user-agent'] || null,
        JSON.stringify(req.body),
      ]
    ).catch(err => console.error('[AUDIT] order patch error:', err.message));

    res.json(rows[0]);
  } catch (e) { next(e); }
});

// src/productsRouter.js
// Module boutique — routes admin et publiques pour les produits et catégories.

import express from 'express';
import { q } from './db.js';
import { requireAuth } from './auth.js';

export const adminProductsRouter = express.Router();
export const publicProductsRouter = express.Router();

// =============================================
// ADMIN — PRODUITS
// =============================================

// GET /admin/products — liste avec name FR + catégorie + stock + status + prix
adminProductsRouter.get('/products', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT
         p.id, p.sku, p.slug, p.status, p.price_cents, p.compare_price_cents,
         p.stock_qty, p.is_physical, p.sort_order, p.featured_media_id,
         p.created_at, p.updated_at, p.published_at,
         t.name,
         c.slug AS category_slug,
         ct.name AS category_name
       FROM products p
       LEFT JOIN product_translations t  ON t.product_id = p.id AND t.lang = 'fr'
       LEFT JOIN product_categories c    ON c.id = p.category_id
       LEFT JOIN product_category_translations ct ON ct.category_id = c.id AND ct.lang = 'fr'
       ORDER BY p.sort_order, p.created_at DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /admin/products/:id — détail + translations + images
adminProductsRouter.get('/products/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT
         p.id, p.sku, p.slug, p.status, p.price_cents, p.compare_price_cents,
         p.stock_qty, p.is_physical, p.sort_order, p.featured_media_id,
         p.category_id, p.created_by, p.created_at, p.updated_at, p.published_at,
         c.slug AS category_slug,
         fm.url_path AS featured_media_url, fm.alt_text AS featured_media_alt
       FROM products p
       LEFT JOIN product_categories c ON c.id = p.category_id
       LEFT JOIN cms_media fm ON fm.id = p.featured_media_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'product_not_found' });

    const product = rows[0];

    const { rows: translations } = await q(
      `SELECT id, lang, name, description, seo_title, seo_description, is_auto_translated, updated_at
       FROM product_translations WHERE product_id = $1 ORDER BY lang`,
      [req.params.id]
    );

    const { rows: images } = await q(
      `SELECT pi.id, pi.media_id, pi.sort_order, m.url_path, m.alt_text, m.original_name
       FROM product_images pi
       JOIN cms_media m ON m.id = pi.media_id
       WHERE pi.product_id = $1
       ORDER BY pi.sort_order`,
      [req.params.id]
    );

    res.json({ ...product, translations, images });
  } catch (e) { next(e); }
});

// POST /admin/products — créer un produit
adminProductsRouter.post('/products', requireAuth, async (req, res, next) => {
  try {
    const {
      sku, slug, category_id, status = 'draft',
      price_cents = 0, compare_price_cents,
      stock_qty = 0, is_physical = true, sort_order = 0,
      featured_media_id,
      translations = [],
    } = req.body || {};

    if (!sku || !slug) return res.status(400).json({ error: 'sku_slug_required' });

    const published_at = status === 'published' ? new Date() : null;

    const { rows } = await q(
      `INSERT INTO products
         (sku, slug, category_id, status, price_cents, compare_price_cents,
          stock_qty, is_physical, sort_order, featured_media_id, created_by, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        sku, slug, category_id || null, status,
        price_cents, compare_price_cents || null,
        stock_qty, is_physical, sort_order,
        featured_media_id || null,
        req.user.sub,
        published_at,
      ]
    );
    const product = rows[0];

    for (const tr of translations) {
      if (!tr.lang || !tr.name) continue;
      await q(
        `INSERT INTO product_translations
           (product_id, lang, name, description, seo_title, seo_description)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (product_id, lang) DO UPDATE
           SET name=$3, description=$4, seo_title=$5, seo_description=$6, updated_at=now()`,
        [product.id, tr.lang, tr.name, tr.description || null, tr.seo_title || null, tr.seo_description || null]
      );
    }

    res.status(201).json(product);
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'sku_or_slug_exists' });
    next(e);
  }
});

// PATCH /admin/products/:id — mise à jour partielle
adminProductsRouter.patch('/products/:id', requireAuth, async (req, res, next) => {
  try {
    const {
      sku, slug, category_id, status,
      price_cents, compare_price_cents,
      stock_qty, is_physical, sort_order,
      featured_media_id,
      translations,
    } = req.body || {};

    const sets = [];
    const params = [];
    let i = 1;

    if (sku               !== undefined) { sets.push(`sku=$${i++}`);                params.push(sku); }
    if (slug              !== undefined) { sets.push(`slug=$${i++}`);               params.push(slug); }
    if (category_id       !== undefined) { sets.push(`category_id=$${i++}`);        params.push(category_id || null); }
    if (status            !== undefined) { sets.push(`status=$${i++}`);             params.push(status); }
    if (price_cents       !== undefined) { sets.push(`price_cents=$${i++}`);        params.push(price_cents); }
    if (compare_price_cents !== undefined) { sets.push(`compare_price_cents=$${i++}`); params.push(compare_price_cents || null); }
    if (stock_qty         !== undefined) { sets.push(`stock_qty=$${i++}`);          params.push(stock_qty); }
    if (is_physical       !== undefined) { sets.push(`is_physical=$${i++}`);        params.push(is_physical); }
    if (sort_order        !== undefined) { sets.push(`sort_order=$${i++}`);         params.push(sort_order); }
    if (featured_media_id !== undefined) { sets.push(`featured_media_id=$${i++}`); params.push(featured_media_id || null); }

    // Gestion published_at automatique
    if (status === 'published') {
      sets.push(`published_at=COALESCE(published_at, now())`);
    }

    if (sets.length > 0) {
      sets.push(`updated_at=now()`);
      params.push(req.params.id);
      await q(
        `UPDATE products SET ${sets.join(', ')} WHERE id=$${i}`,
        params
      );
    }

    if (Array.isArray(translations)) {
      for (const tr of translations) {
        if (!tr.lang || !tr.name) continue;
        await q(
          `INSERT INTO product_translations
             (product_id, lang, name, description, seo_title, seo_description)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (product_id, lang) DO UPDATE
             SET name=$3, description=$4, seo_title=$5, seo_description=$6,
                 is_auto_translated=false, updated_at=now()`,
          [req.params.id, tr.lang, tr.name, tr.description || null, tr.seo_title || null, tr.seo_description || null]
        );
      }
    }

    const { rows } = await q('SELECT * FROM products WHERE id=$1', [req.params.id]);
    res.json(rows[0] || {});
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'sku_or_slug_exists' });
    next(e);
  }
});

// DELETE /admin/products/:id — suppression
adminProductsRouter.delete('/products/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM products WHERE id=$1', [req.params.id]);
    res.json({ ok: rowCount > 0 });
  } catch (e) { next(e); }
});

// POST /admin/products/:id/translate — traduction auto via DeepL (FR → EN + ES)
adminProductsRouter.post('/products/:id/translate', requireAuth, async (req, res, next) => {
  try {
    const { target_langs = ['en', 'es'] } = req.body || {};

    // Récupérer clé DeepL
    const { rows: cfgRows } = await q("SELECT value FROM app_config WHERE key='deepl_api_key'");
    const apiKey = cfgRows[0]?.value;
    if (!apiKey || apiKey.trim() === '') {
      return res.status(400).json({ error: 'no_deepl_key', message: 'Clé DeepL non configurée.' });
    }

    // Source FR
    const { rows: srcRows } = await q(
      "SELECT * FROM product_translations WHERE product_id=$1 AND lang='fr'",
      [req.params.id]
    );
    if (!srcRows.length) return res.status(400).json({ error: 'no_fr_translation' });
    const src = srcRows[0];

    const results = {};
    const LANG_MAP = { en: 'EN', es: 'ES' };

    for (const lang of target_langs) {
      const deeplLang = LANG_MAP[lang];
      if (!deeplLang) continue;

      const texts = [src.name, src.description, src.seo_title, src.seo_description]
        .map(t => t || '');

      const resp = await fetch('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${apiKey}` },
        body: JSON.stringify({ text: texts, target_lang: deeplLang, tag_handling: 'html' }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        results[lang] = { ok: false, error: err.message || `HTTP ${resp.status}` };
        continue;
      }

      const data = await resp.json();
      const [name, description, seo_title, seo_description] =
        data.translations.map(t => t.text || null);

      await q(
        `INSERT INTO product_translations
           (product_id, lang, name, description, seo_title, seo_description, is_auto_translated, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,true,now())
         ON CONFLICT (product_id, lang) DO UPDATE
           SET name=$3, description=$4, seo_title=$5, seo_description=$6,
               is_auto_translated=true, updated_at=now()`,
        [req.params.id, lang, name, description, seo_title, seo_description]
      );
      results[lang] = { ok: true };
    }

    res.json({ ok: true, results });
  } catch (e) { next(e); }
});

// =============================================
// ADMIN — CATÉGORIES
// =============================================

// GET /admin/product-categories — liste avec noms FR
adminProductsRouter.get('/product-categories', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT
         c.id, c.slug, c.sort_order, c.is_active, c.created_at,
         t.name
       FROM product_categories c
       LEFT JOIN product_category_translations t ON t.category_id = c.id AND t.lang = 'fr'
       ORDER BY c.sort_order, c.slug`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /admin/product-categories — créer une catégorie
adminProductsRouter.post('/product-categories', requireAuth, async (req, res, next) => {
  try {
    const { slug, sort_order = 0, is_active = true, translations = [] } = req.body || {};
    if (!slug) return res.status(400).json({ error: 'slug_required' });

    const { rows } = await q(
      `INSERT INTO product_categories (slug, sort_order, is_active)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [slug, sort_order, is_active]
    );
    const cat = rows[0];

    for (const tr of translations) {
      if (!tr.lang || !tr.name) continue;
      await q(
        `INSERT INTO product_category_translations (category_id, lang, name)
         VALUES ($1,$2,$3)
         ON CONFLICT (category_id, lang) DO UPDATE SET name=$3`,
        [cat.id, tr.lang, tr.name]
      );
    }

    res.status(201).json(cat);
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'slug_exists' });
    next(e);
  }
});

// PATCH /admin/product-categories/:id — modifier une catégorie
adminProductsRouter.patch('/product-categories/:id', requireAuth, async (req, res, next) => {
  try {
    const { slug, sort_order, is_active, translations } = req.body || {};

    const sets = [];
    const params = [];
    let i = 1;

    if (slug       !== undefined) { sets.push(`slug=$${i++}`);       params.push(slug); }
    if (sort_order !== undefined) { sets.push(`sort_order=$${i++}`); params.push(sort_order); }
    if (is_active  !== undefined) { sets.push(`is_active=$${i++}`);  params.push(is_active); }

    if (sets.length > 0) {
      params.push(req.params.id);
      await q(
        `UPDATE product_categories SET ${sets.join(', ')} WHERE id=$${i}`,
        params
      );
    }

    if (Array.isArray(translations)) {
      for (const tr of translations) {
        if (!tr.lang || !tr.name) continue;
        await q(
          `INSERT INTO product_category_translations (category_id, lang, name)
           VALUES ($1,$2,$3)
           ON CONFLICT (category_id, lang) DO UPDATE SET name=$3`,
          [req.params.id, tr.lang, tr.name]
        );
      }
    }

    const { rows } = await q('SELECT * FROM product_categories WHERE id=$1', [req.params.id]);
    res.json(rows[0] || {});
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'slug_exists' });
    next(e);
  }
});

// DELETE /admin/product-categories/:id — supprimer une catégorie
adminProductsRouter.delete('/product-categories/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await q('DELETE FROM product_categories WHERE id=$1', [req.params.id]);
    res.json({ ok: rowCount > 0 });
  } catch (e) { next(e); }
});

// =============================================
// PUBLIC — PRODUITS
// =============================================

// GET /public/products — produits publiés avec traduction + pagination + filtre catégorie
publicProductsRouter.get('/products', async (req, res, next) => {
  try {
    const lang   = ['fr','en','es'].includes(req.query.lang) ? req.query.lang : 'fr';
    const limit  = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const categorySlug = req.query.category || null;

    const whereExtra = categorySlug ? 'AND c.slug = $4' : '';
    const queryParams = categorySlug
      ? [lang, limit, offset, categorySlug]
      : [lang, limit, offset];

    const { rows } = await q(
      `SELECT
         p.id, p.sku, p.slug, p.status, p.price_cents, p.compare_price_cents,
         p.price_cents::float / 100 AS price_eur,
         CASE WHEN p.compare_price_cents IS NOT NULL
              THEN p.compare_price_cents::float / 100
              ELSE NULL END AS compare_price_eur,
         p.stock_qty, p.is_physical, p.sort_order,
         p.featured_media_id, p.published_at,
         COALESCE(t.name,        tf.name)        AS name,
         COALESCE(t.description, tf.description) AS description,
         COALESCE(t.seo_title,   tf.seo_title)   AS seo_title,
         c.slug AS category_slug,
         ct.name AS category_name,
         m.url_path AS featured_media_url,
         m.alt_text AS featured_media_alt
       FROM products p
       LEFT JOIN product_translations t  ON t.product_id = p.id AND t.lang = $1
       LEFT JOIN product_translations tf ON tf.product_id = p.id AND tf.lang = 'fr'
       LEFT JOIN product_categories c    ON c.id = p.category_id
       LEFT JOIN product_category_translations ct ON ct.category_id = c.id AND ct.lang = $1
       LEFT JOIN cms_media m              ON m.id = p.featured_media_id
       WHERE p.status = 'published'
         ${whereExtra}
       ORDER BY p.sort_order, p.published_at DESC
       LIMIT $2 OFFSET $3`,
      queryParams
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /public/products/:slug — détail produit public + images
publicProductsRouter.get('/products/:slug', async (req, res, next) => {
  try {
    const lang = ['fr','en','es'].includes(req.query.lang) ? req.query.lang : 'fr';

    const { rows } = await q(
      `SELECT
         p.id, p.sku, p.slug, p.status, p.price_cents, p.compare_price_cents,
         p.price_cents::float / 100 AS price_eur,
         CASE WHEN p.compare_price_cents IS NOT NULL
              THEN p.compare_price_cents::float / 100
              ELSE NULL END AS compare_price_eur,
         p.stock_qty, p.is_physical, p.sort_order,
         p.featured_media_id, p.published_at,
         COALESCE(t.name,            tf.name)            AS name,
         COALESCE(t.description,     tf.description)     AS description,
         COALESCE(t.seo_title,       tf.seo_title)       AS seo_title,
         COALESCE(t.seo_description, tf.seo_description) AS seo_description,
         CASE WHEN t.id IS NULL THEN 'fr' ELSE $1::text END AS effective_lang,
         c.slug AS category_slug,
         ct.name AS category_name,
         m.url_path AS featured_media_url,
         m.alt_text AS featured_media_alt
       FROM products p
       LEFT JOIN product_translations t  ON t.product_id = p.id AND t.lang = $1
       LEFT JOIN product_translations tf ON tf.product_id = p.id AND tf.lang = 'fr'
       LEFT JOIN product_categories c    ON c.id = p.category_id
       LEFT JOIN product_category_translations ct ON ct.category_id = c.id AND ct.lang = $1
       LEFT JOIN cms_media m              ON m.id = p.featured_media_id
       WHERE p.slug = $2 AND p.status = 'published'`,
      [lang, req.params.slug]
    );

    if (!rows.length) return res.status(404).json({ error: 'product_not_found' });

    const product = rows[0];

    const { rows: images } = await q(
      `SELECT pi.id, pi.media_id, pi.sort_order, m.url_path, m.alt_text, m.original_name
       FROM product_images pi
       JOIN cms_media m ON m.id = pi.media_id
       WHERE pi.product_id = $1
       ORDER BY pi.sort_order`,
      [product.id]
    );

    res.json({ ...product, images });
  } catch (e) { next(e); }
});

// GET /public/product-categories — catégories actives avec traduction
publicProductsRouter.get('/product-categories', async (req, res, next) => {
  try {
    const lang = ['fr','en','es'].includes(req.query.lang) ? req.query.lang : 'fr';

    const { rows } = await q(
      `SELECT
         c.id, c.slug, c.sort_order,
         COALESCE(t.name, tf.name) AS name
       FROM product_categories c
       LEFT JOIN product_category_translations t  ON t.category_id = c.id AND t.lang = $1
       LEFT JOIN product_category_translations tf ON tf.category_id = c.id AND tf.lang = 'fr'
       WHERE c.is_active = true
       ORDER BY c.sort_order, c.slug`,
      [lang]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

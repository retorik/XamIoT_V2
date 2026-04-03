// src/cmsPublicRouter.js
// Routes CMS publiques — servies au site public et au portail client.
// Aucune authentification requise.

import express from 'express';
import { q } from './db.js';

export const cmsPublicRouter = express.Router();

/**
 * GET /public/pages
 * Liste des pages publiées avec leur traduction dans la langue demandée.
 * Query: ?lang=fr (défaut: fr) &menu=true (uniquement celles dans le menu)
 */
cmsPublicRouter.get('/pages', async (req, res, next) => {
  try {
    const lang    = ['fr','en','es'].includes(req.query.lang) ? req.query.lang : 'fr';
    const menuOnly = req.query.menu === 'true';

    const { rows } = await q(
      `SELECT
         p.id, p.slug, p.sort_order, p.show_in_menu, p.featured_media_id, p.published_at,
         COALESCE(t.title,       tf.title)             AS title,
         COALESCE(t.menu_label,  tf.menu_label, t.title, tf.title) AS menu_label,
         COALESCE(t.seo_title,   tf.seo_title)          AS seo_title,
         COALESCE(t.seo_description, tf.seo_description) AS seo_description
       FROM cms_pages p
       LEFT JOIN cms_page_translations t  ON t.page_id = p.id AND t.lang = $1
       LEFT JOIN cms_page_translations tf ON tf.page_id = p.id AND tf.lang = 'fr'
       WHERE p.status = 'published'
         ${menuOnly ? 'AND p.show_in_menu = true' : ''}
       ORDER BY p.sort_order, p.slug`,
      [lang]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

/**
 * GET /public/menu
 * Items de menu ordonnés (pages publiées + show_in_menu = true).
 * Raccourci pour le site public.
 * Query: ?lang=fr
 */
cmsPublicRouter.get('/menu', async (req, res, next) => {
  try {
    const lang = ['fr','en','es'].includes(req.query.lang) ? req.query.lang : 'fr';
    const isFooter = req.query.footer === '1';
    const filterCol = isFooter ? 'p.show_in_footer' : 'p.show_in_menu';
    const { rows } = await q(
      `SELECT
         p.id, p.slug, p.sort_order, p.parent_id,
         COALESCE(t.title,      tf.title)                         AS title,
         COALESCE(t.menu_label, tf.menu_label, t.title, tf.title) AS menu_label
       FROM cms_pages p
       LEFT JOIN cms_page_translations t  ON t.page_id = p.id AND t.lang = $1
       LEFT JOIN cms_page_translations tf ON tf.page_id = p.id AND tf.lang = 'fr'
       WHERE p.status = 'published' AND ${filterCol} = true
       ORDER BY p.sort_order, p.slug`,
      [lang]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

/**
 * GET /public/pages/:slug
 * Contenu complet d'une page par son slug.
 * Query: ?lang=fr
 * Si la traduction demandée n'existe pas, retourne le contenu FR en fallback.
 */
cmsPublicRouter.get('/pages/:slug', async (req, res, next) => {
  try {
    const lang = ['fr','en','es'].includes(req.query.lang) ? req.query.lang : 'fr';
    const { rows } = await q(
      `SELECT
         p.id, p.slug, p.sort_order, p.featured_media_id, p.published_at,
         COALESCE(t.title,           tf.title)           AS title,
         COALESCE(t.content,         tf.content)         AS content,
         COALESCE(t.content_after,   tf.content_after)   AS content_after,
         COALESCE(t.seo_title,       tf.seo_title,       t.title, tf.title) AS seo_title,
         COALESCE(t.seo_description, tf.seo_description) AS seo_description,
         COALESCE(t.menu_label,      tf.menu_label)      AS menu_label,
         CASE WHEN t.id IS NULL THEN 'fr' ELSE $1::text END AS effective_lang,
         -- média vedette si présent
         m.url_path AS featured_media_url,
         m.alt_text AS featured_media_alt
       FROM cms_pages p
       LEFT JOIN cms_page_translations t  ON t.page_id = p.id AND t.lang = $1
       LEFT JOIN cms_page_translations tf ON tf.page_id = p.id AND tf.lang = 'fr'
       LEFT JOIN cms_media m ON m.id = p.featured_media_id
       WHERE p.slug = $2 AND p.status = 'published'`,
      [lang, req.params.slug]
    );

    if (!rows.length) return res.status(404).json({ error: 'page_not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/**
 * GET /public/media/:id
 * Informations publiques d'un média (url_path, dimensions, alt_text).
 */
cmsPublicRouter.get('/media/:id', async (req, res, next) => {
  try {
    const { rows } = await q(
      'SELECT id, original_name, mime_type, size_bytes, width_px, height_px, alt_text, url_path, created_at FROM cms_media WHERE id=$1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'media_not_found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

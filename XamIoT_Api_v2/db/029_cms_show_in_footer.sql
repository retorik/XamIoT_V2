-- 029_cms_show_in_footer.sql
-- Ajoute le champ show_in_footer aux pages CMS (distinct de show_in_menu = nav en-tête).

ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS show_in_footer boolean NOT NULL DEFAULT false;

-- Les pages légales et utilitaires créées en 028 doivent apparaître dans le pied de page
UPDATE cms_pages SET show_in_footer = true WHERE slug IN (
  'politique-de-confidentialite',
  'conditions-utilisation',
  'conditions-abonnement',
  'cgv',
  'mentions-legales',
  'aide-en-ligne',
  'contact-support'
);

INSERT INTO schema_migrations (version) VALUES ('029') ON CONFLICT DO NOTHING;

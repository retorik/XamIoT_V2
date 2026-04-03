-- 021_manual_campaigns.sql
-- Historique des envois manuels depuis le backoffice

CREATE TABLE IF NOT EXISTS manual_campaigns (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by       text,                                   -- email de l'admin expéditeur
  send_types    text[]      NOT NULL,                   -- ['push'], ['email'], ['push','email']
  title         text,                                   -- titre pour les push
  subject       text,                                   -- sujet pour les emails
  body          text        NOT NULL,                   -- corps du message (texte brut)
  html_body     text,                                   -- corps HTML optionnel
  filters       jsonb       DEFAULT '{}',               -- critères de ciblage appliqués
  target_count  integer     DEFAULT 0,                  -- nombre de destinataires ciblés
  success_push  integer     DEFAULT 0,
  fail_push     integer     DEFAULT 0,
  success_email integer     DEFAULT 0,
  fail_email    integer     DEFAULT 0,
  errors        jsonb       DEFAULT '[]',               -- détail des erreurs (max 50)
  sent_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_campaigns_sent_at ON manual_campaigns(sent_at DESC);

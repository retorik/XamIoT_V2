-- 039_scheduled_notifs.sql
-- Système 4 : Notifications planifiées (date fixe ou récurrence)

CREATE TABLE IF NOT EXISTS scheduled_notifs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  description           TEXT,

  -- Canaux
  push_enabled          BOOLEAN NOT NULL DEFAULT true,
  email_enabled         BOOLEAN NOT NULL DEFAULT false,

  -- Contenu push
  push_title            TEXT,
  push_body             TEXT,

  -- Contenu email
  email_subject         TEXT,
  email_html            TEXT,              -- édité via TipTap

  -- Ciblage destinataires
  filter_user_ids       UUID[],            -- null = utiliser les autres filtres
  filter_device_type_id UUID REFERENCES device_types(id) ON DELETE SET NULL,
  filter_mobile_platform TEXT,             -- 'iOS' | 'Android' | null = tous
  filter_has_push       BOOLEAN,           -- true = uniquement utilisateurs avec token push

  -- Planification
  scheduled_at          TIMESTAMPTZ NOT NULL,
  recurrence            TEXT CHECK (recurrence IN ('daily','weekly','monthly') OR recurrence IS NULL),
  recurrence_end_at     TIMESTAMPTZ,       -- null = infini

  -- État
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','cancelled','error')),
  last_run_at           TIMESTAMPTZ,
  next_run_at           TIMESTAMPTZ,       -- calculé automatiquement
  run_count             INTEGER NOT NULL DEFAULT 0,
  last_error            TEXT,

  -- Audit
  created_by            TEXT,              -- email admin
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifs_status ON scheduled_notifs(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifs_next   ON scheduled_notifs(next_run_at) WHERE status = 'pending';

INSERT INTO schema_migrations (version) VALUES ('046') ON CONFLICT DO NOTHING;

-- Migration 044 : codes de vérification pour suppression de compte
-- Expire 15 min après création. ON DELETE CASCADE depuis users.

CREATE TABLE IF NOT EXISTS account_deletion_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES users(id) ON DELETE CASCADE,
  code_hash   text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accdel_user ON account_deletion_codes(user_id);

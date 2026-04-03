-- db/007_smtp_config.sql
-- Configuration SMTP stockée en base (hot-reload sans restart)

CREATE TABLE IF NOT EXISTS smtp_config (
  id          integer     PRIMARY KEY DEFAULT 1,
  host        text        NOT NULL,
  port        integer     NOT NULL DEFAULT 587,
  secure      boolean     NOT NULL DEFAULT false,  -- true = TLS implicite (port 465)
  user_login  text,                                -- login SMTP (peut différer de from_email)
  pass        text,
  from_name   text,
  from_email  text        NOT NULL,
  reply_to    text,
  updated_at  timestamptz DEFAULT now()
);

-- Contrainte : une seule ligne
ALTER TABLE smtp_config ADD CONSTRAINT smtp_config_single_row CHECK (id = 1);

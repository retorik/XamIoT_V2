-- extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- table users
ALTER TABLE public.users
  ALTER COLUMN email TYPE citext USING email::citext,
  ALTER COLUMN created_at SET DEFAULT now();

-- colonne unique attendue par l’API
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='password_hash'
  ) THEN
    ALTER TABLE public.users RENAME COLUMN password_hash TO pass_hash;
  END IF;
END$$;

ALTER TABLE public.users
  ALTER COLUMN pass_hash SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_email_key') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE(email);
  END IF;
END$$;

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- id uuid PK + default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='id'
  ) THEN
    ALTER TABLE public.users ADD COLUMN id uuid PRIMARY KEY DEFAULT gen_random_uuid();
  ELSE
    -- s'assure d'un default si absent
    BEGIN
      ALTER TABLE public.users ALTER COLUMN id SET DEFAULT gen_random_uuid();
    EXCEPTION WHEN others THEN
      -- ignore si pas applicable
      NULL;
    END;
  END IF;
END $$;

-- email unique not null
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.users ALTER COLUMN email SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='users' AND indexname='users_email_key'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE(email);
  END IF;
END $$;

-- password_hash not null
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL;

-- created_at default now()
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

COMMIT;

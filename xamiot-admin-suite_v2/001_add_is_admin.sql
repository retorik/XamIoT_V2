-- 001_add_is_admin.sql
-- Ajoute un flag admin pour permettre l'accès à l'API /admin/*
-- (Compatible avec ton schéma actuel: table public.users)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Exemple : rendre admin un utilisateur existant (à adapter)
-- UPDATE public.users SET is_admin=true WHERE email='ton@email.com';

-- Chantier 2 (brief arbitrages 17/07) : gate anti fiche vide, alertes, note.
--
-- 1) system_state : petit stockage clé/valeur pour l'état transverse qui doit
--    survivre aux fonctions serverless (disjoncteur API Anthropic, compteurs).
-- 2) Note de plateau sur la fiche (métrique qualité décidée au §1.1) : note de
--    Matthieu après enregistrement, 1 à 5, avec commentaire et horodatage.

create table if not exists public.system_state (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.system_state enable row level security;
-- Lecture/écriture service role uniquement (aucune policy : l'app n'y touche pas).

alter table public.fiches add column if not exists note_plateau int
  check (note_plateau between 1 and 5);
alter table public.fiches add column if not exists note_commentaire text;
alter table public.fiches add column if not exists note_at timestamptz;

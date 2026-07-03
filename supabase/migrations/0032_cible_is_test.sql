-- A6 — flag « cible de test » : permet des tests de bout en bout en production
-- sans polluer les stats, le score ni la sélection du jour. Filtré côté code
-- (comme le snooze), donc pas de recréation de vue. Une cible de test reste
-- visible dans son dossier mais sort de show_stats, daily_five et du board.

alter table public.cibles add column if not exists is_test boolean not null default false;
create index if not exists cibles_is_test_idx on public.cibles(show_id) where is_test = true;

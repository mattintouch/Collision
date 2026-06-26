-- Lot 4 — Appui : séparer la NATURE (ce qu'est l'appui : ancien invité,
-- conseiller…) de la FONCTION d'approche (est-il le relais qui ouvre la porte).
-- On conserve l'existant en renommant `type` -> `nature`, et on ajoute un
-- booléen `est_relais` (variante légère retenue).

alter table public.appuis rename column type to nature;
alter table public.appuis add column if not exists est_relais boolean not null default false;

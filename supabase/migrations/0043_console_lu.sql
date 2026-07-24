-- Tâche 8 (handoff 24/07) : dernier-lu PAR OPÉRATEUR dans la console.
-- Un événement kind='lu' (payload {jusqu_a: ISO}) marque jusqu'où l'opérateur
-- a lu la régie : ligne de flottaison « non lus » et bouton clignotant.
-- En base (pas localStorage) : cohérent entre appareils, décision actée.

alter table public.fiche_console_events drop constraint if exists fiche_console_events_kind_check;
alter table public.fiche_console_events add constraint fiche_console_events_kind_check
  check (kind in ('clip', 'note', 'chat', 'check', 'question', 'lu'));

-- Plan v1.1 S7 — boucle de feedback du score : chaque touche peut porter un
-- résultat (mesure « le score convertit-il ? »). Alimente show_stats et le
-- tuning des poids en septembre. Optionnel, non bloquant.

alter table public.touches add column if not exists resultat text
  check (resultat in ('reponse_positive', 'reponse_negative', 'silence', 'avance_stage'));

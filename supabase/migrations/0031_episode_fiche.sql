-- S10 — stockage de la fiche de prep sur l'épisode. Le HTML est généré depuis le
-- dossier enrichi, stocké ici, et servi par la route /fiche/[episode] via un lien
-- signé (fiche_token = jeton HS256 typ=fiche). « Régénérer » réécrit ces champs.

alter table public.episodes
  add column if not exists fiche_html         text,
  add column if not exists fiche_token        text,
  add column if not exists fiche_generated_at timestamptz,
  add column if not exists prep_sent_at        timestamptz;

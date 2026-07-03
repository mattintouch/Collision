-- B3/B4/B5 — configuration d'envoi PAR SHOW (fin du staff en dur dans l'env).
--  - sender_email / sender_name : l'expéditeur des mails et l'organisateur des
--    invitations. Alias gratuit sur la boîte d'envoi (ex. gdiy@collision.studio,
--    « Génération Do It Yourself »). Décidé : alias, pas de compte payant.
--  - staff : participants systématiques, structurés (nom complet, email, tél,
--    rôle) → invités à chaque enregistrement ET alimentent le VCF (B4).
--    jsonb : [{ "nom": "...", "email": "...", "telephone": "...", "role": "..." }]

alter table public.shows
  add column if not exists sender_email text,
  add column if not exists sender_name  text,
  add column if not exists staff        jsonb not null default '[]'::jsonb;

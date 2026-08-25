-- P1 bis du chantier doublons (25/08, cas des quatre fiches Harari) : fusion
-- de deux cibles en UNE transaction (le corps d'une fonction plpgsql est
-- atomique). Règles actées :
--   1. La survivante gagne sur les champs remplis des deux côtés ; les
--      données présentes uniquement sur l'absorbée sont rapatriées.
--   2. Appuis, touches, contacts et folk_id migrent vers la survivante ;
--      les valeurs identiques ne sont JAMAIS dupliquées (l'original reste
--      alors rattaché à l'absorbée archivée : rien n'est perdu).
--   3. L'absorbée est ARCHIVÉE avec une note qui pointe la survivante,
--      jamais supprimée.
-- Appelée par l'outil MCP fusionner_cibles (admin) via RPC, service role.

create extension if not exists unaccent;

create or replace function public.fusionner_cibles(survivante uuid, absorbee uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.cibles%rowtype;
  a public.cibles%rowtype;
  r record;
  appui_survivant uuid;
  appuis_deplaces int := 0;
  appuis_fusionnes int := 0;
  touches_deplacees int := 0;
  contacts_deplaces int := 0;
begin
  if survivante = absorbee then
    raise exception 'survivante et absorbée sont la même cible';
  end if;
  select * into s from public.cibles where id = survivante;
  if not found then raise exception 'cible survivante introuvable'; end if;
  select * into a from public.cibles where id = absorbee;
  if not found then raise exception 'cible absorbée introuvable'; end if;
  if s.show_id <> a.show_id then
    raise exception 'les deux cibles ne sont pas sur le même show';
  end if;

  -- 1. Champs : la survivante gagne, l'absorbée comble les vides.
  update public.cibles set
    role                = coalesce(s.role, a.role),
    organisation        = coalesce(s.organisation, a.organisation),
    archetype           = coalesce(s.archetype, a.archetype),
    secteur             = coalesce(s.secteur, a.secteur),
    pays                = coalesce(s.pays, a.pays),
    envergure           = coalesce(s.envergure, a.envergure),
    ville               = coalesce(s.ville, a.ville),
    photo_url           = coalesce(s.photo_url, a.photo_url),
    playbook            = coalesce(s.playbook, a.playbook),
    note                = coalesce(s.note, a.note),
    note_priorite       = coalesce(s.note_priorite, a.note_priorite),
    canal_reel          = coalesce(s.canal_reel, a.canal_reel),
    via_qui             = coalesce(s.via_qui, a.via_qui),
    raison_de_selection = coalesce(s.raison_de_selection, a.raison_de_selection),
    etat_recherche      = coalesce(s.etat_recherche, a.etat_recherche),
    folk_id             = coalesce(s.folk_id, a.folk_id),
    prenom              = coalesce(s.prenom, a.prenom),
    genre               = coalesce(s.genre, a.genre),
    statut_ref          = coalesce(s.statut_ref, a.statut_ref),
    date_relance        = coalesce(s.date_relance, a.date_relance),
    date_contact        = coalesce(s.date_contact, a.date_contact),
    sujets              = case when s.sujets is null or cardinality(s.sujets) = 0 then a.sujets else s.sujets end,
    categorie           = case when cardinality(s.categorie) = 0 then a.categorie else s.categorie end,
    serie_speciale      = case when cardinality(s.serie_speciale) = 0 then a.serie_speciale else s.serie_speciale end,
    social_score        = greatest(s.social_score, a.social_score),
    premiere_neige      = s.premiere_neige or a.premiere_neige,
    tag_investisseur    = s.tag_investisseur or a.tag_investisseur,
    date_derniere_touche = greatest(coalesce(s.date_derniere_touche, a.date_derniere_touche), coalesce(a.date_derniere_touche, s.date_derniere_touche))
  where id = survivante;

  -- 2a. Appuis : déplacés, sauf homonyme (nom normalisé) déjà sur la
  --     survivante ; l'homonyme reste sur l'absorbée mais ses coordonnées et
  --     ses champs manquants migrent vers l'appui survivant.
  for r in select * from public.appuis where cible_id = absorbee loop
    select id into appui_survivant from public.appuis
      where cible_id = survivante
        and lower(unaccent(regexp_replace(btrim(nom), '\s+', ' ', 'g')))
          = lower(unaccent(regexp_replace(btrim(r.nom), '\s+', ' ', 'g')))
      limit 1;
    if appui_survivant is null then
      update public.appuis set cible_id = survivante where id = r.id;
      appuis_deplaces := appuis_deplaces + 1;
    else
      update public.contacts c set appui_id = appui_survivant
        where c.appui_id = r.id
          and not exists (
            select 1 from public.contacts c2
            where c2.appui_id = appui_survivant and lower(btrim(c2.valeur)) = lower(btrim(c.valeur))
          );
      update public.appuis t set
        note          = coalesce(t.note, r.note),
        organisation  = coalesce(t.organisation, r.organisation),
        est_relais    = t.est_relais or r.est_relais,
        ally_cible_id = coalesce(t.ally_cible_id, r.ally_cible_id),
        folk_id       = coalesce(t.folk_id, r.folk_id)
      where t.id = appui_survivant;
      appuis_fusionnes := appuis_fusionnes + 1;
    end if;
  end loop;

  -- 2b. Touches : toutes rapatriées, sauf copie exacte (même date, même
  --     contenu) déjà présente sur la survivante.
  update public.touches t set cible_id = survivante
    where t.cible_id = absorbee
      and not exists (
        select 1 from public.touches t2
        where t2.cible_id = survivante and t2.date = t.date and t2.contenu is not distinct from t.contenu
      );
  get diagnostics touches_deplacees = row_count;

  -- 2c. Coordonnées de la cible : rapatriées sans doublon de valeur.
  update public.contacts c set cible_id = survivante
    where c.cible_id = absorbee
      and not exists (
        select 1 from public.contacts c2
        where c2.cible_id = survivante and lower(btrim(c2.valeur)) = lower(btrim(c.valeur))
      );
  get diagnostics contacts_deplaces = row_count;

  -- 3. L'absorbée est archivée, jamais supprimée, avec la note de renvoi.
  update public.cibles set
    archive = true,
    note = coalesce(note || E'\n', '') || 'Fusionnée dans la cible ' || survivante::text || ' le ' || to_char(now(), 'DD/MM/YYYY') || '.'
  where id = absorbee;

  return jsonb_build_object(
    'survivante', survivante,
    'absorbee', absorbee,
    'appuis_deplaces', appuis_deplaces,
    'appuis_fusionnes', appuis_fusionnes,
    'touches_deplacees', touches_deplacees,
    'contacts_deplaces', contacts_deplaces
  );
end $$;

revoke execute on function public.fusionner_cibles(uuid, uuid) from public, anon, authenticated;

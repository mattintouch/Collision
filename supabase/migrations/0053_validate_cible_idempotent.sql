-- validate_cible idempotent (brief du 12/09, chantier 5). Relancée sur une
-- cible déjà validée, la fonction créait un SECOND épisode (doublon nettoyé à
-- la main le 11/09) : aucune contrainte d'unicité sur episodes(cible_id), et
-- l'insertion était inconditionnelle. Désormais l'épisode existant le plus
-- récent est réutilisé et renvoyé ; l'appelant (outil MCP validate_cible) ne
-- crée que l'invitation manquante. Le contexte de l'épisode existant n'est
-- PAS réécrit (il a pu être complété à la main). Pas d'index unique : une
-- cible peut légitimement revenir pour un second épisode après cancel_episode
-- (qui supprime la ligne) ; la règle « un épisode vivant par cible » vit ici.

create or replace function public.validate_cible(target_cible uuid)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  c            public.cibles%rowtype;
  final_stage  uuid;
  contexte     jsonb;
  new_episode  uuid;
begin
  select * into c from public.cibles where id = target_cible;
  if not found then
    raise exception 'Cible introuvable: %', target_cible;
  end if;

  -- Étape finale configurée du show (is_final), sinon la dernière position.
  select id into final_stage
    from public.stages
   where show_id = c.show_id and is_final
   order by position desc limit 1;
  if final_stage is null then
    select id into final_stage
      from public.stages where show_id = c.show_id
     order by position desc limit 1;
  end if;

  -- Idempotence : un épisode existe déjà pour cette cible, il est réutilisé.
  select id into new_episode
    from public.episodes
   where cible_id = c.id
   order by created_at desc
   limit 1;

  if new_episode is null then
    contexte := jsonb_build_object(
      'cible',   to_jsonb(c),
      'appuis',  coalesce((select jsonb_agg(to_jsonb(a)) from public.appuis  a where a.cible_id = c.id), '[]'::jsonb),
      'touches', coalesce((select jsonb_agg(to_jsonb(t)) from public.touches t where t.cible_id = c.id), '[]'::jsonb),
      'signals', coalesce((select jsonb_agg(to_jsonb(s)) from public.signals s where s.cible_id = c.id), '[]'::jsonb)
    );

    insert into public.episodes (cible_id, show_id, nom, contexte)
    values (c.id, c.show_id, c.nom, contexte)
    returning id into new_episode;
  end if;

  if final_stage is not null then
    update public.cibles set stage_id = final_stage where id = c.id;
  end if;

  return new_episode;
end; $$;

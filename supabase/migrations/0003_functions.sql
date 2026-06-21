-- Magellan — fonctions métier : validation -> épisode, et vue de résurgence.

-- ---------------------------------------------------------------------------
-- validate_cible : bascule une cible en épisode en emmenant son contexte (§13.7, Étape 6).
-- Hérite nom, sujets, appuis, dernières touches et signaux dans contexte jsonb.
-- Place la cible sur l'étape finale du show si elle existe.
-- ---------------------------------------------------------------------------
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

  contexte := jsonb_build_object(
    'cible',   to_jsonb(c),
    'appuis',  coalesce((select jsonb_agg(to_jsonb(a)) from public.appuis  a where a.cible_id = c.id), '[]'::jsonb),
    'touches', coalesce((select jsonb_agg(to_jsonb(t)) from public.touches t where t.cible_id = c.id), '[]'::jsonb),
    'signals', coalesce((select jsonb_agg(to_jsonb(s)) from public.signals s where s.cible_id = c.id), '[]'::jsonb)
  );

  insert into public.episodes (cible_id, show_id, nom, contexte)
  values (c.id, c.show_id, c.nom, contexte)
  returning id into new_episode;

  if final_stage is not null then
    update public.cibles set stage_id = final_stage where id = c.id;
  end if;

  return new_episode;
end; $$;

-- ---------------------------------------------------------------------------
-- Vue de résurgence : enrichit chaque cible des signaux d'anti-oubli.
-- jours_depuis_touche, dernier signal, fraîcheur du signal. La logique de
-- priorisation (voie froide devant, relance avec raison) vit dans le copilote.
-- ---------------------------------------------------------------------------
create or replace view public.cibles_enrichies
with (security_invoker = true) as
select
  c.*,
  st.key   as stage_key,
  st.label as stage_label,
  st.position as stage_position,
  case
    when c.date_derniere_touche is null then null
    else extract(day from now() - c.date_derniere_touche)::int
  end as jours_depuis_touche,
  ls.type as dernier_signal_type,
  ls.date as dernier_signal_date,
  ls.pertinence as dernier_signal_pertinence,
  case
    when ls.date is null then false
    else ls.date > now() - interval '30 days'
  end as signal_frais,
  (select count(*) from public.appuis a where a.cible_id = c.id) as nb_appuis
from public.cibles c
left join public.stages st on st.id = c.stage_id
left join lateral (
  select s.type, s.date, s.pertinence
    from public.signals s
   where s.cible_id = c.id
   order by s.date desc
   limit 1
) ls on true;

// Récap hebdomadaire v2 (brief du 24/07) : un document ACTIONNABLE, qui nomme
// les gens et les fiches, structure A / B / C.
//   A « ce qui a bougé » : mouvements prioritaires nommés (validés, puis
//     urgents en progression, puis notables), chaque ligne avec les alliés ;
//     puis le sandbox, un paragraphe unique de noms à faible enjeu.
//   B « échecs et coûts » : chaque échec nomme sa fiche et sa cause ; coûts ;
//     un prompt de correction SEULEMENT sur échec systématique.
//   C « demandes produit » : les demandes brutes verbatim par personne, puis
//     UN méga-prompt prêt à coller qui a déjà tranché, puis le pied d'action
//     avec les vrais identifiants.
// Style : AUCUN tiret dans l'email, sauf les séparateurs du sandbox (demande
// explicite de Matthieu). Envoi via l'identité Vadim, destinataires
// RECAP_EMAILS sinon staff des shows.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "../ai/websearch";
import { depenseDepuisEur, depenseMoisEur, plafondEur } from "../ai/cout";
import { estivalActif } from "../domain";
import { evaluerCouverture } from "../editorial";
import { ENRICH_MODEL, hasAnthropicKey } from "../copilot/config";
import type { createServiceClient } from "../supabase/service";
import type { StaffMember } from "../types";

type SB = ReturnType<typeof createServiceClient>;

export interface MouvementCible {
  nom: string;
  organisation: string | null;
  etape: string;   // « programmée » / « enregistrée cette semaine » / « passée à Contacté »
  statut: string;  // « enregistrement calé le 28 juillet » / « en progression » ...
  allies: string[];
  rang: 1 | 2 | 3; // 1 validés, 2 urgents en progression, 3 notables
}

export interface EchecCause {
  cause: string;
  jobs: { nom: string; type: string }[];
}

export interface DemandeBrute {
  id: string;
  auteur: string | null;
  contenu: string;
  contexte: Record<string, unknown>;
}

export interface RecapData {
  depuis: string;
  mouvements: MouvementCible[];
  sandbox: string[];
  notes: { invite: string; note: number; commentaire: string | null }[];
  besoins: { show: string; contrainte: string; periode: string | null; candidates: number | null }[];
  generations: { done: number; failed: number };
  echecs: EchecCause[];
  cout: { semaine_eur: number; mois_eur: number; plafond_eur: number } | null;
  prompt_correction: string | null;
  backlog: DemandeBrute[];
  mega_prompt: string | null;
}

export interface TriageProposal { id: string; triage: "a_faire" | "a_preciser" | "rejete"; justification: string }

const dateFr = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }) : null;

/** Normalise la cause d'un échec de job pour le regroupement B1. */
export function normaliseCause(error: string): string {
  const e = error.toLowerCase();
  if (e.startsWith("timeout")) return "timeout au delà de 10 minutes";
  if (e.includes("sans résultat exploitable") || e.includes("sans json exploitable")) return "recherche web sans résultat exploitable";
  if (e.includes("credit balance")) return "crédit API épuisé";
  return error.slice(0, 80);
}

/**
 * B3 : prompt de correction CONDITIONNEL. Une cause est systématique quand
 * elle frappe en masse sur plusieurs semaines (au moins 3 jobs cette semaine
 * ET au moins 3 jobs la semaine précédente) ou en masse cette semaine (au
 * moins 5 fiches distinctes). Un incident ponctuel, ou une cause qui n'était
 * qu'anecdotique la semaine passée, ne produit qu'une liste à relancer.
 */
export function promptCorrection(
  cetteSemaine: { cause: string; cible_id: string | null }[],
  semainePrecedente: { cause: string }[]
): string | null {
  const parCause = new Map<string, { jobs: number; cibles: Set<string> }>();
  for (const j of cetteSemaine) {
    const cur = parCause.get(j.cause) ?? { jobs: 0, cibles: new Set<string>() };
    cur.jobs += 1;
    if (j.cible_id) cur.cibles.add(j.cible_id);
    parCause.set(j.cause, cur);
  }
  const jobsPrec = new Map<string, number>();
  for (const j of semainePrecedente) jobsPrec.set(j.cause, (jobsPrec.get(j.cause) ?? 0) + 1);
  for (const [cause, stats] of parCause) {
    const systematique = (stats.jobs >= 3 && (jobsPrec.get(cause) ?? 0) >= 3) || stats.cibles.size >= 5;
    if (!systematique) continue;
    if (cause.startsWith("timeout")) {
      return "Les jobs de génération dépassent régulièrement 10 minutes et tombent en timeout. Découpe la recherche web en sous-requêtes plus courtes, réduis le nombre de requêtes par passe, et ajoute au worker un retry avec backoff. Si le dépassement persiste, relève le timeout du worker et documente la nouvelle valeur.";
    }
    if (cause.startsWith("recherche web")) {
      return "La recherche web revient régulièrement sans résultat exploitable sur plusieurs fiches. Vérifie le prompt de recherche (trop restrictif ?), ajoute un repli à une seule requête large quand la première passe est vide, et journalise la requête envoyée pour diagnostic.";
    }
    return `La cause « ${cause} » revient de façon systématique sur les jobs de génération. Diagnostique la, corrige le code ou la configuration en cause, et ajoute un test qui la couvre.`;
  }
  return null;
}

/** C2 : le méga-prompt, un seul bloc qui réorganise, déduplique et clarifie
 *  toutes les demandes de la semaine, points flous DÉJÀ tranchés. Repli null
 *  (l'email affiche alors les demandes brutes seules). */
async function construireMegaPrompt(items: DemandeBrute[]): Promise<string | null> {
  if (!items.length || !hasAnthropicKey()) return null;
  try {
    const client = new Anthropic();
    const model = process.env.RECAP_PROMPT_MODEL ?? "claude-sonnet-4-6";
    const liste = items.map((i) => `[${i.auteur ?? "inconnu"}] ${i.contenu}${Object.keys(i.contexte ?? {}).length ? `\nContexte : ${JSON.stringify(i.contexte)}` : ""}`).join("\n\n");
    const res = await client.messages.create({
      model,
      max_tokens: 2000,
      system: [
        "Tu écris LE prompt d'implémentation hebdomadaire pour Claude Code sur Magellan (moteur de conquête d'invités podcast, Next.js + Supabase, console de fiche temps réel livrée en PR 7 avec canal Realtime et présence).",
        "Entrée : les demandes produit brutes de la semaine. Sortie : UN SEUL prompt consolidé, prêt à coller, qui réorganise, déduplique et clarifie, et qui TRANCHE les points flous (décisions de spécification numérotées, valeurs par défaut raisonnables, critères d'acceptation mesurables).",
        "Structure : Contexte (2 à 4 phrases), Décisions de spécification tranchées (liste numérotée), Critères d'acceptation (concrets, avec seuils).",
        "Style impératif : pas d'emoji, AUCUN tiret (ni cadratin ni trait d'union en début de ligne, listes numérotées uniquement), pas de « on », sujet verbe complément, français sobre.",
        'Réponds UNIQUEMENT en JSON : {"prompt": "le bloc complet"}.',
      ].join("\n"),
      messages: [{ role: "user", content: liste }],
    });
    const texte = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    const json = extractJson<{ prompt?: string }>(texte);
    const prompt = json?.prompt?.trim();
    return prompt || null;
  } catch {
    return null;
  }
}

/** Compile le récap v2. Chaque source est best-effort : une table absente ou
 *  une requête en échec produit une section vide, jamais un email bloqué. */
export async function compileRecap(sb: SB, joursFenetre = 7): Promise<RecapData> {
  const maintenant = Date.now();
  const depuis = new Date(maintenant - joursFenetre * 24 * 3600 * 1000).toISOString();
  const depuisPrecedente = new Date(maintenant - 2 * joursFenetre * 24 * 3600 * 1000).toISOString();

  /* ── A1, mouvements réels : épisodes créés, enregistrements clos,
        changements d'étape (journal mcp_audit, payload.stage), alliés ajoutés. */
  type Flags = { episode?: string | null; enregistre?: boolean; valide?: boolean; nouvelleEtape?: string; appuiAjoute?: boolean };
  const flags = new Map<string, Flags>();
  const flag = (cibleId: string, f: Flags) => flags.set(cibleId, { ...(flags.get(cibleId) ?? {}), ...f });

  try {
    const { data: eps } = await sb.from("episodes").select("cible_id, date_enregistrement, created_at").gte("created_at", depuis).limit(50);
    for (const e of ((eps ?? []) as { cible_id: string; date_enregistrement: string | null }[])) {
      if (e.cible_id) flag(e.cible_id, { episode: e.date_enregistrement, valide: true });
    }
  } catch { /* table sans created_at : section sans épisodes */ }

  try {
    const { data: recs } = await sb
      .from("fiche_rec_sessions")
      .select("fiche_id, ended_at, fiches(cible_id)")
      .not("ended_at", "is", null)
      .gte("ended_at", depuis)
      .limit(20);
    for (const r of ((recs ?? []) as unknown as { fiches: { cible_id: string | null } | null }[])) {
      const cid = r.fiches?.cible_id;
      if (cid) flag(cid, { enregistre: true });
    }
  } catch { /* 0041 absente */ }

  // Changements d'étape de la semaine : journal MCP (payload.stage des
  // update_cible/create_cible réussis, cible résolue par nom plus bas).
  const stageParNom = new Map<string, string>();
  const { data: audit } = await sb
    .from("mcp_audit")
    .select("tool, ok, payload, ts")
    .gte("ts", depuis)
    .in("tool", ["update_cible", "validate_cible", "create_cible"])
    .order("ts")
    .limit(1000);
  const nomsValides: string[] = [];
  for (const r of ((audit ?? []) as { tool: string; ok: boolean; payload: Record<string, unknown> }[])) {
    if (!r.ok) continue;
    const nomCible = typeof r.payload?.cible === "string" ? r.payload.cible : typeof r.payload?.nom === "string" ? r.payload.nom : null;
    if (!nomCible) continue;
    if (r.tool === "validate_cible") nomsValides.push(nomCible);
    const stage = typeof r.payload?.stage === "string" ? r.payload.stage : null;
    if (stage) stageParNom.set(nomCible, stage);
  }

  try {
    const { data: appuis } = await sb.from("appuis").select("cible_id, created_at").gte("created_at", depuis).limit(100);
    for (const a of ((appuis ?? []) as { cible_id: string | null }[])) {
      if (a.cible_id) flag(a.cible_id, { appuiAjoute: true });
    }
  } catch { /* rien */ }

  // Résolution des cibles touchées (par id, plus par nom pour l'audit).
  const ids = new Set(flags.keys());
  const noms = new Set([...stageParNom.keys(), ...nomsValides]);
  type CibleRow = { id: string; nom: string; organisation: string | null; stage_key: string | null; stage_label: string | null; archive: boolean };
  const cibles = new Map<string, CibleRow>();
  if (ids.size) {
    const { data } = await sb.from("cibles_enrichies").select("id, nom, organisation, stage_key, stage_label, archive").in("id", [...ids]);
    for (const c of ((data ?? []) as CibleRow[])) cibles.set(c.id, c);
  }
  if (noms.size) {
    const { data } = await sb.from("cibles_enrichies").select("id, nom, organisation, stage_key, stage_label, archive").in("nom", [...noms]);
    for (const c of ((data ?? []) as CibleRow[])) {
      cibles.set(c.id, c);
      if (nomsValides.includes(c.nom)) flag(c.id, { valide: true });
      const stage = stageParNom.get(c.nom);
      if (stage) flag(c.id, { nouvelleEtape: stage });
    }
  }

  // Alliés par cible touchée (relais d'abord).
  const alliesPar = new Map<string, string[]>();
  if (flags.size) {
    const { data } = await sb.from("appuis").select("cible_id, nom, est_relais").in("cible_id", [...flags.keys()]).limit(300);
    for (const a of ((data ?? []) as { cible_id: string; nom: string; est_relais: boolean | null }[])) {
      const liste = alliesPar.get(a.cible_id) ?? [];
      if (a.est_relais) liste.unshift(a.nom);
      else liste.push(a.nom);
      alliesPar.set(a.cible_id, liste);
    }
  }

  const ETAPES_HAUTES = new Set(["confirme", "programme", "enregistre", "publie", "produit"]);
  const mouvements: MouvementCible[] = [];
  for (const [cid, f] of flags) {
    const c = cibles.get(cid);
    if (!c || c.archive) continue;
    let rang: 1 | 2 | 3;
    let etape: string;
    let statut: string;
    if (f.enregistre) {
      rang = 1; etape = "enregistrée cette semaine"; statut = "publication à venir";
    } else if (f.episode !== undefined || f.valide || (f.nouvelleEtape && ETAPES_HAUTES.has(f.nouvelleEtape))) {
      rang = 1;
      etape = c.stage_label ? c.stage_label.toLowerCase() : "validée";
      const cale = dateFr(f.episode ?? null);
      statut = cale ? `enregistrement calé le ${cale}` : "enregistrement à caler";
    } else if (f.nouvelleEtape || f.appuiAjoute) {
      rang = 2;
      etape = f.nouvelleEtape && c.stage_label ? `passée à ${c.stage_label.toLowerCase()}` : (c.stage_label ?? "en pipeline").toLowerCase();
      statut = f.appuiAjoute ? "allié ajouté cette semaine" : "en progression";
    } else {
      rang = 3;
      etape = (c.stage_label ?? "en pipeline").toLowerCase();
      statut = "mouvement cette semaine";
    }
    mouvements.push({ nom: c.nom, organisation: c.organisation, etape, statut, allies: (alliesPar.get(cid) ?? []).slice(0, 4), rang });
  }
  mouvements.sort((a, b) => a.rang - b.rang || a.nom.localeCompare(b.nom));

  /* ── A2, sandbox : mouvements de faible enjeu (créations en début de
        pipeline, simples enrichissements), hors mouvements prioritaires. */
  const dejaNommes = new Set(mouvements.map((m) => m.nom));
  const sandbox: string[] = [];
  {
    const { data: neuves } = await sb
      .from("cibles_enrichies")
      .select("nom, stage_key, archive, created_at")
      .gte("created_at", depuis)
      .eq("archive", false)
      .limit(100);
    for (const c of ((neuves ?? []) as { nom: string; stage_key: string | null }[])) {
      if (!dejaNommes.has(c.nom) && (c.stage_key === "identifie" || c.stage_key === null)) sandbox.push(c.nom);
    }
    const { data: enrichis } = await sb
      .from("enrichment_jobs")
      .select("cible_id, statut, objectif, updated_at")
      .eq("statut", "done")
      .eq("objectif", "profil")
      .gte("updated_at", depuis)
      .limit(200);
    const idsEnrichis = [...new Set(((enrichis ?? []) as { cible_id: string }[]).map((j) => j.cible_id))];
    if (idsEnrichis.length) {
      const { data } = await sb.from("cibles_enrichies").select("id, nom, archive").in("id", idsEnrichis);
      for (const c of ((data ?? []) as { nom: string; archive: boolean }[])) {
        if (!c.archive && !dejaNommes.has(c.nom) && !sandbox.includes(c.nom)) sandbox.push(c.nom);
      }
    }
  }

  /* ── B1, échecs détaillés : chaque échec nomme sa cible et sa cause. */
  const { data: jobs } = await sb
    .from("enrichment_jobs")
    .select("objectif, statut, error, cible_id, updated_at")
    .gte("updated_at", depuisPrecedente)
    .limit(1000);
  const rows = (jobs ?? []) as { objectif: string; statut: string; error: string | null; cible_id: string | null; updated_at: string }[];
  const semaine = rows.filter((j) => j.updated_at >= depuis);
  const precedente = rows.filter((j) => j.updated_at < depuis);
  const failed = semaine.filter((j) => j.statut === "failed" && j.error);

  const idsEchec = [...new Set(failed.map((j) => j.cible_id).filter((x): x is string => !!x))];
  const nomsEchec = new Map<string, string>();
  if (idsEchec.length) {
    const { data } = await sb.from("cibles_enrichies").select("id, nom").in("id", idsEchec);
    for (const c of ((data ?? []) as { id: string; nom: string }[])) nomsEchec.set(c.id, c.nom);
  }
  const parCause = new Map<string, EchecCause>();
  for (const j of failed) {
    const cause = normaliseCause(j.error ?? "");
    const cur = parCause.get(cause) ?? { cause, jobs: [] };
    cur.jobs.push({
      nom: (j.cible_id && nomsEchec.get(j.cible_id)) ?? "cible inconnue",
      type: j.objectif.startsWith("fiche:") ? j.objectif.slice("fiche:".length) : j.objectif,
    });
    parCause.set(cause, cur);
  }
  const echecs = [...parCause.values()].sort((a, b) => b.jobs.length - a.jobs.length);

  const generations = {
    done: semaine.filter((j) => j.statut === "done").length,
    failed: semaine.filter((j) => j.statut === "failed").length,
  };

  /* ── B3 : prompt de correction seulement sur échec SYSTÉMATIQUE. */
  const prompt_correction = promptCorrection(
    failed.map((j) => ({ cause: normaliseCause(j.error ?? ""), cible_id: j.cible_id })),
    precedente.filter((j) => j.statut === "failed" && j.error).map((j) => ({ cause: normaliseCause(j.error ?? "") }))
  );

  /* ── C1, demandes brutes. */
  const { data: items } = await sb
    .from("product_backlog")
    .select("id, auteur, contenu, contexte")
    .eq("statut", "nouveau")
    .order("created_at")
    .limit(50);
  const backlog = ((items ?? []) as DemandeBrute[]);

  /* ── C2, méga-prompt (repli null : l'email vit sans). */
  const mega_prompt = await construireMegaPrompt(backlog);

  /* ── Notes de plateau et besoins (inchangés du v1, défensifs). */
  let notes: RecapData["notes"] = [];
  try {
    const { data: notees } = await sb
      .from("fiches")
      .select("invite_nom, note_plateau, note_commentaire")
      .gte("note_at", depuis)
      .not("note_plateau", "is", null)
      .limit(20);
    notes = ((notees ?? []) as { invite_nom: string; note_plateau: number; note_commentaire: string | null }[])
      .map((f) => ({ invite: f.invite_nom, note: f.note_plateau, commentaire: f.note_commentaire }));
  } catch { notes = []; }

  const besoins: RecapData["besoins"] = [];
  try {
    const { data: shows } = await sb.from("shows").select("id, slug");
    const estival = estivalActif();
    for (const s of ((shows ?? []) as { id: string; slug: string }[])) {
      const couverture = await evaluerCouverture(sb, s.id, estival);
      for (const b of couverture.filter((x) => x.alerte)) {
        besoins.push({ show: s.slug, contrainte: b.besoin.contrainte, periode: b.besoin.periode, candidates: b.candidates?.length ?? null });
      }
    }
  } catch { /* le récap part quand même */ }

  /* ── B2, coûts. */
  let cout: RecapData["cout"] = null;
  const coutSemaine = await depenseDepuisEur(sb, depuis);
  const coutMois = await depenseMoisEur(sb);
  if (coutSemaine !== null && coutMois !== null) {
    cout = { semaine_eur: coutSemaine, mois_eur: coutMois, plafond_eur: plafondEur() };
  }

  return { depuis, mouvements, sandbox, notes, besoins, generations, echecs, cout, prompt_correction, backlog, mega_prompt };
}

/** Triage proposé par item (écrit en commentaire du backlog par le cron,
 *  la décision reste humaine). Repli a_preciser : ne bloque jamais l'envoi. */
export async function proposeTriage(items: RecapData["backlog"]): Promise<TriageProposal[]> {
  const repli: TriageProposal[] = items.map((i) => ({
    id: i.id,
    triage: "a_preciser",
    justification: "À préciser avec l'auteur (triage automatique indisponible).",
  }));
  if (!items.length || !hasAnthropicKey()) return repli;
  try {
    const client = new Anthropic();
    const liste = items.map((i) => `- id ${i.id} (${i.auteur ?? "inconnu"}) : ${i.contenu}`).join("\n");
    const res = await client.messages.create({
      model: ENRICH_MODEL,
      max_tokens: 1500,
      system: [
        "Tu tries le backlog produit de Magellan (moteur de conquête d'invités podcast, Collision Productions).",
        "Pour chaque item : a_faire (clair et utile), a_preciser (ambigu ou incomplet), rejete (hors périmètre ou doublon).",
        "Justification en UNE ligne, sobre, sans emoji ni tiret cadratin.",
        'Réponds UNIQUEMENT en JSON : [{"id", "triage", "justification"}].',
      ].join("\n"),
      messages: [{ role: "user", content: liste }],
    });
    const texte = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    const raw = extractJson<TriageProposal[]>(texte);
    if (!Array.isArray(raw)) return repli;
    const valides = new Set(["a_faire", "a_preciser", "rejete"]);
    const parId = new Map(raw.filter((t) => t?.id && valides.has(t.triage)).map((t) => [t.id, t]));
    return items.map((i) => parId.get(i.id) ?? repli.find((r) => r.id === i.id)!);
  } catch {
    return repli;
  }
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Corps HTML v2 : trois parties A / B / C, aucun tiret hors sandbox. */
export function buildRecapEmail(data: RecapData): { subject: string; html: string } {
  const semaine = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
  const subject = `Magellan, récap hebdo du ${semaine}`;
  const li = (s: string) => `<li style="margin:5px 0">${s}</li>`;
  const pre = (s: string) => `<pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#F6F4EF;padding:12px 14px;margin:8px 0">${esc(s)}</pre>`;

  /* A. Ce qui a bougé */
  const a: string[] = [];
  for (const m of data.mouvements) {
    const allies = m.allies.length ? m.allies.map(esc).join(", ") : "aucun";
    a.push(li(`<b>${esc(m.nom)}</b>${m.organisation ? ` (${esc(m.organisation)})` : ""}, ${esc(m.etape)}, ${esc(m.statut)}. Alliés : ${allies}.`));
  }
  if (!a.length) a.push(li("Aucun mouvement prioritaire cette semaine."));
  const partieA = [
    `<h2 style="font-size:17px">A. Ce qui a bougé</h2><ul style="padding-left:18px">${a.join("")}</ul>`,
    data.sandbox.length
      ? `<p style="margin:10px 0 0 0"><b>Sandbox</b> (exploratoire, aucune action requise) : ${data.sandbox.map(esc).join(" - ")}</p>`
      : "",
    data.notes.length
      ? `<p style="margin:10px 0 0 0">${data.notes.map((n) => `Note de plateau ${esc(n.invite)} : <b>${n.note}/5</b>${n.commentaire ? `. ${esc(n.commentaire)}` : ""}`).join("<br/>")}</p>`
      : "",
    data.besoins.length
      ? `<p style="margin:10px 0 0 0">${data.besoins.map((b) => `Besoin non couvert (${esc(b.show.toUpperCase())}) : « ${esc(b.contrainte)} »${b.periode ? ` (${esc(b.periode)})` : ""} : ${b.candidates === null ? "critères à évaluer à la main" : `${b.candidates} cible(s) actionnable(s), il en faut 2`}.`).join("<br/>")}</p>`
      : "",
  ].join("");

  /* B. Échecs et coûts */
  const b: string[] = [];
  b.push(li(`Générations : <b>${data.generations.done} réussie(s)</b>, ${data.generations.failed} en échec.`));
  for (const e of data.echecs) {
    const fiches = e.jobs.map((j) => `${esc(j.nom)} (job ${esc(j.type)})`).join(", ");
    b.push(li(`Cause ${esc(e.cause)} : ${fiches}. À relancer.`));
  }
  if (data.cout) {
    b.push(li(`Coût API estimé : <b>${data.cout.semaine_eur.toFixed(2)} €</b> cette semaine, ${data.cout.mois_eur.toFixed(2)} € sur le mois (plafond ${data.cout.plafond_eur} €).`));
  }
  const partieB = [
    `<h2 style="font-size:17px">B. Échecs et coûts</h2><ul style="padding-left:18px">${b.join("")}</ul>`,
    data.prompt_correction
      ? `<p style="margin:6px 0 0 0"><b>Échec systématique détecté.</b> Prompt de correction à coller dans Claude Code :</p>${pre(data.prompt_correction)}`
      : "",
  ].join("");

  /* C. Demandes produit */
  const parAuteur = new Map<string, DemandeBrute[]>();
  for (const d of data.backlog) {
    const cle = d.auteur ?? "inconnu";
    parAuteur.set(cle, [...(parAuteur.get(cle) ?? []), d]);
  }
  const c: string[] = [];
  for (const [auteur, demandes] of parAuteur) {
    c.push(`<p style="margin:8px 0 2px 0"><b>${esc(auteur)}</b></p><ul style="padding-left:18px">${demandes
      .map((d) => li(`« ${esc(d.contenu)} » (id : ${esc(d.id.slice(0, 8))})`))
      .join("")}</ul>`);
  }
  if (!c.length) c.push(`<p>Aucune demande nouvelle cette semaine.</p>`);
  const premierId = data.backlog[0]?.id.slice(0, 8);
  const partieC = [
    `<h2 style="font-size:17px">C. Demandes produit</h2>`,
    c.join(""),
    data.mega_prompt
      ? `<p style="margin:10px 0 0 0"><b>Prompt consolidé à coller dans Claude Code</b> (demandes réorganisées, dédupliquées, points flous tranchés) :</p>${pre(data.mega_prompt)}`
      : "",
    premierId
      ? `<p style="margin:12px 0 0 0">Pour actionner une demande : dans une conversation Claude, écris « passe l'item ${esc(premierId)} en a_faire » pour l'accepter, ou « rejette l'item ${esc(premierId)} » pour la refuser. Claude met le backlog à jour via triage_backlog. L'identifiant de chaque demande figure à côté d'elle dans la liste.</p>`
      : "",
  ].join("");

  const html = [
    `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1B1D1E;line-height:1.55;max-width:640px;margin:0 auto;padding:8px 4px">`,
    partieA,
    partieB,
    partieC,
    `<p style="color:#8a8d88;font-size:12px;margin-top:24px">Collision Productions</p>`,
    `</body></html>`,
  ].join("");
  return { subject, html };
}

/** Destinataires : RECAP_EMAILS (env, séparés par virgules), sinon le staff
 *  configuré des shows, sinon EPISODE_STAFF_EMAILS. */
export async function recapRecipients(sb: SB): Promise<string[]> {
  const env = (process.env.RECAP_EMAILS ?? "").split(/[,\s]+/).map((e) => e.trim()).filter((e) => e.includes("@"));
  if (env.length) return Array.from(new Set(env));
  const { data } = await sb.from("shows").select("staff");
  const all = ((data ?? []) as { staff: StaffMember[] | null }[])
    .flatMap((s) => s.staff ?? [])
    .map((m) => m.email)
    .filter((e): e is string => !!e && e.includes("@"));
  if (all.length) return Array.from(new Set(all.map((e) => e.toLowerCase())));
  return (process.env.EPISODE_STAFF_EMAILS ?? "").split(/[,\s]+/).filter((e) => e.includes("@"));
}

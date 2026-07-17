// Chantier 1 — récap hebdomadaire (lundi 08h00 Europe/Paris, cron Vercel Pro).
// UN email, DEUX sections (format imposé par le brief arbitrages §2.4) :
//   A « ce qui a bougé » : écritures MCP de la semaine, générations, échecs.
//   B « demandes produit » : items nouveaux du backlog, avec un triage proposé
//     (a_faire, a_preciser, rejete) et une justification d'une ligne.
// Pas de troisième section, pas de graphiques. Envoi via l'identité Vadim
// (sendGmail existant), destinataires : RECAP_EMAILS sinon staff des shows.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "../ai/websearch";
import { depenseDepuisEur, depenseMoisEur, plafondEur } from "../ai/cout";
import { estivalActif } from "../domain";
import { evaluerCouverture } from "../editorial";
import { ENRICH_MODEL, hasAnthropicKey } from "../copilot/config";
import type { createServiceClient } from "../supabase/service";
import type { StaffMember } from "../types";

type SB = ReturnType<typeof createServiceClient>;

export interface RecapData {
  depuis: string;
  ecritures: { outil: string; acteur: string; total: number; echecs: number }[];
  generations: { done: number; failed: number; erreurs: { objectif: string; error: string }[] };
  backlog: { id: string; auteur: string | null; contenu: string; contexte: Record<string, unknown> }[];
  notes: { invite: string; note: number; commentaire: string | null }[];
  /** Synthèse coût API (chantier 3). null tant que la télémétrie (0039) est absente. */
  cout: { semaine_eur: number; mois_eur: number; plafond_eur: number } | null;
  /** Besoins éditoriaux en alerte (chantier 4) : ouverts et couverts par moins
   *  de deux cibles actionnables. candidates null = critères non automatisables. */
  besoins: { show: string; contrainte: string; periode: string | null; candidates: number | null }[];
}

export interface TriageProposal { id: string; triage: "a_faire" | "a_preciser" | "rejete"; justification: string }

/** Compile les trois sources de la semaine (mcp_audit, enrichment_jobs, backlog). */
export async function compileRecap(sb: SB, joursFenetre = 7): Promise<RecapData> {
  const depuis = new Date(Date.now() - joursFenetre * 24 * 3600 * 1000).toISOString();

  const { data: audit } = await sb
    .from("mcp_audit")
    .select("tool, actor, ok")
    .gte("created_at", depuis)
    .limit(2000);
  const parCle = new Map<string, { outil: string; acteur: string; total: number; echecs: number }>();
  for (const r of ((audit ?? []) as { tool: string; actor: string; ok: boolean }[])) {
    const cle = `${r.tool}|${r.actor}`;
    const cur = parCle.get(cle) ?? { outil: r.tool, acteur: r.actor, total: 0, echecs: 0 };
    cur.total += 1;
    if (!r.ok) cur.echecs += 1;
    parCle.set(cle, cur);
  }
  const ecritures = Array.from(parCle.values()).sort((a, b) => b.total - a.total);

  const { data: jobs } = await sb
    .from("enrichment_jobs")
    .select("objectif, statut, error")
    .gte("updated_at", depuis)
    .limit(1000);
  const rows = (jobs ?? []) as { objectif: string; statut: string; error: string | null }[];
  const generations = {
    done: rows.filter((j) => j.statut === "done").length,
    failed: rows.filter((j) => j.statut === "failed").length,
    erreurs: rows
      .filter((j) => j.statut === "failed" && j.error)
      .slice(0, 10)
      .map((j) => ({ objectif: j.objectif, error: (j.error ?? "").slice(0, 160) })),
  };

  const { data: items } = await sb
    .from("product_backlog")
    .select("id, auteur, contenu, contexte")
    .eq("statut", "nouveau")
    .order("created_at")
    .limit(50);
  const backlog = ((items ?? []) as RecapData["backlog"]);

  // Notes de plateau de la semaine (chantier 2, boucle éditoriale). Défensif :
  // colonnes absentes tant que 0038 n'est pas appliquée → liste vide.
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
  } catch {
    notes = [];
  }

  // Synthèse coût API (chantier 3 §4.2) : semaine glissante + mois en cours.
  let cout: RecapData["cout"] = null;
  const semaine = await depenseDepuisEur(sb, depuis);
  const mois = await depenseMoisEur(sb);
  if (semaine !== null && mois !== null) {
    cout = { semaine_eur: semaine, mois_eur: mois, plafond_eur: plafondEur() };
  }

  // Besoins éditoriaux en alerte (chantier 4 §5.3), tous shows. Défensif :
  // sans la migration 0040, evaluerCouverture renvoie une liste vide.
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
  } catch {
    /* rien : le récap part quand même */
  }

  return { depuis, ecritures, generations, backlog, notes, cout, besoins };
}

/** Triage proposé par item (un appel modèle léger, sans outils). Repli :
 *  a_preciser, pour ne jamais bloquer l'envoi du récap. */
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
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    const raw = extractJson<TriageProposal[]>(text);
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

/** Corps HTML de l'email récap : deux sections, rien d'autre. */
export function buildRecapEmail(data: RecapData, triages: TriageProposal[]): { subject: string; html: string } {
  const semaine = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
  const subject = `Magellan, récap hebdo du ${semaine}`;
  const li = (s: string) => `<li style="margin:4px 0">${s}</li>`;

  const bouge: string[] = [];
  for (const e of data.ecritures.slice(0, 20)) {
    bouge.push(li(`<b>${esc(e.outil)}</b> par ${esc(e.acteur)} : ${e.total} appel(s)${e.echecs ? `, ${e.echecs} échec(s)` : ""}`));
  }
  bouge.push(li(`Générations et enrichissements : <b>${data.generations.done} réussi(s)</b>, ${data.generations.failed} échoué(s)`));
  for (const err of data.generations.erreurs) {
    bouge.push(li(`Échec ${esc(err.objectif)} : ${esc(err.error)}`));
  }
  for (const n of data.notes ?? []) {
    bouge.push(li(`Note de plateau ${esc(n.invite)} : <b>${n.note}/5</b>${n.commentaire ? `. ${esc(n.commentaire)}` : ""}`));
  }
  if (data.cout) {
    bouge.push(li(`Coût API estimé : <b>${data.cout.semaine_eur.toFixed(2)} €</b> cette semaine, ${data.cout.mois_eur.toFixed(2)} € sur le mois (plafond ${data.cout.plafond_eur} €)`));
  }
  for (const b of data.besoins ?? []) {
    const etat = b.candidates === null ? "critères à évaluer à la main" : `${b.candidates} cible(s) actionnable(s), il en faut 2`;
    bouge.push(li(`Besoin non couvert (${esc(b.show.toUpperCase())}) : « ${esc(b.contrainte)} »${b.periode ? ` (${esc(b.periode)})` : ""} : ${etat}`));
  }

  const parId = new Map(triages.map((t) => [t.id, t]));
  const demandes = data.backlog.length
    ? data.backlog.map((i) => {
        const t = parId.get(i.id);
        return li(`« ${esc(i.contenu)} » (${esc(i.auteur ?? "inconnu")}) : proposition <b>${esc(t?.triage ?? "a_preciser")}</b>. ${esc(t?.justification ?? "")}`);
      })
    : [li("Aucune demande nouvelle cette semaine.")];

  const html = [
    `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1B1D1E;line-height:1.55;max-width:640px;margin:0 auto;padding:8px 4px">`,
    `<h2 style="font-size:17px">A. Ce qui a bougé</h2><ul style="padding-left:18px">${bouge.join("")}</ul>`,
    `<h2 style="font-size:17px">B. Demandes produit</h2><ul style="padding-left:18px">${demandes.join("")}</ul>`,
    `<p style="color:#8a8d88;font-size:12px;margin-top:24px">Valider ou rejeter : dans Claude, « passe l'item X en a_faire » (outil triage_backlog). Collision Productions.</p>`,
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

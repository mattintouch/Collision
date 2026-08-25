// Lot 5 du chantier récap (25/08), section C « Magellan cette semaine » : ce
// qui a été livré, expliqué en langage utilisateur pour que l'équipe sache en
// profiter. Source primaire : les PR mergées sur main dans la fenêtre, via
// l'API GitHub (jeton GITHUB_TOKEN en variable d'environnement Vercel).
// Source de complément : les items du backlog passés en statut livre dans la
// semaine (détectés par le journal mcp_audit des triage_backlog), dédoublonnés
// contre les PR par pr_url. Fallback si GitHub est indisponible : les seuls
// items livre, avec un drapeau incomplet (mention discrète dans l'email).
// Le cron n'échoue JAMAIS à cause de cette section.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "../ai/websearch";
import { ENRICH_MODEL, hasAnthropicKey } from "../copilot/config";
import type { createServiceClient } from "../supabase/service";

type SB = ReturnType<typeof createServiceClient>;

export interface Livraison {
  resume: string;
  url: string | null;
}

export interface SourceLivraison {
  ref: string;          // "PR 51" ou id court d'item
  titre: string;
  texte: string;        // corps de PR ou contenu d'item, tronqué
  url: string | null;
}

const GITHUB_REPO = () => process.env.GITHUB_REPO ?? "mattintouch/Collision";

/** Fusion PR + items livre, dédoublonnée par URL de PR (PURE, testée) : un
 *  item livré dont la pr_url figure déjà dans les PR ne fait pas doublon. */
export function fusionneSources(prs: SourceLivraison[], itemsLivre: SourceLivraison[]): SourceLivraison[] {
  const urls = new Set(prs.map((p) => p.url).filter(Boolean));
  return [...prs, ...itemsLivre.filter((i) => !i.url || !urls.has(i.url))];
}

/** PR mergées sur main dans la fenêtre. Le dépôt est PUBLIC : l'appel part
 *  sans authentification quand GITHUB_TOKEN est absent (limite de débit plus
 *  basse, largement suffisante pour un appel hebdomadaire ; le jeton reste
 *  utile en cas de limite atteinte sur les IP partagées de Vercel, ou si le
 *  dépôt passe privé). Lance en cas d'indisponibilité (réseau, quota) :
 *  l'appelant bascule en mode dégradé. */
async function prsMergees(depuisIso: string): Promise<SourceLivraison[]> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO()}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=50`,
    {
      headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const prs = (await res.json()) as { number: number; title: string; body: string | null; merged_at: string | null; html_url: string }[];
  return prs
    .filter((p) => p.merged_at && p.merged_at >= depuisIso)
    .map((p) => ({ ref: `PR ${p.number}`, titre: p.title, texte: (p.body ?? "").slice(0, 900), url: p.html_url }));
}

/** Items du backlog passés en livre dans la fenêtre (journal mcp_audit). */
async function itemsLivres(sb: SB, depuisIso: string): Promise<SourceLivraison[]> {
  const { data: audit } = await sb
    .from("mcp_audit")
    .select("payload, ok, ts")
    .eq("tool", "triage_backlog")
    .gte("ts", depuisIso)
    .limit(200);
  const ids = new Set<string>();
  for (const r of ((audit ?? []) as { payload: Record<string, unknown>; ok: boolean }[])) {
    if (r.ok && r.payload?.statut === "livre" && typeof r.payload?.id === "string") ids.add(r.payload.id);
  }
  if (!ids.size) return [];
  const { data } = await sb
    .from("product_backlog")
    .select("id, contenu, pr_url")
    .in("id", [...ids])
    .eq("statut", "livre");
  return ((data ?? []) as { id: string; contenu: string; pr_url: string | null }[]).map((i) => ({
    ref: i.id.slice(0, 8),
    titre: i.contenu.slice(0, 120),
    texte: i.contenu.slice(0, 900),
    url: i.pr_url,
  }));
}

/** Résumés orientés utilisateur, UN appel modèle pour toute la liste. Le
 *  prompt cible l'audience non technique (Clémence, Axel, Matéo, Clément) :
 *  ce que ça change concrètement et comment en profiter, jamais le message de
 *  commit brut. Fallback : les titres tels quels. */
async function resumeLivraisons(sb: SB, sources: SourceLivraison[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!sources.length || !hasAnthropicKey()) return out;
  try {
    const client = new Anthropic();
    const liste = sources.map((s) => `[${s.ref}] ${s.titre}\n${s.texte}`).join("\n\n");
    const res = await client.messages.create({
      model: ENRICH_MODEL,
      max_tokens: 1500,
      system: [
        "Tu rédiges la section « Magellan cette semaine » de l'email récap de Collision Productions : ce qui a été livré dans l'outil Magellan.",
        "AUDIENCE NON TECHNIQUE (Clémence, Axel, Matéo, Clément). Pour chaque livraison : 1 à 2 phrases qui disent ce que ça change CONCRÈTEMENT pour l'équipe et comment en profiter. JAMAIS le message de commit brut, jamais de vocabulaire technique (PR, migration, endpoint, colonne), jamais de nom de fichier.",
        "Style : pas d'emoji, pas de tiret cadratin ni de tiret en début de ligne, pas de « on », sujet verbe complément, français sobre.",
        'Réponds UNIQUEMENT en JSON : [{"ref": "PR 51", "resume": "..."}] avec une entrée par livraison reçue.',
      ].join("\n"),
      messages: [{ role: "user", content: liste }],
    });
    // Télémétrie de coût (section B) : une ligne recap:livraisons, best-effort.
    try {
      await sb.from("enrichment_jobs").insert({
        cible_id: null,
        objectif: "recap:livraisons",
        statut: "done",
        tokens_in: res.usage?.input_tokens ?? 0,
        tokens_out: res.usage?.output_tokens ?? 0,
        model: ENRICH_MODEL,
        resultat: { livraisons: sources.length },
      });
    } catch { /* 0048 non appliquée */ }
    const texte = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    const raw = extractJson<{ ref?: string; resume?: string }[]>(texte);
    if (Array.isArray(raw)) {
      for (const r of raw) {
        if (r?.ref && r?.resume?.trim()) out.set(r.ref, r.resume.trim());
      }
    }
  } catch {
    /* fallback titres, géré par l'appelant */
  }
  return out;
}

/**
 * Collecte de la section C. AUCUNE exception ne sort d'ici : GitHub
 * indisponible bascule sur les seuls items livre avec le drapeau incomplet.
 */
export async function collecteLivraisons(
  sb: SB,
  depuisIso: string
): Promise<{ livraisons: Livraison[]; incomplet: boolean }> {
  let prs: SourceLivraison[] = [];
  let incomplet = false;
  try {
    prs = await prsMergees(depuisIso);
  } catch {
    incomplet = true;
  }
  let livres: SourceLivraison[] = [];
  try {
    livres = await itemsLivres(sb, depuisIso);
  } catch { /* journal indisponible : la section vit avec les PR seules */ }

  const sources = fusionneSources(prs, livres);
  if (!sources.length) return { livraisons: [], incomplet };
  const resumes = await resumeLivraisons(sb, sources);
  return {
    livraisons: sources.map((s) => ({ resume: resumes.get(s.ref) ?? s.titre, url: s.url })),
    incomplet,
  };
}

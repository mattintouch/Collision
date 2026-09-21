// Chantier « lancement dev en un clic » (21/09), livrable D : le rebouclage.
//
// Une session lancée depuis l'email ouvre une PR portant la ligne
// « Backlog-Item: <uuid> » (le générateur de prompt l'impose). Ce module relit
// les PR du dépôt, retrouve ce marqueur et écrit pr_url sur l'item
// correspondant. Sans lui, la boucle reste ouverte : le weekly continuerait de
// proposer un lancement pour un item déjà en chantier.
//
// AUCUN WEBHOOK GITHUB n'est requis : le scan lit l'API publique du dépôt, ce
// qui se débranche en retirant un appel (règle du mandat : à coût comparable,
// la version la plus simple à débrancher gagne). Contrepartie assumée : le
// rattachement se fait au prochain passage du scan, pas à la seconde près.
//
// Le scan n'écrit QUE pr_url, et seulement sur un item sans pr_url. Il ne
// change aucun statut : le passage en « livre » reste une décision humaine,
// après merge.

import { litMarqueurs } from "../dev/prompt";
import type { createServiceClient } from "../supabase/service";

type SB = ReturnType<typeof createServiceClient>;

const GITHUB_REPO = () => process.env.GITHUB_REPO ?? "mattintouch/Collision";

export interface PrVue {
  numero: number;
  titre: string;
  corps: string | null;
  url: string;
  etat: string;
}

export interface RapportReboucle {
  prs_examinees: number;
  rattachements: { item_id: string; pr_url: string }[];
  deja_lies: number;
  erreur?: string;
}

/** Rattachements déduits des PR (PURE, testée) : pour chaque PR, tout item
 *  marqué dans son titre ou son corps. Une PR peut livrer plusieurs items ;
 *  le premier rattachement d'un item gagne (les PR arrivent de la plus
 *  récemment mise à jour à la plus ancienne). */
export function rattachements(prs: PrVue[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const pr of prs) {
    for (const id of litMarqueurs(`${pr.titre}\n${pr.corps ?? ""}`)) {
      if (!out.has(id)) out.set(id, pr.url);
    }
  }
  return out;
}

/** PR du dépôt, ouvertes et récemment fermées (le marqueur vaut aussi après
 *  merge : un item livré garde son lien de PR). Le dépôt est public, le jeton
 *  GITHUB_TOKEN sert seulement à desserrer la limite de débit. */
async function listePrs(): Promise<PrVue[]> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO()}/pulls?state=all&sort=updated&direction=desc&per_page=50`,
    {
      headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const brut = (await res.json()) as { number: number; title: string; body: string | null; html_url: string; state: string }[];
  return brut.map((p) => ({ numero: p.number, titre: p.title, corps: p.body, url: p.html_url, etat: p.state }));
}

/**
 * Passe de rebouclage. Ne lance JAMAIS : le récap hebdo l'appelle et ne doit
 * pas échouer pour autant. Renvoie ce qui a été rattaché.
 */
export async function reboucleBacklog(sb: SB): Promise<RapportReboucle> {
  let prs: PrVue[] = [];
  try {
    prs = await listePrs();
  } catch (e) {
    return { prs_examinees: 0, rattachements: [], deja_lies: 0, erreur: e instanceof Error ? e.message : String(e) };
  }
  const vises = rattachements(prs);
  if (!vises.size) return { prs_examinees: prs.length, rattachements: [], deja_lies: 0 };

  const { data, error } = await sb.from("product_backlog").select("id, pr_url").in("id", [...vises.keys()]);
  if (error) return { prs_examinees: prs.length, rattachements: [], deja_lies: 0, erreur: error.message };

  const faits: { item_id: string; pr_url: string }[] = [];
  let deja = 0;
  for (const row of (data ?? []) as { id: string; pr_url: string | null }[]) {
    const url = vises.get(row.id);
    if (!url) continue;
    if (row.pr_url) {
      deja += 1;
      continue;
    }
    const { error: err } = await sb.from("product_backlog").update({ pr_url: url }).eq("id", row.id).is("pr_url", null);
    if (!err) faits.push({ item_id: row.id, pr_url: url });
  }
  return { prs_examinees: prs.length, rattachements: faits, deja_lies: deja };
}

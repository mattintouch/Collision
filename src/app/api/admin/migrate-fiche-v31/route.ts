// Migration v3.1 des fiches existantes (brief du 31/07). Dry par défaut :
// rapport complet (table de migration, pertes assumées, lint avant / après
// SIMULÉ) sans aucune écriture. mode=go exécute : chaque écriture passe par
// writeSection (versionnée, budgets serveur, rollback possible), les sections
// sources sont vidées (contenu archivé en versions), puis la passe de
// rédaction est remise en file (redaction=0 pour s'en passer).
//
// Périmètre : fiches draft et en_challenge (décision Matthieu du 31/07).
// Une fiche finale ou verrouillée est refusée avec le motif.
//
//   GET /api/admin/migrate-fiche-v31?fiche=rudy-gobert        → dry sur une fiche
//   GET /api/admin/migrate-fiche-v31?fiche=all                → dry sur toutes
//   GET /api/admin/migrate-fiche-v31?fiche=all&mode=go        → exécute
//
// Autorisation : membre de l'équipe connecté ou Bearer CRON_SECRET.

import { createServiceClient } from "@/lib/supabase/service";
import { cronAutorise } from "@/lib/cron-auth";
import { ficheSections, writeSection, type FicheRow } from "@/lib/fiche/store";
import { migrerFicheV31 } from "@/lib/fiche/migration-v31";
import { lintFiche } from "@/lib/fiche/lint";
import { enqueueFicheGeneration } from "@/lib/fiche/generation";
import { isEmptyContent } from "@/lib/fiche/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

type Content = Record<string, unknown>;
const MIGRATION_AUTHOR = "migration v3.1";
const STATUTS_MIGRABLES = new Set(["draft", "en_challenge"]);

export async function GET(req: Request): Promise<Response> {
  if (!(await cronAutorise(req))) {
    return new Response("unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const cible = url.searchParams.get("fiche") ?? "all";
  const mode = url.searchParams.get("mode") === "go" ? "go" : "dry";
  const relanceRedaction = url.searchParams.get("redaction") !== "0";

  const sb = createServiceClient();
  let q = sb.from("fiches").select("*").order("updated_at", { ascending: false });
  if (cible !== "all") q = q.eq("slug", cible);
  const { data, error } = await q;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const fiches = (data ?? []) as FicheRow[];
  if (!fiches.length) return Response.json({ ok: false, error: `Aucune fiche trouvée (${cible}).` }, { status: 404 });

  const rapports: Record<string, unknown>[] = [];
  for (const fiche of fiches) {
    if (!STATUTS_MIGRABLES.has(fiche.statut)) {
      rapports.push({ fiche: fiche.slug, statut: fiche.statut, action: "ignoree", detail: "seuls draft et en_challenge migrent (décision du 31/07) ; la fiche reste lisible via le fallback de rendu" });
      continue;
    }
    const rows = await ficheSections(sb, fiche.id);
    const sections: Record<string, Content> = {};
    for (const r of rows) {
      if (!isEmptyContent(r.content)) sections[r.section_id] = (r.content ?? {}) as Content;
    }
    const lintAvant = lintFiche(sections);
    const migration = migrerFicheV31(sections);

    // État simulé après migration : cibles écrites, sources vidées.
    const apres: Record<string, Content> = { ...sections, ...migration.ecrits };
    for (const id of migration.vides) delete apres[id];
    const lintApres = lintFiche(apres);

    const dejaMigree = !Object.keys(migration.ecrits).length && !migration.vides.length;
    const ecritures: string[] = [];
    let redaction: string | null = null;
    if (mode === "go" && !dejaMigree) {
      for (const [id, content] of Object.entries(migration.ecrits)) {
        await writeSection(sb, fiche.id, id, content, MIGRATION_AUTHOR);
        ecritures.push(id);
      }
      for (const id of migration.vides) {
        await writeSection(sb, fiche.id, id, {}, MIGRATION_AUTHOR);
        ecritures.push(`${id} (vidée, archivée en versions)`);
      }
      if (relanceRedaction && fiche.cible_id) {
        try {
          const n = await enqueueFicheGeneration(sb, fiche.cible_id, ["redaction"]);
          redaction = n ? "passe de rédaction remise en file" : "passe de rédaction déjà en file";
        } catch (e) {
          redaction = `passe de rédaction non relancée : ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }

    rapports.push({
      fiche: fiche.slug,
      statut: fiche.statut,
      action: dejaMigree ? "deja_migree" : mode === "go" ? "migree" : "simulation",
      table: migration.table,
      pertes: migration.pertes,
      sections_ecrites: mode === "go" ? ecritures : Object.keys(migration.ecrits),
      sections_videes: migration.vides,
      lint_avant: {
        bloquants: lintAvant.bloquants,
        doublons: lintAvant.doublons.length,
        chiffres_repetes: lintAvant.chiffres_repetes.length,
        questions_doublons: lintAvant.questions_doublons.length,
        meta_narratif: lintAvant.meta_narratif.length,
        hors_budget: lintAvant.hors_budget.length,
      },
      lint_apres: {
        bloquants: lintApres.bloquants,
        doublons: lintApres.doublons.length,
        chiffres_repetes: lintApres.chiffres_repetes.length,
        questions_doublons: lintApres.questions_doublons.length,
        meta_narratif: lintApres.meta_narratif.length,
        hors_budget: lintApres.hors_budget.length,
        detail_bloquants: [
          ...lintApres.doublons.slice(0, 5).map((d) => `doublon : « ${d.extrait.slice(0, 70)}... » (${d.sections.join(", ")})`),
          ...lintApres.chiffres_repetes.slice(0, 5).map((c) => `chiffre répété : ${c.valeur} ×${c.occurrences} (${c.sections.join(", ")})`),
          ...lintApres.questions_doublons.slice(0, 5).map((q) => `question en double : « ${q.question.slice(0, 70)} » (${q.endroits.join(", ")})`),
        ],
      },
      ...(redaction ? { redaction } : {}),
    });
  }

  return Response.json({ ok: true, mode, fiches: rapports.length, rapports });
}

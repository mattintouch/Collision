// /fiches/{slug}/plateau : le MODE PLATEAU (mandat du 13/09, chantier 5).
// Sticky header + feuille de plateau (section dix_questions), rien d'autre :
// aucune autre section n'est chargée. Typographie grande, navigation par
// chapitre (ancres), pensé pour l'écran posé sur le plateau. La page hérite
// de l'auth de l'app (middleware) et de fiches.css (layout /fiches). Le rendu
// vit dans PlateauFeuille (composant pur, partagé avec le banc de recette).

import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveFiche } from "@/lib/fiche/store";
import { asPlateau, asString } from "@/lib/fiche/schema";
import type { FicheLangue } from "@/lib/fiche/chrome";
import PlateauFeuille from "./PlateauFeuille";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Content = Record<string, unknown>;

export default async function PlateauPage({ params }: { params: { slug: string } }) {
  const sb = createServiceClient();
  const fiche = await resolveFiche(sb, params.slug, null);
  if (!fiche) notFound();

  // Seules deux sections sont lues : la feuille de plateau et l'identité
  // (langue de l'habillage, société du bandeau).
  const { data: rows } = await sb
    .from("fiche_sections")
    .select("section_id, content")
    .eq("fiche_id", fiche.id)
    .in("section_id", ["dix_questions", "identite"]);
  const par = new Map(((rows ?? []) as { section_id: string; content: Content }[]).map((r) => [r.section_id, r.content ?? {}]));
  const identite = par.get("identite") ?? {};
  const langue: FicheLangue = asString(identite.langue) === "en" ? "en" : "fr";

  return (
    <PlateauFeuille
      plateau={asPlateau(par.get("dix_questions"))}
      langue={langue}
      inviteNom={fiche.invite_nom}
      societe={asString(identite.societe)}
      slug={fiche.slug}
    />
  );
}

// /fiches : index des fiches de préparation. Invité, show, statut, date
// d'enregistrement, commentaires ouverts, carnet disponible (A3.2 : même
// requête que l'outil MCP list_fiches, via fichesOverview, pas de logique
// parallèle). Même système visuel GDIY que la fiche.

import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { isEmptyContent } from "@/lib/fiche/schema";
import { SECTIONS_OBLIGATOIRES } from "@/lib/fiche/sections";
import { fichesOverview } from "@/lib/fiche/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const T_COND = "'Tungsten Condensed', 'Arial Narrow', sans-serif";
const T_COMP = "'Tungsten Compressed', 'Tungsten Condensed', 'Arial Narrow', sans-serif";

const STATUT_LABEL: Record<string, string> = {
  draft: "DRAFT",
  en_challenge: "EN CHALLENGE",
  finale: "FINALE",
  verrouillee: "VERROUILLÉE",
};

function dateLabel(d: string | null): string {
  if (!d) return "DATE À CALER";
  return new Date(d)
    .toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" })
    .toUpperCase();
}

const chip: React.CSSProperties = { fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", padding: "5px 10px", flexShrink: 0 };

export default async function FichesIndexPage() {
  const sb = createServiceClient();
  const rows = await fichesOverview(sb);
  rows.sort((a, b) => (a.fiche.date_enregistrement ?? "9999").localeCompare(b.fiche.date_enregistrement ?? "9999"));

  // Gate anti fiche vide (chantier 2 §3.1) : badge INCOMPLÈTE si une section
  // obligatoire (mécanique, univers, chiffres) est vide.
  const incompletes = new Set<string>();
  if (rows.length) {
    const { data: secs } = await sb
      .from("fiche_sections")
      .select("fiche_id, section_id, content")
      .in("section_id", [...SECTIONS_OBLIGATOIRES])
      .in("fiche_id", rows.map((r) => r.fiche.id));
    const remplies = new Map<string, Set<string>>();
    for (const s of ((secs ?? []) as { fiche_id: string; section_id: string; content: unknown }[])) {
      if (isEmptyContent(s.content)) continue;
      if (!remplies.has(s.fiche_id)) remplies.set(s.fiche_id, new Set());
      remplies.get(s.fiche_id)!.add(s.section_id);
    }
    for (const r of rows) {
      if ((remplies.get(r.fiche.id)?.size ?? 0) < SECTIONS_OBLIGATOIRES.length) incompletes.add(r.fiche.id);
    }
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "0 20px 96px 20px", minHeight: "100vh" }}>
      <header style={{ paddingTop: 40 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", color: "#6B6B65" }}>PRÉPARATION D&apos;ÉPISODES</div>
        <h1 style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: "clamp(64px, 12vw, 120px)", lineHeight: 0.85, textTransform: "uppercase", margin: "14px 0 0 0" }}>Fiches</h1>
      </header>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 32, borderTop: "2px solid #000" }}>
        {rows.length === 0 && (
          <p style={{ fontSize: 15, color: "#6B6B65", padding: "18px 0" }}>
            Aucune fiche pour l&apos;instant. Créer une fiche : outil MCP create_fiche (show, cible).
          </p>
        )}
        {rows.map(({ fiche: f, show_slug, commentaires_ouverts, carnet_disponible }) => (
          <Link key={f.id} href={`/fiches/${f.slug}`} style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "16px 4px", borderBottom: "1px solid #D9D9D4", textDecoration: "none", flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#6B6B65", flexShrink: 0, width: 110 }}>{dateLabel(f.date_enregistrement)}</span>
            <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 30, lineHeight: 1, textTransform: "uppercase", flex: 1, minWidth: 200 }}>
              {f.invite_nom}
              {show_slug && <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 400, letterSpacing: "0.1em", color: "#6B6B65", marginLeft: 10 }}>{show_slug.toUpperCase()}</span>}
            </span>
            {carnet_disponible && (
              <span style={{ ...chip, border: "1px solid #E63946", color: "#E63946" }}>CARNET</span>
            )}
            {commentaires_ouverts > 0 && (
              <span style={{ ...chip, border: "1px solid #6B6B65", color: "#464641" }}>{commentaires_ouverts} COMM.</span>
            )}
            {incompletes.has(f.id) && (
              <span style={{ ...chip, background: "#E63946", color: "#FFF" }}>INCOMPLÈTE</span>
            )}
            <span style={{ ...chip, ...(f.statut === "verrouillee" || f.statut === "finale" ? { background: "#000", color: "#FFF" } : { border: "1px solid #000" }) }}>
              {STATUT_LABEL[f.statut] ?? f.statut.toUpperCase()}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65", flexShrink: 0 }}>V{f.version}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}

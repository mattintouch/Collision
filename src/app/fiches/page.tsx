// /fiches : index des fiches de préparation. Invité, show, statut, date
// d'enregistrement, commentaires ouverts, carnet disponible (A3.2 : même
// requête que l'outil MCP list_fiches, via fichesOverview, pas de logique
// parallèle). Même système visuel Magellan (soft, 04/08) que la fiche.

import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { isEmptyContent } from "@/lib/fiche/schema";
import { SECTIONS_OBLIGATOIRES } from "@/lib/fiche/sections";
import { fichesOverview } from "@/lib/fiche/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "var(--font-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

const STATUT_LABEL: Record<string, string> = {
  draft: "Draft",
  en_challenge: "En challenge",
  finale: "Finale",
  verrouillee: "Verrouillée",
};

function dateLabel(d: string | null): string {
  if (!d) return "Date à caler";
  return new Date(d)
    .toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" });
}

const chip: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 12,
  letterSpacing: "0em",
  padding: "5px 12px",
  borderRadius: 999,
  flexShrink: 0,
};

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
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "0 20px 96px 20px", minHeight: "100vh", background: "#F7F7F5" }}>
      <header style={{ paddingTop: 40 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0em", color: "#6B6862" }}>Préparation d&apos;épisodes</div>
        <h1 style={{ fontFamily: SANS, fontWeight: 600, fontSize: "clamp(32px, 5vw, 40px)", lineHeight: 1.15, letterSpacing: "-0.021em", color: "#37352F", margin: "8px 0 0 0" }}>Fiches</h1>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 32 }}>
        {rows.length === 0 && (
          <p style={{ fontSize: 15, color: "#6B6862", padding: "18px 0" }}>
            Aucune fiche pour l&apos;instant. Créer une fiche : outil MCP create_fiche (show, cible).
          </p>
        )}
        {rows.map(({ fiche: f, show_slug, commentaires_ouverts, carnet_disponible }) => (
          <Link
            key={f.id}
            href={`/fiches/${f.slug}`}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 16,
              padding: "14px 18px",
              borderRadius: 14,
              border: "1px solid #E8E6E0",
              background: "#FFFFFF",
              boxShadow: "0 1px 2px rgba(55,53,47,.04), 0 1px 3px rgba(55,53,47,.06)",
              textDecoration: "none",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#6B6862", flexShrink: 0, width: 110 }}>{dateLabel(f.date_enregistrement)}</span>
            <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 18, lineHeight: 1.3, color: "#37352F", flex: 1, minWidth: 200 }}>
              {f.invite_nom}
              {show_slug && <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 400, color: "#9B978E", marginLeft: 10 }}>{show_slug}</span>}
            </span>
            {carnet_disponible && (
              <span style={{ ...chip, border: "1px solid #E0525F", color: "#E0525F" }}>Carnet</span>
            )}
            {commentaires_ouverts > 0 && (
              <span style={{ ...chip, border: "1px solid #DCD9D1", color: "#6B6862" }}>{commentaires_ouverts} comm.</span>
            )}
            {incompletes.has(f.id) && (
              <span style={{ ...chip, background: "#E0525F", color: "#FFF" }}>Incomplète</span>
            )}
            <span style={{ ...chip, ...(f.statut === "verrouillee" || f.statut === "finale" ? { background: "#37352F", color: "#FFF" } : { border: "1px solid #DCD9D1", color: "#6B6862" }) }}>
              {STATUT_LABEL[f.statut] ?? f.statut}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#9B978E", flexShrink: 0 }}>v{f.version}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}

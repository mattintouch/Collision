// /fiches : index des fiches de préparation (brief §2.1). Statut, date
// d'enregistrement, version. Même système visuel GDIY que la fiche.

import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import type { FicheRow } from "@/lib/fiche/store";

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

export default async function FichesIndexPage() {
  const sb = createServiceClient();
  const { data } = await sb.from("fiches").select("*").order("date_enregistrement", { ascending: true, nullsFirst: false });
  const fiches = (data ?? []) as FicheRow[];

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "0 20px 96px 20px", minHeight: "100vh" }}>
      <header style={{ paddingTop: 40 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", color: "#6B6B65" }}>GDIY · PRÉPARATION D&apos;ÉPISODES</div>
        <h1 style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: "clamp(64px, 12vw, 120px)", lineHeight: 0.85, textTransform: "uppercase", margin: "14px 0 0 0" }}>Fiches</h1>
      </header>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 32, borderTop: "2px solid #000" }}>
        {fiches.length === 0 && (
          <p style={{ fontSize: 15, color: "#6B6B65", padding: "18px 0" }}>
            Aucune fiche pour l&apos;instant. Créer une fiche : outil MCP create_fiche (show, cible).
          </p>
        )}
        {fiches.map((f) => (
          <Link key={f.id} href={`/fiches/${f.slug}`} style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "16px 4px", borderBottom: "1px solid #D9D9D4", textDecoration: "none", flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#6B6B65", flexShrink: 0, width: 110 }}>{dateLabel(f.date_enregistrement)}</span>
            <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 30, lineHeight: 1, textTransform: "uppercase", flex: 1, minWidth: 200 }}>{f.invite_nom}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", padding: "5px 10px", flexShrink: 0, ...(f.statut === "verrouillee" || f.statut === "finale" ? { background: "#000", color: "#FFF" } : { border: "1px solid #000" }) }}>
              {STATUT_LABEL[f.statut] ?? f.statut.toUpperCase()}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65", flexShrink: 0 }}>V{f.version}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}

// Segment /fiches : fiches de préparation GDIY (design handoff, distinct du
// Cockpit). Accès protégé par l'auth de l'app (middleware) ; jamais indexé.
//
// A3 : barre globale sur toutes les vues du segment (liste et fiche) : retour
// board, entrée Fiches, compte connecté avec déconnexion. Non collante : le
// header noir de la console garde son sticky à lui.

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CompteBadge } from "@/components/CompteBadge";
import "./fiches.css";

export const metadata: Metadata = {
  title: "Fiches de préparation — GDIY",
  robots: { index: false, follow: false },
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export default async function FichesLayout({ children }: { children: React.ReactNode }) {
  const { data } = await createClient().auth.getUser();
  const email = data.user?.email ?? "";

  return (
    <div className="gdiy">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 20px", borderBottom: "1px solid #D9D9D4", fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", background: "#FFF" }}>
        <span style={{ display: "flex", gap: 16 }}>
          <Link href="/" style={{ color: "#000", textDecoration: "none" }}>‹ BOARD</Link>
          <Link href="/fiches" style={{ color: "#000", textDecoration: "none" }}>FICHES</Link>
        </span>
        {email && <CompteBadge email={email} mono />}
      </div>
      {children}
    </div>
  );
}

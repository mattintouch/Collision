// Lot 3 du chantier récap (25/08) : la page console du backlog produit.
// C'est ici que vivent les textes complets : l'email du lundi n'affiche plus
// que des résumés de 2 lignes et pointe vers cette page (ligne de stock et
// lien « voir le détail » de chaque item). Accès : profils internes (toute
// session authentifiée, la connexion Google est restreinte aux domaines).

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BacklogTable, type BacklogItemVue } from "@/components/BacklogTable";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  created_at: string;
  auteur: string | null;
  contenu: string;
  statut: string;
  commentaire_triage: string | null;
  pr_url: string | null;
  type?: string | null;
  resume?: string | null;
}

/** Troncature d'affichage (repli quand la colonne resume est vide) : la
 *  version pure du lot 4 vit dans un module serveur lourd, on reste local. */
function apercu(texte: string, max = 220): string {
  const plat = texte.replace(/\s+/g, " ").trim();
  if (plat.length <= max) return plat;
  const coupe = plat.slice(0, max - 1);
  const espace = coupe.lastIndexOf(" ");
  return `${(espace > max * 0.6 ? coupe.slice(0, espace) : coupe).trimEnd()}…`;
}

export default async function BacklogPage() {
  const sb = createClient();
  // Colonnes type et resume défensives (0048) : repli sans elles.
  let rows: Row[] = [];
  const enrichi = await sb
    .from("product_backlog")
    .select("id, created_at, auteur, contenu, statut, commentaire_triage, pr_url, type, resume")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!enrichi.error) {
    rows = (enrichi.data ?? []) as Row[];
  } else {
    const base = await sb
      .from("product_backlog")
      .select("id, created_at, auteur, contenu, statut, commentaire_triage, pr_url")
      .order("created_at", { ascending: false })
      .limit(500);
    rows = ((base.data ?? []) as Row[]);
  }

  const maintenant = Date.now();
  const items: BacklogItemVue[] = rows.map((r) => {
    const age = Math.max(0, Math.floor((maintenant - new Date(r.created_at).getTime()) / 86_400_000));
    return {
      id: r.id,
      id8: r.id.slice(0, 8),
      type: r.type ?? "feature",
      resume: (r.resume ?? "").trim() || apercu(r.contenu),
      contenu: r.contenu,
      auteur: r.auteur ?? "inconnu",
      age_jours: age,
      statut: r.statut,
      commentaire_triage: r.commentaire_triage,
      pr_url: r.pr_url,
      en_retard: r.statut === "nouveau" && age > 14,
    };
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/" className="text-sm text-blanc-muted hover:text-blanc">
        ← Retour
      </Link>
      <p className="label mb-1 mt-3" style={{ color: "#8A6E10" }}>Produit</p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Backlog</h1>
      <p className="mt-2 text-sm text-blanc-muted">
        Les demandes produit de l&apos;équipe, avec leur triage. Le récap du lundi résume les nouveautés de la
        semaine et pointe ici pour le texte complet. Pour trancher un item : dans une conversation Claude,
        « passe l&apos;item xxxxxxxx en a_faire » ou « rejette l&apos;item xxxxxxxx ».
      </p>
      <div className="mt-6">
        <BacklogTable items={items} />
      </div>
    </main>
  );
}

// Chantier « lancement dev en un clic » (21/09), livrable A : la route de
// lancement. Ouverte depuis l'email du lundi, souvent sur mobile, hors session
// applicative : l'autorisation tient dans le jeton signé porté par l'URL
// (paramètre t, 30 jours, secret dédié DEV_LINK_SECRET).
//
// Deux issues, décidées côté serveur :
//   1. l'URL Claude Code tient dans la limite : redirection directe, un clic ;
//   2. le prompt est trop long : page intermédiaire qui le porte en entier,
//      copiable en un geste. Le prompt n'est JAMAIS tronqué pour entrer dans
//      une URL.
// Dans les deux cas le prompt est PRÉ-REMPLI et jamais envoyé : la relecture
// humaine avant exécution est une décision actée du 01/09.

import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { cibleLancement, hasDevLinkSecret, verifyDevToken } from "@/lib/dev/lien";
import { construitPromptDev, type ItemBacklog } from "@/lib/dev/prompt";
import { PromptCopiable } from "./PromptCopiable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEPOT = () => process.env.GITHUB_REPO ?? "mattintouch/Collision";

const PAGE: React.CSSProperties = {
  fontFamily: "-apple-system,Segoe UI,Roboto,sans-serif",
  color: "#1B1D1E",
  lineHeight: 1.55,
  maxWidth: 720,
  margin: "0 auto",
  padding: "24px 16px 48px",
};

function Message({ titre, corps }: { titre: string; corps: string }) {
  return (
    <main style={PAGE}>
      <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>{titre}</h1>
      <p style={{ margin: 0, color: "#5B5F5C" }}>{corps}</p>
    </main>
  );
}

export default async function DevLancementPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { t?: string };
}) {
  if (!hasDevLinkSecret()) {
    return (
      <Message
        titre="Lancement indisponible"
        corps="La variable DEV_LINK_SECRET n'est pas configurée sur ce déploiement : aucun lien de lancement ne peut être vérifié. Le backlog reste consultable sur la page /backlog."
      />
    );
  }

  const autorise = await verifyDevToken(searchParams.t, params.id);
  if (!autorise) {
    return (
      <Message
        titre="Lien expiré ou invalide"
        corps="Ce lien de lancement n'est plus valable (30 jours de validité) ou ne correspond pas à cet item. Le récap du lundi suivant en porte un neuf ; la page /backlog donne accès à l'item."
      />
    );
  }

  const sb = createServiceClient();
  const { data } = await sb
    .from("product_backlog")
    .select("id, created_at, auteur, contenu, contexte, statut, commentaire_triage, pr_url, type, resume")
    .eq("id", params.id)
    .maybeSingle();
  const item = data as (ItemBacklog & { statut: string; pr_url: string | null }) | null;
  if (!item) {
    return <Message titre="Item introuvable" corps={`Aucun item de backlog ne porte l'identifiant ${params.id}.`} />;
  }

  const depot = DEPOT();
  const prompt = construitPromptDev(item, { depot });
  const cible = cibleLancement(prompt, depot);

  // Item déjà couvert par une PR : la page s'affiche au lieu de rediriger,
  // pour éviter d'ouvrir un second chantier sur le même sujet sans le savoir.
  if (cible.mode === "redirection" && !item.pr_url) redirect(cible.url);

  return (
    <main style={PAGE}>
      <p style={{ color: "#8a8d88", fontSize: 12, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Magellan · lancement dev
      </p>
      <h1 style={{ fontSize: 20, margin: "0 0 12px" }}>Item {item.id.slice(0, 8)}</h1>

      {item.pr_url ? (
        <p style={{ background: "#FFF4E5", border: "1px solid #F0D9B5", padding: "12px 14px", margin: "0 0 16px", fontSize: 14 }}>
          Une pull request couvre déjà cet item :{" "}
          <a href={item.pr_url} style={{ color: "#1D6FD8" }}>
            {item.pr_url}
          </a>
          . Vérifie son état avant de lancer un second chantier.
        </p>
      ) : null}

      {cible.mode === "page" ? (
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "#5B5F5C" }}>
          Le prompt est trop long pour tenir dans un lien. Copiez-le, puis ouvrez Claude Code et collez-le. Il est complet, rien
          n&apos;a été retiré.
        </p>
      ) : null}

      <PromptCopiable prompt={prompt} urlClaude={cible.url} depot={depot} />

      <p style={{ color: "#8a8d88", fontSize: 12, marginTop: 24 }}>
        Le prompt est pré-rempli, jamais envoyé : relisez-le avant de lancer la session.
      </p>
    </main>
  );
}

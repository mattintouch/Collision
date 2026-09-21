// Chantier « lancement dev en un clic » (21/09), livrable B : le générateur de
// prompt. À partir d'un item du backlog produit, il compose le prompt de
// développement autonome qui sera PRÉ-REMPLI (jamais envoyé) dans une session
// Claude Code. La relecture humaine avant exécution est une décision actée du
// 01/09 : ce module ne déclenche rien, il rédige.
//
// Le prompt porte quatre choses, dans cet ordre : le dépôt et la branche, le
// contexte fonctionnel (ce que la demande veut dire), le critère d'acceptation
// (comment savoir que c'est fait), et la consigne d'ouvrir une PR portant le
// marqueur de rebouclage. Ce marqueur est ce qui permet au scan de rattacher
// la PR à son item de backlog (livrable D), sans webhook GitHub.

/** Item du backlog tel que la Routine et l'email le manipulent. */
export interface ItemBacklog {
  id: string;
  contenu: string;
  type?: string | null;
  auteur?: string | null;
  created_at?: string | null;
  commentaire_triage?: string | null;
  contexte?: Record<string, unknown> | null;
  resume?: string | null;
}

/** Marqueur de rattachement PR vers item. Le scan de rebouclage (livrable D)
 *  cherche exactement cette ligne dans le corps et le titre des PR ouvertes.
 *  Changer ce format casse le rebouclage : il est testé des deux côtés. */
export const MARQUEUR_ITEM = "Backlog-Item:";

export function marqueurPour(id: string): string {
  return `${MARQUEUR_ITEM} ${id}`;
}

const RE_MARQUEUR = /backlog-item\s*:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/** Extrait TOUS les ids d'item d'un texte de PR (PURE, testée). Une PR livre
 *  parfois plusieurs items du backlog : le rebouclage les rattache tous.
 *  Renvoie une liste vide si le marqueur est absent ou mal formé. */
export function litMarqueurs(texte: string | null | undefined): string[] {
  if (!texte) return [];
  const ids = new Set<string>();
  for (const m of texte.matchAll(RE_MARQUEUR)) ids.add(m[1].toLowerCase());
  return [...ids];
}

/** Premier id marqué, ou null (confort de lecture). */
export function litMarqueur(texte: string | null | undefined): string | null {
  return litMarqueurs(texte)[0] ?? null;
}

const DEPOT = () => process.env.GITHUB_REPO ?? "mattintouch/Collision";

/** Consigne de périmètre selon le type d'item. Une correction ne se traite pas
 *  comme une fonctionnalité : le prompt le dit, plutôt que de laisser la
 *  session le deviner. */
function cadrageParType(type: string): string {
  switch (type) {
    case "bug":
      return "C'est un BUG. Commence par le reproduire, écris un test qui échoue, corrige, vérifie que le test passe. Ne profite pas du passage pour refactorer autre chose.";
    case "correction":
      return "C'est une CORRECTION de comportement existant. Localise le code fautif, corrige au plus près, couvre la correction par un test. Aucune refonte élargie.";
    case "note":
      return "Cet item est une NOTE de cadrage, pas une demande de code. Vérifie qu'il y a réellement quelque chose à livrer avant d'écrire la moindre ligne : si la note est informative, arrête-toi et dis-le plutôt que de produire du code inutile.";
    default:
      return "C'est une DEMANDE DE FONCTIONNALITÉ. Livre le plus petit incrément qui rend le service demandé, testé, sans élargir le périmètre.";
  }
}

/** Contexte technique posé une fois pour toutes : la session démarre sans
 *  mémoire des conventions du dépôt. */
const CONVENTIONS = [
  "Conventions du dépôt, à respecter sans exception :",
  "1. Migrations SQL jamais automatiques : écris le fichier dans supabase/migrations/ et inscris-le dans docs/MIGRATIONS-EN-ATTENTE.md. Matthieu les applique à la main.",
  "2. Aucun secret dans le code, dans les journaux ni dans la description de PR.",
  "3. Toute écriture produit passe par une PR relue, jamais un push direct sur main.",
  "4. Style des textes visibles par l'équipe : pas de tiret cadratin, pas de « on », sujet verbe complément, aucun emoji.",
  "5. Avant de pousser : npx tsc --noEmit, npx vitest run et npm run lint doivent passer.",
].join("\n");

function bloc(titre: string, corps: string): string {
  return `${titre}\n${corps}`;
}

/** Compose le prompt de développement autonome d'un item (PURE, testée).
 *  Aucun appel réseau, aucun modèle : le texte se déduit entièrement de
 *  l'item, ce qui rend le lien de l'email reproductible et vérifiable. */
export function construitPromptDev(item: ItemBacklog, opts: { depot?: string; branche?: string } = {}): string {
  const depot = opts.depot ?? DEPOT();
  const type = (item.type ?? "feature").trim() || "feature";
  const demande = item.contenu.trim();
  const triage = (item.commentaire_triage ?? "").trim();
  const contexte = item.contexte && Object.keys(item.contexte).length ? JSON.stringify(item.contexte) : "";
  const origine = [item.auteur ? `demandé par ${item.auteur}` : "", item.created_at ? `posé le ${item.created_at.slice(0, 10)}` : ""]
    .filter(Boolean)
    .join(", ");

  const parties = [
    `Dépôt : ${depot}. Développe sur une branche dédiée${opts.branche ? ` nommée ${opts.branche}` : ""}, jamais sur main.`,
    "",
    bloc("LA DEMANDE", demande),
    "",
    bloc(
      "CONTEXTE",
      [
        "Magellan est le moteur de conquête d'invités du podcast Génération Do It Yourself (Collision Productions) : application Next.js 14 App Router en TypeScript, base Supabase, déploiement Vercel, connecteur MCP exposé à l'équipe.",
        `Cet item vient du backlog produit${origine ? ` (${origine})` : ""}.`,
        triage ? `Arbitrage au triage : ${triage}` : "",
        contexte ? `Contexte enregistré avec la demande : ${contexte}` : "",
        cadrageParType(type),
      ]
        .filter(Boolean)
        .join("\n")
    ),
    "",
    bloc(
      "AVANT DE CODER",
      [
        "1. Cherche dans le dépôt ce qui existe déjà sur ce sujet. Une partie du besoin est peut-être posée, branchée ou en panne : un correctif vaut mieux qu'une construction parallèle.",
        "2. Si la demande est ambiguë, tranche toi-même selon les conventions ci-dessous et note la décision dans la description de PR. Ne pose pas de question, personne ne lira la session en direct.",
      ].join("\n")
    ),
    "",
    bloc("CRITÈRE D'ACCEPTATION", critereAcceptation(item)),
    "",
    bloc("CONVENTIONS", CONVENTIONS),
    "",
    bloc(
      "À L'ARRIVÉE",
      [
        "Ouvre UNE pull request vers main.",
        `Fais figurer cette ligne telle quelle dans la description de la PR, elle rattache la PR à sa demande : ${marqueurPour(item.id)}`,
        "Décris en tête de PR ce que la personne qui a demandé verra changer, en langage utilisateur.",
      ].join("\n")
    ),
  ];
  return parties.join("\n").trim();
}

/** Critère d'acceptation : le commentaire de triage fait foi quand il existe
 *  (c'est l'arbitrage humain), sinon la demande elle-même sert de critère,
 *  reformulée en objectif vérifiable. */
export function critereAcceptation(item: ItemBacklog): string {
  const triage = (item.commentaire_triage ?? "").trim();
  if (triage) {
    return [
      `L'item est livré quand ceci est vrai : ${triage}`,
      "La demande d'origine ci-dessus reste la référence en cas de contradiction : signale la contradiction dans la PR plutôt que de choisir en silence.",
    ].join("\n");
  }
  return [
    "Aucun critère n'a été posé au triage. Formule en tête de PR, en une phrase, la condition qui rend cet item livré, puis tiens-la.",
    "Cette condition doit être observable par la personne qui a fait la demande, pas seulement par un test.",
  ].join("\n");
}

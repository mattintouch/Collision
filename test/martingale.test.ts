import { describe, it, expect } from "vitest";
import {
  ALERTE_TOURNAGE_JOURS,
  DELAI_PROMO_FINIE,
  DELAI_RELANCE_HAUTE,
  DELAI_RELANCE_NORMALE,
  decisionsDuJour,
  delaiRelance,
  etapeCible,
  jourParis,
  joursAvant,
  joursDepuis,
  type CibleMartingale,
} from "../src/lib/martingale/automatisations";
import { collisionsFamille, phraseAlerte, triePlanning, type LignePlanning } from "../src/lib/martingale/rotation";

const MAINTENANT = new Date("2026-10-01T09:00:00Z");

function cible(p: Partial<CibleMartingale>): CibleMartingale {
  return {
    id: "c1",
    nom: "Invité test",
    etape: null,
    priorite: "moyenne",
    statut_sortie: null,
    relances_envoyees: 0,
    date_derniere_touche: null,
    date_diffusion: null,
    date_tournage: null,
    date_publication: null,
    a_une_fiche: true,
    calls_faits: 2,
    ...p,
  };
}

describe("La Martingale, délais de relance (brief 2.4.1)", () => {
  it("cinq jours en priorité haute, dix jours sinon", () => {
    expect(delaiRelance("haute")).toBe(DELAI_RELANCE_HAUTE);
    expect(delaiRelance("moyenne")).toBe(DELAI_RELANCE_NORMALE);
    expect(delaiRelance(null)).toBe(DELAI_RELANCE_NORMALE);
  });

  it("relance une cible contactée au delà du seuil, pas avant", () => {
    const tot = decisionsDuJour([cible({ etape: "contacte", priorite: "haute", date_derniere_touche: "2026-09-29T09:00:00Z" })], MAINTENANT);
    expect(tot).toHaveLength(0);

    const mure = decisionsDuJour([cible({ etape: "contacte", priorite: "haute", date_derniere_touche: "2026-09-25T09:00:00Z" })], MAINTENANT);
    expect(mure[0]).toMatchObject({ type: "relancer", jours_sans_reponse: 6 });
  });

  it("une priorité normale attend dix jours là où une haute en attend cinq", () => {
    const cibles = [cible({ id: "n", etape: "contacte", priorite: "moyenne", date_derniere_touche: "2026-09-24T09:00:00Z" })];
    expect(decisionsDuJour(cibles, MAINTENANT)).toHaveLength(0);
    cibles[0].date_derniere_touche = "2026-09-20T09:00:00Z";
    expect(decisionsDuJour(cibles, MAINTENANT)[0].type).toBe("relancer");
  });

  it("deux relances sans réponse : abandon, jamais une troisième relance", () => {
    const a = decisionsDuJour([cible({ etape: "a_relancer", relances_envoyees: 2, date_derniere_touche: "2026-09-01T09:00:00Z" })], MAINTENANT);
    expect(a).toHaveLength(1);
    expect(a[0].type).toBe("abandonner");
  });

  it("une cible sortie du pipe n'est plus jamais touchée", () => {
    const sortie = cible({ etape: "contacte", statut_sortie: "pour_plus_tard", date_derniere_touche: "2026-01-01T09:00:00Z" });
    expect(decisionsDuJour([sortie], MAINTENANT)).toHaveLength(0);
  });
});

describe("La Martingale, publication et fin de promo (brief 2.4.2 et 2.4.3)", () => {
  it("le jour de la diffusion, l'épisode planifié passe en publié", () => {
    expect(decisionsDuJour([cible({ etape: "planifie", date_diffusion: "2026-10-01" })], MAINTENANT)[0].type).toBe("publier");
    expect(decisionsDuJour([cible({ etape: "planifie", date_diffusion: "2026-10-02" })], MAINTENANT)).toHaveLength(0);
  });

  it("la promo se clôt quatorze jours après la publication", () => {
    const veille = decisionsDuJour([cible({ etape: "publie", date_publication: "2026-09-18T09:00:00Z" })], MAINTENANT);
    expect(veille).toHaveLength(0);
    const jour = decisionsDuJour([cible({ etape: "publie", date_publication: "2026-09-17T09:00:00Z" })], MAINTENANT);
    expect(jour[0]).toMatchObject({ type: "promo_finie" });
    expect(DELAI_PROMO_FINIE).toBe(14);
  });
});

describe("La Martingale, alerte J-7 tournage (brief 2.4.4)", () => {
  it("alerte quand la fiche manque", () => {
    const a = decisionsDuJour([cible({ date_tournage: "2026-10-06", a_une_fiche: false })], MAINTENANT);
    expect(a[0].type).toBe("alerte_tournage");
    expect(a[0]).toMatchObject({ manques: ["la fiche de préparation n'existe pas"] });
  });

  it("alerte aussi quand un des deux calls n'est pas fait", () => {
    const a = decisionsDuJour([cible({ date_tournage: "2026-10-06", calls_faits: 1 })], MAINTENANT);
    expect((a[0] as { manques: string[] }).manques).toEqual(["1 call sur 2 n'est pas en statut fait"]);
  });

  it("aucune alerte quand la fiche existe et que les deux calls sont faits", () => {
    expect(decisionsDuJour([cible({ date_tournage: "2026-10-06" })], MAINTENANT)).toHaveLength(0);
  });

  it("aucune alerte au delà de la fenêtre, ni après le tournage", () => {
    expect(decisionsDuJour([cible({ date_tournage: "2026-10-20", a_une_fiche: false })], MAINTENANT)).toHaveLength(0);
    expect(decisionsDuJour([cible({ date_tournage: "2026-09-20", a_une_fiche: false })], MAINTENANT)).toHaveLength(0);
    expect(ALERTE_TOURNAGE_JOURS).toBe(7);
  });
});

describe("La Martingale, étape visée par chaque action", () => {
  it("une alerte et un abandon ne déplacent pas la cible vers une étape", () => {
    expect(etapeCible({ type: "relancer", cible_id: "c", nom: "n", jours_sans_reponse: 6, motif: "" })).toBe("a_relancer");
    expect(etapeCible({ type: "publier", cible_id: "c", nom: "n", motif: "" })).toBe("publie");
    expect(etapeCible({ type: "promo_finie", cible_id: "c", nom: "n", motif: "" })).toBe("promo_finie");
    expect(etapeCible({ type: "abandonner", cible_id: "c", nom: "n", motif: "" })).toBeNull();
    expect(etapeCible({ type: "alerte_tournage", cible_id: "c", nom: "n", manques: [], motif: "" })).toBeNull();
  });
});

describe("outils de date", () => {
  it("joursDepuis, joursAvant et le jour de Paris", () => {
    expect(joursDepuis("2026-09-24T09:00:00Z", MAINTENANT)).toBe(7);
    expect(joursAvant("2026-10-08T09:00:00Z", MAINTENANT)).toBe(7);
    expect(joursDepuis(null, MAINTENANT)).toBeNull();
    expect(jourParis(MAINTENANT)).toBe("2026-10-01");
  });
});

describe("La Martingale, rotation des familles (brief 2.3)", () => {
  const ligne = (p: Partial<LignePlanning>): LignePlanning => ({
    cible_id: "x", nom: "X", etape: "planifie", famille: null, famille_label: null, date_diffusion: null, og: false, ...p,
  });

  it("le planning se trie par date de diffusion, les non datés à la fin", () => {
    const t = triePlanning([
      ligne({ cible_id: "c", nom: "Sans date" }),
      ligne({ cible_id: "b", nom: "B", date_diffusion: "2026-10-15" }),
      ligne({ cible_id: "a", nom: "A", date_diffusion: "2026-10-01" }),
    ]);
    expect(t.map((l) => l.cible_id)).toEqual(["a", "b", "c"]);
  });

  it("deux épisodes consécutifs de la même famille lèvent une alerte", () => {
    const c = collisionsFamille([
      ligne({ cible_id: "a", nom: "Alpha", famille: "immobilier", famille_label: "Immobilier", date_diffusion: "2026-10-01" }),
      ligne({ cible_id: "b", nom: "Bravo", famille: "immobilier", famille_label: "Immobilier", date_diffusion: "2026-10-08" }),
      ligne({ cible_id: "d", nom: "Delta", famille: "macro_economie", famille_label: "Macro et économie", date_diffusion: "2026-10-15" }),
    ]);
    expect(c).toHaveLength(1);
    expect(phraseAlerte(c[0])).toBe("Deux épisodes consécutifs en Immobilier : Alpha puis Bravo.");
  });

  it("des familles alternées ne lèvent rien, et une famille absente n'est pas une répétition", () => {
    expect(collisionsFamille([
      ligne({ cible_id: "a", famille: "immobilier", date_diffusion: "2026-10-01" }),
      ligne({ cible_id: "b", famille: "alternatif", date_diffusion: "2026-10-08" }),
      ligne({ cible_id: "c", famille: "immobilier", date_diffusion: "2026-10-15" }),
    ])).toHaveLength(0);

    expect(collisionsFamille([
      ligne({ cible_id: "a", famille: null, date_diffusion: "2026-10-01" }),
      ligne({ cible_id: "b", famille: null, date_diffusion: "2026-10-08" }),
    ])).toHaveLength(0);
  });
});

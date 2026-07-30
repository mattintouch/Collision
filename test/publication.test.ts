import { describe, it, expect } from "vitest";
import { CHAMPS_PUBLICATION, filtrePatchPublication, motifRefusEcriture } from "../src/lib/episodes/publication";
import { construirePatchFolk } from "../src/lib/folk/sync";

describe("domaine publication — liste blanche et verrou (rebranchement 1)", () => {
  it("la liste blanche refuse tout champ hors publication, avec la liste des refusés", () => {
    const { admis, refuses } = filtrePatchPublication({
      titre: "L'épisode",
      numero: 451,
      cible_id: "pirate",
      show_id: "pirate",
      statut_prod: "pirate", // deprecated : plus jamais écrit
      published_locked_at: "pirate", // le verrou ne s'écrit que par set_episode_lock
    });
    expect(Object.keys(admis).sort()).toEqual(["numero", "titre"]);
    expect(refuses.sort()).toEqual(["cible_id", "published_locked_at", "show_id", "statut_prod"]);
  });

  it("le verrou refuse l'écriture sauf admin, et dit quoi faire", () => {
    expect(motifRefusEcriture(null, false)).toBeNull();
    expect(motifRefusEcriture(null, true)).toBeNull();
    const refus = motifRefusEcriture("2026-07-30T10:00:00Z", false);
    expect(refus).toContain("verrouillé");
    expect(refus).toContain("admin");
    expect(motifRefusEcriture("2026-07-30T10:00:00Z", true)).toBeNull();
  });

  it("les 3 statuts de production et les blocs médias sont éditables, le verrou non", () => {
    for (const champ of ["statut_script", "statut_montage", "statut_illustration", "shorts_statut", "teaser_reseaux_lien", "chapitres", "timestamp_hr"]) {
      expect(CHAMPS_PUBLICATION).toContain(champ);
    }
    expect(CHAMPS_PUBLICATION).not.toContain("published_locked_at");
    expect(CHAMPS_PUBLICATION).not.toContain("statut_prod");
  });
});

describe("golden Folk — aucun nouveau champ ne part en miroir sans décision", () => {
  it("le patch Folk ne peut produire QUE jobTitle, companies, description, emails, phones", () => {
    // Une cible saturée, y compris TOUS les attributs du schéma de référence :
    // si un champ neuf fuyait vers Folk, il apparaîtrait ici et le test casse.
    const cible = {
      role: "CEO", organisation: "Acme", secteur: "Tech", pays: "France", ville: "Paris",
      prenom: "Jean", genre: "homme", categorie: ["entrepreneur"], serie_speciale: ["première neige"],
      premiere_neige: true, tag_investisseur: true, social_score: 3, statut_ref: "Booké",
      date_relance: "2026-08-01", date_contact: "2026-07-01", note: "notes prepa",
    } as never;
    const { patch, champs } = construirePatchFolk(
      cible,
      { emails: ["jean@acme.fr"], telephones: ["+33600000000"] },
      { jobTitle: "", description: "", emails: [], phones: [], companies: [] }
    );
    const AUTORISES = new Set(["jobTitle", "companies", "description", "emails", "phones"]);
    for (const cle of Object.keys(patch)) expect(AUTORISES.has(cle), `champ inattendu vers Folk : ${cle}`).toBe(true);
    for (const c of champs) expect(AUTORISES.has(c.split(" ")[0]), `champ inattendu vers Folk : ${c}`).toBe(true);
  });
});

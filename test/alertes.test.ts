import { describe, it, expect, afterEach } from "vitest";
import { destinatairesEchec } from "../src/lib/recap/alertes";

const nettoie = () => {
  delete process.env.ALERT_EMAILS;
  delete process.env.ALERT_OWNER_EMAIL;
};

describe("destinataires d'une alerte d'échec de génération (brief 11/09)", () => {
  afterEach(nettoie);

  it("initiateur + Matthieu uniquement, jamais toute l'équipe", () => {
    nettoie();
    expect(destinatairesEchec("clemence@stefani.fr").sort()).toEqual(["clemence@stefani.fr", "matt@stefani.fr"]);
  });

  it("sans initiateur (colonne 0051 absente ou job du cron) : Matthieu seul", () => {
    nettoie();
    expect(destinatairesEchec(null)).toEqual(["matt@stefani.fr"]);
    expect(destinatairesEchec("user-id-sans-email")).toEqual(["matt@stefani.fr"]);
  });

  it("l'initiateur qui EST Matthieu ne double pas le destinataire", () => {
    nettoie();
    expect(destinatairesEchec("Matt@stefani.fr")).toEqual(["matt@stefani.fr"]);
  });

  it("ALERT_OWNER_EMAIL surcharge l'adresse de Matthieu, ALERT_EMAILS surcharge tout", () => {
    process.env.ALERT_OWNER_EMAIL = "autre@collision.studio";
    expect(destinatairesEchec(null)).toEqual(["autre@collision.studio"]);
    process.env.ALERT_EMAILS = "a@x.fr, b@x.fr";
    expect(destinatairesEchec("clemence@stefani.fr").sort()).toEqual(["a@x.fr", "b@x.fr"]);
  });
});

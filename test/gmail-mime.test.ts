import { describe, it, expect } from "vitest";
import { buildMime } from "../src/lib/gmail";

// B1 — garde de structure MIME. Prouve que le corps HTML est DANS une partie
// (après le premier boundary) et non dans le préambule, qu'il y a bien une ligne
// vide entre en-têtes racine et corps, un seul Content-Type racine, un boundary
// aléatoire, et que le HTML décodé correspond à l'entrée.

const HTML = "<p>Bonjour, ceci est le corps.</p>";
const VCF = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Test\r\nEND:VCARD\r\n";

describe("buildMime — message multipart avec pièce jointe", () => {
  const raw = buildMime("gdiy@collision.studio", { to: ["a@b.c"], subject: "Sujet é", html: HTML, attachments: [{ filename: "participants.vcf", mimeType: "text/vcard", content: VCF }] });

  it("a un seul Content-Type racine (multipart/mixed)", () => {
    // Les en-têtes racine = tout avant la première ligne vide.
    const rootHeaders = raw.split("\r\n\r\n")[0];
    const ctCount = (rootHeaders.match(/^Content-Type:/gm) ?? []).length;
    expect(ctCount).toBe(1);
    expect(rootHeaders).toContain("multipart/mixed");
  });

  it("insère une ligne vide avant le premier boundary", () => {
    const boundary = raw.match(/boundary="([^"]+)"/)?.[1];
    expect(boundary).toBeTruthy();
    expect(raw).toContain(`"\r\n\r\n--${boundary}`);
  });

  it("place le HTML dans une partie, pas dans le préambule", () => {
    const boundary = raw.match(/boundary="([^"]+)"/)![1];
    const preambule = raw.split(`--${boundary}`)[0];
    // le HTML encodé ne doit PAS être dans le préambule
    expect(preambule).not.toContain(Buffer.from(HTML).toString("base64"));
    // il doit être présent dans le corps, décodable
    expect(raw).toContain(Buffer.from(HTML).toString("base64"));
  });

  it("le boundary est aléatoire (pas la valeur statique buguée)", () => {
    expect(raw).not.toContain("mgln_boundary_0000");
  });

  it("déclare la pièce jointe en attachment", () => {
    expect(raw).toContain('Content-Disposition: attachment; filename="participants.vcf"');
  });

  it("chaque partie a une ligne vide entre ses en-têtes et son corps", () => {
    // Content-Transfer-Encoding: base64 doit être suivi d'une ligne vide.
    expect(raw).toMatch(/Content-Transfer-Encoding: base64\r\n\r\n/);
  });
});

describe("buildMime — message simple sans pièce jointe", () => {
  const raw = buildMime("x@y.z", { to: ["a@b.c"], subject: "S", html: HTML });
  it("est un text/html direct avec ligne vide avant le corps", () => {
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(raw).toMatch(/base64\r\n\r\n/);
    expect(raw).toContain(Buffer.from(HTML).toString("base64"));
  });
});

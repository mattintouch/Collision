import { describe, it, expect } from "vitest";
import { registerMagellanTools } from "../src/lib/mcp/tools";

// LOT H — contrat d'entrée des outils MCP. On enregistre les outils contre un
// faux serveur qui capture (name, config, cb), sans base ni réseau, et on
// vérifie : schémas STRICTS (rejet des paramètres inconnus), contrat atomique
// de create_cible, annotations explicites.
function captureTools(allow?: readonly string[]) {
  const tools: Record<string, { config: any; cb: any }> = {};
  const server = {
    registerTool: (name: string, config: any, cb: any) => {
      tools[name] = { config, cb };
      return {};
    },
  };
  registerMagellanTools(server as any, allow ? { allow } : {});
  return tools;
}

const tools = captureTools();

describe("enregistrement des outils", () => {
  it("enregistre les outils clés", () => {
    for (const t of ["list_shows", "list_cibles", "get_dossier", "create_cible", "resolve_contact", "add_appui_contact"]) {
      expect(tools[t], t).toBeTruthy();
    }
  });

  it("chaque outil porte un inputSchema zod et des annotations", () => {
    for (const [name, t] of Object.entries(tools)) {
      expect(typeof t.config.inputSchema?.safeParse, name).toBe("function");
      expect(t.config.annotations, name).toBeTruthy();
    }
  });
});

describe("rejet des paramètres inconnus (strict)", () => {
  it("list_cibles rejette une clé inconnue", () => {
    expect(tools["list_cibles"].config.inputSchema.safeParse({ show: "gdiy", typo: true }).success).toBe(false);
  });
  it("list_cibles accepte un appel valide", () => {
    expect(tools["list_cibles"].config.inputSchema.safeParse({ show: "gdiy", limit: 5 }).success).toBe(true);
  });
  it("log_touche rejette une clé inconnue", () => {
    expect(tools["log_touche"].config.inputSchema.safeParse({ show: "gdiy", cible: "X", contenu: "y", cannal: "email" }).success).toBe(false);
  });
});

describe("create_cible — contrat atomique", () => {
  const schema = () => tools["create_cible"].config.inputSchema;
  it("accepte stage + contacts[] + premiere_touche en un appel", () => {
    const r = schema().safeParse({
      show: "gdiy",
      nom: "Nouvelle Cible",
      stage: "identifie",
      contacts: [{ kind: "email", valeur: "a@b.c" }, { kind: "portier", valeur: "+33 6 00", label: "Assistante" }],
      premiere_touche: { contenu: "Premier message envoyé", canal: "email" },
    });
    expect(r.success).toBe(true);
  });
  it("reste valide sans les champs atomiques (rétrocompatible)", () => {
    expect(schema().safeParse({ show: "gdiy", nom: "X" }).success).toBe(true);
  });
  it("rejette un paramètre inconnu", () => {
    expect(schema().safeParse({ show: "gdiy", nom: "X", bogus: 1 }).success).toBe(false);
  });
  it("rejette un kind de contact invalide", () => {
    expect(schema().safeParse({ show: "gdiy", nom: "X", contacts: [{ kind: "pigeon", valeur: "z" }] }).success).toBe(false);
  });
});

describe("annotations explicites", () => {
  it("les suppressions sont destructives", () => {
    expect(tools["delete_appui"].config.annotations.destructiveHint).toBe(true);
    expect(tools["delete_touche"].config.annotations.destructiveHint).toBe(true);
  });
  it("les lectures sont readOnly", () => {
    for (const t of ["list_shows", "list_cibles", "daily_five", "find_cible", "get_dossier", "show_stats"]) {
      expect(tools[t].config.annotations.readOnlyHint, t).toBe(true);
    }
  });
});

describe("allowlist Vadim", () => {
  it("n'enregistre que les 8 outils de la boucle", () => {
    const loop = captureTools(["list_shows", "list_cibles", "find_cible", "get_dossier", "daily_five", "log_touche", "update_cible", "add_appui"]);
    expect(Object.keys(loop).sort()).toEqual(
      ["add_appui", "daily_five", "find_cible", "get_dossier", "list_cibles", "list_shows", "log_touche", "update_cible"].sort()
    );
  });
});

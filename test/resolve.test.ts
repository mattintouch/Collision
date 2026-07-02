import { describe, it, expect } from "vitest";
import { normName } from "../src/lib/contacts/resolve";

describe("normName — rapprochement tolérant", () => {
  it("insensible à la casse et aux accents", () => {
    expect(normName("Édouard Meylan")).toBe(normName("edouard meylan"));
    expect(normName("Xavier NIEL")).toBe("xavier niel");
  });
  it("compacte les espaces", () => {
    expect(normName("  Jean   Dupont ")).toBe("jean dupont");
  });
});

// Mapping Folk -> Magellan. Pipe invité = personne (cahier des charges §14.2).

import type { CibleKind, ContactKind } from "../types";
import type { FolkPerson } from "./client";

export interface MappedContact {
  kind: ContactKind;
  valeur: string;
  label: string | null;
  source: string;
  confiance: number;
}

export interface MappedTarget {
  folk_id: string;
  nom: string;
  kind: CibleKind;
  role: string | null;
  organisation: string | null;
  contacts: MappedContact[];
  note: string | null;
}

function companyName(p: FolkPerson): string | null {
  const c = p.companies?.[0];
  if (!c) return null;
  if (typeof c === "string") return c;
  return c.name ?? null;
}

export function mapPerson(
  p: FolkPerson,
  typePipe: "invites" | "thematique"
): MappedTarget {
  const nom =
    p.fullName?.trim() ||
    [p.firstName, p.lastName].filter(Boolean).join(" ").trim() ||
    "Sans nom";

  const contacts: MappedContact[] = [];
  for (const e of p.emails ?? [])
    if (e) contacts.push({ kind: "email", valeur: e, label: "Import Folk", source: "Folk", confiance: 4 });
  for (const ph of p.phones ?? [])
    if (ph) contacts.push({ kind: "telephone", valeur: ph, label: "Import Folk", source: "Folk", confiance: 4 });
  for (const u of p.urls ?? [])
    if (u) contacts.push({ kind: "reseau", valeur: u, label: "Import Folk", source: "Folk", confiance: 3 });

  return {
    folk_id: p.id,
    nom,
    kind: typePipe === "invites" ? "personne" : "entreprise",
    role: p.jobTitle?.trim() || null,
    organisation: companyName(p),
    contacts,
    note: p.description?.trim() || null,
  };
}

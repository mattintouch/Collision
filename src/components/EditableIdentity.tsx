"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCibleInfo } from "@/lib/actions";
import { Input } from "./form";

// Édition inline de l'identité de la fiche : nom + (rôle/organisation pour une
// personne, secteur/pays pour une entreprise).
export function EditableIdentity({
  cibleId,
  showSlug,
  isEntreprise,
  nom,
  role,
  organisation,
  secteur,
  pays,
}: {
  cibleId: string;
  showSlug: string;
  isEntreprise: boolean;
  nom: string;
  role: string | null;
  organisation: string | null;
  secteur: string | null;
  pays: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [vNom, setVNom] = useState(nom);
  const [v1, setV1] = useState((isEntreprise ? secteur : role) ?? "");
  const [v2, setV2] = useState((isEntreprise ? pays : organisation) ?? "");

  const subtitle = isEntreprise
    ? [secteur, pays].filter(Boolean).join(" · ")
    : [role, organisation].filter(Boolean).join(" · ");

  function save() {
    const patch = isEntreprise
      ? { nom: vNom.trim(), secteur: v1.trim() || null, pays: v2.trim() || null }
      : { nom: vNom.trim(), role: v1.trim() || null, organisation: v2.trim() || null };
    start(async () => {
      await updateCibleInfo({ cible_id: cibleId, show_slug: showSlug, patch });
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <Input value={vNom} onChange={(e) => setVNom(e.target.value)} placeholder="Nom" className="text-lg" />
        <div className="grid grid-cols-2 gap-2">
          <Input value={v1} onChange={(e) => setV1(e.target.value)} placeholder={isEntreprise ? "Secteur" : "Rôle"} />
          <Input value={v2} onChange={(e) => setV2(e.target.value)} placeholder={isEntreprise ? "Pays" : "Organisation"} />
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={pending} className="btn bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-500">
            {pending ? "…" : "Enregistrer"}
          </button>
          <button onClick={() => setEditing(false)} className="btn-ghost px-3 py-1 text-sm">Annuler</button>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <h1 className="shimmer font-display text-3xl font-semibold tracking-tight">{nom}</h1>
      <p className="mt-1 text-sm text-blanc-muted">
        {subtitle || "—"}
        <button
          onClick={() => setEditing(true)}
          className="ml-2 text-xs text-blanc-muted underline opacity-0 transition-opacity hover:text-blanc group-hover:opacity-100"
        >
          éditer
        </button>
      </p>
    </div>
  );
}

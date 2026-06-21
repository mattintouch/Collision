"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Show } from "@/lib/types";
import { createCible } from "@/lib/actions";
import { Modal } from "./Modal";
import { Field, Input, Select, Textarea } from "./form";

export function NewTargetButton({ show }: { show: Show }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const isEntreprise = show.type_pipe === "thematique";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const sujets = (f.get("sujets") as string)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    start(async () => {
      const res = await createCible({
        show_id: show.id,
        show_slug: show.slug,
        kind: isEntreprise ? "entreprise" : "personne",
        nom: f.get("nom") as string,
        priorite: f.get("priorite") as string,
        voie: f.get("voie") as string,
        sujets,
        canal_reel: (f.get("canal_reel") as string) || null,
        via_qui: (f.get("via_qui") as string) || null,
        role: (f.get("role") as string) || null,
        organisation: (f.get("organisation") as string) || null,
        archetype: (f.get("archetype") as string) || null,
        secteur: (f.get("secteur") as string) || null,
        pays: (f.get("pays") as string) || null,
        envergure: (f.get("envergure") as string) || null,
        raison_de_selection: (f.get("raison_de_selection") as string) || null,
        etat_recherche: (f.get("etat_recherche") as string) || null,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "Erreur");
      }
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-jaune">
        + Nouvelle cible
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isEntreprise ? "Nouvelle entreprise" : "Nouvel invité"}
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Nom" required>
            <Input name="nom" required autoFocus placeholder={isEntreprise ? "Nom de l'entreprise / marque" : "Nom de la personne"} />
          </Field>

          {isEntreprise ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Secteur">
                  <Input name="secteur" />
                </Field>
                <Field label="Pays">
                  <Input name="pays" defaultValue="France" />
                </Field>
              </div>
              <Field label="Envergure">
                <Select name="envergure" defaultValue="fr">
                  <option value="fr">France</option>
                  <option value="international">International</option>
                </Select>
              </Field>
              <Field label="Raison de sélection">
                <Textarea name="raison_de_selection" rows={2} placeholder="Pourquoi ce fleuron, l'angle éditorial" />
              </Field>
              <Field label="État de la recherche">
                <Input name="etat_recherche" placeholder="À lancer, en cours…" />
              </Field>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rôle">
                  <Input name="role" placeholder="Entrepreneur, sportif…" />
                </Field>
                <Field label="Organisation">
                  <Input name="organisation" />
                </Field>
              </div>
              <Field label="Archétype">
                <Select name="archetype" defaultValue="">
                  <option value="">À classer</option>
                  <option value="big_fish">Big Fish</option>
                  <option value="quick_win">Quick Win</option>
                  <option value="pepite">Pépite</option>
                </Select>
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priorité">
              <Select name="priorite" defaultValue="moyenne">
                <option value="haute">Haute</option>
                <option value="moyenne">Moyenne</option>
                <option value="basse">Basse</option>
              </Select>
            </Field>
            <Field label="Voie">
              <Select name="voie" defaultValue="froid">
                <option value="froid">Froid</option>
                <option value="chaud">Chaud</option>
              </Select>
            </Field>
          </div>

          <Field label="Sujets (séparés par des virgules)">
            <Input name="sujets" placeholder="sport, business" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Canal réel">
              <Input name="canal_reel" placeholder="Instagram DM, LinkedIn…" />
            </Field>
            <Field label="Via qui">
              <Input name="via_qui" />
            </Field>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              Annuler
            </button>
            <button type="submit" disabled={pending} className="btn-jaune">
              {pending ? "Création…" : "Créer"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

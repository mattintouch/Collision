"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { validateCible } from "@/lib/actions";
import { Modal } from "./Modal";
import { Field, Input } from "./form";

const DEFAULT_LIEU = "Studio 71, 71 rue de Saussure, 75017 Paris";

export function ConfirmEpisodeModal({
  open,
  onClose,
  cibleId,
  showSlug,
  cibleNom,
  defaultEmails = [],
}: {
  open: boolean;
  onClose: () => void;
  cibleId: string;
  showSlug: string;
  cibleNom: string;
  defaultEmails?: string[];
}) {
  const [date, setDate] = useState("");
  const [heure, setHeure] = useState("");
  const [lieu, setLieu] = useState(DEFAULT_LIEU);
  const [emails, setEmails] = useState(defaultEmails.join(", "));
  const [send, setSend] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    setMsg(null);
    const attendees = emails.split(/[,\s]+/).map((e) => e.trim()).filter((e) => e.includes("@"));
    const start_iso = date && heure ? new Date(`${date}T${heure}:00`).toISOString() : undefined;
    start(async () => {
      const r = await validateCible({
        cible_id: cibleId,
        show_slug: showSlug,
        cible_nom: cibleNom,
        start_iso,
        lieu,
        attendees,
        send_invite: send,
      });
      if (r.ok) {
        setMsg(r.detail ?? "Validé.");
        router.refresh();
        setTimeout(onClose, 1200);
      } else {
        setMsg(r.error ?? "Erreur");
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={`Confirmer l'épisode — ${cibleNom}`}>
      <div className="space-y-3">
        <p className="text-xs text-blanc-muted">
          La cible devient un épisode. Renseigne l&apos;enregistrement pour créer
          l&apos;invitation Google Calendar (laisse vide pour valider sans planifier).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date d'enregistrement">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Heure">
            <Input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
          </Field>
        </div>
        <Field label="Lieu">
          <Input value={lieu} onChange={(e) => setLieu(e.target.value)} />
        </Field>
        <Field label="Emails des participants (séparés par des virgules)">
          <Input
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="invite@exemple.com, equipe@collision.studio"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-blanc-muted">
          <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />
          Envoyer l&apos;invitation par email aux participants
        </label>

        {msg && <p className="text-sm text-jaune">{msg}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Annuler
          </button>
          <button onClick={submit} disabled={pending} className="btn bg-emerald-600 text-white hover:bg-emerald-500">
            {pending ? "Validation…" : "Confirmer l'épisode"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

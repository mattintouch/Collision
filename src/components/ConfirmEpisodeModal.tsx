"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { validateCible } from "@/lib/actions";
import { Modal } from "./Modal";
import { Field, Input, Textarea } from "./form";
import { MiniCalendar } from "./MiniCalendar";
import {
  GDIY_TEAM_EMAILS,
  STUDIO_71,
  defaultRecordingDate,
  invitationBody,
  invitationSubject,
  type InviteLang,
} from "@/lib/invitation";

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
  const [date, setDate] = useState(() => defaultRecordingDate().date);
  const [heure, setHeure] = useState("09:30");
  const [lieu, setLieu] = useState(STUDIO_71);
  const [lang, setLang] = useState<InviteLang>("fr");
  const [subject, setSubject] = useState(() => invitationSubject(cibleNom));
  const [body, setBody] = useState(() => invitationBody(cibleNom, "fr"));
  const [emails, setEmails] = useState(() =>
    Array.from(new Set([...defaultEmails, ...GDIY_TEAM_EMAILS])).join(", ")
  );
  const [send, setSend] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [claudeUrl, setClaudeUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const studioReserve = lieu.trim() === STUDIO_71;

  function switchLang(next: InviteLang) {
    setLang(next);
    setBody(invitationBody(cibleNom, next)); // réinitialise le corps dans la langue choisie
  }

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
        summary: subject,
        description: body,
      });
      if (r.ok) {
        setMsg(r.detail ?? "Validé.");
        router.refresh();
        if (r.claudeUrl) setClaudeUrl(r.claudeUrl);
        else setTimeout(onClose, 1200);
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
          l&apos;invitation Google Calendar (laisse la date vide pour valider sans planifier).
        </p>

        <Field label="Date d'enregistrement (mardi/jeudi 9h30 par défaut)">
          <MiniCalendar value={date} onChange={setDate} />
        </Field>
        <Field label="Heure">
          <Input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
        </Field>

        <Field label="Lieu">
          <Input value={lieu} onChange={(e) => setLieu(e.target.value)} />
        </Field>
        <p className="-mt-1 text-[11px] text-blanc-muted">
          {studioReserve
            ? "Studio 71 → la réservation studio (-1h/+1h) sera créée."
            : "Lieu modifié → pas de réservation du Studio 71."}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-blanc-muted">Langue de l&apos;invitation</span>
          <div className="flex gap-1 text-xs">
            {(["fr", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => switchLang(l)}
                className={`rounded px-2 py-1 ${lang === l ? "bg-jaune text-noir-900" : "text-blanc-muted hover:bg-noir-700"}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <Field label="Objet">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message d'invitation (modifiable)">
          <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>

        <Field label="Participants (invité + équipe, séparés par des virgules)">
          <Textarea
            rows={2}
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

        {claudeUrl && (
          <a
            href={claudeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn block w-full bg-jaune text-center font-medium text-noir-900 hover:opacity-90"
          >
            Préparer la fiche invité dans Claude →
          </a>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Fermer
          </button>
          <button onClick={submit} disabled={pending} className="btn bg-emerald-600 text-white hover:bg-emerald-500">
            {pending ? "Validation…" : "Confirmer l'épisode"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

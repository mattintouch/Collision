"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelEpisodeRecording, rescheduleEpisode } from "@/lib/actions";
import { MiniCalendar } from "./MiniCalendar";
import { Field, Input } from "./form";

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecordingActions({
  cibleId,
  showSlug,
  dateEnregistrement,
  lieu,
  statut,
}: {
  cibleId: string;
  showSlug: string;
  dateEnregistrement: string | null;
  lieu: string | null;
  statut: string;
}) {
  const [reporting, setReporting] = useState(false);
  const [date, setDate] = useState("");
  const [heure, setHeure] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function reschedule() {
    if (!date || !heure) {
      setMsg("Choisis une date et une heure.");
      return;
    }
    setMsg(null);
    const start_iso = new Date(`${date}T${heure}:00`).toISOString();
    start(async () => {
      const r = await rescheduleEpisode({ cible_id: cibleId, show_slug: showSlug, start_iso });
      setMsg(r.ok ? r.detail ?? "Reprogrammé." : r.error ?? "Erreur");
      if (r.ok) {
        setReporting(false);
        router.refresh();
      }
    });
  }

  function cancel() {
    if (!confirm("Annuler l'enregistrement ? Les événements Google Calendar (enregistrement + studio) seront supprimés.")) return;
    setMsg(null);
    start(async () => {
      const r = await cancelEpisodeRecording({ cible_id: cibleId, show_slug: showSlug });
      setMsg(r.ok ? r.detail ?? "Annulé." : r.error ?? "Erreur");
      if (r.ok) router.refresh();
    });
  }

  const annule = statut === "annule";

  return (
    <section className="card p-5">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blanc-muted">
        Enregistrement
      </h2>

      {annule ? (
        <p className="mt-2 text-sm text-blanc-muted">Enregistrement annulé.</p>
      ) : (
        <p className="mt-2 text-sm">
          {fmt(dateEnregistrement)}
          {lieu && <span className="text-blanc-muted"> · {lieu}</span>}
        </p>
      )}

      {!annule && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setReporting((v) => !v)}
            disabled={pending}
            className="btn-ghost px-3 py-1.5 text-sm"
          >
            {reporting ? "Fermer" : "Reporter"}
          </button>
          <button
            onClick={cancel}
            disabled={pending}
            className="btn border border-red-500/50 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10"
          >
            Annuler
          </button>
        </div>
      )}

      {reporting && !annule && (
        <div className="mt-3 space-y-3 border-t border-noir-600 pt-3">
          <Field label="Nouvelle date">
            <MiniCalendar value={date} onChange={setDate} />
          </Field>
          <Field label="Heure">
            <Input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
          </Field>
          <button
            onClick={reschedule}
            disabled={pending}
            className="btn w-full bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {pending ? "Report…" : "Confirmer le report"}
          </button>
          <p className="text-[11px] text-blanc-muted">
            Déplace l&apos;enregistrement et la réservation studio, et prévient les participants.
          </p>
        </div>
      )}

      {msg && <p className="mt-2 text-sm text-jaune">{msg}</p>}
    </section>
  );
}

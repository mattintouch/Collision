"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrichCibleAction, deleteContact } from "@/lib/actions";
import { CONTACT_LABELS } from "@/lib/domain";
import type { Contact } from "@/lib/types";
import type { ContactSuggestion } from "@/lib/enrichment/engine";

function looksLinkable(v: string) {
  return /^https?:\/\//.test(v);
}

export function ContactsSection({
  cibleId,
  showSlug,
  contacts,
}: {
  cibleId: string;
  showSlug: string;
  contacts: Contact[];
}) {
  const [suggestions, setSuggestions] = useState<ContactSuggestion[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function enrich() {
    setError(null);
    start(async () => {
      const res = await enrichCibleAction({ cible_id: cibleId, show_slug: showSlug });
      if (res.ok) {
        setDemo(res.demo);
        if (res.demo) {
          setSuggestions(res.contacts);
        } else {
          router.refresh(); // persistés en base
        }
      } else {
        setError(res.error ?? "Erreur");
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      await deleteContact({ contact_id: id, cible_id: cibleId, show_slug: showSlug });
      router.refresh();
    });
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blanc-muted">
          Contacts ({contacts.length})
        </h2>
        <button onClick={enrich} disabled={pending} className="btn-ghost px-2 py-1 text-xs">
          {pending ? "Recherche…" : "Enrichir"}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {contacts.length === 0 && !suggestions && (
          <p className="text-sm text-blanc-muted">
            Aucun contact. « Enrichir » cherche par où joindre la cible
            (sources publiques).
          </p>
        )}
        {contacts.map((c) => (
          <ContactRow
            key={c.id}
            kind={c.kind}
            valeur={c.valeur}
            label={c.label}
            source={c.source}
            confiance={c.confiance}
            onDelete={() => remove(c.id)}
          />
        ))}
      </div>

      {suggestions && (
        <div className="mt-4 border-t border-noir-600 pt-3">
          <p className="mb-2 text-xs text-blanc-muted">
            Suggestions {demo ? "(démo)" : ""} — non enregistrées :
          </p>
          <div className="space-y-2">
            {suggestions.length === 0 ? (
              <p className="text-sm text-blanc-muted">Rien trouvé de fiable.</p>
            ) : (
              suggestions.map((c, i) => (
                <ContactRow
                  key={i}
                  kind={c.kind}
                  valeur={c.valeur}
                  label={c.label}
                  source={c.source}
                  confiance={c.confiance}
                />
              ))
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <p className="mt-3 text-[11px] leading-snug text-blanc-muted">
        Sources publiques, finalité prise de contact professionnelle. À vérifier
        avant usage.
      </p>
    </section>
  );
}

function ContactRow({
  kind,
  valeur,
  label,
  source,
  confiance,
  onDelete,
}: {
  kind: Contact["kind"];
  valeur: string;
  label: string | null;
  source: string | null;
  confiance: number;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="chip border-noir-600 text-blanc-muted">
            {CONTACT_LABELS[kind]}
          </span>
          <span className="truncate text-sm">{valeur}</span>
        </div>
        <p className="text-xs text-blanc-muted">
          {label ? `${label} · ` : ""}confiance {confiance}/5
          {source ? " · " : ""}
          {source &&
            (looksLinkable(source) ? (
              <a href={source} target="_blank" rel="noopener noreferrer" className="underline hover:text-blanc">
                source
              </a>
            ) : (
              <span>{source}</span>
            ))}
        </p>
      </div>
      {onDelete && (
        <button
          onClick={onDelete}
          className="shrink-0 text-xs text-blanc-muted hover:text-red-400"
          aria-label="Supprimer"
        >
          ✕
        </button>
      )}
    </div>
  );
}

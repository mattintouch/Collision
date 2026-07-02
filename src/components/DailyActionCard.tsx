"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logTouche } from "@/lib/actions";
import type { Playbook } from "@/lib/types";

export interface DailyAction {
  id: string;
  nom: string;
  sous_titre: string;
  score: number;
  badges: string[];
  pourquoi: string | null;
  playbook: Playbook | null;
  canal_reel: string | null;
  via_qui: string | null;
}

/** Une action prête pour la session « Aujourd'hui » : pourquoi, comment, et log en un geste. */
export function DailyActionCard({ action, showSlug }: { action: DailyAction; showSlug: string }) {
  const pb = action.playbook ?? {};
  const canal = pb.canal ?? action.canal_reel ?? "";
  const brouillon = buildDraft(action);
  const [contenu, setContenu] = useState("");
  const [canalTouche, setCanalTouche] = useState(canal);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function log() {
    if (!contenu.trim()) return;
    start(async () => {
      const r = await logTouche({ cible_id: action.id, show_slug: showSlug, canal: canalTouche || null, contenu, source: "saisie" });
      if (r.ok) {
        setDone(true);
        router.refresh(); // la cible sort de la liste du jour au prochain rendu
      }
    });
  }

  function copy() {
    navigator.clipboard?.writeText(brouillon).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const pbEntries = [
    ["Canal", pb.canal],
    ["Langue", pb.langue],
    ["Fenêtre", pb.fenetre],
    ["Via", pb.personne_entree ?? action.via_qui],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <section className={`card p-5 ${done ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/${showSlug}/cible/${action.id}`} className="font-display text-lg font-semibold tracking-tight hover:underline">
            {action.nom}
          </Link>
          {action.sous_titre && <p className="text-sm text-blanc-muted">{action.sous_titre}</p>}
        </div>
        <span className="mono shrink-0" style={{ color: "#FFD200", fontWeight: 700 }}>SCORE {action.score}</span>
      </div>

      {action.badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {action.badges.map((b) => (
            <span key={b} className="chip mono border-noir-600 text-blanc-muted" style={{ fontSize: "9px" }}>{b}</span>
          ))}
        </div>
      )}

      {action.pourquoi && (
        <div className="mt-3 rounded-[10px] p-3" style={{ background: "rgba(255,210,0,.06)", border: "1px solid rgba(255,210,0,.14)" }}>
          <div className="label" style={{ color: "#FFD200", fontSize: "9px" }}>Pourquoi maintenant</div>
          <p className="mt-1 text-[13px] leading-snug">{action.pourquoi}</p>
        </div>
      )}

      {pbEntries.length > 0 && (
        <div className="meta mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {pbEntries.map(([k, v]) => (
            <span key={k}><span className="text-blanc-muted">{k} :</span> {v}</span>
          ))}
        </div>
      )}
      {pb.angle && <p className="mt-2 text-[13px] text-blanc-muted">Angle : {pb.angle}</p>}

      {/* Brouillon + copie */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <div className="label" style={{ fontSize: "9px" }}>Brouillon</div>
          <button onClick={copy} className="btn-ghost px-2 py-0.5 text-xs">{copied ? "Copié ✓" : "Copier"}</button>
        </div>
        <p className="mt-1 whitespace-pre-wrap rounded-lg border border-noir-600 bg-noir-900 p-2 text-[12.5px] text-blanc-muted">{brouillon}</p>
      </div>

      {/* Logger la touche */}
      {done ? (
        <p className="mt-3 text-sm text-relancer">Touche loggée ✓</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            placeholder="Ce que tu as envoyé / fait…"
            className="min-w-0 flex-1 rounded-lg border border-noir-600 bg-noir-900 px-2 py-1.5 text-sm outline-none placeholder:text-blanc-muted/60 focus:border-jaune"
          />
          <input
            value={canalTouche}
            onChange={(e) => setCanalTouche(e.target.value)}
            placeholder="Canal"
            className="w-28 rounded-lg border border-noir-600 bg-noir-900 px-2 py-1.5 text-sm outline-none placeholder:text-blanc-muted/60 focus:border-jaune"
          />
          <button onClick={log} disabled={pending || !contenu.trim()} className="btn-jaune shrink-0 disabled:opacity-40">
            Logger la touche
          </button>
        </div>
      )}
    </section>
  );
}

/** Brouillon d'ouverture simple à partir du playbook + du pourquoi maintenant. */
function buildDraft(a: DailyAction): string {
  const prenom = a.nom.split(/\s+/)[0];
  const pb = a.playbook ?? {};
  const en = (pb.langue ?? "").toLowerCase().startsWith("en");
  const angle = pb.angle ? ` ${pb.angle}` : a.pourquoi ? ` ${a.pourquoi}` : "";
  if (en) return `Hi ${prenom},\n\nI'd love to have you on the show.${angle}\n\nWould you be open to a conversation?`;
  return `Bonjour ${prenom},\n\nJ'aimerais beaucoup vous recevoir sur le podcast.${angle}\n\nSeriez-vous ouvert(e) à un échange ?`;
}

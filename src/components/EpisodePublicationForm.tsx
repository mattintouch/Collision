"use client";

// Formulaire du domaine PUBLICATION (schéma de référence, rebranchement 1).
// Piloté par des listes de champs : ajouter un attribut demain = une ligne.
// Verrou : posé par l'équipe, levé par un admin ; verrouillé, tout est en
// lecture seule sauf pour un admin (motif affiché, jamais d'échec muet).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEpisodeLock, updateEpisodePublication } from "@/lib/actions";

type Episode = Record<string, unknown> & { id: string; nom: string };

const COURTS: { champ: string; label: string; type?: "number" | "date" }[] = [
  { champ: "numero", label: "Numéro d'épisode (unique)", type: "number" },
  { champ: "titre", label: "Titre" },
  { champ: "date_publication", label: "Date de publication", type: "date" },
];

const DESCRIPTIONS: { champ: string; label: string }[] = [
  { champ: "description_site", label: "Description site" },
  { champ: "description_youtube", label: "Description YouTube" },
  { champ: "description_rss", label: "Description RSS" },
];

const VISUELS: { champ: string; label: string }[] = [
  { champ: "miniature_v1", label: "Miniature v1" },
  { champ: "miniature_v2", label: "Miniature v2" },
  { champ: "miniature_v3", label: "Miniature v3" },
  { champ: "visuel_public_ecoute", label: "Visuel plateformes d'écoute" },
  { champ: "visuel_public_instagram", label: "Visuel Instagram" },
  { champ: "photo_post_linkedin", label: "Photo post LinkedIn" },
];

const PLATEFORMES: { champ: string; label: string }[] = [
  { champ: "lien_youtube", label: "YouTube" },
  { champ: "lien_apple_podcast", label: "Apple Podcasts" },
  { champ: "lien_spotify", label: "Spotify" },
  { champ: "lien_amazon_music", label: "Amazon Music" },
  { champ: "lien_deezer", label: "Deezer" },
];

const CONTENUS: { champ: string; label: string }[] = [
  { champ: "contenu_linkedin", label: "Contenu LinkedIn" },
  { champ: "sponsors", label: "Sponsors" },
  { champ: "notes_clemence", label: "Notes Clémence" },
  { champ: "transcript", label: "Transcript" },
];

const LISTES: { champ: string; label: string }[] = [
  { champ: "liens_livres", label: "Liens livres (un par ligne)" },
  { champ: "episodes_mentionnes", label: "Épisodes mentionnés (un par ligne)" },
  { champ: "seo_liens", label: "Liens SEO (un par ligne)" },
];

const MEDIAS: { prefixe: string; label: string }[] = [
  { prefixe: "shorts", label: "Shorts" },
  { prefixe: "teaser_reseaux", label: "Teaser réseaux" },
  { prefixe: "teaser_youtube", label: "Teaser YouTube" },
];

const STATUTS_PROD: { champ: string; label: string }[] = [
  { champ: "statut_script", label: "Script" },
  { champ: "statut_montage", label: "Montage" },
  { champ: "statut_illustration", label: "Illustration" },
];

const s = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const lignes = (v: unknown): string => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").join("\n") : "");

export function EpisodePublicationForm({
  showSlug,
  episode,
  estAdmin,
  statutsProduction,
  statutsMedia,
}: {
  showSlug: string;
  episode: Episode;
  estAdmin: boolean;
  statutsProduction: string[];
  statutsMedia: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const initial = useMemo(() => {
    const v: Record<string, string> = {};
    for (const { champ } of [...COURTS, ...DESCRIPTIONS, ...VISUELS, ...PLATEFORMES, ...CONTENUS, ...STATUTS_PROD]) v[champ] = s(episode[champ]);
    for (const { champ } of LISTES) v[champ] = lignes(episode[champ]);
    v.fiche_prepa = s(episode.fiche_prepa);
    for (const { prefixe } of MEDIAS) {
      v[`${prefixe}_script`] = s(episode[`${prefixe}_script`]);
      v[`${prefixe}_statut`] = s(episode[`${prefixe}_statut`]);
      v[`${prefixe}_lien`] = s(episode[`${prefixe}_lien`]);
    }
    return v;
  }, [episode]);
  const [valeurs, setValeurs] = useState<Record<string, string>>(initial);

  const verrou = typeof episode.published_locked_at === "string" ? episode.published_locked_at : null;
  const lectureSeule = !!verrou && !estAdmin;
  const set = (champ: string) => (e: { target: { value: string } }) => setValeurs((v) => ({ ...v, [champ]: e.target.value }));

  const enregistrer = () => {
    const patch: Record<string, unknown> = {};
    for (const [champ, valeur] of Object.entries(valeurs)) {
      if (valeur === initial[champ]) continue;
      if (LISTES.some((l) => l.champ === champ)) {
        patch[champ] = valeur.split("\n").map((l) => l.trim()).filter(Boolean);
      } else if (champ === "numero") {
        patch[champ] = valeur.trim() === "" ? null : Number(valeur);
      } else {
        patch[champ] = valeur.trim() === "" ? null : valeur;
      }
    }
    if (!Object.keys(patch).length) {
      setMessage({ ok: true, texte: "Rien à enregistrer : aucun champ modifié." });
      return;
    }
    start(async () => {
      const r = await updateEpisodePublication({ episode_id: episode.id, patch, show_slug: showSlug });
      setMessage(r.ok ? { ok: true, texte: r.detail ?? "Enregistré." } : { ok: false, texte: r.error ?? "Échec." });
      if (r.ok) router.refresh();
    });
  };

  const basculerVerrou = () => {
    start(async () => {
      const r = await setEpisodeLock({ episode_id: episode.id, locked: !verrou, show_slug: showSlug });
      setMessage(r.ok ? { ok: true, texte: verrou ? "Verrou levé." : "Épisode verrouillé : publication en lecture seule." } : { ok: false, texte: r.error ?? "Échec." });
      if (r.ok) router.refresh();
    });
  };

  const input = "w-full rounded-lg border border-noir-600 bg-transparent px-3 py-2 text-sm";
  const zone = `${input} min-h-24`;
  const bloc = "card p-4 space-y-3";
  const titreBloc = "label";

  return (
    <div className="space-y-4">
      {/* Verrou */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${verrou ? "border-amber-400/40 bg-amber-400/10" : "border-noir-600"}`}>
        <div className="text-sm">
          {verrou ? (
            <>
              <span className="font-semibold text-amber-700">Épisode verrouillé</span>
              <span className="text-blanc-muted"> depuis le {new Date(verrou).toLocaleDateString("fr-FR")} : publication en lecture seule{estAdmin ? " (ton profil admin peut écrire)" : ""}.</span>
            </>
          ) : (
            <span className="text-blanc-muted">Épisode ouvert : l&apos;équipe peut éditer la publication. Verrouille une fois l&apos;épisode publié et vérifié.</span>
          )}
        </div>
        {(!verrou || estAdmin) && (
          <button onClick={basculerVerrou} disabled={pending} className="btn-ghost rounded-lg px-3 py-1.5 text-sm">
            {verrou ? "Lever le verrou (admin)" : "Verrouiller la publication"}
          </button>
        )}
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-2 text-sm ${message.ok ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border border-red-500/40 bg-red-500/10 text-red-700"}`}>
          {message.texte}
        </div>
      )}

      <div className={bloc}>
        <h2 className={titreBloc}>Identité</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {COURTS.map(({ champ, label, type }) => (
            <label key={champ} className="text-sm">
              <span className="text-blanc-muted">{label}</span>
              <input className={input} type={type ?? "text"} value={valeurs[champ]} onChange={set(champ)} disabled={lectureSeule} />
            </label>
          ))}
        </div>
      </div>

      <div className={bloc}>
        <h2 className={titreBloc}>Statuts de production</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {STATUTS_PROD.map(({ champ, label }) => (
            <label key={champ} className="text-sm">
              <span className="text-blanc-muted">{label}</span>
              <select className={input} value={valeurs[champ]} onChange={set(champ)} disabled={lectureSeule}>
                {statutsProduction.map((v) => (
                  <option key={v} value={v} className="bg-white">{v}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className={bloc}>
        <h2 className={titreBloc}>Descriptions</h2>
        {DESCRIPTIONS.map(({ champ, label }) => (
          <label key={champ} className="block text-sm">
            <span className="text-blanc-muted">{label}</span>
            <textarea className={zone} value={valeurs[champ]} onChange={set(champ)} disabled={lectureSeule} />
          </label>
        ))}
      </div>

      <div className={bloc}>
        <h2 className={titreBloc}>Visuels (liens)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {VISUELS.map(({ champ, label }) => (
            <label key={champ} className="text-sm">
              <span className="text-blanc-muted">{label}</span>
              <input className={input} value={valeurs[champ]} onChange={set(champ)} disabled={lectureSeule} placeholder="https://..." />
            </label>
          ))}
        </div>
      </div>

      <div className={bloc}>
        <h2 className={titreBloc}>Liens plateformes</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLATEFORMES.map(({ champ, label }) => (
            <label key={champ} className="text-sm">
              <span className="text-blanc-muted">{label}</span>
              <input className={input} value={valeurs[champ]} onChange={set(champ)} disabled={lectureSeule} placeholder="https://..." />
            </label>
          ))}
        </div>
      </div>

      <div className={bloc}>
        <h2 className={titreBloc}>Médias courts</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {MEDIAS.map(({ prefixe, label }) => (
            <div key={prefixe} className="space-y-2 rounded-lg border border-noir-600 p-3">
              <div className="text-sm font-medium">{label}</div>
              <label className="block text-sm">
                <span className="text-blanc-muted">Statut</span>
                <select className={input} value={valeurs[`${prefixe}_statut`]} onChange={set(`${prefixe}_statut`)} disabled={lectureSeule}>
                  <option value="" className="bg-white">non prévu</option>
                  {statutsMedia.map((v) => (
                    <option key={v} value={v} className="bg-white">{v}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-blanc-muted">Script</span>
                <textarea className={zone} value={valeurs[`${prefixe}_script`]} onChange={set(`${prefixe}_script`)} disabled={lectureSeule} />
              </label>
              <label className="block text-sm">
                <span className="text-blanc-muted">Lien</span>
                <input className={input} value={valeurs[`${prefixe}_lien`]} onChange={set(`${prefixe}_lien`)} disabled={lectureSeule} placeholder="https://..." />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className={bloc}>
        <h2 className={titreBloc}>Contenus et listes</h2>
        {CONTENUS.map(({ champ, label }) => (
          <label key={champ} className="block text-sm">
            <span className="text-blanc-muted">{label}</span>
            <textarea className={champ === "transcript" ? `${input} min-h-40` : zone} value={valeurs[champ]} onChange={set(champ)} disabled={lectureSeule} />
          </label>
        ))}
        <label className="block text-sm">
          <span className="text-blanc-muted">Fiche de préparation (lien externe, la fiche Magellan native reste dans Fiches)</span>
          <input className={input} value={valeurs.fiche_prepa ?? ""} onChange={set("fiche_prepa")} disabled={lectureSeule} placeholder="https://..." />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {LISTES.map(({ champ, label }) => (
            <label key={champ} className="text-sm">
              <span className="text-blanc-muted">{label}</span>
              <textarea className={zone} value={valeurs[champ]} onChange={set(champ)} disabled={lectureSeule} />
            </label>
          ))}
        </div>
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <button
          onClick={enregistrer}
          disabled={pending || lectureSeule}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-noir-900"
          style={{ background: "var(--accent-gradient, #1FB46A)" }}
        >
          {pending ? "Enregistrement..." : lectureSeule ? "Lecture seule (verrouillé)" : "Enregistrer la publication"}
        </button>
      </div>
    </div>
  );
}

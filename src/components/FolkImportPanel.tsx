"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  folkListGroups,
  folkImport,
  type FolkImportResult,
} from "@/lib/actions";
import type { FolkGroup } from "@/lib/folk/client";

export function FolkImportPanel({ showSlug }: { showSlug: string }) {
  const [groups, setGroups] = useState<FolkGroup[] | null>(null);
  const [groupId, setGroupId] = useState("");
  const [result, setResult] = useState<FolkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    folkListGroups().then((r) => {
      setLoadingGroups(false);
      if (r.ok) setGroups(r.groups);
      else setError(r.error ?? "Erreur");
    });
  }, []);

  function run(dry: boolean) {
    if (!groupId) return;
    setError(null);
    start(async () => {
      const r = await folkImport({ show_slug: showSlug, group_id: groupId, dry_run: dry });
      if (r.ok) {
        setResult(r);
        if (!dry) router.refresh();
      } else {
        setError(r.error ?? "Erreur");
      }
    });
  }

  if (loadingGroups)
    return <p className="text-sm text-blanc-muted">Connexion à Folk…</p>;

  if (error && !groups)
    return (
      <div className="card p-5">
        <p className="text-sm text-red-400">{error}</p>
        <p className="mt-2 text-xs text-blanc-muted">
          Ajoute <code>FOLK_API_KEY</code> (clé API Folk) dans Vercel → Settings →
          Environments, puis redéploie. La clé se crée dans Folk → Settings → Developer / API.
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-blanc-muted">
            Groupe Folk à importer
          </span>
          <select
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              setResult(null);
            }}
            className="rounded-lg border border-noir-600 bg-noir-900 px-3 py-2 text-sm outline-none focus:border-jaune"
          >
            <option value="">— choisir —</option>
            {(groups ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={() => run(true)}
          disabled={pending || !groupId}
          className="btn-ghost"
        >
          {pending ? "…" : "Aperçu"}
        </button>
        <button
          onClick={() => run(false)}
          disabled={pending || !groupId || !result}
          className="btn-jaune"
          title={!result ? "Fais d'abord un aperçu" : ""}
        >
          {pending ? "Import…" : "Importer"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {result && (
        <div className="card p-5">
          {result.dry_run ? (
            <p className="text-sm">
              <span className="font-medium">{result.total}</span> personne
              {result.total > 1 ? "s" : ""} dans ce groupe. Aperçu des premières —
              clique <span className="text-jaune">Importer</span> pour créer les
              cibles (les doublons par nom seront ignorés).
            </p>
          ) : (
            <p className="text-sm">
              Import terminé : <span className="font-medium text-jaune">{result.created}</span> créée
              {result.created > 1 ? "s" : ""},{" "}
              <span className="font-medium text-jaune">{result.linked}</span> reliée
              {result.linked > 1 ? "s" : ""} à Folk, {result.skipped} ignorée
              {result.skipped > 1 ? "s" : ""} sur {result.total}.
            </p>
          )}

          {result.preview.length > 0 && (
            <div className="mt-3 divide-y divide-noir-600">
              {result.preview.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="truncate font-medium">{r.nom}</span>
                    <span className="ml-2 text-xs text-blanc-muted">
                      {[r.role, r.organisation].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  {r.nb_contacts > 0 && (
                    <span className="shrink-0 text-xs text-blanc-muted">
                      {r.nb_contacts} contact{r.nb_contacts > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getShow } from "@/lib/data";
import { FolkImportPanel } from "@/components/FolkImportPanel";

export default async function ImportPage({
  params,
}: {
  params: { show: string };
}) {
  const show = await getShow(params.show);
  if (!show) notFound();

  return (
    <div>
      <Link href={`/${show.slug}/board`} className="text-sm text-blanc-muted hover:text-blanc">
        ← Board {show.nom}
      </Link>
      <p className="label mb-1 mt-3" style={{ color: "#FFD200" }}>Sources</p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Importer depuis Folk — {show.nom}
      </h1>
      <p className="mb-5 mt-1 text-sm text-blanc-muted">
        Reprend les contacts d&apos;un groupe Folk comme cibles (avec leurs
        emails/téléphones en contacts). Fais un aperçu d&apos;abord ; les doublons
        par nom sont ignorés.
        {show.type_pipe !== "invites" && (
          <span className="mt-1 block text-jaune">
            Note : le périmètre prévu est le pipe invité. Sur un show thématique,
            les personnes seront importées comme entreprises (à ajuster ensuite).
          </span>
        )}
      </p>
      <FolkImportPanel showSlug={show.slug} />
    </div>
  );
}

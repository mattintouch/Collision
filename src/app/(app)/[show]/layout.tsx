import { notFound } from "next/navigation";
import Link from "next/link";
import { getShow, getShows, demoMode } from "@/lib/data";
import { ShowSwitcher } from "@/components/ShowSwitcher";
import { NavTabs } from "@/components/NavTabs";

export default async function ShowLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { show: string };
}) {
  const [shows, show] = await Promise.all([getShows(), getShow(params.show)]);
  if (!show) notFound();

  const accent = show.couleur ?? "#FFD200";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-noir-600 bg-noir-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "#FFD200" }}
            />
            <span className="font-display text-lg font-semibold tracking-tight">
              Magellan
            </span>
          </Link>

          <ShowSwitcher shows={shows} current={show} />

          <NavTabs showSlug={show.slug} />

          <div className="ml-auto flex items-center gap-3">
            <span
              className="chip border-transparent"
              style={{ backgroundColor: `${accent}22`, color: accent }}
            >
              {show.type_pipe === "invites" ? "Invités" : "Thématique"}
            </span>
            <Link
              href="/settings"
              className="text-sm text-blanc-muted hover:text-blanc"
              aria-label="Réglages"
              title="Réglages"
            >
              Réglages
            </Link>
          </div>
        </div>
        {demoMode && (
          <div className="bg-jaune/10 px-4 py-1.5 text-center text-xs text-jaune">
            Mode démo — données locales. Branchez Supabase (.env.local) pour
            persister.
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { getShow, getShows } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { ShowSwitcher } from "@/components/ShowSwitcher";
import { NavTabs } from "@/components/NavTabs";
import { CompteBadge } from "@/components/CompteBadge";

export default async function ShowLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { show: string };
}) {
  const [shows, show, auth] = await Promise.all([getShows(), getShow(params.show), createClient().auth.getUser()]);
  if (!show) notFound();
  const email = auth.data.user?.email ?? "";

  const accent = show.couleur ?? "#FFD200";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-noir-600 bg-noir-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="logo-dot inline-block h-3 w-3 rotate-45 rounded-[3px]" />
            <span className="shimmer font-display text-lg font-semibold tracking-tight">
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
              href="/fiches"
              className="text-sm text-blanc-muted hover:text-blanc"
              title="Fiches de préparation"
            >
              Fiches
            </Link>
            <Link
              href="/settings"
              className="text-sm text-blanc-muted hover:text-blanc"
              aria-label="Réglages"
              title="Réglages"
            >
              Réglages
            </Link>
            {email && <CompteBadge email={email} />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

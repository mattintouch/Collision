import { redirect } from "next/navigation";
import { getDefaultShowSlug, getShows } from "@/lib/data";

export default async function Home() {
  const shows = await getShows();
  const pref = await getDefaultShowSlug();
  const slug =
    pref && shows.some((s) => s.slug === pref)
      ? pref
      : shows[0]?.slug ?? "gdiy";
  redirect(`/${slug}/board`);
}

"use client";

import { useRouter } from "next/navigation";
import type { Show } from "@/lib/types";

export function ShowSwitcher({
  shows,
  current,
}: {
  shows: Show[];
  current: Show;
}) {
  const router = useRouter();

  return (
    <select
      value={current.slug}
      onChange={(e) => router.push(`/${e.target.value}/board`)}
      className="rounded-lg border border-noir-600 bg-noir-800 px-3 py-1.5 text-sm font-medium outline-none focus:border-jaune"
      aria-label="Sélecteur de show"
    >
      {shows.map((s) => (
        <option key={s.id} value={s.slug}>
          {s.nom}
        </option>
      ))}
    </select>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { key: "board", label: "Board" },
  { key: "episodes", label: "Épisodes" },
  { key: "dispo", label: "Dispo" },
  { key: "veille", label: "Veille" },
  { key: "copilote", label: "Copilote" },
];

export function NavTabs({ showSlug }: { showSlug: string }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {tabs.map((t) => {
        const href = `/${showSlug}/${t.key}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={t.key}
            href={href}
            className={clsx(
              "relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "text-blanc"
                : "text-blanc-muted hover:bg-[var(--glass-1)] hover:text-blanc"
            )}
            style={active ? { background: "var(--glass-2)" } : undefined}
          >
            {t.label}
            {active && (
              <span
                className="absolute inset-x-2.5 -bottom-[7px] h-0.5 rounded-full"
                style={{ background: "var(--accent-gradient)" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

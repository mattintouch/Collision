"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { key: "board", label: "Board" },
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
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-noir-700 text-blanc"
                : "text-blanc-muted hover:text-blanc"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import { useState } from "react";

// Mini calendrier mensuel autonome (sans dépendance) pour choisir une date.
// Valeur au format YYYY-MM-DD. Semaine commençant le lundi, locale FR.

const JOURS = ["L", "M", "M", "J", "V", "S", "D"];

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Index lundi=0 … dimanche=6. */
function lundiIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function MiniCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (ymd: string) => void;
}) {
  const selected = parseYmd(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Mois affiché : celui de la valeur, sinon le mois courant.
  const [view, setView] = useState(() => {
    const base = selected ?? today;
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const first = new Date(view.year, view.month, 1);
  const lead = lundiIndex(first); // cases vides avant le 1er
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.year, view.month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const moisLabel = first.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  function shift(delta: number) {
    setView((v) => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  return (
    <div className="rounded-lg border border-noir-600 bg-noir-900/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="rounded px-2 py-1 text-blanc-muted hover:bg-noir-700 hover:text-blanc"
          aria-label="Mois précédent"
        >
          ‹
        </button>
        <span className="text-sm font-medium capitalize">{moisLabel}</span>
        <button
          type="button"
          onClick={() => shift(1)}
          className="rounded px-2 py-1 text-blanc-muted hover:bg-noir-700 hover:text-blanc"
          aria-label="Mois suivant"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-blanc-muted">
        {JOURS.map((j, i) => (
          <div key={i} className="py-1">{j}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = ymd(d);
          const isPast = d < today;
          const isSelected = selected != null && key === ymd(selected);
          const isToday = key === ymd(today);
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <button
              key={i}
              type="button"
              disabled={isPast}
              onClick={() => onChange(key)}
              className={[
                "aspect-square rounded text-sm transition-colors",
                isSelected
                  ? "bg-jaune font-semibold text-noir-900"
                  : isPast
                    ? "cursor-not-allowed text-blanc-muted/30"
                    : isWeekend
                      ? "text-blanc-muted hover:bg-noir-700"
                      : "text-blanc hover:bg-noir-700",
                !isSelected && isToday ? "ring-1 ring-jaune/50" : "",
              ].join(" ")}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

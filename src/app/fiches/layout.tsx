// Segment /fiches : fiches de préparation GDIY (design handoff, distinct du
// Cockpit). Accès protégé par l'auth de l'app (middleware) ; jamais indexé.

import type { Metadata } from "next";
import "./fiches.css";

export const metadata: Metadata = {
  title: "Fiches de préparation — GDIY",
  robots: { index: false, follow: false },
};

export default function FichesLayout({ children }: { children: React.ReactNode }) {
  return <div className="gdiy">{children}</div>;
}

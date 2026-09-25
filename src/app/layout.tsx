import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Couche GDIY (03/08) : Source Sans 3 (UI + corps) + IBM Plex Mono
// (micro-labels, compteurs, dates), alignées sur les fiches.
//
// Fontes AUTO-HÉBERGÉES depuis le 25/09. Elles passaient par next/font/google,
// qui les télécharge PENDANT LE BUILD : un déploiement sans cache a échoué
// parce que l'appel à Google Fonts n'a pas abouti, et le build de production
// dépendait donc de la disponibilité d'un service tiers. Les fichiers étaient
// déjà dans le dépôt pour les fiches, ils servent maintenant aussi à l'app.
// Source Sans 3 est une fonte variable : une seule ressource couvre 200 à 900.
const sans = localFont({
  src: [
    { path: "../../public/fonts/gdiy/SourceSans3-variable.woff2", weight: "200 900", style: "normal" },
    { path: "../../public/fonts/gdiy/SourceSans3-variable-italic.woff2", weight: "200 900", style: "italic" },
  ],
  variable: "--font-sans",
  display: "swap",
});
const mono = localFont({
  src: [
    { path: "../../public/fonts/gdiy/IBMPlexMono-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/gdiy/IBMPlexMono-500.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/gdiy/IBMPlexMono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Magellan — Collision",
  description:
    "Moteur de conquête et de closing pour les podcasts de Collision Productions.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Magellan",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#FBFAF7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

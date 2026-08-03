import type { Metadata, Viewport } from "next";
import { Source_Sans_3, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Couche GDIY (03/08) : Source Sans 3 (UI + corps) + IBM Plex Mono
// (micro-labels, compteurs, dates), alignées sur les fiches.
const sans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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

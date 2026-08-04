import type { Metadata, Viewport } from "next";
import "./globals.css";

// Couche soft (04/08) : police système (SF/Segoe UI/Roboto), --font-sans et
// --font-mono déclarées dans globals.css. Plus de webfont pour l'interface.

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
  themeColor: "#F7F7F5",
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
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

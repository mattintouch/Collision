import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Magellan — Collision",
  description:
    "Moteur de conquête et de closing pour les podcasts de Collision Productions.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Magellan",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
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

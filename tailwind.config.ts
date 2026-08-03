import type { Config } from "tailwindcss";

/**
 * Identité Magellan 2026 — couche GDIY papier/encre (handoff design du 03/08,
 * étendue à tout Magellan pour rester cohérent avec les fiches, décision
 * Matthieu). L'échelle « noir » historique est REMAPPÉE sur les surfaces
 * papier et « blanc » sur l'encre : les classes existantes se propagent sans
 * réécrire chaque composant. Zéro border-radius, hairlines beiges, jaune
 * #F4C435 en accent, rouge réservé aux états critiques.
 */
const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Fonds (remappés sur l'échelle « noir » existante pour propager partout).
        noir: {
          DEFAULT: "#FBFAF7", // bg/page (papier)
          900: "#FBFAF7",
          800: "#FFFFFF", // surface/card
          700: "#F0EDE7", // hover / sous-panneau
          600: "#E8E5DF", // hairlines (bordures)
          500: "#C9C4BB",
        },
        blanc: {
          DEFAULT: "#141414", // text/primary (encre)
          pure: "#000000",
          muted: "#5C5850", // text/muted
          dim: "#8A857D", // text/dim
          faint: "#C9C4BB", // text/faint
        },
        jaune: {
          DEFAULT: "#F4C435", // accent GDIY
          600: "#E0B222",
          pale: "#F7E9B0",
        },
        amber: "#F4C435", // plus de dégradé : l'accent est plat
        // Voie d'approche (assombries pour le fond papier).
        froid: "#1D6FD8",
        chaud: "#C2601E",
        // Conseils de relance.
        relancer: "#177A4C",
        appui: "#1D6FD8",
        // Signalétique par show.
        gdiy: "#1FB46A",
        ccg: "#3B82F6",
        fleurons: "#B45CFF",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        // Handoff 03/08 : aucun border-radius nulle part.
        card: "0px",
        control: "0px",
        chip: "0px",
        pill: "0px",
      },
      boxShadow: {
        cta: "none",
        fab: "none",
        frame: "0 24px 60px -20px rgba(0,0,0,.6)",
      },
    },
  },
  plugins: [],
};

export default config;

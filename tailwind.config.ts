import type { Config } from "tailwindcss";

/**
 * Identité Magellan 2026 — direction « Cockpit ».
 * Sombre, technique ; noir encre froid (jamais de pur noir) ; accent jaune→ambre
 * ponctuel ; hairlines blanches en rgba (cf. globals.css). Tokens du handoff
 * design 2026 (Space Grotesk + JetBrains Mono).
 */
const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Fonds (remappés sur l'échelle « noir » existante pour propager partout).
        noir: {
          DEFAULT: "#0B0C10", // bg/page
          900: "#0B0C10",
          800: "#14161D", // surface/card
          700: "#1b1e26", // hover / sous-panneau
          600: "#262a33", // approximation solide des hairlines (bordures)
          500: "#2f3440",
        },
        blanc: {
          DEFAULT: "#F3F4F6", // text/primary
          pure: "#FFFFFF",
          muted: "#9aa0ac", // text/muted
          dim: "#6b7280", // text/dim
          faint: "#5b616b", // text/faint
        },
        jaune: {
          DEFAULT: "#FFD200", // accent Collision
          600: "#E6BD00",
          pale: "#FFE680", // glint shimmer
        },
        amber: "#FF9F1C", // fin du dégradé jaune→ambre
        // Voie d'approche.
        froid: "#5DB4FF",
        chaud: "#FF8C42",
        // Conseils de relance.
        relancer: "#5fe0a0",
        appui: "#9fd0ff",
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
        card: "14px",
        control: "9px",
        chip: "7px",
        pill: "20px",
      },
      boxShadow: {
        cta: "0 6px 18px -6px rgba(255,210,0,.5)",
        fab: "0 8px 24px -4px rgba(255,210,0,.5)",
        frame: "0 24px 60px -20px rgba(0,0,0,.6)",
      },
    },
  },
  plugins: [],
};

export default config;

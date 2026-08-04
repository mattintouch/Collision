import type { Config } from "tailwindcss";

/**
 * Identité Magellan — couche « soft » (04/08, remplace le papier/encre du
 * 03/08 sur décision Matthieu). L'échelle « noir » historique reste la
 * surface, « blanc » l'encre : les classes existantes se propagent sans
 * réécrire chaque composant. Tout est arrondi, chaque carte porte une ombre
 * légère, ambre #F2C14E en accent, rouge réservé à l'enregistrement/critique.
 */
const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Fonds (remappés sur l'échelle « noir » existante pour propager partout).
        noir: {
          DEFAULT: "#F7F7F5", // bg/page (canvas)
          900: "#F7F7F5",
          800: "#FFFFFF", // surface/card
          700: "#F4F3F0", // hover / sous-panneau
          600: "#E8E6E0", // hairlines (bordures)
          500: "#C6C2B9",
        },
        blanc: {
          DEFAULT: "#37352F", // text/primary (encre)
          pure: "#201F1C",
          muted: "#6B6862", // text/muted
          dim: "#9B978E", // text/dim
          faint: "#C6C2B9", // text/faint
        },
        jaune: {
          DEFAULT: "#F2C14E", // accent GDIY adouci
          600: "#E2AD33",
          pale: "#FBEEC6",
        },
        amber: "#F2C14E",
        // Voie d'approche.
        froid: "#3B82F6",
        chaud: "#D0803F",
        // Conseils de relance.
        relancer: "#1F9D6B",
        appui: "#3B82F6",
        // Signalétique par show.
        gdiy: "#29B37C",
        ccg: "#4B8EF7",
        fleurons: "#A879F0",
        // Rouge d'enregistrement / critique.
        rouge: "#E0525F",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        // Direction douce (04/08) : tout est arrondi.
        card: "14px",
        "card-lg": "18px",
        control: "10px",
        chip: "999px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(55,53,47,.04), 0 1px 3px rgba(55,53,47,.06)",
        raised: "0 4px 14px rgba(55,53,47,.08)",
        cta: "0 1px 2px rgba(55,53,47,.08)",
        fab: "0 4px 14px rgba(55,53,47,.08)",
        frame: "0 24px 60px -20px rgba(55,53,47,.35)",
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

/**
 * Identité Collision. Palette : noir, blanc, jaune (signature).
 * Le vert appartient au show GDIY, pas au studio.
 *
 * TODO (décision ouverte §14.1) : confirmer les hex et les typographies
 * exacts depuis le Figma identité (id ZI56QbnEsPRDjL5JXJ7oEz) au build.
 * Les valeurs ci-dessous sont des placeholders calés sur la DA du site
 * collision.studio en attendant les tokens définitifs.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        noir: {
          DEFAULT: "#0A0A0A",
          900: "#0A0A0A",
          800: "#141414",
          700: "#1E1E1E",
          600: "#2A2A2A",
        },
        blanc: {
          DEFAULT: "#FAFAFA",
          pure: "#FFFFFF",
          muted: "#9CA3AF",
        },
        jaune: {
          DEFAULT: "#FFD200",
          600: "#E6BD00",
        },
        // Couleurs par show (signalétique, pas couleur studio).
        gdiy: "#1FB46A",
        ccg: "#3B82F6",
        fleurons: "#B45CFF",
      },
      fontFamily: {
        // TODO: remplacer par les polices du Figma identité.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
};

export default config;

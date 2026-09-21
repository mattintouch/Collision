"use client";

// Page intermédiaire du lancement dev : le prompt complet, copiable en un
// geste, et le bouton qui ouvre Claude Code sur le dépôt. Composant client
// pour le seul presse-papiers.

import { useState } from "react";

const BOUTON: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 16px",
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 6,
  border: "1px solid #1B1D1E",
  cursor: "pointer",
  textDecoration: "none",
};

export function PromptCopiable({ prompt, urlClaude, depot }: { prompt: string; urlClaude: string; depot: string }) {
  const [copie, setCopie] = useState(false);

  async function copier() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : la zone de
      // texte reste sélectionnable à la main, rien n'est perdu.
      setCopie(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <button type="button" onClick={copier} style={{ ...BOUTON, background: "#1B1D1E", color: "#fff" }}>
          {copie ? "Prompt copié" : "Copier le prompt"}
        </button>
        <a href={urlClaude} target="_blank" rel="noreferrer" style={{ ...BOUTON, background: "#fff", color: "#1B1D1E" }}>
          Ouvrir Claude Code
        </a>
      </div>
      <p style={{ color: "#8a8d88", fontSize: 12, margin: "0 0 10px" }}>Dépôt : {depot}</p>
      <textarea
        readOnly
        value={prompt}
        rows={22}
        onFocus={(e) => e.currentTarget.select()}
        style={{
          width: "100%",
          boxSizing: "border-box",
          fontFamily: "ui-monospace,Menlo,monospace",
          fontSize: 12,
          lineHeight: 1.5,
          background: "#F6F4EF",
          border: "1px solid #E4E0D6",
          borderRadius: 6,
          padding: 12,
          whiteSpace: "pre-wrap",
        }}
      />
    </div>
  );
}

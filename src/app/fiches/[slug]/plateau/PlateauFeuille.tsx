// Feuille de plateau (mandat du 13/09, chantier 5) : composant de
// PRÉSENTATION PUR, sans accès données. La route /fiches/{slug}/plateau le
// rend côté serveur ; le banc de recette le rend tel quel pour les captures.

import { CHROME_FICHE, type FicheLangue } from "@/lib/fiche/chrome";
import type { PlateauView } from "@/lib/fiche/schema";

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function PlateauFeuille({
  plateau,
  langue,
  inviteNom,
  societe,
  slug,
}: {
  plateau: PlateauView | null;
  langue: FicheLangue;
  inviteNom: string;
  societe?: string;
  slug: string;
}) {
  const L = CHROME_FICHE[langue];
  const groupes = (plateau?.chapitres ?? []).map((ch) => ({
    chapitre: ch,
    questions: (plateau?.questions ?? []).filter((q) => q.chapitre === ch.num),
  }));
  const horsChapitre = (plateau?.questions ?? []).filter(
    (q) => q.chapitre === undefined || !(plateau?.chapitres ?? []).some((ch) => ch.num === q.chapitre)
  );

  return (
    <div className="gdv4">
      <div className="gd-sticky">
        <span className="nom">{inviteNom}</span>
        <span className="meta">{[societe, L.plateauTitre.toUpperCase()].filter(Boolean).join(" · ")}</span>
      </div>
      <section className="gd-plateau gd-plateau--page">
        <div className="gd-page">
          <div className="gd-plateau__head">
            <h2>{L.plateauTitre}</h2>
            <span className="sub">{L.plateauSub}</span>
            <a className="ouvrir" href={`/fiches/${slug}`}>← {inviteNom}</a>
          </div>
          {!plateau && (
            <p className="pintro">
              {langue === "en"
                ? "No set sheet on this fiche yet (section dix_questions)."
                : "Aucune feuille de plateau sur cette fiche pour le moment (section dix_questions)."}
            </p>
          )}
          {plateau?.intro && <p className="pintro">{plateau.intro}</p>}
          {plateau && plateau.chapitres.length > 0 && (
            <nav className="pchaps" aria-label={L.plateauChapitres}>
              {plateau.chapitres.map((c) => (
                <a className="pchap" key={c.num} href={`#chapitre-${c.num}`}>
                  <span className="n">{c.num}</span>
                  <span className="t">{c.titre}</span>
                  {(c.debut_min !== undefined || c.fin_min !== undefined) && (
                    <span className="mn">{c.debut_min ?? 0}–{c.fin_min ?? ""} {L.plateauMin}</span>
                  )}
                </a>
              ))}
            </nav>
          )}
          {plateau && groupes.map(({ chapitre, questions }) => (
            <div key={chapitre.num} id={`chapitre-${chapitre.num}`}>
              <div className="gd-plateau__head" style={{ marginTop: 34 }}>
                <h2 style={{ fontSize: 26 }}>{chapitre.num} · {chapitre.titre}</h2>
                {(chapitre.debut_min !== undefined || chapitre.fin_min !== undefined) && (
                  <span className="sub">{chapitre.debut_min ?? 0}–{chapitre.fin_min ?? ""} {L.plateauMin}</span>
                )}
              </div>
              <div className="pqs">
                {questions.map((q, i) => (
                  <div className="pq" key={i}>
                    <div className="pqhead">
                      <span className="pn">{q.num ?? pad2(i + 1)}</span>
                    </div>
                    <p className="pt">{q.texte}</p>
                    {q.note && <p className="pnote">{q.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {plateau && horsChapitre.length > 0 && (
            <div className="pqs" style={{ marginTop: 34 }}>
              {horsChapitre.map((q, i) => (
                <div className="pq" key={i}>
                  <div className="pqhead">
                    <span className="pn">{q.num ?? pad2(i + 1)}</span>
                  </div>
                  <p className="pt">{q.texte}</p>
                  {q.note && <p className="pnote">{q.note}</p>}
                </div>
              ))}
            </div>
          )}
          {plateau && plateau.interdits.length > 0 && (
            <div className="pinterdits" style={{ marginTop: 34 }}>
              <div className="lab">{L.plateauInterdits}</div>
              <ul>{plateau.interdits.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

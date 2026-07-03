// S10 — génération de la fiche de prep au format Onesta (gabarit codifié).
// Structure FIXE en 10 sections. Une section sans matière s'affiche comme
// « à alimenter » (encart ambre), jamais remplie de généralités : la fiche sert
// aussi de contrôle qualité de la prep. Tout le contenu interpolé est échappé.

import { FICHE_CSS } from "./css";

export interface FicheFigure {
  valeur: string;
  unite?: string | null;
  libelle: string;
  source?: string | null;
}
export interface FicheSource {
  titre: string;
  url: string;
  type?: string | null;
  date?: string | null;
}
export interface FicheAxe {
  titre: string;
  levier?: string | null;
  questions: { setup?: string | null; q: string }[];
}
export interface FicheLevier {
  titre: string;
  setup?: string | null;
  q?: string | null;
}

export interface FicheData {
  nom: string;
  soustitre?: string | null;
  // Rangée meta de l'en-tête (valeurs issues de l'épisode Magellan).
  entretien?: string | null;
  lieu?: string | null;
  diffusion?: string | null;
  fiche_date?: string | null;
  // 00–09 : contenu par section. Vide/absent → « à alimenter ».
  lecture_strategique?: { tag: string; texte: string }[];
  mission?: string | null;
  a_verrouiller?: string[];
  qui?: { role?: string | null; puces: { d: string; t: string }[] };
  chiffres?: FicheFigure[];
  questions_reseaux?: string[];
  axes_profonds?: FicheAxe[];
  masterclass?: FicheLevier[];
  arrivee?: string[];
  sources?: FicheSource[];
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Attribut href sûr : seulement http(s), sinon vide (anti-javascript:). */
function safeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? esc(url) : "#";
}

function head(num: string, title: string): string {
  return `<div class="sec-head"><span class="sec-num">${num}</span><h2 class="sec-title">${esc(title)}</h2></div>`;
}

/** Encart « section à alimenter » (contrôle qualité de la prep). */
function missing(num: string, title: string, quoi: string): string {
  return `<section>${head(num, title)}<div class="alert"><span class="tag">Section à alimenter</span><p>${esc(quoi)}</p></div></section>`;
}

const has = (a?: unknown[]) => Array.isArray(a) && a.length > 0;

export function generateFicheHtml(d: FicheData): string {
  const sections: string[] = [];

  // 00 — Lecture stratégique
  if (has(d.lecture_strategique)) {
    const rows = d.lecture_strategique!
      .map((r) => `<div class="read-row"><span class="tag">${esc(r.tag)}</span>${esc(r.texte)}</div>`)
      .join("");
    sections.push(`<section>${head("00", "Lecture stratégique")}${rows}</section>`);
  } else {
    sections.push(missing("00", "Lecture stratégique", "Le vrai sujet, le piège, le levier : à dériver de la raison de sélection et du playbook."));
  }

  // 01 — Mission
  sections.push(
    d.mission?.trim()
      ? `<section>${head("01", "Mission")}<p class="lead">${esc(d.mission)}</p></section>`
      : missing("01", "Mission", "Objectif de l'entretien en 2-3 phrases : ce que l'épisode doit produire.")
  );

  // 02 — À verrouiller
  if (has(d.a_verrouiller)) {
    const items = d.a_verrouiller!.map((t) => `<div class="alert"><span class="tag">Correction avant le micro</span><p>${esc(t)}</p></div>`).join("");
    sections.push(`<section>${head("02", "À verrouiller")}${items}</section>`);
  } else {
    sections.push(missing("02", "À verrouiller", "Points logistiques et éditoriaux à confirmer avant le jour J."));
  }

  // 03 — Qui
  if (d.qui && has(d.qui.puces)) {
    const role = d.qui.role ? `<p class="role">${esc(d.qui.role)}</p>` : "";
    const puces = d.qui.puces.map((p) => `<li><span class="d">${esc(p.d)}</span><span>${esc(p.t)}</span></li>`).join("");
    sections.push(`<section>${head("03", "Qui")}<div class="card"><h3>${esc(d.nom)}</h3>${role}</div><ul class="dated">${puces}</ul></section>`);
  } else {
    sections.push(missing("03", "Qui", "Bio/parcours : puces datées (dates en gras). À alimenter par l'enrichissement."));
  }

  // 04 — En chiffres (figures sourcées uniquement)
  if (has(d.chiffres)) {
    const figs = d.chiffres!
      .map((f) => `<div class="fig"><div class="n">${esc(f.valeur)}${f.unite ? " " + esc(f.unite) : ""}</div><div class="l">${esc(f.libelle)}${f.source ? ` <em>(${esc(f.source)})</em>` : ""}</div></div>`)
      .join("");
    sections.push(`<section>${head("04", "En chiffres")}<div class="figs">${figs}</div></section>`);
  } else {
    sections.push(missing("04", "En chiffres", "Figures sourcées (valeur, unité, libellé, source) issues de l'enrichissement. Jamais de chiffre sans source."));
  }

  // 05 — Questions réseaux (hero)
  if (has(d.questions_reseaux)) {
    const qs = d.questions_reseaux!.map((q) => `<li><span class="q">${esc(q)}</span></li>`).join("");
    sections.push(`<section class="hero">${head("05", "Questions réseaux · à dégainer")}<p class="hint">Courtes, punchy, partageables.</p><ol class="reseaux">${qs}</ol></section>`);
  } else {
    sections.push(missing("05", "Questions réseaux", "Questions courtes et partageables, cadence du show."));
  }

  // 06 — Questions profondes (3 axes)
  if (has(d.axes_profonds)) {
    const axes = d.axes_profonds!
      .map((ax) => {
        const lev = ax.levier ? `<p class="levier">${esc(ax.levier)}</p>` : "";
        const qs = ax.questions
          .map((q) => `<li>${q.setup ? `<p class="setup">${esc(q.setup)}</p>` : ""}${esc(q.q)}</li>`)
          .join("");
        return `<div class="axis"><h4>${esc(ax.titre)}</h4>${lev}<ol class="deep">${qs}</ol></div>`;
      })
      .join("");
    sections.push(`<section>${head("06", "Questions profondes · 3 axes")}${axes}</section>`);
  } else {
    sections.push(missing("06", "Questions profondes", "3 axes, chaque question avec son contexte (setup) puis la question."));
  }

  // 07 — Masterclass
  if (has(d.masterclass)) {
    const items = d.masterclass!
      .map((l, i) => {
        const n = String(i + 1).padStart(2, "0");
        const setup = l.setup ? `<p class="setup">${esc(l.setup)}</p>` : "";
        const q = l.q ? `<p class="q">${esc(l.q)}</p>` : "";
        return `<li><div class="mh"><span class="mn">${n}</span><span class="mt">${esc(l.titre)}</span></div>${setup}${q}</li>`;
      })
      .join("");
    sections.push(`<section>${head("07", "Masterclass")}<ol class="master">${items}</ol></section>`);
  } else {
    sections.push(missing("07", "Masterclass", "3-4 leviers de méthode/management à extraire."));
  }

  // 08 — À verrouiller à l'arrivée (checklist)
  if (has(d.arrivee)) {
    const items = d.arrivee!.map((t) => `<li>${esc(t)}</li>`).join("");
    sections.push(`<section>${head("08", "À verrouiller à l'arrivée")}<ul class="check">${items}</ul></section>`);
  } else {
    sections.push(missing("08", "À verrouiller à l'arrivée", "Checklist jour J : caméra/audio, élocution, photo de fin, cue questions directes."));
  }

  // 09 — Sources
  if (has(d.sources)) {
    const items = d.sources!
      .map((s) => `<li><a href="${safeHref(s.url)}" target="_blank" rel="noopener">${esc(s.titre)}</a>${s.type ? ` <span class="tag">${esc(s.type)}</span>` : ""}${s.date ? ` — ${esc(s.date)}` : ""}</li>`)
      .join("");
    sections.push(`<section>${head("09", "Sources")}<ul class="sources">${items}</ul></section>`);
  } else {
    sections.push(missing("09", "Sources", "Liens typés (article/vidéo/podcast) avec date, issus de la curation ou de l'enrichissement."));
  }

  const meta = [
    d.entretien ? `<span>ENTRETIEN <b>${esc(d.entretien)}</b></span>` : "",
    d.lieu ? `<span>LIEU <b>${esc(d.lieu)}</b></span>` : "",
    d.diffusion ? `<span>DIFFUSION <b>${esc(d.diffusion)}</b></span>` : "",
    d.fiche_date ? `<span>FICHE <b>${esc(d.fiche_date)}</b></span>` : "",
  ].filter(Boolean).join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fiche prépa · ${esc(d.nom)}</title>
<style>${FICHE_CSS}</style>
</head>
<body>
<div class="sheet">
<header class="brief">
  <p class="kicker">Fiche prépa · Génération Do It Yourself</p>
  <h1 class="title">${esc(d.nom)}</h1>
  ${d.soustitre ? `<p class="subtitle">${esc(d.soustitre)}</p>` : ""}
  <div class="meta">${meta}</div>
</header>
${sections.join("\n")}
<footer>Fiche générée par Magellan · Collision Productions</footer>
</div>
</body>
</html>`;
}

"use client";

// Fiche de préparation GDIY, contrat v2 (Bloc A / Bloc B) sur le design du
// handoff (vue unique fusionnée, système GDIY noir/blanc Tungsten).
// Bloc A : document d'apprentissage (prose, lu 48 h avant). Bloc B : console
// d'épisode (cartes scannables), à partir de l'ancre « console ». Les sections
// se rendent dans l'ordre stocké par fiche (défaut au catalogue) via un
// registre : chaque section_id a son rendu, une section vide est absente.
// REC verrouillé tant que la checklist n'est pas complète (règle Matt).
// État persisté par appareil (localStorage, clé gdiy-fiche-{slug}).

import { useCallback, useEffect, useRef, useState } from "react";
import { FICHE_SECTIONS } from "@/lib/fiche/sections";
import type { KpiCard, LienDate } from "@/lib/fiche/schema";

export interface FicheBloc {
  debut_min: number;
  fin_min: number;
  court: string;
  titre: string;
  intention?: string;
  mode?: string;
  rappel_label?: string;
  rappel?: string;
}
export interface FicheQuestion { num: string; bloc: number; texte: string; note?: string }
export interface ALireLien {
  niveau?: "indispensable" | "utile" | "optionnel";
  titre: string;
  date?: string;
  temps_lecture?: string;
  apport?: string;
  url?: string;
}

export interface FicheViewData {
  slug: string;
  invite_nom: string;
  statut: string;
  version: number;
  ordre: string[]; // ordre des sections par fiche (réordonnable)
  generation: { groupe: string; statut: string; error?: string; quand?: string }[];
  incompletes: string[]; // sections obligatoires vides (gate anti fiche vide)
  entete: {
    numero?: string;
    titre_lignes: string[];
    societe?: string;
    sous_titre?: string;
    pilules: string[];
    liens: { label: string; url: string }[];
  };
  checklist: string[];
  enjeu?: string;
  lecon?: string;
  recit: string[];
  mecanique: {
    definition?: string;
    pairs: { nom: string; position?: string }[];
    divergences: { date: string; decision: string; effet?: string }[];
    contrefactuel?: string;
  } | null;
  univers_intro: string[];
  distinctions: string[];
  personnel: { bandeau: string; items: { texte: string; source: string }[] } | null;
  a_lire: ALireLien[];
  trente_secondes: { label: string; texte: string }[];
  anecdotes: { texte: string; source?: string; cachee?: boolean }[];
  kpis: KpiCard[];
  visuels: {
    barres?: { titre: string; note?: string; source?: string; valeurs: { label: string; affiche: string; valeur: number; plein?: boolean }[] };
    comparaison?: { titre?: string; source?: string; valeurs: { nom: string; affiche: string; pct: number; hero?: boolean }[] };
    rentabilite?: { titre?: string; note?: string; source?: string; valeurs: { label: string; affiche: string; pct: number }[] };
    timeline?: { titre: string; jalons: { annee: string; titre: string; texte?: string; cle?: boolean }[] };
  };
  parcours: { annee: string; texte: string }[];
  playbook: { intro?: string; items: { titre: string; connu?: string; manque?: string; question?: string }[] };
  entourage: { nom: string; role?: string; texte?: string }[];
  tensions: { a: string; b: string; angle?: string }[];
  recurrentes: { intro?: string; items: { question: string; reponse?: string }[] };
  reseaux: { question: string; meta?: string }[];
  blocs: FicheBloc[];
  questions: FicheQuestion[];
  zone_grise: { texte: string; origine?: string }[];
  sources: LienDate[];
  footer: string;
}

/* Tokens typographiques du système GDIY. */
const T_COND = "'Tungsten Condensed', 'Arial Narrow', sans-serif";
const T_COMP = "'Tungsten Compressed', 'Tungsten Condensed', 'Arial Narrow', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const h2Style: React.CSSProperties = { fontFamily: T_COND, fontWeight: 700, fontSize: 40, lineHeight: 0.95, textTransform: "uppercase", margin: 0 };
const h3Style: React.CSSProperties = { fontFamily: T_COND, fontWeight: 700, fontSize: 28, lineHeight: 1, textTransform: "uppercase", margin: 0 };
const sectionStyle: React.CSSProperties = { marginTop: 52, borderTop: "2px solid #000", paddingTop: 18 };
const monoSrc: React.CSSProperties = { fontFamily: MONO, fontSize: 11, color: "#6B6B65" };
/* Bloc A : mode lecture, prose, interligne généreux, largeur limitée. */
const proseStyle: React.CSSProperties = { fontSize: 17, lineHeight: 1.65, maxWidth: 680 };

const BLOC_OF = new Map(FICHE_SECTIONS.map((s) => [s.id, s.bloc]));
const TITRE_OF = new Map(FICHE_SECTIONS.map((s) => [s.id, s.titre]));
const NIVEAUX: Record<string, string> = { indispensable: "INDISPENSABLE", utile: "UTILE", optionnel: "OPTIONNEL" };

interface Persisted {
  checked?: Record<number, boolean>;
  asked?: Record<string, boolean>;
  askedAt?: Record<string, string>;
  recStart?: number | null;
  carnet?: { tag: "CLIP" | "NOTE"; time: string; text: string }[];
  chat?: { who: string; time: string; text: string }[];
}

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
const pad2 = (n: number) => String(n).padStart(2, "0");
const rangeLabel = (b: FicheBloc) => `${pad2(Math.floor(b.debut_min / 60))}:${pad2(b.debut_min % 60)} – ${pad2(Math.floor(b.fin_min / 60))}:${pad2(b.fin_min % 60)}`;

export default function FicheView({ data }: { data: FicheViewData }) {
  const LS = `gdiy-fiche-${data.slug}`;
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [asked, setAsked] = useState<Record<string, boolean>>({});
  const [askedAt, setAskedAt] = useState<Record<string, string>>({});
  const [recStart, setRecStart] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [carnet, setCarnet] = useState<{ tag: "CLIP" | "NOTE"; time: string; text: string }[]>([]);
  const [chat, setChat] = useState<{ who: string; time: string; text: string }[]>([]);
  const [carnetOpen, setCarnetOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS) ?? "{}") as Persisted;
      setChecked(saved.checked ?? {});
      setAsked(saved.asked ?? {});
      setAskedAt(saved.askedAt ?? {});
      setRecStart(saved.recStart ?? null);
      setCarnet(saved.carnet ?? []);
      setChat(saved.chat ?? []);
    } catch { /* état neuf */ }
    loaded.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [LS]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(LS, JSON.stringify({ checked, asked, askedAt, recStart, carnet, chat } satisfies Persisted));
    } catch { /* stockage plein ou privé */ }
  }, [LS, checked, asked, askedAt, recStart, carnet, chat]);

  const elapsed = recStart ? Math.max(0, Math.floor((now - recStart) / 1000)) : 0;
  const recStarted = !!recStart;
  const elapsedMin = elapsed / 60;

  const doneCount = data.checklist.filter((_, i) => checked[i]).length;
  const checklistComplete = doneCount === data.checklist.length;

  const blocs = data.blocs;
  let currentBloc = -1;
  if (recStarted && blocs.length) {
    currentBloc = blocs.findIndex((b) => elapsedMin >= b.debut_min && elapsedMin < b.fin_min);
    if (currentBloc === -1 && elapsedMin >= (blocs[blocs.length - 1]?.fin_min ?? 0)) currentBloc = blocs.length - 1;
  }
  const questionsOf = (i: number) =>
    data.questions.filter((q) => (blocs[q.bloc] ? q.bloc : blocs.length - 1) === i);
  const askedTotal = data.questions.filter((q) => asked[q.num]).length;

  const nowTime = () => {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  const stamp = () => (recStarted ? fmt(elapsed) : nowTime());

  const toggleQuestion = (num: string) => {
    const next = !asked[num];
    setAsked((a) => ({ ...a, [num]: next }));
    setAskedAt((a) => ({ ...a, [num]: next ? fmt(elapsed) : "" }));
  };
  const goBloc = useCallback((i: number) => {
    const el = document.getElementById(`bloc-${i}`);
    if (el) {
      const y = el.getBoundingClientRect().top + window.pageYOffset - 108;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  }, []);
  const addNote = () => {
    const t = noteDraft.trim();
    if (!t) return;
    setCarnet((c) => [...c, { tag: "NOTE", time: stamp(), text: t }]);
    setNoteDraft("");
  };
  const sendChat = () => {
    const t = chatDraft.trim();
    if (!t) return;
    setChat((c) => [...c, { who: "me", time: nowTime(), text: t }]);
    setChatDraft("");
  };
  const markClip = () => {
    setCarnet((c) => [...c, { tag: "CLIP", time: stamp(), text: "Moment fort marqué" }]);
    setCarnetOpen(true);
    setChatOpen(false);
  };

  const numero = data.entete.numero ? `GDIY #${data.entete.numero}` : "GDIY";
  const v = data.visuels;
  const echecs = data.generation.filter((g) => g.statut === "failed");
  const enCours = data.generation.filter((g) => g.statut === "pending" || g.statut === "running");

  /* ─────────────── registre de rendu des sections (ordre par fiche) ─────────────── */

  const renderSection = (id: string): React.ReactNode => {
    switch (id) {
      case "enjeu":
        return data.enjeu || data.lecon ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>L&apos;enjeu</h2>
            {data.enjeu && <p style={{ ...proseStyle, margin: "14px 0 0 0" }}>{data.enjeu}</p>}
            {data.lecon && (
              <div style={{ marginTop: 16, borderLeft: "3px solid #000", paddingLeft: 14 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", fontWeight: 700 }}>LEÇON TRANSFÉRABLE</span>
                <p style={{ fontSize: 16, lineHeight: 1.55, margin: "6px 0 0 0", fontWeight: 600 }}>{data.lecon}</p>
              </div>
            )}
          </section>
        ) : null;

      case "recit_canonique":
        return data.recit.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Récit canonique</h2>
            {data.recit.map((p, i) => (
              <p key={i} style={{ ...proseStyle, margin: i === 0 ? "14px 0 0 0" : "14px 0 0 0" }}>{p}</p>
            ))}
          </section>
        ) : null;

      case "mecanique_succes": {
        const m = data.mecanique;
        if (!m) return null;
        return (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Mécanique du succès</h2>
            {m.definition && <p style={{ ...proseStyle, fontWeight: 600, margin: "14px 0 0 0" }}>{m.definition}</p>}
            {m.pairs.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", color: "#6B6B65" }}>PAIRS ET CONCURRENTS</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginTop: 10 }}>
                  {m.pairs.map((p, i) => (
                    <div key={i} style={{ border: "1px solid #000", padding: "12px 14px" }}>
                      <div style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 22, textTransform: "uppercase", lineHeight: 1 }}>{p.nom}</div>
                      {p.position && <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 6 }}>{p.position}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {m.divergences.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", color: "#6B6B65" }}>POINTS DE DIVERGENCE</div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
                  {m.divergences.map((d, i) => (
                    <div key={i} style={{ display: "flex", gap: 16, padding: "12px 0", borderBottom: "1px solid #D9D9D4", alignItems: "baseline" }}>
                      <span style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: 30, lineHeight: 1, flexShrink: 0, minWidth: 56 }}>{d.date}</span>
                      <div>
                        <span style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600 }}>{d.decision}</span>
                        {d.effet && <span style={{ fontSize: 14, lineHeight: 1.5, color: "#464641" }}> — {d.effet}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {m.contrefactuel && (
              <div style={{ marginTop: 18, borderLeft: "3px solid #000", paddingLeft: 14 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", fontWeight: 700 }}>CONTREFACTUEL · RAISONNEMENT, PAS UN FAIT</span>
                <p style={{ fontSize: 15, lineHeight: 1.55, margin: "6px 0 0 0", color: "#464641" }}>{m.contrefactuel}</p>
              </div>
            )}
          </section>
        );
      }

      case "univers": {
        const hasVisuels = !!(v.barres || v.comparaison || v.rentabilite || v.timeline);
        if (!data.univers_intro.length && !hasVisuels && !data.distinctions.length) return null;
        return (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Univers / marché</h2>
            {data.univers_intro.map((p, i) => (
              <p key={i} style={{ ...proseStyle, margin: "14px 0 0 0" }}>{p}</p>
            ))}
            {data.distinctions.length > 0 && (
              <div style={{ marginTop: 18, border: "1px solid #000", padding: "12px 16px" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", fontWeight: 700 }}>DISTINCTIONS À TENIR AU MICRO</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {data.distinctions.map((d, i) => (
                    <span key={i} style={{ fontSize: 15, lineHeight: 1.5 }}>{d}</span>
                  ))}
                </div>
              </div>
            )}
            {v.barres && v.barres.valeurs.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <h3 style={h3Style}>{v.barres.titre}</h3>
                  {v.barres.source && <span style={monoSrc}>SOURCE : {v.barres.source.toUpperCase()}</span>}
                </div>
                {v.barres.note && <p style={{ fontSize: 14, color: "#6B6B65", margin: "8px 0 0 0", maxWidth: 520 }}>{v.barres.note}</p>}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 180, marginTop: 16, borderBottom: "2px solid #000", padding: "0 4px" }}>
                  {(() => {
                    const max = Math.max(...v.barres!.valeurs.map((b) => b.valeur), 1);
                    return v.barres!.valeurs.map((b, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6, height: "100%" }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{b.affiche}</span>
                        <div style={{ width: "100%", background: b.plein ? "#000" : "#8F8F88", height: `${Math.round((b.valeur / max) * 100)}%` }} />
                      </div>
                    ));
                  })()}
                </div>
                <div style={{ display: "flex", gap: 6, padding: "6px 4px 0 4px" }}>
                  {v.barres.valeurs.map((b, i) => (
                    <span key={i} style={{ flex: 1, textAlign: "center", fontFamily: MONO, fontSize: 10, color: "#6B6B65" }}>{b.label}</span>
                  ))}
                </div>
              </div>
            )}
            {v.comparaison && v.comparaison.valeurs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 32 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <h3 style={h3Style}>{v.comparaison.titre ?? "Croissance comparée"}</h3>
                  {v.comparaison.source && <span style={monoSrc}>{v.comparaison.source.toUpperCase()}</span>}
                </div>
                {v.comparaison.valeurs.map((g, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 64px", gap: 12, alignItems: "center" }}>
                    <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 20, textTransform: "uppercase", lineHeight: 1 }}>{g.nom}</span>
                    <div style={{ height: 22, background: "#ECECE8", position: "relative" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(2, Math.min(100, Math.round(Math.abs(g.pct) / 1.4)))}%`, background: g.hero ? "#000" : "#BFBFB9" }} />
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, textAlign: "right" }}>{g.affiche}</span>
                  </div>
                ))}
              </div>
            )}
            {v.rentabilite && v.rentabilite.valeurs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 32 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <h3 style={h3Style}>{v.rentabilite.titre ?? "Rentabilité"}</h3>
                  {v.rentabilite.source && <span style={monoSrc}>SOURCE : {v.rentabilite.source.toUpperCase()}</span>}
                </div>
                {v.rentabilite.note && <p style={{ fontSize: 14, color: "#6B6B65", margin: 0, maxWidth: 620 }}>{v.rentabilite.note}</p>}
                {v.rentabilite.valeurs.map((m, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "48px 1fr 56px", gap: 12, alignItems: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{m.label}</span>
                    <div style={{ height: 26, background: "#ECECE8", position: "relative" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(0, Math.min(100, m.pct))}%`, background: "#000" }} />
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, textAlign: "right" }}>{m.affiche}</span>
                  </div>
                ))}
              </div>
            )}
            {v.timeline && v.timeline.jalons.length > 0 && (
              <div style={{ marginTop: 36 }}>
                <h3 style={h3Style}>{v.timeline.titre}</h3>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
                  {v.timeline.jalons.map((tl, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 20px 1fr", gap: 0 }}>
                      <span style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: 34, lineHeight: 1, textAlign: "right", paddingRight: 14 }}>{tl.annee}</span>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span style={{ width: 11, height: 11, background: tl.cle ? "#000" : "#FFF", border: "1px solid #000", flexShrink: 0, marginTop: 6 }} />
                        <span style={{ width: 1, flex: 1, background: "#000" }} />
                      </div>
                      <div style={{ padding: "0 0 24px 14px", display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 22, textTransform: "uppercase", lineHeight: 1 }}>{tl.titre}</span>
                        {tl.texte && <span style={{ fontSize: 14, lineHeight: 1.5, color: "#464641" }}>{tl.texte}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      }

      case "personnel": {
        const p = data.personnel;
        if (!p) return null;
        return (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Personnel</h2>
            <div style={{ marginTop: 14, borderLeft: "3px solid #F4C435", padding: "10px 14px", background: "#F6F4EF" }}>
              <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", fontWeight: 700 }}>USAGE</span>
              <p style={{ fontSize: 14, lineHeight: 1.5, margin: "6px 0 0 0" }}>{p.bandeau}</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
              {p.items.map((it, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "13px 4px", borderBottom: "1px solid #D9D9D4" }}>
                  <span style={{ fontSize: 15, lineHeight: 1.55 }}>{it.texte}</span>
                  <span style={monoSrc}>{it.source}</span>
                </div>
              ))}
            </div>
          </section>
        );
      }

      case "a_lire": {
        if (!data.a_lire.length) return null;
        const groupes: ("indispensable" | "utile" | "optionnel")[] = ["indispensable", "utile", "optionnel"];
        const sans = data.a_lire.filter((l) => !l.niveau);
        return (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>À lire</h2>
            {[...groupes.map((n) => ({ label: NIVEAUX[n], items: data.a_lire.filter((l) => l.niveau === n) })), { label: "", items: sans }]
              .filter((g) => g.items.length)
              .map((g, gi) => (
                <div key={gi} style={{ marginTop: gi === 0 ? 14 : 20 }}>
                  {g.label && <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", fontWeight: 700 }}>{g.label}</div>}
                  <div style={{ display: "flex", flexDirection: "column", marginTop: 6, borderTop: "1px solid #000" }}>
                    {g.items.map((s, i) => {
                      const inner = (
                        <>
                          {s.date && <span style={{ fontFamily: MONO, fontSize: 12, color: "#6B6B65", flexShrink: 0 }}>{s.date}</span>}
                          <span style={{ fontSize: 15, fontWeight: 600, textDecoration: s.url ? "underline" : "none", textUnderlineOffset: 3 }}>{s.titre}</span>
                          {s.temps_lecture && <span style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65" }}>{s.temps_lecture.toUpperCase()}</span>}
                          {s.apport && <span style={{ fontSize: 13, color: "#6B6B65" }}>{s.apport}</span>}
                        </>
                      );
                      const style: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 14, padding: "14px 4px", borderBottom: "1px solid #D9D9D4", textDecoration: "none", flexWrap: "wrap" };
                      return s.url ? (
                        <a key={i} href={s.url} target="_blank" rel="noreferrer" style={style}>{inner}</a>
                      ) : (
                        <div key={i} style={style}>{inner}</div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </section>
        );
      }

      case "trente_secondes":
        return data.trente_secondes.length ? (
          <section key={id} style={{ marginTop: 52, background: "#000", color: "#FFF", padding: "24px 24px 28px 24px" }}>
            <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", color: "#8F8F88" }}>30 SECONDES AVANT D&apos;ENTRER</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20, marginTop: 16 }}>
              {data.trente_secondes.map((t, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontFamily: T_COND, fontWeight: 600, fontSize: 24, textTransform: "uppercase", lineHeight: 1 }}>{t.label}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.5, color: "#D9D9D4" }}>{t.texte}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "chiffres":
        return data.kpis.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>En chiffres</h2>
            <p style={{ fontSize: 14, color: "#6B6B65", margin: "8px 0 0 0", maxWidth: 620 }}>Données vérifiées et datées, mélange invité + univers, chaque carte porte sa source.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 1, background: "#000", border: "1px solid #000", marginTop: 14 }}>
              {data.kpis.map((k, i) => (
                <div key={i} style={{ background: "#FFF", padding: "16px 16px 14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: 52, lineHeight: 0.9 }}>{k.valeur}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{k.libelle}</span>
                  {k.source && <span style={{ ...monoSrc, marginTop: 4 }}>{k.source}</span>}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "parcours":
        return data.parcours.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Parcours</h2>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
              {data.parcours.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 16, padding: "10px 0", borderBottom: "1px solid #ECECE8", alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, flexShrink: 0, width: 44 }}>{p.annee}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5 }}>{p.texte}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "playbook":
        return data.playbook.items.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Playbook à extraire</h2>
            {data.playbook.intro && <p style={{ fontSize: 14, color: "#6B6B65", margin: "8px 0 0 0", maxWidth: 620 }}>{data.playbook.intro}</p>}
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14, borderTop: "1px solid #000" }}>
              {data.playbook.items.map((pb, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 12, padding: "18px 0", borderBottom: "1px solid #D9D9D4" }}>
                  <span style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: 44, lineHeight: 0.9, color: "#BFBFB9" }}>{pad2(i + 1)}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 26, textTransform: "uppercase", lineHeight: 1 }}>{pb.titre}</span>
                    {pb.connu && <span style={{ fontSize: 14, lineHeight: 1.5 }}><strong>Connu :</strong> {pb.connu}</span>}
                    {pb.manque && <span style={{ fontSize: 14, lineHeight: 1.5, color: "#464641" }}><strong>Manque :</strong> {pb.manque}</span>}
                    {pb.question && <span style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600, borderLeft: "2px solid #000", paddingLeft: 12 }}>{pb.question}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "entourage":
        return data.entourage.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Entourage</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginTop: 14 }}>
              {data.entourage.map((e, i) => (
                <div key={i} style={{ border: "1px solid #000", padding: "14px 16px" }}>
                  <div style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 22, textTransform: "uppercase", lineHeight: 1 }}>{e.nom}</div>
                  {e.role && <div style={{ ...monoSrc, marginTop: 4 }}>{e.role.toUpperCase()}</div>}
                  {e.texte && <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 8 }}>{e.texte}</div>}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "anecdotes":
        return data.anecdotes.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Anecdotes</h2>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14, borderTop: "1px solid #000" }}>
              {data.anecdotes.map((a, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "13px 4px", borderBottom: "1px solid #D9D9D4", ...(a.cachee ? { background: "#F6F4EF", borderLeft: "3px solid #F4C435", paddingLeft: 12 } : {}) }}>
                  {a.cachee && <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", fontWeight: 700 }}>BONUS · BIEN CACHÉE</span>}
                  <span style={{ fontSize: 15, lineHeight: 1.5 }}>{a.texte}</span>
                  {a.source && <span style={monoSrc}>{a.source}</span>}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "tensions":
        return data.tensions.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Tensions</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, marginTop: 14 }}>
              {data.tensions.map((tn, i) => (
                <div key={i} style={{ border: "1px solid #000", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#6B6B65" }}>TENSION {pad2(i + 1)}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600 }}>{tn.a}</span>
                  <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>VS</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600 }}>{tn.b}</span>
                  {tn.angle && <span style={{ fontSize: 13, lineHeight: 1.5, color: "#464641", borderTop: "1px solid #D9D9D4", paddingTop: 10 }}>{tn.angle}</span>}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "questions_recurrentes":
        return data.recurrentes.items.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Déjà répondu partout</h2>
            <p style={{ fontSize: 14, color: "#6B6B65", margin: "8px 0 0 0" }}>{data.recurrentes.intro ?? "Interdiction de les reposer telles quelles. Matériau pour les dépasser."}</p>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14, borderTop: "1px solid #000" }}>
              {data.recurrentes.items.map((r, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "13px 4px", borderBottom: "1px solid #D9D9D4" }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{r.question}</span>
                  {r.reponse && <span style={{ fontSize: 13, color: "#6B6B65" }}>Réponse rodée : {r.reponse}</span>}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "questions_reseaux":
        return data.reseaux.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Questions clips</h2>
            <p style={{ fontSize: 14, color: "#6B6B65", margin: "8px 0 0 0", maxWidth: 620 }}>À dégainer sur un moment de mou ou pour relancer : la réponse courte fait le short. Proposées par Vadim, à challenger.</p>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14, borderTop: "1px solid #000" }}>
              {data.reseaux.map((rs, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "13px 4px", borderBottom: "1px solid #D9D9D4" }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{rs.question}</span>
                  {rs.meta && <span style={monoSrc}>{rs.meta}</span>}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "sequencage":
        // Le déroulé rend séquençage + questions ensemble (dix_questions sauté).
        return blocs.length ? (
          <div key={id}>
            <section style={sectionStyle}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <h2 style={h2Style}>Le déroulé, 2h30</h2>
                <span style={{ fontFamily: MONO, fontSize: 12, color: "#6B6B65" }}>{askedTotal} / {data.questions.length} POSÉES</span>
              </div>
              <p style={{ fontSize: 14, color: "#6B6B65", margin: "8px 0 0 0", maxWidth: 620 }}>Proposition de séquençage, les questions à leur place. Tape une question quand elle est posée : elle se raye avec le timecode.</p>
            </section>
            {blocs.map((b, i) => {
              const isCur = i === currentBloc;
              const qs = questionsOf(i);
              return (
                <section key={i} id={`bloc-${i}`} style={{ marginTop: 36 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14, borderBottom: "2px solid #000", paddingBottom: 8, flexWrap: "wrap", background: isCur ? "#F4C435" : "transparent" }}>
                    <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: isCur ? "#B5790A" : "#6B6B65" }}>{rangeLabel(b)}</span>
                    <h2 style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 34, lineHeight: 0.95, textTransform: "uppercase", margin: 0 }}>{b.titre}</h2>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                    {b.mode && <span style={{ fontFamily: MONO, fontSize: 12, color: "#6B6B65", letterSpacing: "0.06em" }}>{b.mode}</span>}
                    {b.intention && <span style={{ fontSize: 13, color: "#464641", maxWidth: 480 }}>{b.intention}</span>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                    {qs.map((q) => {
                      const isAsked = !!asked[q.num];
                      return (
                        <div key={q.num} onClick={() => toggleQuestion(q.num)} style={{ cursor: "pointer", border: "1px solid #000", padding: "16px 18px", display: "flex", gap: 14, alignItems: "flex-start", opacity: isAsked ? 0.45 : 1, background: isAsked ? "#F7F7F5" : "#FFF" }}>
                          <span style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: 40, lineHeight: 0.85, color: "#BFBFB9", flexShrink: 0, minWidth: 34 }}>{q.num}</span>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                            <span style={{ fontSize: 18, lineHeight: 1.35, fontWeight: 600, textDecoration: isAsked ? "line-through" : "none" }}>{q.texte}</span>
                            {q.note && <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: "#6B6B65" }}>{q.note}</span>}
                            {isAsked && <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#2FA46A", fontWeight: 700 }}>POSÉE · {askedAt[q.num]}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {b.rappel && (
                    <div style={{ marginTop: 12, borderLeft: "3px solid #F4C435", padding: "10px 14px", background: "#F6F4EF" }}>
                      {b.rappel_label && <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", fontWeight: 700 }}>{b.rappel_label}</span>}
                      <p style={{ fontSize: 15, lineHeight: 1.5, margin: "6px 0 0 0", color: "#1B1D1E" }}>{b.rappel}</p>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : null;

      case "dix_questions":
        // Rendues dans le déroulé (sequencage) ; en secours si aucun séquençage.
        return !blocs.length && data.questions.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Les {data.questions.length} questions</h2>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
              {data.questions.map((q) => (
                <div key={q.num} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 14, padding: "18px 0", borderBottom: "1px solid #D9D9D4" }}>
                  <span style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: 52, lineHeight: 0.85, color: "#BFBFB9" }}>{q.num}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontSize: 18, lineHeight: 1.4, fontWeight: 600 }}>{q.texte}</span>
                    {q.note && <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: "#464641" }}>{q.note}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "zone_grise":
        return data.zone_grise.length ? (
          <section key={id} style={{ marginTop: 52, background: "#EFE9DC", border: "1px solid #000", padding: "20px 22px" }}>
            <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", fontWeight: 700 }}>ZONE GRISE : À FAIRE DIRE PAR L&apos;INVITÉ</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {data.zone_grise.map((z, i) => (
                <div key={i} style={{ fontSize: 15, lineHeight: 1.5, borderLeft: "2px solid #000", paddingLeft: 12 }}>
                  {z.texte} {z.origine && <span style={monoSrc}>({z.origine})</span>}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "sources":
        return data.sources.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Sources</h2>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
              {data.sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 14, alignItems: "baseline", padding: "10px 0", borderBottom: "1px solid #ECECE8", textDecoration: "none", flexWrap: "wrap" }}>
                  {s.date && <span style={{ fontFamily: MONO, fontSize: 12, color: "#6B6B65", flexShrink: 0 }}>{s.date}</span>}
                  <span style={{ fontSize: 14, textDecoration: "underline", textUnderlineOffset: 3 }}>{s.titre}</span>
                  {s.apport && <span style={{ fontSize: 13, color: "#6B6B65" }}>{s.apport}</span>}
                </a>
              ))}
            </div>
          </section>
        ) : null;

      default:
        return null;
    }
  };

  // Ordre par fiche : le bloc d'appartenance vient du catalogue, l'ordre interne
  // de la fiche (colonne position). Défaut au catalogue.
  const ordreA = data.ordre.filter((idSec) => BLOC_OF.get(idSec) === "A");
  const ordreB = data.ordre.filter((idSec) => BLOC_OF.get(idSec) === "B");

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 120, background: "#FFF" }}>
      {/* Header sticky : nom + numéro, REC ou chrono. */}
      <header style={{ position: "sticky", top: 0, zIndex: 60, background: "#000", color: "#FFF", display: "flex", alignItems: "stretch", height: 52 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "0 16px", alignSelf: "center", minWidth: 0, flex: 1 }}>
          <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 26, letterSpacing: "0.01em", whiteSpace: "nowrap", textTransform: "uppercase" }}>{data.invite_nom}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#8F8F88", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {data.entete.societe ? `${data.entete.societe} · ${numero}` : numero}
          </span>
        </div>
        <a href="#console" style={{ display: "flex", alignItems: "center", padding: "0 14px", borderLeft: "1px solid #2B2B27", fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#8F8F88", textDecoration: "none" }}>CONSOLE »</a>
        {recStarted ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", borderLeft: "1px solid #2B2B27" }}>
            <span style={{ width: 8, height: 8, background: "#E63946", borderRadius: 999, animation: "gdiy-recpulse 1.6s ease-in-out infinite" }} />
            <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, letterSpacing: "0.04em" }}>{fmt(elapsed)}</span>
          </div>
        ) : (
          <button
            onClick={() => { if (checklistComplete) setRecStart(Date.now()); }}
            disabled={!checklistComplete}
            style={{ border: "none", borderLeft: "1px solid #2B2B27", cursor: checklistComplete ? "pointer" : "not-allowed", background: checklistComplete ? "#E63946" : "#171715", color: checklistComplete ? "#FFF" : "#6B6B65", padding: "0 18px", display: "flex", alignItems: "center", gap: 8, fontFamily: T_COND, fontWeight: 700, fontSize: 22, letterSpacing: "0.04em" }}
          >
            {checklistComplete ? "REC »" : `REC · ${doneCount}/${data.checklist.length}`}
          </button>
        )}
      </header>

      {/* Nav de blocs sticky (déroulé). */}
      {blocs.length > 0 && (
        <nav style={{ position: "sticky", top: 52, zIndex: 50, background: "#000", borderBottom: "1px solid #2B2B27", display: "flex", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {blocs.map((b, i) => {
            const isCur = i === currentBloc;
            return (
              <button key={i} onClick={() => goBloc(i)} style={{ flexShrink: 0, border: "none", borderRight: "1px solid #2B2B27", cursor: "pointer", padding: "9px 16px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, background: isCur ? "#FFF" : "#000", color: isCur ? "#000" : "#FFF", minHeight: 44, boxSizing: "border-box" }}>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", opacity: 0.7 }}>{rangeLabel(b).split(" ")[0]}</span>
                <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 19, lineHeight: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>{b.court}</span>
              </button>
            );
          })}
        </nav>
      )}

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "0 20px" }}>
        {/* Gate anti fiche vide (chantier 2 §3.1) : une section obligatoire vide
            rend la fiche non présentable, l'état est dit franchement, avec la cause. */}
        {data.incompletes.length > 0 && (
          <div style={{ marginTop: 16, background: "#E63946", color: "#FFF", padding: "18px 20px" }}>
            <div style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 38, lineHeight: 0.95, textTransform: "uppercase" }}>Fiche incomplète · non présentable</div>
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: "10px 0 0 0" }}>
              Section(s) obligatoire(s) vide(s) : <b>{data.incompletes.map((id) => TITRE_OF.get(id) ?? id).join(", ")}</b>.
            </p>
            <p style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.5, margin: "8px 0 0 0", opacity: 0.9 }}>
              {enCours.length > 0
                ? `Cause : génération en cours (${enCours.map((g) => g.groupe).join(", ")}). Recharger la page fait avancer.`
                : echecs.length > 0
                  ? `Cause : génération en échec (${echecs.map((g) => g.groupe).join(", ")})${echecs[0].error ? ` : ${echecs[0].error}` : ""}.`
                  : "Cause : génération non lancée ou incomplète. Dans Claude : « regénère la fiche »."}
            </p>
          </div>
        )}
        {/* Alerte génération (contrat §3.6) : un groupe en échec reste visible. */}
        {echecs.length > 0 && (
          <div style={{ marginTop: 16, borderLeft: "3px solid #F4C435", padding: "10px 14px", background: "#F6F4EF" }}>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", fontWeight: 700 }}>GÉNÉRATION EN ÉCHEC : {echecs.map((g) => g.groupe.toUpperCase()).join(" · ")}</span>
            <p style={{ fontSize: 14, lineHeight: 1.5, margin: "6px 0 0 0" }}>Relancer via Claude : « regénère le groupe {echecs[0].groupe} de la fiche {data.invite_nom} ».</p>
          </div>
        )}
        {echecs.length === 0 && enCours.length > 0 && (
          <div style={{ marginTop: 16, border: "1px solid #000", padding: "10px 14px" }}>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em" }}>GÉNÉRATION EN COURS : {enCours.map((g) => g.groupe.toUpperCase()).join(" · ")} — recharger la page fait avancer.</span>
          </div>
        )}

        {/* Entête */}
        <section style={{ paddingTop: 36 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", color: "#6B6B65", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>FICHE DE PRÉPARATION · {numero}</span>
            <span>STATUT : {data.statut.toUpperCase()} · V{data.version}</span>
          </div>
          <h1 style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: "clamp(88px, 16vw, 180px)", lineHeight: 0.85, letterSpacing: "-0.01em", textTransform: "uppercase", margin: "18px 0 0 0" }}>
            {data.entete.titre_lignes.map((l, i) => (
              <span key={i}>{i > 0 && <br />}{l}</span>
            ))}
          </h1>
          {data.entete.sous_titre && (
            <p style={{ fontSize: 20, lineHeight: 1.45, maxWidth: 620, margin: "22px 0 0 0" }}>{data.entete.sous_titre}</p>
          )}
          {(data.entete.pilules.length > 0 || data.entete.liens.length > 0) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 20 }}>
              {data.entete.pilules.map((p, i) => (
                <span key={i} style={{ border: "1px solid #000", padding: "7px 14px", fontFamily: MONO, fontSize: 12, letterSpacing: "0.08em" }}>{p}</span>
              ))}
              {data.entete.liens.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ border: "1px solid #000", background: "#000", color: "#FFF", padding: "7px 14px", fontFamily: MONO, fontSize: 12, letterSpacing: "0.08em", textDecoration: "none" }}>{l.label.toUpperCase()} »</a>
              ))}
            </div>
          )}
        </section>

        {/* Checklist pré-rec */}
        <section style={sectionStyle}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h2 style={h2Style}>Checklist pré-rec</h2>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#6B6B65" }}>{doneCount} / {data.checklist.length}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", columnGap: 24, marginTop: 14, borderTop: "1px solid #000" }}>
            {data.checklist.map((label, i) => {
              const done = !!checked[i];
              return (
                <label key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 4px", borderBottom: "1px solid #D9D9D4", cursor: "pointer", minHeight: 44, boxSizing: "border-box" }}>
                  <input type="checkbox" checked={done} onChange={() => setChecked((cc) => ({ ...cc, [i]: !done }))} style={{ width: 20, height: 20, margin: 0, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, textDecoration: done ? "line-through" : "none", color: done ? "#8F8F88" : "#0A0A0A" }}>{label}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* ── BLOC A : comprendre (mode lecture) ── */}
        {ordreA.map(renderSection)}

        {/* ── Séparation nette : la console commence ici ── */}
        <div id="console" style={{ marginTop: 64, background: "#000", color: "#FFF", padding: "14px 20px", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 30, lineHeight: 1, textTransform: "uppercase" }}>Console d&apos;épisode</span>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#8F8F88" }}>À SCANNER PENDANT L&apos;ENREGISTREMENT</span>
        </div>

        {/* ── BLOC B : console ── */}
        {ordreB.map(renderSection)}

        {/* Fin d'épisode : livraison des moments forts (clips en tête), régie en appendice. */}
        {carnet.length > 0 && (
          <section style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 34, lineHeight: 0.95, textTransform: "uppercase", margin: 0 }}>Fin d&apos;épisode : moments forts</h2>
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65", letterSpacing: "0.1em" }}>{carnet.filter((x) => x.tag === "CLIP").length} CLIP(S) · {carnet.filter((x) => x.tag === "NOTE").length} NOTE(S)</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
              {[...carnet].sort((a, b) => (a.tag === b.tag ? 0 : a.tag === "CLIP" ? -1 : 1)).map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "10px 0", borderBottom: "1px solid #D9D9D4" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: item.tag === "CLIP" ? "#E63946" : "#000", flexShrink: 0 }}>{item.tag} {item.time}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5 }}>{item.text}</span>
                </div>
              ))}
            </div>
            {chat.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", color: "#6B6B65" }}>RÉGIE PENDANT LE REC</div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
                  {chat.map((m, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid #ECECE8" }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65", flexShrink: 0 }}>{(m.who === "me" ? "MATTHIEU" : m.who.toUpperCase())} · {m.time}</span>
                      <span style={{ fontSize: 14, lineHeight: 1.5, color: "#464641" }}>{m.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Journal de génération (contrat §3.6). */}
        {data.generation.length > 0 && (
          <div style={{ marginTop: 40, fontFamily: MONO, fontSize: 11, lineHeight: 1.8, color: "#8F8F88" }}>
            JOURNAL DE GÉNÉRATION : {data.generation.map((g) => `${g.groupe.toUpperCase()} ${g.statut.toUpperCase()}`).join(" · ")}
          </div>
        )}

        <footer style={{ marginTop: 24, borderTop: "2px solid #000", paddingTop: 18, fontFamily: MONO, fontSize: 12, lineHeight: 1.8, color: "#464641" }}>
          {data.footer}
        </footer>
      </main>

      {/* Drawer carnet */}
      {carnetOpen && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 64, zIndex: 70, display: "flex", justifyContent: "center", padding: "0 12px" }}>
          <div style={{ width: "100%", maxWidth: 680, background: "#FFF", color: "#000", border: "1px solid #000", boxShadow: "0 8px 24px rgba(0,0,0,0.08)", maxHeight: "55vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #000", padding: "6px 8px 6px 16px" }}>
              <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", fontWeight: 700 }}>CARNET</span>
              <button onClick={() => setCarnetOpen(false)} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: MONO, fontSize: 12, letterSpacing: "0.1em", padding: 10 }}>FERMER ×</button>
            </div>
            <div style={{ overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {carnet.length === 0 && (
                <span style={{ fontSize: 14, color: "#6B6B65" }}>Rien pour l&apos;instant. CLIP marque un moment fort avec le timecode, la note capture une idée à la volée.</span>
              )}
              {carnet.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", borderBottom: "1px solid #ECECE8", paddingBottom: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: item.tag === "CLIP" ? "#E63946" : "#000", flexShrink: 0 }}>{item.tag} {item.time}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.5 }}>{item.text}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", borderTop: "1px solid #000" }}>
              <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} placeholder="Note rapide, entrée pour valider" style={{ flex: 1, border: "none", outline: "none", padding: "14px 16px", fontSize: 15, fontFamily: "inherit", background: "#F7F7F5", minWidth: 0 }} />
              <button onClick={addNote} style={{ border: "none", borderLeft: "1px solid #000", background: "#000", color: "#FFF", cursor: "pointer", padding: "0 20px", fontFamily: MONO, fontSize: 12, letterSpacing: "0.1em" }}>NOTER</button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer régie */}
      {chatOpen && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 64, zIndex: 70, display: "flex", justifyContent: "center", padding: "0 12px" }}>
          <div style={{ width: "100%", maxWidth: 680, background: "#FFF", color: "#000", border: "1px solid #000", boxShadow: "0 8px 24px rgba(0,0,0,0.08)", maxHeight: "55vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #000", padding: "6px 8px 6px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", fontWeight: 700 }}>RÉGIE</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 11, color: "#464641" }}>
                  <span style={{ width: 7, height: 7, background: "#8F8F88", borderRadius: 999 }} />NOTES LOCALES, TEMPS RÉEL À VENIR
                </span>
              </div>
              <button onClick={() => setChatOpen(false)} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: MONO, fontSize: 12, letterSpacing: "0.1em", padding: 10 }}>FERMER ×</button>
            </div>
            <div style={{ overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {chat.map((m, i) => {
                const me = m.who === "me";
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: me ? "flex-end" : "flex-start" }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", color: "#8F8F88" }}>{me ? "MATTHIEU" : m.who.toUpperCase()} · {m.time}</span>
                    <span style={{ fontSize: 14, lineHeight: 1.5, background: me ? "#000" : "#ECECE8", color: me ? "#FFF" : "#0A0A0A", padding: "8px 12px", maxWidth: "85%" }}>{m.text}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", borderTop: "1px solid #000" }}>
              <input value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder="Message à la régie" style={{ flex: 1, border: "none", outline: "none", padding: "14px 16px", fontSize: 15, fontFamily: "inherit", background: "#F7F7F5", minWidth: 0 }} />
              <button onClick={sendChat} style={{ border: "none", borderLeft: "1px solid #000", background: "#000", color: "#FFF", cursor: "pointer", padding: "0 20px", fontFamily: MONO, fontSize: 14 }}>»</button>
            </div>
          </div>
        </div>
      )}

      {/* Barre d'actions fixe */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 80, background: "#000", borderTop: "1px solid #000", display: "flex", height: 64 }}>
        <button onClick={markClip} style={{ flex: 1.2, border: "none", cursor: "pointer", background: "#E63946", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: T_COND, fontWeight: 700, fontSize: 26, letterSpacing: "0.04em" }}>
          CLIP <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 400 }}>{carnet.filter((c) => c.tag === "CLIP").length}</span>
        </button>
        <button onClick={() => { setCarnetOpen(!carnetOpen); setChatOpen(false); }} style={{ flex: 1, border: "none", borderLeft: "1px solid #2B2B27", cursor: "pointer", background: carnetOpen ? "#FFF" : "#000", color: carnetOpen ? "#000" : "#FFF", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: T_COND, fontWeight: 700, fontSize: 26, letterSpacing: "0.04em" }}>
          CARNET <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 400 }}>{carnet.length}</span>
        </button>
        <button onClick={() => { setChatOpen(!chatOpen); setCarnetOpen(false); }} style={{ flex: 1, border: "none", borderLeft: "1px solid #2B2B27", cursor: "pointer", background: chatOpen ? "#FFF" : "#000", color: chatOpen ? "#000" : "#FFF", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: T_COND, fontWeight: 700, fontSize: 26, letterSpacing: "0.04em" }}>
          RÉGIE <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 400 }}>{chat.length}</span>
        </button>
      </div>
    </div>
  );
}

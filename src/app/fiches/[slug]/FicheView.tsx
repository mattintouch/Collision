"use client";

// Fiche de préparation GDIY : recréation au pixel du prototype du handoff design
// (docs/design-fiches-gdiy/prototype-xavier-niel.html). Deux modes :
// PRÉPA (colonne blanche, lecture profonde) et LIVE (fond noir anti-reflet,
// chrono, questions à rayer, carnet, régie). État persisté par appareil
// (localStorage, clé gdiy-fiche-{slug}), comme spécifié par le README du handoff.

import { useCallback, useEffect, useRef, useState } from "react";
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

export interface FicheViewData {
  slug: string;
  invite_nom: string;
  statut: string;
  version: number;
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
  sources_rapides: LienDate[];
  trente_secondes: { label: string; texte: string }[];
  presentation: string[];
  anecdotes: { texte: string; source?: string; cachee?: boolean }[];
  kpis: KpiCard[];
  entreprise: {
    barres?: { titre: string; note?: string; source?: string; valeurs: { label: string; affiche: string; valeur: number; plein?: boolean }[] };
    comparaison?: { titre?: string; source?: string; valeurs: { nom: string; affiche: string; pct: number; hero?: boolean }[] };
    rentabilite?: { titre?: string; note?: string; source?: string; valeurs: { label: string; affiche: string; pct: number }[] };
    timeline?: { titre: string; jalons: { annee: string; titre: string; texte?: string; cle?: boolean }[] };
  } | null;
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
const sectionStyle: React.CSSProperties = { marginTop: 56, borderTop: "2px solid #000", paddingTop: 18 };
const monoLabel = (extra?: React.CSSProperties): React.CSSProperties => ({ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", color: "#6B6B65", ...extra });

interface Persisted {
  mode?: "prepa" | "live";
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
  const [mode, setMode] = useState<"prepa" | "live">("prepa");
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
      if (saved.mode === "live" || saved.mode === "prepa") setMode(saved.mode);
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

  // Persistance (tout sauf drafts et drawers), après la première hydratation.
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(LS, JSON.stringify({ mode, checked, asked, askedAt, recStart, carnet, chat } satisfies Persisted));
    } catch { /* stockage plein ou privé */ }
  }, [LS, mode, checked, asked, askedAt, recStart, carnet, chat]);

  const elapsed = recStart ? Math.max(0, Math.floor((now - recStart) / 1000)) : 0;
  const recStarted = !!recStart;
  const elapsedMin = elapsed / 60;

  // Blocs : ceux du séquençage, sinon un bloc implicite portant les questions.
  const blocs: FicheBloc[] = data.blocs.length
    ? data.blocs
    : data.questions.length
      ? [{ debut_min: 0, fin_min: 150, court: "Questions", titre: "Les questions" }]
      : [];
  let currentBloc = -1;
  if (recStarted && blocs.length) {
    currentBloc = blocs.findIndex((b) => elapsedMin >= b.debut_min && elapsedMin < b.fin_min);
    if (currentBloc === -1 && elapsedMin >= (blocs[blocs.length - 1]?.fin_min ?? 0)) currentBloc = blocs.length - 1;
  }
  const questionsOf = (i: number) =>
    data.questions.filter((q) => (blocs[q.bloc] ? q.bloc : blocs.length - 1) === i);

  const askedTotal = data.questions.filter((q) => asked[q.num]).length;
  const doneCount = data.checklist.filter((_, i) => checked[i]).length;
  // Règle Matt : la checklist ENTIÈRE conditionne le lancement du REC.
  const checklistComplete = doneCount === data.checklist.length;

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
      const y = el.getBoundingClientRect().top + window.pageYOffset - 110;
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
  const ent = data.entreprise;

  /* ─────────────────────────── rendu ─────────────────────────── */

  const header = (
    <header style={{ position: "sticky", top: 0, zIndex: 60, background: "#000", color: "#FFF", display: "flex", alignItems: "stretch", height: 52 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "0 16px", alignSelf: "center", minWidth: 0, flex: 1 }}>
        <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 26, letterSpacing: "0.01em", whiteSpace: "nowrap", textTransform: "uppercase" }}>{data.invite_nom}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#8F8F88", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {data.entete.societe ? `${data.entete.societe} · ${numero}` : numero}
        </span>
      </div>
      {recStarted && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px", borderLeft: "1px solid #2B2B27" }}>
          <span style={{ width: 8, height: 8, background: "#E63946", borderRadius: 999, animation: "gdiy-recpulse 1.6s ease-in-out infinite" }} />
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, letterSpacing: "0.04em" }}>{fmt(elapsed)}</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "stretch", borderLeft: "1px solid #2B2B27" }}>
        <button onClick={() => setMode("prepa")} style={{ border: "none", cursor: "pointer", padding: "0 16px", fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", background: mode === "prepa" ? "#FFF" : "#000", color: mode === "prepa" ? "#000" : "#FFF" }}>PRÉPA</button>
        <button onClick={() => setMode("live")} style={{ border: "none", borderLeft: "1px solid #2B2B27", cursor: "pointer", padding: "0 16px", fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", background: mode === "live" ? "#FFF" : "#000", color: mode === "live" ? "#000" : "#FFF" }}>LIVE</button>
      </div>
    </header>
  );

  const checklistRows = (dark: boolean) =>
    data.checklist.map((label, i) => {
      const done = !!checked[i];
      return (
        <label key={i} style={{ display: "flex", alignItems: "center", gap: dark ? 14 : 12, padding: "13px 4px", borderBottom: `1px solid ${dark ? "#2B2B27" : "#D9D9D4"}`, cursor: "pointer", minHeight: 44, boxSizing: "border-box" }}>
          <input type="checkbox" checked={done} onChange={() => setChecked((c) => ({ ...c, [i]: !done }))} style={{ width: dark ? 22 : 20, height: dark ? 22 : 20, margin: 0, flexShrink: 0, ...(dark ? { accentColor: "#FFF" } : {}) }} />
          <span style={{ fontSize: dark ? 17 : 15, textDecoration: done ? "line-through" : "none", color: done ? "#8F8F88" : dark ? "#FFF" : "#0A0A0A" }}>{label}</span>
        </label>
      );
    });

  const prepa = (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "0 20px 96px 20px" }}>
      {/* Entête */}
      <section style={{ paddingTop: 40 }}>
        <div style={{ ...monoLabel(), display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
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
          {checklistRows(false)}
        </div>
      </section>

      {/* Enjeu */}
      {data.enjeu && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>L&apos;enjeu</h2>
          <p style={{ fontSize: 17, lineHeight: 1.55, maxWidth: 680, margin: "14px 0 0 0" }}>{data.enjeu}</p>
        </section>
      )}

      {/* 3 liens utiles */}
      {data.sources_rapides.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>3 liens utiles</h2>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 14, borderTop: "1px solid #000" }}>
            {data.sources_rapides.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "14px 4px", borderBottom: "1px solid #D9D9D4", textDecoration: "none", flexWrap: "wrap" }}>
                {s.date && <span style={{ fontFamily: MONO, fontSize: 12, color: "#6B6B65", flexShrink: 0 }}>{s.date}</span>}
                <span style={{ fontSize: 15, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>{s.titre}</span>
                {s.apport && <span style={{ fontSize: 13, color: "#6B6B65" }}>{s.apport}</span>}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* 30 secondes avant d'entrer (panneau noir) */}
      {data.trente_secondes.length > 0 && (
        <section style={{ marginTop: 56, background: "#000", color: "#FFF", padding: "24px 24px 28px 24px" }}>
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
      )}

      {/* Présentation exhaustive de l'invité */}
      {data.presentation.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>Présentation</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14, maxWidth: 680 }}>
            {data.presentation.map((p, i) => (
              <p key={i} style={{ fontSize: 16, lineHeight: 1.6, margin: 0 }}>{p}</p>
            ))}
          </div>
        </section>
      )}

      {/* Chiffres vérifiés (grille KPI hairline) */}
      {data.kpis.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>Chiffres vérifiés</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 1, background: "#000", border: "1px solid #000", marginTop: 14 }}>
            {data.kpis.map((k, i) => (
              <div key={i} style={{ background: "#FFF", padding: "16px 16px 14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: 52, lineHeight: 0.9 }}>{k.valeur}</span>
                <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{k.libelle}</span>
                {k.source && <span style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65", marginTop: 4 }}>{k.source}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Visualisations adaptatives (entrepreneur / artiste / sportif) */}
      {ent?.barres && ent.barres.valeurs.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>{ent.barres.titre}</h2>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            {ent.barres.note && <p style={{ fontSize: 14, color: "#6B6B65", margin: 0, maxWidth: 520 }}>{ent.barres.note}</p>}
            {ent.barres.source && <span style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65" }}>SOURCE : {ent.barres.source.toUpperCase()}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 200, marginTop: 20, borderBottom: "2px solid #000", padding: "0 4px" }}>
            {(() => {
              const max = Math.max(...ent.barres!.valeurs.map((b) => b.valeur), 1);
              return ent.barres!.valeurs.map((b, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6, height: "100%" }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{b.affiche}</span>
                  <div style={{ width: "100%", background: b.plein ? "#000" : "#8F8F88", height: `${Math.round((b.valeur / max) * 100)}%` }} />
                </div>
              ));
            })()}
          </div>
          <div style={{ display: "flex", gap: 6, padding: "6px 4px 0 4px" }}>
            {ent.barres.valeurs.map((b, i) => (
              <span key={i} style={{ flex: 1, textAlign: "center", fontFamily: MONO, fontSize: 10, color: "#6B6B65" }}>{b.label}</span>
            ))}
          </div>
          {ent.comparaison && ent.comparaison.valeurs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28, borderTop: "1px solid #000", paddingTop: 16 }}>
              {ent.comparaison.titre && <div style={monoLabel()}>{ent.comparaison.titre.toUpperCase()}</div>}
              {ent.comparaison.valeurs.map((g, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 64px", gap: 12, alignItems: "center" }}>
                  <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 20, textTransform: "uppercase", lineHeight: 1 }}>{g.nom}</span>
                  <div style={{ height: 22, background: "#ECECE8", position: "relative" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(2, Math.min(100, Math.round(Math.abs(g.pct) / 1.4)))}%`, background: g.hero ? "#000" : "#BFBFB9" }} />
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, textAlign: "right" }}>{g.affiche}</span>
                </div>
              ))}
              {ent.comparaison.source && <span style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65" }}>SOURCE : {ent.comparaison.source.toUpperCase()}</span>}
            </div>
          )}
        </section>
      )}

      {ent?.rentabilite && ent.rentabilite.valeurs.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>{ent.rentabilite.titre ?? "Rentabilité"}</h2>
          {ent.rentabilite.note && <p style={{ fontSize: 14, color: "#6B6B65", margin: "8px 0 0 0", maxWidth: 620 }}>{ent.rentabilite.note}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {ent.rentabilite.valeurs.map((m, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "48px 1fr 56px", gap: 12, alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{m.label}</span>
                <div style={{ height: 26, background: "#ECECE8", position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(0, Math.min(100, m.pct))}%`, background: "#000" }} />
                </div>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, textAlign: "right" }}>{m.affiche}</span>
              </div>
            ))}
            {ent.rentabilite.source && <span style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65" }}>SOURCE : {ent.rentabilite.source.toUpperCase()}</span>}
          </div>
        </section>
      )}

      {ent?.timeline && ent.timeline.jalons.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>{ent.timeline.titre}</h2>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
            {ent.timeline.jalons.map((tl, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 20px 1fr", gap: 0 }}>
                <span style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: 34, lineHeight: 1, textAlign: "right", paddingRight: 14 }}>{tl.annee}</span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: 11, height: 11, background: tl.cle ? "#000" : "#FFF", border: "1px solid #000", flexShrink: 0, marginTop: 6 }} />
                  <span style={{ width: 1, flex: 1, background: "#000" }} />
                </div>
                <div style={{ padding: "0 0 26px 14px", display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 22, textTransform: "uppercase", lineHeight: 1 }}>{tl.titre}</span>
                  {tl.texte && <span style={{ fontSize: 14, lineHeight: 1.5, color: "#464641" }}>{tl.texte}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Parcours */}
      {data.parcours.length > 0 && (
        <section style={sectionStyle}>
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
      )}

      {/* Playbook */}
      {data.playbook.items.length > 0 && (
        <section style={sectionStyle}>
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
      )}

      {/* Entourage */}
      {data.entourage.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>Entourage</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginTop: 14 }}>
            {data.entourage.map((e, i) => (
              <div key={i} style={{ border: "1px solid #000", padding: "14px 16px" }}>
                <div style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 22, textTransform: "uppercase", lineHeight: 1 }}>{e.nom}</div>
                {e.role && <div style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65", marginTop: 4 }}>{e.role.toUpperCase()}</div>}
                {e.texte && <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 8 }}>{e.texte}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Anecdotes (les bien cachées mises en avant) */}
      {data.anecdotes.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>Anecdotes</h2>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 14, borderTop: "1px solid #000" }}>
            {data.anecdotes.map((a, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "13px 4px", borderBottom: "1px solid #D9D9D4", ...(a.cachee ? { background: "#F6F4EF", borderLeft: "3px solid #F4C435", paddingLeft: 12 } : {}) }}>
                {a.cachee && <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", fontWeight: 700 }}>BONUS · BIEN CACHÉE</span>}
                <span style={{ fontSize: 15, lineHeight: 1.5 }}>{a.texte}</span>
                {a.source && <span style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65" }}>{a.source}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tensions */}
      {data.tensions.length > 0 && (
        <section style={sectionStyle}>
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
      )}

      {/* Questions récurrentes */}
      {data.recurrentes.items.length > 0 && (
        <section style={sectionStyle}>
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
      )}

      {/* Questions clips */}
      {data.reseaux.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>Questions clips</h2>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 14, borderTop: "1px solid #000" }}>
            {data.reseaux.map((rs, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "13px 4px", borderBottom: "1px solid #D9D9D4" }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{rs.question}</span>
                {rs.meta && <span style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65" }}>{rs.meta}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Séquençage */}
      {data.blocs.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>Séquençage 2h30</h2>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 14, borderTop: "1px solid #000" }}>
            {data.blocs.map((b, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 14, padding: "14px 4px", borderBottom: "1px solid #D9D9D4", alignItems: "baseline" }}>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>{rangeLabel(b)}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 24, textTransform: "uppercase", lineHeight: 1 }}>{b.titre}</span>
                  {b.intention && <span style={{ fontSize: 14, color: "#464641", lineHeight: 1.5 }}>{b.intention}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Les 10 questions */}
      {data.questions.length > 0 && (
        <section style={sectionStyle}>
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
      )}

      {/* Zone grise (bandeau crème) */}
      {data.zone_grise.length > 0 && (
        <section style={{ marginTop: 56, background: "#EFE9DC", border: "1px solid #000", padding: "20px 22px" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", fontWeight: 700 }}>ZONE GRISE : À FAIRE DIRE PAR L&apos;INVITÉ</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {data.zone_grise.map((z, i) => (
              <div key={i} style={{ fontSize: 15, lineHeight: 1.5, borderLeft: "2px solid #000", paddingLeft: 12 }}>
                {z.texte} {z.origine && <span style={{ fontFamily: MONO, fontSize: 11, color: "#6B6B65" }}>({z.origine})</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sources */}
      {data.sources.length > 0 && (
        <section style={sectionStyle}>
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
      )}

      <footer style={{ marginTop: 64, borderTop: "2px solid #000", paddingTop: 18, fontFamily: MONO, fontSize: 12, lineHeight: 1.8, color: "#464641" }}>
        {data.footer}
      </footer>
    </main>
  );

  const live = (
    <main style={{ background: "#000", color: "#FFF", minHeight: "calc(100vh - 52px)" }}>
      {blocs.length > 0 && (
        <nav style={{ position: "sticky", top: 52, zIndex: 50, background: "#000", borderBottom: "1px solid #2B2B27", display: "flex", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {blocs.map((b, i) => {
            const isCur = i === currentBloc;
            return (
              <button key={i} onClick={() => goBloc(i)} style={{ flexShrink: 0, border: "none", borderRight: "1px solid #2B2B27", cursor: "pointer", padding: "10px 18px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, background: isCur ? "#FFF" : "#000", color: isCur ? "#000" : "#FFF", minHeight: 44, boxSizing: "border-box" }}>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", opacity: 0.7, color: isCur ? "#B5790A" : undefined }}>{rangeLabel(b).split(" ")[0]}</span>
                <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 20, lineHeight: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>{b.court}</span>
              </button>
            );
          })}
        </nav>
      )}

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 20px 150px 20px" }}>
        {!recStarted && (
          <section style={{ paddingTop: 28 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", color: "#8F8F88" }}>AVANT D&apos;APPUYER SUR REC</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 10, borderTop: "1px solid #2B2B27" }}>
              {checklistRows(true)}
            </div>
            <button
              onClick={() => { if (checklistComplete) setRecStart(Date.now()); }}
              disabled={!checklistComplete}
              style={{ marginTop: 20, width: "100%", border: "none", cursor: checklistComplete ? "pointer" : "not-allowed", background: checklistComplete ? "#E63946" : "#171715", color: checklistComplete ? "#FFF" : "#6B6B65", padding: 16, fontFamily: T_COND, fontWeight: 700, fontSize: 30, letterSpacing: "0.04em", textTransform: "uppercase" }}
            >
              {checklistComplete ? "Démarrer le rec »" : `Checklist d'abord · ${doneCount} / ${data.checklist.length}`}
            </button>
          </section>
        )}

        {blocs.map((b, i) => {
          const isCur = i === currentBloc;
          const qs = questionsOf(i);
          return (
            <section key={i} id={`bloc-${i}`} style={{ paddingTop: 36 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, borderBottom: "2px solid #FFF", paddingBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: isCur ? "#F4C435" : "#8F8F88" }}>{rangeLabel(b)}</span>
                <h2 style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 38, lineHeight: 0.95, textTransform: "uppercase", margin: 0 }}>{b.titre}</h2>
              </div>
              {b.mode && <div style={{ fontFamily: MONO, fontSize: 12, color: "#8F8F88", marginTop: 8, letterSpacing: "0.06em" }}>{b.mode}</div>}

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                {qs.map((q) => {
                  const isAsked = !!asked[q.num];
                  return (
                    <div key={q.num} onClick={() => toggleQuestion(q.num)} style={{ cursor: "pointer", border: `1px solid ${isAsked ? "#2B2B27" : "#FFF"}`, padding: "16px 18px", display: "flex", gap: 14, alignItems: "flex-start", opacity: isAsked ? 0.45 : 1 }}>
                      <span style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: 40, lineHeight: 0.85, color: "#464641", flexShrink: 0, minWidth: 34 }}>{q.num}</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                        <span style={{ fontSize: 19, lineHeight: 1.35, fontWeight: 600, textDecoration: isAsked ? "line-through" : "none" }}>{q.texte}</span>
                        {q.note && <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: "#8F8F88" }}>{q.note}</span>}
                        {isAsked && <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#2FA46A" }}>POSÉE · {askedAt[q.num]}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {b.rappel && (
                <div style={{ marginTop: 12, borderLeft: "2px solid #F4C435", padding: "10px 14px", background: "#171715" }}>
                  {b.rappel_label && <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#F4C435" }}>{b.rappel_label}</span>}
                  <p style={{ fontSize: 15, lineHeight: 1.5, margin: "6px 0 0 0", color: "#ECECE8" }}>{b.rappel}</p>
                </div>
              )}
            </section>
          );
        })}

        {data.kpis.length > 0 && (
          <section style={{ paddingTop: 40 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", color: "#8F8F88", borderBottom: "1px solid #2B2B27", paddingBottom: 8 }}>CHIFFRES À PORTÉE DE MAIN</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1, background: "#2B2B27", border: "1px solid #2B2B27", marginTop: 14 }}>
              {data.kpis.map((k, i) => (
                <div key={i} style={{ background: "#000", padding: "12px 14px" }}>
                  <div style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: 40, lineHeight: 0.9 }}>{k.valeur}</div>
                  <div style={{ fontSize: 12, color: "#BFBFB9", marginTop: 2 }}>{k.libelle}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.zone_grise.length > 0 && (
          <section style={{ marginTop: 32, border: "1px solid #F4C435", padding: "16px 18px" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", color: "#F4C435" }}>ZONE GRISE : LUI FAIRE DIRE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {data.zone_grise.map((z, i) => (
                <span key={i} style={{ fontSize: 15, lineHeight: 1.5, color: "#ECECE8" }}>{z.texte}</span>
              ))}
            </div>
          </section>
        )}

        {/* Fin d'épisode : livraison des moments forts marqués pendant le rec
            (clips en tête, notes ensuite), régie en appendice. */}
        {carnet.length > 0 && (
          <section style={{ marginTop: 40, borderTop: "2px solid #FFF", paddingTop: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 34, lineHeight: 0.95, textTransform: "uppercase", margin: 0 }}>Fin d&apos;épisode : moments forts</h2>
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#8F8F88", letterSpacing: "0.1em" }}>{carnet.filter((x) => x.tag === "CLIP").length} CLIP(S) · {carnet.filter((x) => x.tag === "NOTE").length} NOTE(S)</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
              {[...carnet].sort((a, b) => (a.tag === b.tag ? 0 : a.tag === "CLIP" ? -1 : 1)).map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "10px 0", borderBottom: "1px solid #2B2B27" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: item.tag === "CLIP" ? "#E63946" : "#8F8F88", flexShrink: 0 }}>{item.tag} {item.time}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5, color: "#ECECE8" }}>{item.text}</span>
                </div>
              ))}
            </div>
            {chat.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", color: "#8F8F88" }}>RÉGIE PENDANT LE REC</div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
                  {chat.map((m, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid #171715" }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "#8F8F88", flexShrink: 0 }}>{(m.who === "me" ? "MATTHIEU" : m.who.toUpperCase())} · {m.time}</span>
                      <span style={{ fontSize: 14, lineHeight: 1.5, color: "#D9D9D4" }}>{m.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 11, lineHeight: 1.7, color: "#8F8F88" }}>
              {data.footer}
            </div>
          </section>
        )}
      </div>

      {/* Drawer carnet */}
      {carnetOpen && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 64, zIndex: 70, display: "flex", justifyContent: "center", padding: "0 12px" }}>
          <div style={{ width: "100%", maxWidth: 680, background: "#FFF", color: "#000", border: "1px solid #000", maxHeight: "55vh", display: "flex", flexDirection: "column" }}>
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
          <div style={{ width: "100%", maxWidth: 680, background: "#FFF", color: "#000", border: "1px solid #000", maxHeight: "55vh", display: "flex", flexDirection: "column" }}>
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

      {/* Barre d'actions */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 80, background: "#000", borderTop: "1px solid #FFF", display: "flex", height: 64 }}>
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
    </main>
  );

  return (
    <div style={{ minHeight: "100vh", background: mode === "live" ? "#000" : "#FFF" }}>
      {header}
      {mode === "prepa" ? prepa : live}
    </div>
  );
}

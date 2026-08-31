"use client";

// Fiche de préparation GDIY, template v4 : port fidèle de la maquette validée
// Fiche_Prepa_GDIY_Dimitri_Rassam_v3.html (Clémence, 31/08). La maquette est
// l'autorité de design ; les styles vivent dans fiches.css (classes .gdv4).
//
// Comportements conservés de la console partagée (lot A du 20/07) : chaque
// saisie (clip, note, message régie, coche de checklist, question posée) est
// une ligne fiche_console_events écrite sous l'identité du compte connecté,
// l'état se réduit du flux d'événements, la synchro passe par Supabase
// Realtime avec repli en polling court (2 s).
//
// Nouveau REC (v4) : bouton dans la bande checklist, cliquable qu'elle soit
// dépliée ou repliée, chronomètre de séance PUREMENT LOCAL. L'intégration
// console du REC (sessions en base, email des notes au stop) est reportée,
// décision du brief v4.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { googleImagesUrl } from "@/lib/fiche/schema";
import { POOL_QUESTIONS_GENERALES } from "@/lib/fiche/schema";
import { createClient } from "@/lib/supabase/client";
import {
  labelFromEmail, reduceChecked, reduceAsked, carnetOf, chatOf, textOf,
  timecodeAt, timeLabel, mergeEvent, dernierLu, chatNonLus, segmentsAvecLiens,
  type ConsoleEvent, type RecSession,
} from "@/lib/fiche/console";

/** Décalage d'index des coches de la checklist post-rec dans le flux
 *  d'événements check (les index 0..n restent la checklist pré-rec). */
export const POST_CHECK_OFFSET = 100;

/** Accent d'un item de TL;DR d'après son label (règle maquette : la tension
 *  en vert, le piège en rouge, « à lui faire lâcher » en or). PURE, testée. */
export function tldrAccent(label: string): "green" | "red" | "gold" | null {
  const l = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/piege/.test(l)) return "red";
  if (/tension/.test(l)) return "green";
  if (/lacher|levier/.test(l)) return "gold";
  return null;
}

/** Couleurs d'une barre de graph marché selon son accent déclaré. PURE. */
export function accentBarre(accent?: string): { col: string; num: string } {
  if (accent === "noir") return { col: "#16150F", num: "#16150F" };
  if (accent === "rouge") return { col: "#D4231A", num: "#D4231A" };
  if (accent === "jaune") return { col: "#F5C542", num: "#8A7118" };
  return { col: "#C4C0B2", num: "#6B675C" };
}

/** Hauteur d'une barre en pixels, relative au maximum de la série. PURE. */
export function hauteurBarre(valeur: number, max: number, hMax = 140): number {
  if (!(max > 0)) return 4;
  return Math.max(4, Math.round((Math.max(0, valeur) / max) * hMax));
}

/** Sujet affiché d'un item de zone grise : champ sujet, sinon l'identifiant
 *  nettoyé (zg_pere_suicide → « pere suicide »), sinon les premiers mots. */
export function sujetZoneGrise(z: { sujet?: string; id?: string; texte: string }): string {
  if (z.sujet) return z.sujet;
  if (z.id) return z.id.replace(/^zg_/, "").replace(/_/g, " ");
  const mots = z.texte.split(/\s+/).slice(0, 4).join(" ");
  return mots.length < z.texte.length ? `${mots}…` : mots;
}

export interface FicheQuestion { num: string; texte: string; clip?: boolean }
export interface ALireLien {
  niveau?: "indispensable" | "utile" | "optionnel";
  titre: string;
  date?: string;
  temps_lecture?: string;
  apport?: string;
  url?: string;
  embargo?: boolean;
}
export interface MarcheGraphView {
  titre: string;
  sous_titre?: string;
  type: "barres" | "barres_jumelees";
  valeurs: { label: string; valeur: number; affiche: string; valeur2?: number; affiche2?: string; accent?: string; legende?: string }[];
  legende?: { serie1?: string; serie2?: string };
  callout?: string;
  source?: string;
}

export interface FicheViewData {
  slug: string;
  fiche_id: string;
  invite_nom: string;
  statut: string;
  version: number;
  viewer_email: string;
  console_events: ConsoleEvent[];
  rec_sessions: RecSession[];
  show_label: string;
  generation: { groupe: string; statut: string; error?: string; quand?: string }[];
  incompletes: string[];
  identite: {
    numero?: string;
    societe?: string;
    sous_titre?: string;
    pilules: string[];
    liens: { label: string; url: string }[];
    age?: number;
    accompagnants: { nom: string; fonction?: string }[];
    mise_en_relation?: { qui?: string; canal?: string };
  };
  checklist: string[];
  checklist_post: string[];
  tldr: { label: string; texte: string }[];
  timeline: { date?: string; texte: string }[];
  kpis: { valeur: string; libelle: string; source?: string; zg?: string }[];
  visuels: {
    barres?: { titre: string; note?: string; source?: string; valeurs: { label: string; affiche: string; valeur: number; plein?: boolean }[] };
    comparaison?: { titre?: string; source?: string; valeurs: { nom: string; affiche: string; pct: number; hero?: boolean }[] };
    rentabilite?: { titre?: string; note?: string; source?: string; valeurs: { label: string; affiche: string; pct: number }[] };
  };
  marche_graphs: MarcheGraphView[];
  lexique: { terme: string; definition: string }[];
  marche: { texte?: string; comparables: { nom: string; position?: string }[] } | null;
  terrain_connu: { question: string; reponse?: string; depassement?: string }[];
  topics: {
    titre: string;
    intention?: string;
    contexte?: string;
    dates: string[];
    citations: string[];
    hero?: { valeur: string; libelle?: string };
    extras?: { titre?: string; items: string[] };
    reflexions: string[];
    pleine_largeur: boolean;
    questions: FicheQuestion[];
  }[];
  clickbait: { piquantes: string[]; apprentissages: string[] } | null;
  clips_legacy: { question: string; meta?: string; fache?: boolean }[];
  apprentissages: { intro?: string; items: { titre: string; connu?: string; manque?: string; question?: string }[] };
  personnel: {
    entourage: { nom: string; role?: string; eclaire?: string; preconfirmer?: string }[];
    donnees_cachees: { texte: string; source?: string }[];
    zone_grise: { sujet?: string; id?: string; texte: string; origine?: string }[];
  };
  revue_de_presse: {
    reseaux: { label: string; url: string }[];
    a_lire: ALireLien[];
  };
  sources_titres: string[];
  legacy: {
    enjeu?: string;
    recit: string[];
    questions: FicheQuestion[];
  };
}

function TexteLie({ texte }: { texte: string }) {
  return (
    <>
      {segmentsAvecLiens(texte).map((s, i) =>
        s.type === "lien" ? (
          <a key={i} href={s.valeur} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} style={{ wordBreak: "break-all" }}>
            {s.valeur}
          </a>
        ) : (
          <span key={i}>{s.valeur}</span>
        )
      )}
    </>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");
function fmtChrono(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/* Icônes des boutons réseaux (X et Instagram, comme la maquette). */
function IconeReseau({ label }: { label: string }) {
  const l = label.toLowerCase();
  if (l === "x" || l.includes("twitter")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  if (l.includes("instagram")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return null;
}

export default function FicheView({ data }: { data: FicheViewData }) {
  const [events, setEvents] = useState<ConsoleEvent[]>(data.console_events);
  const [sessions, setSessions] = useState<RecSession[]>(data.rec_sessions);
  const sb = useMemo(() => createClient(), []);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  useEffect(() => setSessions(data.rec_sessions), [data.rec_sessions]);

  /* Synchro : canal Realtime, repli documenté en polling 2 s. */
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;
    const demarrerPolling = () => {
      if (poll) return;
      poll = setInterval(async () => {
        const { data: evs } = await sb
          .from("fiche_console_events")
          .select("id, session_id, created_at, author_email, kind, timecode, payload")
          .eq("fiche_id", data.fiche_id)
          .order("created_at")
          .limit(2000);
        if (evs) setEvents((prev) => (evs as ConsoleEvent[]).reduce((acc, e) => mergeEvent(acc, e), prev));
      }, 2000);
    };
    const channel = sb
      .channel(`console-${data.fiche_id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "fiche_console_events", filter: `fiche_id=eq.${data.fiche_id}` }, (p) => {
        setEvents((prev) => mergeEvent(prev, p.new as ConsoleEvent));
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") demarrerPolling();
      });
    return () => {
      if (poll) clearInterval(poll);
      void sb.removeChannel(channel);
    };
  }, [sb, data.fiche_id]);

  /* Écriture d'un événement : ajout optimiste, session rafraîchie et retentée
     UNE fois en cas de refus (incident du 30/07), échec dit franchement. */
  const sendEvent = useCallback((kind: ConsoleEvent["kind"], payload: Record<string, unknown>) => {
    const open = sessionsRef.current.find((s) => !s.ended_at) ?? null;
    const e: ConsoleEvent = {
      id: crypto.randomUUID(),
      session_id: open?.id ?? null,
      created_at: new Date().toISOString(),
      author_email: data.viewer_email,
      kind,
      timecode: open ? timecodeAt(open, Date.now()) : null,
      payload,
    };
    setEvents((prev) => mergeEvent(prev, e));
    const ligne = { id: e.id, fiche_id: data.fiche_id, session_id: e.session_id, kind, timecode: e.timecode, payload };
    void (async () => {
      let { error } = await sb.from("fiche_console_events").insert(ligne);
      if (error) {
        await sb.auth.refreshSession();
        ({ error } = await sb.from("fiche_console_events").insert(ligne));
      }
      if (error) {
        setEvents((prev) => prev.filter((x) => x.id !== e.id));
        setErreurEnvoi(`Écriture refusée (${error.message}). Recharge la page puis renvoie ; si ça persiste, reconnecte toi.`);
      } else {
        setErreurEnvoi(null);
      }
    })();
  }, [sb, data.fiche_id, data.viewer_email]);

  /* État réduit du flux. */
  const checked = useMemo(() => reduceChecked(events), [events]);
  const { asked } = useMemo(() => reduceAsked(events), [events]);
  const carnet = useMemo(() => carnetOf(events), [events]);
  const clipsSaisis = useMemo(() => carnet.filter((e) => e.kind === "clip"), [carnet]);
  const notesSaisies = useMemo(() => carnet.filter((e) => e.kind === "note"), [carnet]);
  const chat = useMemo(() => chatOf(events), [events]);
  const monDernierLu = useMemo(() => dernierLu(events, data.viewer_email), [events, data.viewer_email]);
  const nonLus = useMemo(() => chatNonLus(events, data.viewer_email), [events, data.viewer_email]);

  const preDone = data.checklist.filter((_, i) => checked[i]).length;
  const postDone = data.checklist_post.filter((_, i) => checked[i + POST_CHECK_OFFSET]).length;
  const toggleCheck = (index: number) => sendEvent("check", { index, checked: !checked[index] });
  const toggleQuestion = (num: string) => sendEvent("question", { num, asked: !asked[num] });

  /* Folds : checklist pré dépliée d'office, post repliée, folds discrets. */
  const [preOpen, setPreOpen] = useState(true);
  const [postOpen, setPostOpen] = useState(false);
  const [foldSources, setFoldSources] = useState(false);
  const [foldPool, setFoldPool] = useState(false);

  /* REC v4 : chronomètre de séance purement local (pas d'intégration console
     dans cette itération, décision du brief). */
  const [recOn, setRecOn] = useState(false);
  const [recT0, setRecT0] = useState<number | null>(null);
  const [recSec, setRecSec] = useState(0);
  useEffect(() => {
    if (!recOn || recT0 === null) return;
    const t = setInterval(() => setRecSec(Math.floor((Date.now() - recT0) / 1000)), 500);
    return () => clearInterval(t);
  }, [recOn, recT0]);
  const toggleRec = () => {
    if (recOn) {
      setRecOn(false);
    } else {
      setRecT0(Date.now());
      setRecSec(0);
      setRecOn(true);
    }
  };

  /* Toolbar : trois panneaux adossés à la console partagée. */
  const [panneau, setPanneau] = useState<"clips" | "carnet" | "regie" | null>(null);
  const [saisie, setSaisie] = useState("");
  const meta = {
    clips: { title: "Clips", hint: "questions à fort potentiel réseaux · challengées par l'équipe", ph: "Proposer un clip", empty: "Aucun clip validé. Les questions marquées CLIP dans les briques sont les candidates." },
    carnet: { title: "Carnet", hint: "notes prises en direct", ph: "Note en direct", empty: "Vide. À remplir pendant l'enregistrement." },
    regie: { title: "Régie", hint: "suivi technique et production", ph: "Entrée régie", empty: "Aucune entrée technique." },
  } as const;
  const listeDuPanneau = panneau === "clips" ? clipsSaisis : panneau === "carnet" ? notesSaisies : panneau === "regie" ? chat : [];
  const submitPanneau = () => {
    const t = saisie.trim();
    if (!panneau || !t) return;
    sendEvent(panneau === "clips" ? "clip" : panneau === "carnet" ? "note" : "chat", { text: t });
    setSaisie("");
  };
  // Régie ouverte : la borne de lecture avance jusqu'au dernier message des autres.
  useEffect(() => {
    if (panneau !== "regie" || nonLus.length === 0) return;
    const jusquA = nonLus[nonLus.length - 1].created_at;
    if (jusquA > monDernierLu) sendEvent("lu", { jusqu_a: jusquA });
  }, [panneau, nonLus, monDernierLu, sendEvent]);

  const echecs = data.generation.filter((g) => g.statut === "failed");
  const enCours = data.generation.filter((g) => g.statut === "pending" || g.statut === "running");

  const lede = [data.identite.age !== undefined ? `${data.identite.age} ans` : null, data.identite.sous_titre].filter(Boolean);
  const aChiffres = data.kpis.length > 0 || !!data.visuels.barres || !!data.visuels.comparaison || !!data.visuels.rentabilite;
  const aMarche = data.marche_graphs.length > 0 || !!(data.marche && (data.marche.texte || data.marche.comparables.length)) || data.lexique.length > 0;
  const aLegacy = !!data.legacy.enjeu || data.legacy.recit.length > 0 || data.legacy.questions.length > 0;
  const numeroTag = data.identite.numero ? ` #${data.identite.numero}` : "";

  /* ── graph marché : une carte ── */
  const carteGraph = (g: MarcheGraphView, i: number) => {
    const max = Math.max(...g.valeurs.flatMap((v) => [v.valeur, v.valeur2 ?? 0]), 0);
    const nCols = Math.min(Math.max(g.valeurs.length, 1), 8);
    return (
      <div className="gd-card" key={i} style={i === 0 ? { marginTop: 24 } : undefined}>
        <h3>{g.titre}</h3>
        {g.sous_titre && <p className="csub">{g.sous_titre}</p>}
        <div className={`cgrid${g.valeurs.length >= 7 ? " cgrid8" : ""}`} style={{ gridTemplateColumns: `repeat(${nCols}, 1fr)` }}>
          {g.valeurs.map((v, j) => {
            const a = accentBarre(v.accent);
            if (g.type === "barres_jumelees") {
              return (
                <div className="cbar" key={j}>
                  <div className="duobars">
                    <div>
                      <div className="num" style={{ fontSize: 15, color: "#16150F" }}>{v.affiche}</div>
                      <div className="col" style={{ height: hauteurBarre(v.valeur, max, 112), background: "#16150F" }} />
                    </div>
                    <div>
                      <div className="num" style={{ fontSize: 15, color: "#B3651A" }}>{v.affiche2 ?? ""}</div>
                      <div className="col" style={{ height: hauteurBarre(v.valeur2 ?? 0, max, 112), background: "#F5C542" }} />
                    </div>
                  </div>
                  <div className="yr">{v.label}</div>
                  {v.legende && <div className="cap">{v.legende}</div>}
                </div>
              );
            }
            return (
              <div className="cbar" key={j}>
                <div className="num" style={{ color: a.num, ...(g.valeurs.length >= 7 ? { fontSize: 20 } : {}) }}>{v.affiche}</div>
                <div className="col" style={{ height: hauteurBarre(v.valeur, max), background: a.col }} />
                <div className="yr">{v.label}</div>
                {v.legende && <div className="cap">{v.legende}</div>}
              </div>
            );
          })}
        </div>
        {g.type === "barres_jumelees" && g.legende && (g.legende.serie1 || g.legende.serie2) && (
          <div className="clegend">
            {g.legende.serie1 && <span><i style={{ background: "#16150F" }} />{g.legende.serie1}</span>}
            {g.legende.serie2 && <span><i style={{ background: "#F5C542" }} />{g.legende.serie2}</span>}
          </div>
        )}
        {g.callout && <p className="gd-callout">{g.callout}</p>}
        {g.source && <p className="gd-src">{g.source}</p>}
      </div>
    );
  };

  /* ── question de brique (rayable d'un tap, état partagé) ── */
  const questionRow = (q: FicheQuestion) => (
    <div key={q.num} className={`gd-q${q.clip ? " clip" : ""}${asked[q.num] ? " asked" : ""}`} onClick={() => toggleQuestion(q.num)}>
      <span className="n">{q.num.replace(/^0/, "")}</span>
      <span className="t">
        {q.texte}
        {q.clip && <span className="cliptag">CLIP</span>}
      </span>
    </div>
  );

  return (
    <div className="gdv4">
      <div className="gd-page">

        {/* ── Checklist pré-REC : bande rouge dépliée d'office, REC intégré,
            cliquable dépliée ou repliée (stopPropagation sur le trigger). ── */}
        <div className="gd-fold--red">
          <button className="gd-fold__trigger" onClick={() => setPreOpen(!preOpen)}>
            <span style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span
                className={`recbtn${recOn ? " on" : ""}`}
                role="button"
                tabIndex={0}
                onClick={(ev) => { ev.stopPropagation(); toggleRec(); }}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.stopPropagation(); toggleRec(); } }}
              >
                {recOn ? "■ En cours" : "● REC"}
              </span>
              <span className="rectime mono">{fmtChrono(recSec)}</span>
              <span>{`Avant d'appuyer sur REC · ${data.checklist.length} gestes`}</span>
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{preDone}/{data.checklist.length} {preOpen ? "▲" : "▼"}</span>
          </button>
          <div className={`gd-fold__body${preOpen ? "" : " hidden"}`}>
            {data.checklist.map((label, i) => (
              <label key={i} className={`gd-check${checked[i] ? " done" : ""}`}>
                <input type="checkbox" checked={!!checked[i]} onChange={() => toggleCheck(i)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ── États hors maquette : gate anti fiche vide et génération. ── */}
        {data.incompletes.length > 0 && (
          <div className="gd-state">
            <div className="t">Fiche incomplète · non présentable</div>
            <p>Section(s) obligatoire(s) vide(s) : <b>{data.incompletes.join(", ")}</b>.</p>
            <p className="mono" style={{ fontSize: 12, color: "#6B675C" }}>
              {enCours.length > 0
                ? `Génération en cours (${enCours.map((g) => g.groupe).join(", ")}). Recharger la page fait avancer.`
                : echecs.length > 0
                  ? `Génération en échec (${echecs.map((g) => g.groupe).join(", ")})${echecs[0].error ? ` : ${echecs[0].error}` : ""}.`
                  : "Génération non lancée ou incomplète. Dans Claude : « regénère la fiche »."}
            </p>
          </div>
        )}
        {data.incompletes.length === 0 && echecs.length > 0 && (
          <div className="gd-state quiet">
            <p className="mono" style={{ fontSize: 12, margin: 0 }}>
              GÉNÉRATION EN ÉCHEC : {echecs.map((g) => g.groupe.toUpperCase()).join(" · ")}. Relancer via Claude : « regénère le groupe {echecs[0].groupe} de la fiche {data.invite_nom} ».
            </p>
          </div>
        )}

        {/* ── Header ── */}
        <header className="gd">
          <div className="gd-eyebrow">{data.show_label} · Fiche de préparation{numeroTag}</div>
          <h1 className="gd">{data.invite_nom}</h1>
          <div className="gd-rule" />
          {lede.length > 0 && (
            <p className="gd-lede">
              {data.identite.age !== undefined && <span className="age">{data.identite.age} ans</span>}
              {data.identite.age !== undefined && data.identite.sous_titre ? " · " : ""}
              {data.identite.sous_titre ?? ""}
            </p>
          )}
          {data.identite.pilules.length > 0 && (
            <div className="gd-pills">
              {data.identite.pilules.map((p, i) => <span key={i} className="gd-pill">{p}</span>)}
            </div>
          )}
          <div className="gd-btnrow">
            {data.identite.liens.map((l, i) => (
              <a key={i} className="gd-btn" href={l.url} target="_blank" rel="noopener noreferrer">{l.label} →</a>
            ))}
            <a className="gd-btn gd-btn--photo" href={googleImagesUrl(data.invite_nom)} target="_blank" rel="noopener noreferrer">
              {`Photos · Google Images "${data.invite_nom}" →`}
            </a>
            {data.revue_de_presse.reseaux.map((l, i) => (
              <a key={i} className="gd-btn gd-btn--dark mono" href={l.url} target="_blank" rel="noopener noreferrer">
                <IconeReseau label={l.label} />
                <span>{l.label}</span>
              </a>
            ))}
          </div>
          {(data.identite.accompagnants.length > 0 || data.identite.mise_en_relation) && (
            <div className="mono" style={{ fontSize: 12, color: "#6B675C", marginTop: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
              <span>ACCOMPAGNANTS : {data.identite.accompagnants.length ? data.identite.accompagnants.map((a) => `${a.nom}${a.fonction ? ` (${a.fonction})` : ""}`).join(", ") : "à confirmer"}</span>
              {data.identite.mise_en_relation && (
                <span>MISE EN RELATION : {[data.identite.mise_en_relation.qui, data.identite.mise_en_relation.canal].filter(Boolean).join(", ")}</span>
              )}
            </div>
          )}
        </header>

        {/* ── INTRO ── */}
        {(data.tldr.length > 0 || data.timeline.length > 0 || aChiffres) && (
          <div className="gd-cat"><span className="tag">Intro</span></div>
        )}

        {data.tldr.length > 0 && (
          <section className="gd-tldr">
            <div className="head">
              <h2 className="gd" style={{ margin: 0 }}>TL;DR</h2>
              <p>Le briefing en 30 secondes</p>
            </div>
            <div className="grid">
              {data.tldr.map((t, i) => {
                const accent = tldrAccent(t.label);
                return (
                  <div key={i} className={accent ? `accent-${accent}` : undefined}>
                    <h3>{t.label}</h3>
                    <p className="t">{t.texte}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {data.timeline.length > 0 && (
          <section className="gd-timeline">
            <h2 className="gd">Bio timeline</h2>
            <p className="gd-sub">Une ligne = une date = un fait · pro et perso mêlés</p>
            <div className="rows">
              {data.timeline.map((t, i) => (
                <div key={i} className="gd-tl"><span className="d">{t.date ?? ""}</span><span className="f">{t.texte}</span></div>
              ))}
            </div>
          </section>
        )}

        {aChiffres && (
          <section style={{ marginTop: 56 }}>
            <h2 className="gd">Les chiffres</h2>
            <p className="gd-sub">Bloc propriétaire des valeurs · toute valeur est datée et sourcée</p>
            {data.kpis.length > 0 && (
              <div className="gd-kpigrid">
                {data.kpis.map((k, i) => (
                  <div key={i} className={`gd-kpi${i < 3 ? " gd-kpi--hero" : ""}`}>
                    <div className="v">{k.valeur}</div>
                    <div className="l">{k.libelle}</div>
                    {(k.source || k.zg) && <div className="s">{k.source ?? `ZG : ${k.zg}`}</div>}
                  </div>
                ))}
              </div>
            )}
            {data.visuels.barres && data.visuels.barres.valeurs.length > 0 && (() => {
              const b = data.visuels.barres;
              const max = Math.max(...b.valeurs.map((x) => x.valeur), 0);
              return (
                <div className="gd-card">
                  <h3>{b.titre}</h3>
                  {(b.note || b.source) && <p className="csub">{[b.note, b.source].filter(Boolean).join(" · ")}</p>}
                  <div className="cgrid" style={{ gridTemplateColumns: `repeat(${Math.min(b.valeurs.length, 8)}, 1fr)` }}>
                    {b.valeurs.map((v, j) => (
                      <div className="cbar" key={j}>
                        <div className="num" style={{ color: v.plein ? "#16150F" : "#6B675C" }}>{v.affiche}</div>
                        <div className="col" style={{ height: hauteurBarre(v.valeur, max), background: v.plein ? "#16150F" : "#C4C0B2" }} />
                        <div className="yr">{v.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            {data.visuels.comparaison && data.visuels.comparaison.valeurs.length > 0 && (() => {
              const g = data.visuels.comparaison;
              const max = Math.max(...g.valeurs.map((x) => Math.abs(x.pct)), 1);
              return (
                <div className="gd-card">
                  <h3>{g.titre ?? "Comparaison"}</h3>
                  {g.source && <p className="csub">{g.source}</p>}
                  {g.valeurs.map((v, j) => (
                    <div className="hbar-row" key={j}>
                      <div className="lab"><span>{v.nom}</span><b>{v.affiche}</b></div>
                      <div className={`bar${v.hero ? " hero" : ""}`} style={{ width: `${Math.max(4, Math.round((Math.abs(v.pct) / max) * 100))}%` }} />
                    </div>
                  ))}
                </div>
              );
            })()}
            {data.visuels.rentabilite && data.visuels.rentabilite.valeurs.length > 0 && (() => {
              const g = data.visuels.rentabilite;
              return (
                <div className="gd-card">
                  <h3>{g.titre ?? "Rentabilité"}</h3>
                  {(g.note || g.source) && <p className="csub">{[g.note, g.source].filter(Boolean).join(" · ")}</p>}
                  {g.valeurs.map((v, j) => (
                    <div className="hbar-row" key={j}>
                      <div className="lab"><span>{v.label}</span><b>{v.affiche}</b></div>
                      <div className="bar hero" style={{ width: `${Math.max(0, Math.min(100, v.pct))}%` }} />
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>
        )}

        {/* ── MARCHÉ ── */}
        {aMarche && (
          <>
            <div className="gd-cat"><span className="tag">Marché</span></div>
            <section style={{ marginTop: 32 }}>
              {data.marche_graphs.length > 0 && (
                <>
                  <h2 className="gd">{`Où va l'argent du secteur`}</h2>
                  <p className="gd-sub">Le contexte, en {data.marche_graphs.length} image{data.marche_graphs.length > 1 ? "s" : ""}</p>
                  {data.marche_graphs.map(carteGraph)}
                </>
              )}
              {data.marche && (data.marche.texte || data.marche.comparables.length > 0) && (
                <div className="gd-2col">
                  {data.marche.texte && (
                    <div>
                      <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 10px" }}>Le marché en un paragraphe</h3>
                      <p style={{ fontSize: 16, margin: 0, color: "#35332A" }}>{data.marche.texte}</p>
                    </div>
                  )}
                  {data.marche.comparables.length > 0 && (
                    <div>
                      <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 10px" }}>Comparables</h3>
                      <div style={{ borderTop: "2px solid #16150F" }}>
                        {data.marche.comparables.map((p, i) => (
                          <div key={i} className="gd-table-row"><span className="n">{p.nom}</span><span className="p">{p.position ?? ""}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {data.lexique.length > 0 && (
                <div className="gd-card">
                  <h3>{`Lexique : les ${data.lexique.length} mots du métier, en une phrase chacun`}</h3>
                  <p className="csub">{`Pour ne jamais être le seul du studio à ne pas comprendre`}</p>
                  <div className="gd-lex">
                    {data.lexique.map((l, i) => (
                      <div key={i}><b className="term">{l.terme}</b>{l.definition}</div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {/* ── MAIN TOPICS ── */}
        {data.topics.length > 0 && (
          <>
            <div className="gd-cat"><span className="tag">Main topics</span></div>
            <div className="gd-briques">
              {data.topics.map((t, ti) => {
                const large = t.pleine_largeur;
                const aExploit = t.reflexions.length > 0 || t.questions.length > 0;
                const fond = (
                  <div className="gd-brique__fond" style={!aExploit ? { borderRight: 0 } : undefined}>
                    {t.hero && (
                      <div className="gd-hero">
                        <div className="hnum">{t.hero.valeur}</div>
                        {t.hero.libelle && <div className="hlab">{t.hero.libelle}</div>}
                      </div>
                    )}
                    {(t.contexte || t.intention) && (
                      <>
                        <h3>Le contexte</h3>
                        <p className="ctx">{t.contexte ?? t.intention}</p>
                      </>
                    )}
                    {t.extras && t.extras.items.length > 0 && (
                      <div className="gd-extras">
                        {t.extras.titre && <h3>{t.extras.titre}</h3>}
                        {t.extras.items.map((x, i) => <div key={i} className="x">{x}</div>)}
                      </div>
                    )}
                    {t.dates.length > 0 && (
                      <div className="gd-dates">
                        <h3>Dates clés</h3>
                        {t.dates.map((d, i) => (
                          <div key={i} className="d"><i>·</i><span>{d}</span></div>
                        ))}
                      </div>
                    )}
                    {t.citations.map((cit, i) => (
                      <blockquote key={i} className="gd-quote">{`« ${cit} »`}</blockquote>
                    ))}
                    {/* Brique sans colonne exploitation : les questions vivent dans le fond. */}
                    {!aExploit ? null : null}
                  </div>
                );
                const exploit = (
                  <div className="gd-brique__exploit">
                    {t.reflexions.length > 0 && (
                      <div className="gd-reflex">
                        <h3>Réflexions</h3>
                        {t.reflexions.map((r, i) => <p key={i}>{r}</p>)}
                      </div>
                    )}
                    {t.questions.length > 0 && (
                      <div className="gd-qs">
                        <h3>Questions</h3>
                        {t.questions.map(questionRow)}
                      </div>
                    )}
                  </div>
                );
                return (
                  <article key={ti} className={`gd-brique${large ? " span2" : ""}`}>
                    <div className="gd-brique__head">
                      <div className="gd-brique__num">Sujet {ti + 1}</div>
                      <h2 className="gd-brique__title">{t.titre}</h2>
                    </div>
                    <div className="gd-brique__cols">
                      {fond}
                      {aExploit && exploit}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {/* ── CLICKBAIT (repurpose de clips) ── */}
        {data.clickbait && (
          <article className="gd-clickbait">
            <div className="head">
              <span className="tt">Clickbait</span>
              <span className="st">Les questions qui piquent, et celles qui font apprendre · à doser selon la température du studio</span>
            </div>
            <div className="body">
              {data.clickbait.piquantes.length > 0 && (
                <>
                  <h3 className="grp">{`Celles qui piquent (jusqu'à la gêne assumée)`}</h3>
                  {data.clickbait.piquantes.map((q, i) => (
                    <div key={i} className="cb-q"><span className="n">C{i + 1}</span><span className="t">{q}</span></div>
                  ))}
                </>
              )}
              {data.clickbait.apprentissages.length > 0 && (
                <>
                  <h3 className="grp">{`Celles qui font apprendre (le meilleur de sa catégorie est en face de moi : qu'est-ce que je dois retenir ?)`}</h3>
                  {data.clickbait.apprentissages.map((q, i) => (
                    <div key={i} className="cb-q learn"><span className="n">C{data.clickbait!.piquantes.length + i + 1}</span><span className="t">{q}</span></div>
                  ))}
                </>
              )}
            </div>
          </article>
        )}

        {/* Clips v3.1 (fiches non régénérées) : ancien style, lisible tel quel. */}
        {!data.clickbait && data.clips_legacy.length > 0 && (
          <article className="gd-clickbait">
            <div className="head">
              <span className="tt">Clips</span>
              <span className="st">Format v3.1 · régénérer la fiche pour le format clickbait</span>
            </div>
            <div className="body">
              {data.clips_legacy.map((q, i) => (
                <div key={i} className={`cb-q${q.fache ? "" : " learn"}`}>
                  <span className="n">{i + 1}</span>
                  <span className="t">{q.question}{q.meta ? <span className="mono" style={{ display: "block", fontSize: 11, color: "#8C887A", marginTop: 4 }}>{q.meta}</span> : null}</span>
                </div>
              ))}
            </div>
          </article>
        )}

        {/* ── APPROFONDISSEMENT ── */}
        {(data.terrain_connu.length > 0 || data.personnel.entourage.length > 0 || data.apprentissages.items.length > 0 || data.personnel.zone_grise.length > 0 || data.personnel.donnees_cachees.length > 0) && (
          <div className="gd-cat"><span className="tag">Approfondissement</span></div>
        )}

        {data.terrain_connu.length > 0 && (
          <article className="gd-brique" style={{ marginTop: 32 }}>
            <div className="gd-brique__head">
              <h2 className="gd" style={{ margin: 0 }}>Terrain connu</h2>
              <p className="gd-sub" style={{ margin: "4px 0 0" }}>Ses réponses rodées, et la question de dépassement qui force du neuf</p>
            </div>
            <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
              {data.terrain_connu.map((r, i) => (
                <div key={i} className="gd-terrain">
                  <div className="cq"><div className="lab">{`La question qu'on lui pose partout`}</div><p>{r.question}</p></div>
                  <div className="cr"><div className="lab">Sa réponse rodée</div><p>{r.reponse ?? ""}</p></div>
                  <div className="cd"><div className="lab">Le dépassement</div><p>{r.depassement ?? ""}</p></div>
                </div>
              ))}
            </div>
          </article>
        )}

        {data.personnel.entourage.length > 0 && (
          <article className="gd-brique" style={{ marginTop: 40 }}>
            <div className="gd-brique__head"><h2 className="gd" style={{ margin: 0 }}>{`Who's who`}</h2></div>
            <div style={{ padding: "0 24px 20px" }}>
              <div className="gd-who-head"><span>Qui / rôle</span><span>Ce que ça éclaire</span><span>À préconfirmer</span></div>
              {data.personnel.entourage.map((e, i) => (
                <div key={i} className="gd-who-row">
                  <div><div className="name">{e.nom}</div>{e.role && <div className="role">{e.role}</div>}</div>
                  <div className="light">{e.eclaire ?? ""}</div>
                  {e.preconfirmer ? <div className="conf">{e.preconfirmer}</div> : <div />}
                </div>
              ))}
            </div>
          </article>
        )}

        {data.apprentissages.items.length > 0 && (
          <article className="gd-brique" style={{ marginTop: 40 }}>
            <div className="gd-brique__head"><h2 className="gd" style={{ margin: 0 }}>Les apprentissages</h2></div>
            <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
              {data.apprentissages.items.map((pb, i) => (
                <div key={i} className="gd-tryp">
                  <h3>{i + 1}. {pb.titre}</h3>
                  <div className="cols">
                    <div className="c1"><div className="lab">{`Ce qu'on sait`}</div><p>{pb.connu ?? ""}</p></div>
                    <div className="c2"><div className="lab">Ce qui manque</div><p>{pb.manque ?? ""}</p></div>
                    <div className="c3"><div className="lab">La question</div><p>{pb.question ?? ""}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        )}

        {data.personnel.donnees_cachees.length > 0 && (
          <article className="gd-brique" style={{ marginTop: 40 }}>
            <div className="gd-brique__head">
              <h2 className="gd" style={{ margin: 0 }}>Données cachées</h2>
              <p className="gd-sub" style={{ margin: "4px 0 0" }}>Vieux dossiers et anecdotes introuvables dans les interviews récentes</p>
            </div>
            <div style={{ padding: "12px 24px 20px" }}>
              {data.personnel.donnees_cachees.map((d, i) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #EFEDE4" }}>
                  <div style={{ fontSize: 16, color: "#26241C" }}>{d.texte}</div>
                  {d.source && <div className="mono" style={{ fontSize: 11, color: "#8C887A", marginTop: 4 }}>{d.source}</div>}
                </div>
              ))}
            </div>
          </article>
        )}

        {data.personnel.zone_grise.length > 0 && (
          <article className="gd-alert">
            <div className="head">
              <span className="tt">Zones grises</span>
              <span className="st">{`Ne jamais affirmer à l'antenne`}</span>
            </div>
            <div className="body">
              {data.personnel.zone_grise.map((z, i) => (
                <div key={i} className="gd-zg" id={z.id || undefined}>
                  <span className="s">{sujetZoneGrise(z)}</span>
                  <span className="r">{z.texte}{z.origine ? <span className="mono" style={{ fontSize: 11, color: "#8C887A" }}> ({z.origine})</span> : null}</span>
                </div>
              ))}
            </div>
          </article>
        )}

        {/* ── SOURCES ── */}
        {(data.revue_de_presse.a_lire.length > 0 || data.sources_titres.length > 0) && (
          <div className="gd-cat"><span className="tag">Les sources</span></div>
        )}

        {data.revue_de_presse.a_lire.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 className="gd">{`À consulter avant l'enregistrement`}</h2>
            <p className="gd-sub">
              {(() => {
                const total = data.revue_de_presse.a_lire.reduce((acc, l) => acc + (parseInt(l.temps_lecture ?? "", 10) || 0), 0);
                return total > 0 ? `${total} min de lecture au total` : "Les lectures indispensables et utiles";
              })()}
            </p>
            <div>
              {data.revue_de_presse.a_lire.map((l, i) => {
                const inner = (
                  <>
                    <div>
                      <span className="prio">{l.niveau === "indispensable" ? "Indispensable" : l.niveau === "optionnel" ? "Optionnel" : "Utile"}</span>
                      {l.date && <div className="date">{l.date}</div>}
                    </div>
                    <div>
                      <div className="ti">{l.titre}{l.embargo && <span className="embargo">Embargo</span>}</div>
                      {l.apport && <div className="why">{l.apport}</div>}
                    </div>
                    <div>
                      {l.temps_lecture && <><div className="time">{l.temps_lecture.replace(/\s*min.*/i, " min")}</div><div className="tlab">de lecture</div></>}
                    </div>
                  </>
                );
                const cls = `gd-press${l.niveau === "indispensable" ? " must" : ""}`;
                return l.url
                  ? <a key={i} className={cls} href={l.url} target="_blank" rel="noopener noreferrer">{inner}</a>
                  : <div key={i} className={cls}>{inner}</div>;
              })}
            </div>
          </section>
        )}

        {data.sources_titres.length > 0 && (
          <div className={`gd-fold--quiet${foldSources ? " open" : ""}`}>
            <button className="fq" onClick={() => setFoldSources(!foldSources)}>
              <span>Toutes les sources consultées ({data.sources_titres.length})</span>
              <span>{foldSources ? "− Replier" : "+ Déplier"}</span>
            </button>
            <div className="fbody">
              <p className="mono" style={{ fontSize: 13, lineHeight: 1.9, color: "#6B675C", margin: "16px 0 0" }}>
                {data.sources_titres.join(" · ")}
              </p>
            </div>
          </div>
        )}

        <div className={`gd-fold--quiet${foldPool ? " open" : ""}`} style={{ marginTop: 12 }}>
          <button className="fq" onClick={() => setFoldPool(!foldPool)}>
            <span>{`Questions générales de l'émission (pool fixe)`}</span>
            <span>{foldPool ? "− Replier" : "+ Déplier"}</span>
          </button>
          <div className="fbody" style={{ marginTop: 16 }}>
            {POOL_QUESTIONS_GENERALES.map((q, i) => <div key={i} className="gd-genq">{q}</div>)}
          </div>
        </div>

        {/* ── Repli des fiches d'un contrat antérieur à v3.1 (non migrées). ── */}
        {aLegacy && (
          <div className="gd-legacy">
            <div className="lab">Contenu d&apos;un contrat antérieur (fiche non migrée)</div>
            {data.legacy.enjeu && <p style={{ fontSize: 15, margin: "0 0 10px" }}>{data.legacy.enjeu}</p>}
            {data.legacy.recit.map((p, i) => <p key={i} style={{ fontSize: 15, margin: "0 0 10px" }}>{p}</p>)}
            {data.legacy.questions.map(questionRow)}
          </div>
        )}

        {/* ── Checklist post-REC : bande rouge repliée par défaut. ── */}
        <div className="gd-fold--red" style={{ marginTop: 48 }}>
          <button className="gd-fold__trigger" onClick={() => setPostOpen(!postOpen)}>
            <span>Avant de quitter le studio · {data.checklist_post.length} gestes</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{postDone}/{data.checklist_post.length} {postOpen ? "▲" : "▼"}</span>
          </button>
          <div className={`gd-fold__body${postOpen ? "" : " hidden"}`}>
            {data.checklist_post.map((label, i) => (
              <label key={i} className={`gd-check${checked[i + POST_CHECK_OFFSET] ? " done" : ""}`}>
                <input type="checkbox" checked={!!checked[i + POST_CHECK_OFFSET]} onChange={() => toggleCheck(i + POST_CHECK_OFFSET)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ height: 40 }} />

        {/* Journal de génération (contrat §3.6), discret. */}
        {data.generation.length > 0 && (
          <div className="mono" style={{ marginTop: 24, fontSize: 11, lineHeight: 1.8, color: "#8C887A" }}>
            STATUT : {data.statut.toUpperCase()} · V{data.version} · GÉNÉRATION : {data.generation.map((g) => `${g.groupe.toUpperCase()} ${g.statut.toUpperCase()}`).join(" · ")}
          </div>
        )}
      </div>

      {/* Échec d'écriture console : dit franchement (incident du 30/07). */}
      {erreurEnvoi && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 64, zIndex: 85, background: "#D4231A", color: "#FFF", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{erreurEnvoi}</span>
          <button onClick={() => setErreurEnvoi(null)} style={{ border: "1px solid #FFF", background: "none", color: "#FFF", cursor: "pointer", fontSize: 11, letterSpacing: "0.1em", padding: "3px 10px" }}>OK</button>
        </div>
      )}

      {/* ── Toolbar fixe : Clips / Carnet / Régie (console partagée). ── */}
      <div className="gd-toolbar">
        <div className={`panel${panneau ? " open" : ""}`}>
          {panneau && (
            <>
              <div className="phead"><h3>{meta[panneau].title}</h3><span>{meta[panneau].hint}</span></div>
              <div style={{ marginTop: 16 }}>
                {listeDuPanneau.map((e) => (
                  <div key={e.id} className="pitem">
                    <span className="m">{labelFromEmail(e.author_email)} · {timeLabel(e, sessions)}</span>
                    <TexteLie texte={textOf(e) || (e.kind === "clip" ? "Moment fort marqué" : "")} />
                  </div>
                ))}
              </div>
              {listeDuPanneau.length === 0 && <p className="pempty">{meta[panneau].empty}</p>}
              <div className="pform">
                <input
                  value={saisie}
                  onChange={(e) => setSaisie(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitPanneau(); }}
                  placeholder={meta[panneau].ph}
                />
                <button onClick={submitPanneau}>Ajouter</button>
              </div>
            </>
          )}
        </div>
        <div className="tabs">
          {(["clips", "carnet", "regie"] as const).map((id) => {
            const count = id === "clips" ? clipsSaisis.length : id === "carnet" ? notesSaisies.length : chat.length;
            const blink = id === "regie" && nonLus.length > 0 && panneau !== "regie";
            return (
              <button key={id} className={`${panneau === id ? "active" : ""}${blink ? " blink" : ""}`} onClick={() => setPanneau(panneau === id ? null : id)}>
                <span>{meta[id].title}</span>
                <span className="ct">{blink ? `${nonLus.length} non lu(s)` : count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

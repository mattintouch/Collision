"use client";

// Fiche de préparation GDIY, contrat v2 (Bloc A / Bloc B) sur le design du
// handoff (vue unique fusionnée, système GDIY noir/blanc Tungsten).
// Bloc A : document d'apprentissage (prose, lu 48 h avant). Bloc B : console
// d'épisode (cartes scannables), à partir de l'ancre « console ». Les sections
// se rendent dans l'ordre stocké par fiche (défaut au catalogue) via un
// registre : chaque section_id a son rendu, une section vide est absente.
// REC verrouillé tant que la checklist n'est pas complète (règle Matt).
//
// Lot A (session Yaël Braun-Pivet, 20/07) : la console est PARTAGÉE. Chaque
// saisie est une ligne fiche_console_events écrite sous l'identité du compte
// connecté (résolue côté serveur, migration 0041), l'état se réduit du flux
// d'événements, la synchro passe par Supabase Realtime avec repli en polling
// court (2 s) documenté. Le REC est une session en base : il survit au
// rechargement et se partage. Aucun libellé d'auteur en dur.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FICHE_SECTIONS } from "@/lib/fiche/sections";
import type { KpiCard, LienDate } from "@/lib/fiche/schema";
import { createClient } from "@/lib/supabase/client";
import {
  labelFromEmail, reduceChecked, reduceAsked, carnetOf, chatOf, textOf,
  timecodeAt, timeLabel, mergeEvent, dernierLu, chatNonLus,
  saisiesEnCours, SAISIE_FRAICHEUR_MS, segmentsAvecLiens,
  type ConsoleEvent, type RecSession, type PresenceOperateur,
} from "@/lib/fiche/console";

/** Texte de régie ou de carnet avec URLs cliquables (incident du 30/07 :
 *  les liens collés par Clémence étaient du texte mort). */
function TexteLie({ texte }: { texte: string }) {
  return (
    <>
      {segmentsAvecLiens(texte).map((s, i) =>
        s.type === "lien" ? (
          <a
            key={i}
            href={s.valeur}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3, wordBreak: "break-all" }}
          >
            {s.valeur}
          </a>
        ) : (
          <span key={i}>{s.valeur}</span>
        )
      )}
    </>
  );
}

// Les questions se rayent d'un tap avec timecode pendant le REC (état partagé
// indexé par num, numérotation continue sur toute la fiche en v3.1).
export interface FicheQuestion { num: string; texte: string; note?: string; zg?: string }
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
  fiche_id: string;
  invite_nom: string;
  statut: string;
  version: number;
  viewer_email: string; // compte connecté (résolu côté serveur)
  console_events: ConsoleEvent[];
  rec_sessions: RecSession[];
  ordre: string[]; // ordre des sections par fiche (réordonnable)
  generation: { groupe: string; statut: string; error?: string; quand?: string }[];
  incompletes: string[]; // sections obligatoires vides (gate anti fiche vide)
  // ── contrat v3.1 ──
  identite: {
    numero?: string;
    titre_lignes: string[];
    societe?: string;
    sous_titre?: string;
    pilules: string[];
    liens: { label: string; url: string }[];
    date_naissance?: string;
    age?: number; // calculé à la date d'enregistrement
    accompagnants: { nom: string; fonction?: string }[];
    mise_en_relation?: { qui?: string; canal?: string };
  };
  checklist: string[];
  tldr: { label: string; texte: string }[];
  tldr_legacy: string[]; // forme du 30/07 (puces sans label), fiches non migrées
  kpis: KpiCard[];
  marche: { texte?: string; comparables: { nom: string; position?: string }[] } | null;
  apprentissages: { intro?: string; items: { titre: string; connu?: string; manque?: string; question?: string }[] };
  clips: { question: string; meta?: string; zg?: string; fache?: boolean }[];
  terrain_connu: { question: string; reponse?: string; depassement?: string }[];
  topics: { titre: string; debut_min?: number; fin_min?: number; intention?: string; questions: FicheQuestion[] }[];
  personnel: {
    bandeau: string;
    entourage: { nom: string; role?: string; eclaire?: string; preconfirmer?: string }[];
    donnees_cachees: { texte: string; source?: string; zg?: string }[];
    zone_grise: { id?: string; texte: string; origine?: string }[];
    items_legacy: { texte: string; source: string }[];
  };
  revue_de_presse: {
    reseaux: { label: string; url: string }[];
    palmares: { date?: string; texte: string }[];
    a_lire: ALireLien[];
    sources_total: number;
  };
  // ── contrats précédents (fallback des fiches non migrées) ──
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
  a_lire: ALireLien[];
  trente_secondes: { label: string; texte: string }[];
  anecdotes: { texte: string; source?: string; cachee?: boolean }[];
  visuels: {
    barres?: { titre: string; note?: string; source?: string; valeurs: { label: string; affiche: string; valeur: number; plein?: boolean }[] };
    comparaison?: { titre?: string; source?: string; valeurs: { nom: string; affiche: string; pct: number; hero?: boolean }[] };
    rentabilite?: { titre?: string; note?: string; source?: string; valeurs: { label: string; affiche: string; pct: number }[] };
    timeline?: { titre: string; jalons: { annee: string; titre: string; texte?: string; cle?: boolean }[] };
  };
  parcours: { annee: string; texte: string }[];
  entourage_legacy: { nom: string; role?: string; texte?: string }[];
  tensions: { a: string; b: string; angle?: string }[];
  polemiques: { texte: string; source?: string; question?: string }[];
  recurrentes: { intro?: string; items: { question: string; reponse?: string }[] };
  questions: FicheQuestion[];
  zone_grise: { id?: string; texte: string; origine?: string }[];
  sources: LienDate[];
  footer: string;
}

/* Tokens de la couche soft (04/08, remplace le papier/encre du 03/08 sur
   décision Matthieu) : police système pour les titres et la lecture, mono
   système pour les timings/nombres/zg_, palette warm grey / ambre adoucie.
   Tout est arrondi (voir tailwind rounded-card/control/chip), chaque carte
   porte une ombre légère. */
const T_COND = "var(--font-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const T_COMP = "var(--font-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace";
const PAPER = "#F7F7F5";
const INK = "#37352F";
const INK_INVERT = "#F5F2EC";
const SUB = "#9B978E";
const SUB_STRONG = "#6B6862";
const HAIRLINE = "#E8E6E0";
const HAIRLINE_STRONG = "#DCD9D1";
const HAIRLINE_SOFT = "#F4F3F0";
const MUTED_BAR = "#C6C2B9";
const JAUNE = "#F2C14E";
const ROUGE = "#E0525F";
const LIVE_BG = "#1C1B19";
const LIVE_CARD = "#262421";
const LIVE_HAIRLINE = "#3A3833";
const LIVE_SUB = "#A8A29A";
const LIVE_NOTE = "#C9C4BB";
const ZG_TEXT = "#9A7418";
const PAPER_TINT = "#FBF6E9";
const PAPER_SUNK = "#F4F3F0";
const CARD_SHADOW = "0 1px 2px rgba(55,53,47,.04), 0 1px 3px rgba(55,53,47,.06)";
const RAISED_SHADOW = "0 4px 14px rgba(55,53,47,.08)";
const FRAME_SHADOW = "0 24px 60px -20px rgba(55,53,47,.35)";

const h2Style: React.CSSProperties = { fontFamily: T_COND, fontWeight: 600, fontSize: 30, lineHeight: 1.1, margin: 0, letterSpacing: "-0.018em" };
const sectionStyle: React.CSSProperties = { padding: "34px 0", borderTop: `1px solid ${HAIRLINE}` };
const monoSrc: React.CSSProperties = { fontFamily: T_COND, fontSize: 11, color: SUB };
const monoLabel: React.CSSProperties = { fontFamily: T_COND, fontWeight: 600, fontSize: 12, letterSpacing: "0.01em", color: SUB_STRONG };
const secNum: React.CSSProperties = { fontFamily: MONO, fontSize: 12, color: SUB };
const secHead: React.CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
const h3Style: React.CSSProperties = { fontFamily: T_COND, fontWeight: 600, fontSize: 24, lineHeight: 1.15, margin: 0, letterSpacing: "-0.014em" };
const proseStyle: React.CSSProperties = { fontSize: 15, lineHeight: 1.55, maxWidth: "72ch" };
/** Carte-panneau standard : fond blanc, coins arrondis, ombre légère au repos. */
const cardStyle: React.CSSProperties = { background: "#FFFFFF", borderRadius: 14, boxShadow: CARD_SHADOW, border: `1px solid ${HAIRLINE}` };

/** Chip ZG jaune : ouvre le popover (repli : ancre vers l'item). */
function ZgChip({ zg, onOpen, outline }: { zg: string; onOpen: (id: string) => void; outline?: boolean }) {
  const id = zg.startsWith("zg_") ? zg : `zg_${zg}`;
  return (
    <button
      onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onOpen(id); }}
      style={outline
        ? { background: "none", border: `1px solid ${JAUNE}`, color: JAUNE, fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999, cursor: "pointer", transition: "160ms ease" }
        : { background: JAUNE, border: "none", color: INK, fontFamily: MONO, fontSize: 10, fontWeight: 600, padding: "3px 7px", borderRadius: 999, cursor: "pointer", transition: "160ms ease" }}
    >
      ZG
    </button>
  );
}

const TITRE_OF = new Map(FICHE_SECTIONS.map((s) => [s.id, s.titre]));
// Zone étude (avant le bandeau console) : v3.1 (tldr, data, apprentissages)
// plus les sections de lecture des contrats précédents (fiches non migrées).
const ZONE_ETUDE = new Set(["tldr", "enjeu", "recit_canonique", "mecanique_succes", "univers", "data", "apprentissages"]);
// Chrome rendu en dur (hors registre de sections).
const CHROME = new Set(["sticky_header", "identite", "checklist_prerec", "footer"]);
const NIVEAUX: Record<string, string> = { indispensable: "Indispensable", utile: "Utile", optionnel: "Optionnel" };

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
const pad2 = (n: number) => String(n).padStart(2, "0");

export default function FicheView({ data }: { data: FicheViewData }) {
  const [events, setEvents] = useState<ConsoleEvent[]>(data.console_events);
  const [sessions, setSessions] = useState<RecSession[]>(data.rec_sessions);
  const [now, setNow] = useState(() => Date.now());
  const [carnetOpen, setCarnetOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [stopConfirm, setStopConfirm] = useState(false);
  const [stopEnCours, setStopEnCours] = useState(false);
  const [emailStatut, setEmailStatut] = useState<string | null>(null);
  const [emailDetail, setEmailDetail] = useState<string | null>(null);
  const [renvoiEnCours, setRenvoiEnCours] = useState(false);
  const [copie, setCopie] = useState<string | null>(null);
  const [presences, setPresences] = useState<PresenceOperateur[]>([]);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<"realtime" | "polling">("realtime");
  /* Handoff v3.1 : trois modes de présentation (état local, persisté par
     fiche). Le live montre un topic à la fois, navigation MANUELLE (les
     timecodes d'épisode sont retirés, décision Matthieu du 03/08). */
  const [mode, setMode] = useState<"etude" | "combat" | "live">("etude");
  const [topicIdx, setTopicIdx] = useState(0);
  const [zgOpen, setZgOpen] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`gdiy-mode-${data.slug}`);
      if (saved === "etude" || saved === "combat" || saved === "live") setMode(saved);
    } catch { /* stockage indisponible */ }
  }, [data.slug]);
  const changerMode = (m: "etude" | "combat" | "live") => {
    setMode(m);
    try { localStorage.setItem(`gdiy-mode-${data.slug}`, m); } catch { /* ignore */ }
  };
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sb = useMemo(() => createClient(), []);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const presents = useMemo(
    () => Array.from(new Set(presences.map((p) => labelFromEmail(p.email)))),
    [presences]
  );
  /* Alerte de saisie (C2 du 27/07) : le canal de la PR 7 transporte aussi
     typing_at dans le payload de présence. Émission throttlée (1 s), retour à
     null après 3 s d'inactivité. Aucun canal ni table supplémentaire. */
  const channelRef = useRef<ReturnType<typeof sb.channel> | null>(null);
  const saisieTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saisieDernierTrack = useRef(0);
  const signalerSaisie = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const t = Date.now();
    if (t - saisieDernierTrack.current > 1000) {
      saisieDernierTrack.current = t;
      void ch.track({ email: data.viewer_email, typing_at: new Date(t).toISOString() });
    }
    if (saisieTimer.current) clearTimeout(saisieTimer.current);
    saisieTimer.current = setTimeout(() => {
      void ch.track({ email: data.viewer_email, typing_at: null });
    }, SAISIE_FRAICHEUR_MS);
  }, [data.viewer_email]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* Synchro : canal Realtime (événements + sessions + présence). Repli
     documenté : si le canal n'aboutit pas, polling toutes les 2 s. */
  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;
    const demarrerPolling = () => {
      if (poll) return;
      setSyncMode("polling");
      poll = setInterval(async () => {
        const { data: evs } = await sb
          .from("fiche_console_events")
          .select("id, session_id, created_at, author_email, kind, timecode, payload")
          .eq("fiche_id", data.fiche_id)
          .order("created_at")
          .limit(2000);
        if (evs) setEvents((prev) => (evs as ConsoleEvent[]).reduce((acc, e) => mergeEvent(acc, e), prev));
        const { data: ss } = await sb
          .from("fiche_rec_sessions")
          .select("id, started_at, ended_at, started_by, ended_by, email_envoye_at")
          .eq("fiche_id", data.fiche_id)
          .order("started_at");
        if (ss) setSessions(ss as RecSession[]);
      }, 2000);
    };
    const channel = sb
      .channel(`console-${data.fiche_id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "fiche_console_events", filter: `fiche_id=eq.${data.fiche_id}` }, (p) => {
        setEvents((prev) => mergeEvent(prev, p.new as ConsoleEvent));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fiche_rec_sessions", filter: `fiche_id=eq.${data.fiche_id}` }, (p) => {
        const s = p.new as RecSession;
        setSessions((prev) => [...prev.filter((x) => x.id !== s.id), s].sort((a, b) => a.started_at.localeCompare(b.started_at)));
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceOperateur>();
        setPresences(Object.values(state).flat().filter((m) => !!m.email));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSyncMode("realtime");
          void channel.track({ email: data.viewer_email });
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") demarrerPolling();
      });
    channelRef.current = channel;
    return () => {
      if (poll) clearInterval(poll);
      if (saisieTimer.current) clearTimeout(saisieTimer.current);
      channelRef.current = null;
      void sb.removeChannel(channel);
    };
  }, [sb, data.fiche_id, data.viewer_email]);

  /* Session d'enregistrement ouverte : source de vérité du REC (survit au
     rechargement, partagée entre opérateurs). */
  const openSession = sessions.find((s) => !s.ended_at) ?? null;
  const derniereClose = [...sessions].reverse().find((s) => s.ended_at) ?? null;
  const recStarted = !!openSession;
  const elapsed = openSession ? Math.max(0, Math.floor((now - new Date(openSession.started_at).getTime()) / 1000)) : 0;

  /* Écriture d'un événement : identité résolue côté serveur (défauts 0041),
     ajout optimiste avec id client, dédoublonné à l'écho realtime. */
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
        // Incident du 30/07 (enregistrement Chiche) : un onglet resté ouvert
        // longtemps porte une session périmée, l'écriture est refusée et le
        // message disparaissait EN SILENCE. Rafraîchir la session et
        // réessayer UNE fois, puis dire franchement l'échec.
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

  /* État réduit du flux d'événements (dernier événement gagne). */
  const checked = useMemo(() => reduceChecked(events), [events]);
  const { asked, askedAt } = useMemo(() => reduceAsked(events), [events]);
  const carnet = useMemo(
    () => carnetOf(events).map((e) => ({
      tag: (e.kind === "clip" ? "CLIP" : "NOTE") as "CLIP" | "NOTE",
      time: timeLabel(e, sessions),
      text: textOf(e) || (e.kind === "clip" ? "Moment fort marqué" : ""),
      who: labelFromEmail(e.author_email),
    })),
    [events, sessions]
  );
  const chat = useMemo(
    () => chatOf(events).map((e) => ({
      who: labelFromEmail(e.author_email),
      me: e.author_email === data.viewer_email,
      time: timeLabel(e, sessions),
      text: textOf(e),
      created_at: e.created_at,
    })),
    [events, sessions, data.viewer_email]
  );

  /* Tâche 8 (handoff 24/07) : dernier-lu par opérateur (événement en base),
     ligne de flottaison « non lus » et clignotement du bouton RÉGIE. */
  const monDernierLu = useMemo(() => dernierLu(events, data.viewer_email), [events, data.viewer_email]);
  const nonLus = useMemo(() => chatNonLus(events, data.viewer_email), [events, data.viewer_email]);
  const [estDesktop, setEstDesktop] = useState(false);
  const [panneauOuvert, setPanneauOuvert] = useState(true); // dock droit desktop
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const maj = () => setEstDesktop(mq.matches);
    maj();
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, []);
  const regieVisible = estDesktop ? panneauOuvert : chatOpen;
  // Marquage lu : quand la régie est visible, la borne avance jusqu'au dernier
  // message des autres. L'écho fait retomber nonLus à zéro (pas de boucle).
  useEffect(() => {
    if (!regieVisible || nonLus.length === 0) return;
    const jusquA = nonLus[nonLus.length - 1].created_at;
    if (jusquA > monDernierLu) sendEvent("lu", { jusqu_a: jusquA });
  }, [regieVisible, nonLus, monDernierLu, sendEvent]);
  // Ancre en bas du chat : à l'ouverture et à chaque message, la liste arrive
  // en bas (la flottaison non lus reste visible juste au-dessus).
  const listeRegieRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!regieVisible) return;
    const el = listeRegieRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [regieVisible, chat.length]);
  // Index du premier non lu (par rapport à la liste chat) pour la flottaison.
  const premierNonLu = useMemo(
    () => chat.findIndex((m) => !m.me && m.created_at > monDernierLu),
    [chat, monDernierLu]
  );

  /* Alerte de saisie : opérateurs distants en train d'écrire sur la fiche
     pendant le REC. `now` (tic 1 s) fait expirer les signaux périmés même si
     le retour à null s'est perdu ; hors REC la liste est toujours vide. */
  const saisiesActives = useMemo(
    () => saisiesEnCours(presences, data.viewer_email, recStarted, now),
    [presences, data.viewer_email, recStarted, now]
  );

  const doneCount = data.checklist.filter((_, i) => checked[i]).length;
  const checklistComplete = doneCount === data.checklist.length;

  const questionsTopics = data.topics.flatMap((t) => t.questions);
  const totalQuestionsTopics = questionsTopics.length;
  const askedTotal = (totalQuestionsTopics ? questionsTopics : data.questions).filter((q) => asked[q.num]).length;

  const toggleQuestion = (num: string) => { signalerSaisie(); sendEvent("question", { num, asked: !asked[num] }); };
  const toggleCheck = (index: number) => { signalerSaisie(); sendEvent("check", { index, checked: !checked[index] }); };
  const addNote = () => {
    const t = noteDraft.trim();
    if (!t) return;
    sendEvent("note", { text: t });
    setNoteDraft("");
  };
  const sendChat = () => {
    const t = chatDraft.trim();
    if (!t) return;
    sendEvent("chat", { text: t });
    setChatDraft("");
  };
  const markClip = () => {
    signalerSaisie();
    // Handoff v3.1 : le marqueur se rattache à la question en cours (première
    // non rayée du topic courant en live, sinon première non rayée).
    const source = mode === "live" && data.topics[topicIdx] ? data.topics[topicIdx].questions : data.topics.flatMap((t) => t.questions);
    const enCoursQ = (source.length ? source : data.questions).find((q) => !asked[q.num]);
    sendEvent("clip", { text: enCoursQ ? `Moment fort · Q${enCoursQ.num}` : "Moment fort marqué", ...(enCoursQ ? { num: enCoursQ.num } : {}) });
    if (mode !== "live") {
      setCarnetOpen(true);
      setChatOpen(false);
    }
  };

  /* REC : ouvre une session en base. STOP (A2) : confirmation explicite puis
     clôture par la route serveur (horodatage de fin, flux de fin d'épisode). */
  const startRec = async () => {
    if (!checklistComplete || openSession) return;
    const { data: row, error } = await sb
      .from("fiche_rec_sessions")
      .insert({ fiche_id: data.fiche_id, started_by: data.viewer_email })
      .select("id, started_at, ended_at, started_by, ended_by, email_envoye_at")
      .single();
    if (!error && row) setSessions((prev) => [...prev, row as RecSession]);
  };
  const stopRec = async () => {
    if (!openSession || stopEnCours) return;
    setStopEnCours(true);
    try {
      const res = await fetch(`/api/fiches/${data.slug}/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = (await res.json()) as { ok?: boolean; session?: RecSession; email?: string; email_detail?: string };
      if (body.ok && body.session) {
        const s = body.session;
        setSessions((prev) => [...prev.filter((x) => x.id !== s.id), s].sort((a, b) => a.started_at.localeCompare(b.started_at)));
      }
      setEmailStatut(body.email ?? null);
      setEmailDetail(body.email_detail ?? null);
    } finally {
      setStopEnCours(false);
      setStopConfirm(false);
    }
  };

  /* B1 : renvoi EXPLICITE des notes de la dernière session close. */
  const renvoyerNotes = async () => {
    if (renvoiEnCours) return;
    setRenvoiEnCours(true);
    try {
      const res = await fetch(`/api/fiches/${data.slug}/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resend: true }) });
      const body = (await res.json()) as { ok?: boolean; session?: RecSession; email?: string; email_detail?: string };
      if (body.ok && body.session) {
        const s = body.session;
        setSessions((prev) => [...prev.filter((x) => x.id !== s.id), s].sort((a, b) => a.started_at.localeCompare(b.started_at)));
      }
      setEmailStatut(body.email ?? null);
      setEmailDetail(body.email_detail ?? null);
    } finally {
      setRenvoiEnCours(false);
    }
  };

  /* B2 : timecode + libellé copiables, pour transmission au montage. */
  const copier = async (cle: string, texte: string) => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(cle);
      setTimeout(() => setCopie(null), 1500);
    } catch { /* clipboard indisponible : la sélection manuelle reste possible */ }
  };

  const numero = data.identite.numero ? `GDIY #${data.identite.numero}` : "GDIY";
  const v = data.visuels;
  const echecs = data.generation.filter((g) => g.statut === "failed");
  const enCours = data.generation.filter((g) => g.statut === "pending" || g.statut === "running");

  /* ─────────────── registre de rendu des sections (ordre par fiche) ─────────────── */

  const renderSection = (id: string): React.ReactNode => {
    switch (id) {
      case "tldr": {
        // 03 TL;DR : le brief d'attaque en 60 secondes, neuf labels en <dl>.
        // Fallback : la forme du 30/07 (puces sans label) des fiches non migrées.
        const tldrTexte: React.CSSProperties = { fontSize: mode === "combat" ? 18 : 16, lineHeight: 1.55, margin: 0 };
        if (data.tldr.length) {
          return (
            <section key={id} id="tldr" style={{ ...sectionStyle, scrollMarginTop: 64 }}>
              <div style={secHead}>
                <h2 style={h2Style}>TL;DR</h2>
                <span style={secNum}>03 · Brief d&apos;attaque · 60 secondes</span>
              </div>
              <dl style={{ margin: "16px 0 0", display: "flex", flexDirection: "column" }}>
                {data.tldr.map((t, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 16, padding: "10px 0", borderBottom: i < data.tldr.length - 1 ? `1px solid ${HAIRLINE_SOFT}` : "none" }}>
                    <dt style={{ fontFamily: T_COND, fontSize: 12, fontWeight: 600, letterSpacing: "0.01em", paddingTop: 3 }}>{t.label}</dt>
                    <dd style={tldrTexte}>{t.texte}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        }
        return data.tldr_legacy.length ? (
          <section key={id} id="tldr" style={{ ...sectionStyle, scrollMarginTop: 64 }}>
            <div style={secHead}>
              <h2 style={h2Style}>TL;DR</h2>
              <span style={secNum}>03</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {data.tldr_legacy.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: SUB, flexShrink: 0, minWidth: 24 }}>{pad2(i + 1)}</span>
                  <span style={tldrTexte}>{t}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null;
      }

      case "enjeu":
        return data.enjeu || data.lecon ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>L&apos;enjeu</h2>
            {data.enjeu && <p style={{ ...proseStyle, margin: "14px 0 0 0" }}>{data.enjeu}</p>}
            {data.lecon && (
              <div style={{ marginTop: 16, borderLeft: `3px solid ${JAUNE}`, paddingLeft: 14 }}>
                <span style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", fontWeight: 700 }}>Leçon transférable</span>
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
                <div style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", color: SUB_STRONG, fontWeight: 600 }}>Pairs et concurrents</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginTop: 10 }}>
                  {m.pairs.map((p, i) => (
                    <div key={i} style={{ ...cardStyle, padding: "12px 14px" }}>
                      <div style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>{p.nom}</div>
                      {p.position && <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 6 }}>{p.position}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {m.divergences.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <div style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", color: SUB_STRONG, fontWeight: 600 }}>Points de divergence</div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
                  {m.divergences.map((d, i) => (
                    <div key={i} style={{ display: "flex", gap: 16, padding: "12px 0", borderBottom: `1px solid ${HAIRLINE}`, alignItems: "baseline" }}>
                      <span style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: 30, lineHeight: 1, flexShrink: 0, minWidth: 56 }}>{d.date}</span>
                      <div>
                        <span style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600 }}>{d.decision}</span>
                        {d.effet && <span style={{ fontSize: 14, lineHeight: 1.5, color: SUB_STRONG }}> — {d.effet}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {m.contrefactuel && (
              <div style={{ marginTop: 18, borderLeft: `3px solid ${JAUNE}`, paddingLeft: 14 }}>
                <span style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", fontWeight: 700 }}>Contrefactuel · raisonnement, pas un fait</span>
                <p style={{ fontSize: 15, lineHeight: 1.55, margin: "6px 0 0 0", color: SUB_STRONG }}>{m.contrefactuel}</p>
              </div>
            )}
          </section>
        );
      }

      case "univers": {
        // Legacy (fiches non migrées) : intro + distinctions + timeline. Les
        // graphiques chiffrés se rendent dans data (section propriétaire v3.1).
        if (!data.univers_intro.length && !data.distinctions.length && !v.timeline) return null;
        return (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Univers / marché</h2>
            {data.univers_intro.map((p, i) => (
              <p key={i} style={{ ...proseStyle, margin: "14px 0 0 0" }}>{p}</p>
            ))}
            {data.distinctions.length > 0 && (
              <div style={{ marginTop: 18, ...cardStyle, padding: "12px 16px" }}>
                <span style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", fontWeight: 700 }}>Distinctions à tenir au micro</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {data.distinctions.map((d, i) => (
                    <span key={i} style={{ fontSize: 15, lineHeight: 1.5 }}>{d}</span>
                  ))}
                </div>
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
                        <span style={{ width: 11, height: 11, borderRadius: "50%", background: tl.cle ? INK : "#FFF", border: `1px solid ${INK}`, flexShrink: 0, marginTop: 6 }} />
                        <span style={{ width: 1, flex: 1, background: HAIRLINE }} />
                      </div>
                      <div style={{ padding: "0 0 24px 14px", display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>{tl.titre}</span>
                        {tl.texte && <span style={{ fontSize: 14, lineHeight: 1.5, color: SUB_STRONG }}>{tl.texte}</span>}
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
        const vide = !p.entourage.length && !p.donnees_cachees.length && !p.zone_grise.length && !p.items_legacy.length;
        if (vide) return null;
        return (
          <section key={id} style={sectionStyle}>
            <div style={secHead}>
              <h2 style={h2Style}>Personnel</h2>
              <span style={secNum}>08</span>
            </div>
            <div style={{ background: INK, color: INK_INVERT, fontFamily: T_COND, fontWeight: 600, fontSize: 12, padding: "10px 14px", marginTop: 14, borderRadius: 10 }}>{p.bandeau}</div>
            {p.entourage.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <div style={{ ...monoLabel, marginBottom: 10 }}>Entourage</div>
                <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "6px 16px", ...cardStyle, padding: "14px 16px" }}>
                  {p.entourage.map((e, i) => (
                    <div key={i} style={{ display: "contents" }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{e.nom}{e.role ? <span style={{ color: SUB, fontWeight: 400 }}> · {e.role}</span> : null}</span>
                      <span style={{ fontSize: 15, lineHeight: 1.55 }}>
                        {[e.eclaire, e.preconfirmer ? `À pré-confirmer avant plateau : ${e.preconfirmer}` : null].filter(Boolean).join(" ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(p.donnees_cachees.length > 0 || p.items_legacy.length > 0) && (
              <div style={{ marginTop: 22 }}>
                <div style={{ ...monoLabel, marginBottom: 10 }}>Données cachées</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...p.donnees_cachees, ...p.items_legacy].map((it, i) => (
                    <div key={i} style={{ ...cardStyle, padding: "12px 16px" }}>
                      <div style={{ fontSize: 15, lineHeight: 1.55 }}>{it.texte}</div>
                      <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginTop: 6 }}>
                        {"source" in it && it.source && <span style={{ fontFamily: T_COND, fontSize: 11, color: SUB }}>{it.source}</span>}
                        {"zg" in it && it.zg && <ZgChip zg={it.zg} onOpen={setZgOpen} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {p.zone_grise.length > 0 && (
              <div id="zonegrise" style={{ marginTop: 26, borderRadius: 14, overflow: "hidden", boxShadow: CARD_SHADOW }}>
                <div style={{ background: JAUNE, color: INK, fontFamily: T_COND, fontSize: 12, fontWeight: 600, padding: "10px 14px" }}>
                  Zone grise · ne rien affirmer de ce bloc à l&apos;antenne sans son statut · cible de tous les pointeurs ZG
                </div>
                <div style={{ border: `1px solid ${HAIRLINE}`, borderTop: "none" }}>
                  {p.zone_grise.map((z, i) => (
                    <div key={i} id={z.id || undefined} style={{ padding: "14px 16px", borderBottom: i < p.zone_grise.length - 1 ? `1px solid ${HAIRLINE_SOFT}` : "none", scrollMarginTop: 64 }}>
                      {z.id && <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: ZG_TEXT, marginBottom: 5 }}>{z.id}</div>}
                      <div style={{ fontSize: 15, lineHeight: 1.55 }}>{z.texte}</div>
                      {z.origine && <div style={{ fontFamily: T_COND, fontSize: 11, color: SUB, marginTop: 6 }}>{z.origine}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      }

      case "a_lire": {
        if (!data.a_lire.length) return null;
        const groupes: ("indispensable" | "utile" | "optionnel")[] = ["indispensable", "utile", "optionnel"];
        const sans = data.a_lire.filter((l) => !l.niveau);
        return (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>À lire la veille</h2>
            {[...groupes.map((n) => ({ label: NIVEAUX[n], items: data.a_lire.filter((l) => l.niveau === n) })), { label: "", items: sans }]
              .filter((g) => g.items.length)
              .map((g, gi) => (
                <div key={gi} style={{ marginTop: gi === 0 ? 14 : 20 }}>
                  {g.label && <div style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", fontWeight: 700 }}>{g.label}</div>}
                  <div style={{ display: "flex", flexDirection: "column", marginTop: 6, borderTop: `1px solid ${HAIRLINE}` }}>
                    {g.items.map((s, i) => {
                      const inner = (
                        <>
                          {s.date && <span style={{ fontFamily: MONO, fontSize: 12, color: SUB_STRONG, flexShrink: 0 }}>{s.date}</span>}
                          <span style={{ fontSize: 15, fontWeight: 600, textDecoration: s.url ? "underline" : "none", textUnderlineOffset: 3 }}>{s.titre}</span>
                          {s.temps_lecture && <span style={{ fontFamily: T_COND, fontSize: 11, color: SUB_STRONG }}>{s.temps_lecture}</span>}
                          {s.apport && <span style={{ fontSize: 13, color: SUB_STRONG }}>{s.apport}</span>}
                        </>
                      );
                      const style: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 14, padding: "14px 4px", borderBottom: `1px solid ${HAIRLINE}`, textDecoration: "none", flexWrap: "wrap" };
                      return s.url ? (
                        <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={style}>{inner}</a>
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
          <section key={id} style={{ marginTop: 52, background: INK, color: INK_INVERT, padding: "24px 24px 28px 24px", borderRadius: 14, boxShadow: CARD_SHADOW }}>
            <div style={{ fontFamily: T_COND, fontSize: 12, letterSpacing: "0.01em", color: LIVE_SUB }}>30 secondes avant d&apos;entrer</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20, marginTop: 16 }}>
              {data.trente_secondes.map((t, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontFamily: T_COND, fontWeight: 600, fontSize: 24, lineHeight: 1 }}>{t.label}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.5, color: LIVE_NOTE }}>{t.texte}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "data": {
        const aMarche = !!(data.marche && (data.marche.texte || data.marche.comparables.length));
        const aGraphes = !!((v.barres && v.barres.valeurs.length) || (v.comparaison && v.comparaison.valeurs.length) || (v.rentabilite && v.rentabilite.valeurs.length));
        if (!data.kpis.length && !aMarche && !aGraphes) return null;
        return (
          <section key={id} style={sectionStyle}>
            <div style={secHead}>
              <h2 style={h2Style}>Data</h2>
              <span style={secNum}>04</span>
            </div>
            {data.kpis.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 18 }}>
                {data.kpis.map((k, i) => (
                  <div key={i} style={{ ...cardStyle, padding: "16px 16px 14px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontFamily: T_COND, fontWeight: 600, fontSize: 38, lineHeight: 1 }}>{k.valeur}</span>
                      {k.zg && <span style={{ marginLeft: "auto" }}><ZgChip zg={k.zg} onOpen={setZgOpen} /></span>}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.4, marginTop: 8 }}>{k.libelle}</div>
                    {k.source && <div style={{ fontFamily: T_COND, fontSize: 11, color: SUB, marginTop: 8 }}>{k.source}</div>}
                  </div>
                ))}
              </div>
            )}
            {v.barres && v.barres.valeurs.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={{ ...monoLabel, marginBottom: 14 }}>{v.barres.titre}{v.barres.source ? ` · ${v.barres.source}` : ""}</div>
                {v.barres.note && <p style={{ fontSize: 14, color: SUB, margin: "0 0 10px", maxWidth: 520 }}>{v.barres.note}</p>}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 28, height: 150, borderBottom: `2px solid ${INK}`, padding: "0 8px" }}>
                  {(() => {
                    const max = Math.max(...v.barres!.valeurs.map((b) => b.valeur), 1);
                    return v.barres!.valeurs.map((b, i) => (
                      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, justifyContent: "flex-end", height: "100%", flex: 1 }}>
                        <span style={{ fontFamily: T_COND, fontWeight: 600, fontSize: 16, color: b.plein ? INK : SUB }}>{b.affiche}</span>
                        <div style={{ width: "100%", maxWidth: 56, height: `${Math.max(3, Math.round((b.valeur / max) * 100))}%`, background: b.plein ? INK : MUTED_BAR, borderRadius: "6px 6px 0 0" }} />
                      </div>
                    ));
                  })()}
                </div>
                <div style={{ display: "flex", gap: 28, padding: "6px 8px 0" }}>
                  {v.barres.valeurs.map((b, i) => (
                    <span key={i} style={{ flex: 1, textAlign: "center", fontFamily: T_COND, fontSize: 11, color: SUB }}>{b.label}</span>
                  ))}
                </div>
              </div>
            )}
            {v.comparaison && v.comparaison.valeurs.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={{ ...monoLabel, marginBottom: 14 }}>{v.comparaison.titre ?? "Comparaison"}{v.comparaison.source ? ` · ${v.comparaison.source}` : ""}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {(() => {
                    const max = Math.max(...v.comparaison!.valeurs.map((g) => Math.abs(g.pct)), 1);
                    return v.comparaison!.valeurs.map((g, i) => (
                      <div key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                          <span>{g.nom}</span>
                          <span style={{ fontFamily: T_COND, fontWeight: 600 }}>{g.affiche}</span>
                        </div>
                        <div style={{ height: 14, borderRadius: 6, background: g.hero ? INK : MUTED_BAR, width: `${Math.max(4, Math.round((Math.abs(g.pct) / max) * 100))}%` }} />
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
            {v.rentabilite && v.rentabilite.valeurs.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={{ ...monoLabel, marginBottom: 14 }}>{v.rentabilite.titre ?? "Rentabilité"}{v.rentabilite.source ? ` · ${v.rentabilite.source}` : ""}</div>
                {v.rentabilite.note && <p style={{ fontSize: 14, color: SUB, margin: "0 0 10px", maxWidth: 520 }}>{v.rentabilite.note}</p>}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {v.rentabilite.valeurs.map((m, i) => (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                        <span>{m.label}</span>
                        <span style={{ fontFamily: T_COND, fontWeight: 600 }}>{m.affiche}</span>
                      </div>
                      <div style={{ height: 14, borderRadius: 6, background: INK, width: `${Math.max(0, Math.min(100, m.pct))}%` }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aMarche && (
              <div style={{ ...cardStyle, padding: "14px 16px", marginTop: 26 }}>
                <div style={{ ...monoLabel, marginBottom: 10 }}>Marché et comparables</div>
                {data.marche!.texte && <p style={{ fontSize: 15, lineHeight: 1.5, margin: "0 0 10px" }}>{data.marche!.texte}</p>}
                {data.marche!.comparables.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", fontSize: 15, lineHeight: 1.5 }}>
                    {data.marche!.comparables.map((p, i) => (
                      <div key={i}><span style={{ fontWeight: 600 }}>{p.nom}</span>{p.position ? ` : ${p.position}` : ""}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      }

      case "parcours":
        return data.parcours.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Parcours</h2>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
              {data.parcours.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 16, padding: "10px 0", borderBottom: `1px solid ${HAIRLINE}`, alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, flexShrink: 0, width: 44 }}>{p.annee}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5 }}>{p.texte}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "apprentissages":
        return data.apprentissages.items.length ? (
          <section key={id} style={sectionStyle}>
            <div style={secHead}>
              <h2 style={h2Style}>Apprentissages</h2>
              <span style={secNum}>05 · Connu / manque / question</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
              {data.apprentissages.items.map((pb, i) => (
                <div key={i} style={{ padding: "18px 0", borderBottom: `1px solid ${HAIRLINE_SOFT}` }}>
                  <div style={{ fontFamily: T_COND, fontWeight: 600, fontSize: 20, letterSpacing: "-0.012em", marginBottom: 10 }}>{pb.titre}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: "6px 14px" }}>
                    {pb.connu && (<><span style={{ fontFamily: T_COND, fontSize: 11, fontWeight: 600, color: SUB, paddingTop: 3 }}>Connu</span><span style={{ fontSize: mode === "combat" ? 17 : 15, lineHeight: 1.55 }}>{pb.connu}</span></>)}
                    {pb.manque && (<><span style={{ fontFamily: T_COND, fontSize: 11, fontWeight: 600, color: SUB, paddingTop: 3 }}>Manque</span><span style={{ fontSize: mode === "combat" ? 17 : 15, lineHeight: 1.55 }}>{pb.manque}</span></>)}
                    {pb.question && (<><span style={{ fontFamily: T_COND, fontSize: 11, fontWeight: 600, color: INK, paddingTop: 3 }}>Question</span><span style={{ fontSize: mode === "combat" ? 19 : 17, lineHeight: 1.45, fontWeight: 600 }}>{pb.question}</span></>)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "entourage":
        return data.entourage_legacy.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Entourage</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginTop: 14 }}>
              {data.entourage_legacy.map((e, i) => (
                <div key={i} style={{ ...cardStyle, padding: "14px 16px" }}>
                  <div style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>{e.nom}</div>
                  {e.role && <div style={{ ...monoSrc, marginTop: 4 }}>{e.role}</div>}
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
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14, borderTop: `1px solid ${HAIRLINE}` }}>
              {data.anecdotes.map((a, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "13px 4px", borderBottom: `1px solid ${HAIRLINE}`, ...(a.cachee ? { background: PAPER_TINT, borderLeft: `3px solid ${JAUNE}`, paddingLeft: 12, borderRadius: 10 } : {}) }}>
                  {a.cachee && <span style={{ fontFamily: T_COND, fontSize: 10, letterSpacing: "0.01em", fontWeight: 700 }}>Bonus · bien cachée</span>}
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
                <div key={i} style={{ ...cardStyle, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <span style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", color: SUB_STRONG, fontWeight: 600 }}>Tension {pad2(i + 1)}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600 }}>{tn.a}</span>
                  <span style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>Vs</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600 }}>{tn.b}</span>
                  {tn.angle && <span style={{ fontSize: 13, lineHeight: 1.5, color: SUB_STRONG, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 10 }}>{tn.angle}</span>}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "questions_recurrentes":
        return data.recurrentes.items.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Déjà répondu partout</h2>
            <p style={{ fontSize: 14, color: SUB_STRONG, margin: "8px 0 0 0" }}>{data.recurrentes.intro ?? "Interdiction de les reposer telles quelles. Matériau pour les dépasser."}</p>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14, borderTop: `1px solid ${HAIRLINE}` }}>
              {data.recurrentes.items.map((r, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "13px 4px", borderBottom: `1px solid ${HAIRLINE}` }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{r.question}</span>
                  {r.reponse && <span style={{ fontSize: 13, color: SUB_STRONG }}>Réponse rodée : {r.reponse}</span>}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "clips": {
        // 06 Clips : les questions qui fâchent ferment la liste, filet rouge
        // au-dessus de la première.
        if (!data.clips.length) return null;
        const premierFache = data.clips.findIndex((c) => c.fache);
        return (
          <section key={id} id="clips" style={{ ...sectionStyle, scrollMarginTop: 64 }}>
            <div style={secHead}>
              <h2 style={h2Style}>Clips</h2>
              <span style={secNum}>06 · Questions frontales · les questions qui fâchent ferment la liste</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
              {data.clips.map((rs, i) => {
                const [ressort, ...resteMeta] = (rs.meta ?? "").split(" · ");
                return (
                  <div key={i} style={{ padding: "14px 0", borderBottom: `1px solid ${HAIRLINE_SOFT}`, borderTop: i === premierFache && i > 0 ? `2px solid ${ROUGE}` : undefined }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                      {ressort && <span style={{ fontFamily: T_COND, fontSize: 10, fontWeight: 600, background: INK, color: INK_INVERT, padding: "3px 8px", borderRadius: 999 }}>{ressort}</span>}
                      {rs.fache && <span style={{ fontFamily: T_COND, fontSize: 11, fontWeight: 600, color: ROUGE }}>Question qui fâche</span>}
                      {rs.zg && <ZgChip zg={rs.zg} onOpen={setZgOpen} />}
                    </div>
                    <div style={{ fontSize: mode === "combat" ? 19 : 17, lineHeight: 1.45, fontWeight: 600 }}>{rs.question}</div>
                    {resteMeta.length > 0 && (
                      <div style={{ fontFamily: T_COND, fontSize: 12, lineHeight: 1.5, color: SUB, marginTop: 6 }}>Pourquoi ça clippe · {resteMeta.join(" · ")}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      }

      case "topics": {
        // 07 Topics : terrain connu puis topics à questions cœur numérotées en
        // continu, rayables d'un tap (timecode de SESSION pour le montage).
        // Les timecodes d'épisode (gate times) ne s'affichent plus (03/08).
        if (!data.terrain_connu.length && !data.topics.length) return null;
        const qFs = mode === "combat" ? 19 : 17;
        return (
          <section key={id} id="topics" style={{ ...sectionStyle, scrollMarginTop: 64 }}>
            <div style={secHead}>
              <h2 style={h2Style}>Topics</h2>
              <span style={secNum}>07 · {data.topics.length} topics · {totalQuestionsTopics || data.questions.length} questions · {askedTotal} posée(s)</span>
            </div>
            {data.terrain_connu.length > 0 && (
              <div style={{ ...cardStyle, padding: 16, marginTop: 16 }}>
                <div style={{ ...monoLabel, marginBottom: 12 }}>Terrain connu · réponse rodée + dépassement</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {data.terrain_connu.map((r, i) => (
                    <div key={i}>
                      <div style={{ fontSize: qFs, lineHeight: 1.45, fontWeight: 600 }}>{r.question}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "4px 12px", marginTop: 6 }}>
                        {r.reponse && (<><span style={{ fontFamily: T_COND, fontSize: 11, fontWeight: 600, color: SUB, paddingTop: 2 }}>Rodée</span><span style={{ fontSize: mode === "combat" ? 17 : 15, lineHeight: 1.55 }}>{r.reponse}</span></>)}
                        {r.depassement && (<><span style={{ fontFamily: T_COND, fontSize: 11, fontWeight: 600, color: INK, paddingTop: 2 }}>Dépassement</span><span style={{ fontSize: mode === "combat" ? 17 : 15, lineHeight: 1.55 }}>{r.depassement}</span></>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
              {data.topics.map((t, ti) => (
                <div key={ti} style={{ padding: "20px 16px", margin: "0 -16px", borderBottom: `1px solid ${HAIRLINE_SOFT}` }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                    <h3 style={{ ...h3Style, flex: 1 }}>{t.titre}</h3>
                  </div>
                  {t.intention && <p style={{ fontSize: mode === "combat" ? 17 : 15, lineHeight: 1.55, margin: "8px 0 4px", maxWidth: "72ch" }}>{t.intention}</p>}
                  <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
                    {t.questions.map((q) => {
                      const rayee = !!asked[q.num];
                      return (
                        <div key={q.num} onClick={() => toggleQuestion(q.num)} style={{ display: "flex", gap: 12, padding: "10px 12px", cursor: "pointer", borderRadius: 10, borderLeft: `2px solid ${rayee ? HAIRLINE : JAUNE}`, marginBottom: 6, opacity: rayee ? 0.45 : 1, background: rayee ? "transparent" : "#FFFFFF", boxShadow: rayee ? "none" : CARD_SHADOW, transition: "160ms ease" }}>
                          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, minWidth: 32, paddingTop: 3 }}>{q.num}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: qFs, lineHeight: 1.45, fontWeight: 600, textDecoration: rayee ? "line-through" : "none" }}>{q.texte}</div>
                            {q.note && <div style={{ fontFamily: T_COND, fontSize: 12, lineHeight: 1.55, color: SUB, marginTop: 4 }}>{q.note}</div>}
                          </div>
                          {q.zg && <span style={{ alignSelf: "flex-start", marginTop: 4 }}><ZgChip zg={q.zg} onOpen={setZgOpen} /></span>}
                          {rayee && <span style={{ fontFamily: MONO, fontSize: 11, color: SUB, paddingTop: 5 }}>{askedAt[q.num]}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      }

      case "revue_de_presse": {
        const r = data.revue_de_presse;
        if (!r.reseaux.length && !r.palmares.length && !r.a_lire.length) return null;
        return (
          <section key={id} style={sectionStyle}>
            <div style={secHead}>
              <h2 style={h2Style}>Revue de presse</h2>
              <span style={secNum}>09</span>
            </div>
            {r.reseaux.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                {r.reseaux.map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: T_COND, fontSize: 12, border: `1px solid ${INK}`, padding: "6px 12px", borderRadius: 999, textDecoration: "none", transition: "160ms ease" }}>{l.label}</a>
                ))}
              </div>
            )}
            {r.palmares.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ ...monoLabel, marginBottom: 10 }}>Palmarès</div>
                <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "6px 16px" }}>
                  {r.palmares.map((p, i) => (
                    <div key={i} style={{ display: "contents" }}>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>{p.date ?? ""}</span>
                      <span style={{ fontSize: 15, lineHeight: 1.5 }}>{p.texte}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {r.a_lire.length > 0 && (
              <div style={{ marginTop: 26 }}>
                <div style={{ ...monoLabel, marginBottom: 10 }}>À lire la veille</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {r.a_lire.map((l, i) => (
                    <div key={i} style={{ ...cardStyle, padding: "12px 16px", display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
                      {l.niveau && (
                        <span style={l.niveau === "indispensable"
                          ? { fontFamily: T_COND, fontSize: 10, fontWeight: 600, background: INK, color: INK_INVERT, padding: "3px 8px", borderRadius: 999 }
                          : { fontFamily: T_COND, fontSize: 10, fontWeight: 600, border: `1px solid ${INK}`, color: INK, padding: "2px 8px", borderRadius: 999 }}>
                          {NIVEAUX[l.niveau] ?? l.niveau}
                        </span>
                      )}
                      {l.url ? (
                        <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: 16 }}>{l.titre}</a>
                      ) : (
                        <span style={{ fontWeight: 600, fontSize: 16 }}>{l.titre}</span>
                      )}
                      {l.temps_lecture && <span style={{ fontFamily: T_COND, fontSize: 11, color: SUB }}>{l.temps_lecture}</span>}
                      {l.date && <span style={{ fontFamily: MONO, fontSize: 11, color: SUB }}>{l.date}</span>}
                      {l.apport && <span style={{ fontSize: 15, lineHeight: 1.5, flexBasis: "100%" }}>{l.apport}</span>}
                    </div>
                  ))}
                </div>
                {r.sources_total > 0 && (
                  <div style={{ fontFamily: T_COND, fontSize: 12, color: SUB, marginTop: 12 }}>
                    Sources complètes conservées en base · {r.sources_total} · get_section sources dans Magellan
                  </div>
                )}
              </div>
            )}
          </section>
        );
      }

      case "sequencage":
        // Refonte conversation (27/07) : le déroulé minuté est supprimé, la
        // section stockée des anciennes fiches n'est plus affichée.
        return null;

      case "polemiques":
        // Refonte du 30/07 : le fait public sourcé et la question qui fâche.
        return data.polemiques.length ? (
          <section key={id} style={sectionStyle}>
            <h2 style={h2Style}>Polémiques</h2>
            <p style={{ fontSize: 14, color: SUB_STRONG, margin: "8px 0 0 0", maxWidth: 620 }}>Controverses publiques documentées. La question se pose sur le fait, jamais sur la rumeur.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
              {data.polemiques.map((p, i) => (
                <div key={i} style={{ ...cardStyle, borderLeft: `4px solid ${ROUGE}`, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", color: SUB_STRONG, fontWeight: 600 }}>Polémique {pad2(i + 1)}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5 }}>
                    {p.texte} {p.source && <span style={monoSrc}>({p.source})</span>}
                  </span>
                  {p.question && (
                    <div style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 10 }}>
                      <span style={{ fontFamily: T_COND, fontSize: 10, letterSpacing: "0.01em", fontWeight: 700 }}>La question qui fâche</span>
                      <p style={{ fontSize: 16, lineHeight: 1.45, margin: "4px 0 0 0", fontWeight: 600 }}>{p.question}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "dix_questions":
        // Des PROPOSITIONS à plat, jamais un script : la conversation les
        // amène. Tape une question quand elle est posée : elle se raye avec
        // le timecode (état partagé entre opérateurs).
        return data.questions.length ? (
          <section key={id} style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h2 style={h2Style}>Les questions</h2>
              <span style={{ fontFamily: T_COND, fontSize: 12, color: SUB_STRONG }}>{askedTotal} / {data.questions.length} posées</span>
            </div>
            <p style={{ fontSize: 14, color: SUB_STRONG, margin: "8px 0 0 0", maxWidth: 620 }}>Des propositions, pas un script : la conversation décide. Tape une question quand elle est posée, elle se raye avec le timecode.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
              {data.questions.map((q) => {
                const isAsked = !!asked[q.num];
                return (
                  <div key={q.num} onClick={() => toggleQuestion(q.num)} style={{ cursor: "pointer", ...cardStyle, padding: "16px 18px", display: "flex", gap: 14, alignItems: "flex-start", opacity: isAsked ? 0.45 : 1, background: isAsked ? PAPER_SUNK : "#FFF", transition: "160ms ease" }}>
                    <span style={{ fontFamily: T_COMP, fontWeight: 700, fontSize: 40, lineHeight: 0.85, color: MUTED_BAR, flexShrink: 0, minWidth: 34 }}>{q.num}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                      <span style={{ fontSize: 18, lineHeight: 1.35, fontWeight: 600, textDecoration: isAsked ? "line-through" : "none" }}>{q.texte}</span>
                      {q.note && <span style={{ fontFamily: T_COND, fontSize: 12, lineHeight: 1.6, color: SUB_STRONG }}>{q.note}</span>}
                      {isAsked && <span style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", color: "#1F9D6B", fontWeight: 700 }}>Posée · {askedAt[q.num]}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null;

      case "zone_grise":
        return data.zone_grise.length ? (
          <section key={id} style={{ marginTop: 52, background: PAPER_TINT, borderRadius: 14, boxShadow: CARD_SHADOW, padding: "20px 22px" }}>
            <div style={{ fontFamily: T_COND, fontSize: 12, letterSpacing: "0.01em", fontWeight: 700 }}>Zone grise : à faire dire par l&apos;invité</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {data.zone_grise.map((z, i) => (
                <div key={i} id={z.id || undefined} style={{ fontSize: 15, lineHeight: 1.5, borderLeft: `2px solid ${JAUNE}`, paddingLeft: 12 }}>
                  {z.id && (
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.01em", background: INK, color: "#FFF", padding: "1px 6px", borderRadius: 6, marginRight: 8, verticalAlign: "middle" }}>
                      ZG: {z.id.replace(/^zg_/, "")}
                    </span>
                  )}
                  {z.texte} {z.origine && <span style={monoSrc}>({z.origine})</span>}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "sources":
        // v3.1 : la liste exhaustive reste en base ; la revue de presse
        // affiche les indispensables et renvoie vers Magellan pour le reste.
        return null;

      default:
        return null;
    }
  };

  // Ordre par fiche (colonne position, défaut au catalogue). Zone étude avant
  // le bandeau console (tldr, data, apprentissages + lecture des contrats
  // précédents), console ensuite (clips, topics, personnel, revue de presse
  // + fallback des fiches non migrées). Le chrome se rend en dur.
  const ordreContenu = data.ordre.filter((idSec) => !CHROME.has(idSec));
  const ordreA = ordreContenu.filter((idSec) => ZONE_ETUDE.has(idSec));
  const ordreB = ordreContenu.filter((idSec) => !ZONE_ETUDE.has(idSec));

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 120, background: mode === "live" ? LIVE_BG : PAPER, color: mode === "live" ? INK_INVERT : INK, paddingRight: estDesktop && panneauOuvert && mode !== "live" ? 376 : undefined }}>
      {/* 00 · Sticky : nom + société, ancres, commutateur de modes, zone REC. */}
      <header style={{ position: "sticky", top: 0, zIndex: 60, background: INK, color: INK_INVERT, display: "flex", alignItems: "center", gap: 16, height: 56, padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <span style={{ fontFamily: T_COND, fontWeight: 600, fontSize: 22, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{data.invite_nom}</span>
          <span className="fiche-societe" style={{ fontFamily: MONO, fontSize: 11, color: LIVE_SUB, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {data.identite.societe ? `${data.identite.societe} · ${numero}` : numero}
          </span>
        </div>
        {/* Trois ancres d'accès direct (H-1 mobile), masquées sous 560 px. */}
        {mode !== "live" ? (
          <nav className="fiche-ancres" style={{ display: "flex", gap: 4, margin: "0 auto" }}>
            {[["#tldr", "TL;DR"], ["#clips", "Clips"], ["#topics", "Questions"]].map(([href, label]) => (
              <a key={href} href={href} style={{ fontFamily: T_COND, fontSize: 12, color: INK_INVERT, textDecoration: "none", padding: "6px 10px", borderRadius: 10, border: `1px solid ${LIVE_HAIRLINE}`, transition: "160ms ease" }}>{label}</a>
            ))}
          </nav>
        ) : (
          <div style={{ margin: "0 auto" }} />
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", border: `1px solid ${LIVE_HAIRLINE}`, borderRadius: 10, overflow: "hidden" }}>
            {([["etude", "Étude"], ["combat", "Combat"], ["live", "Live"]] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => changerMode(m)}
                style={{ fontFamily: T_COND, fontSize: 12, fontWeight: 600, letterSpacing: "0.01em", padding: "7px 9px", border: "none", cursor: "pointer", background: mode === m ? INK_INVERT : "transparent", color: mode === m ? INK : LIVE_SUB, transition: "160ms ease" }}
              >
                {label}
              </button>
            ))}
          </div>
          {recStarted ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, background: ROUGE, borderRadius: "50%", animation: "gdiy-recpulse 1.2s infinite" }} />
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{fmt(elapsed)}</span>
              {/* STOP (A2) : confirmation deux temps, SÛR ? retombe seul après 3 s
                  (un clic accidentel à 3 h d'enregistrement est inacceptable). */}
              <button
                onClick={() => {
                  if (!stopConfirm) {
                    setStopConfirm(true);
                    if (stopTimer.current) clearTimeout(stopTimer.current);
                    stopTimer.current = setTimeout(() => setStopConfirm(false), 3000);
                    return;
                  }
                  if (stopTimer.current) clearTimeout(stopTimer.current);
                  void stopRec();
                }}
                disabled={stopEnCours}
                style={{ fontFamily: T_COND, fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 10, cursor: "pointer", border: `1px solid ${stopConfirm ? ROUGE : LIVE_HAIRLINE}`, background: stopConfirm ? ROUGE : "transparent", color: "#fff", transition: "160ms ease" }}
              >
                {stopEnCours ? "Clôture…" : stopConfirm ? "Sûr ?" : "Stop"}
              </button>
            </div>
          ) : (
            <button
              onClick={startRec}
              disabled={!checklistComplete}
              style={{ fontFamily: T_COND, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 10, cursor: checklistComplete ? "pointer" : "not-allowed", border: "none", background: checklistComplete ? ROUGE : LIVE_HAIRLINE, color: checklistComplete ? "#fff" : SUB, transition: "160ms ease" }}
            >
              {checklistComplete ? (derniereClose ? "REC (nouvelle session) »" : "REC »") : `REC · ${doneCount}/${data.checklist.length}`}
            </button>
          )}
        </div>
      </header>

      {/* ── MODE LIVE : un topic à la fois, navigation MANUELLE (les timecodes
          d'épisode sont retirés, décision Matthieu du 03/08 : ni gate times,
          ni temps restant, ni topic auto). Écran à distance de bras : questions
          en gros, notes en second niveau, zéro décoration. ── */}
      {mode === "live" && (() => {
        const topicsLive = data.topics.length
          ? data.topics
          : [{ titre: "Les questions", intention: undefined as string | undefined, questions: data.questions }];
        const idx = Math.min(topicIdx, topicsLive.length - 1);
        const topic = topicsLive[idx];
        const suivant = topicsLive[idx + 1];
        return (
          <div style={{ maxWidth: 980, width: "100%", margin: "0 auto", padding: "28px 24px 140px", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${LIVE_HAIRLINE}`, paddingBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => setTopicIdx(Math.max(0, idx - 1))} style={{ background: "none", border: `1px solid ${LIVE_HAIRLINE}`, color: INK_INVERT, fontFamily: T_COND, fontSize: 14, padding: "8px 14px", borderRadius: 10, cursor: "pointer", transition: "160ms ease" }}>←</button>
                <button onClick={() => setTopicIdx(Math.min(topicsLive.length - 1, idx + 1))} style={{ background: "none", border: `1px solid ${LIVE_HAIRLINE}`, color: INK_INVERT, fontFamily: T_COND, fontSize: 14, padding: "8px 14px", borderRadius: 10, cursor: "pointer", transition: "160ms ease" }}>→</button>
              </div>
              <div style={{ fontFamily: T_COND, fontSize: 13, color: LIVE_SUB }}>Topic {idx + 1}/{topicsLive.length}</div>
            </div>
            <h1 style={{ fontFamily: T_COND, fontWeight: 600, letterSpacing: "-0.02em", fontSize: 44, lineHeight: 1.05, margin: "22px 0 6px" }}>{topic.titre}</h1>
            {topic.intention && <p style={{ fontSize: 19, lineHeight: 1.5, color: LIVE_NOTE, margin: "0 0 8px", maxWidth: "70ch" }}>{topic.intention}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 18 }}>
              {topic.questions.map((q) => {
                const rayee = !!asked[q.num];
                return (
                  <div key={q.num} onClick={() => toggleQuestion(q.num)} style={{ display: "flex", gap: 16, padding: "14px 16px", cursor: "pointer", borderRadius: 14, opacity: rayee ? 0.38 : 1, background: rayee ? "transparent" : LIVE_CARD, transition: "160ms ease" }}>
                    <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, color: JAUNE, paddingTop: 8, minWidth: 36 }}>{q.num}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 34, lineHeight: 1.25, fontWeight: 600, textDecoration: rayee ? "line-through" : "none", maxWidth: "30ch" }}>{q.texte}</div>
                      {q.note && <div style={{ fontFamily: T_COND, fontSize: 13, lineHeight: 1.55, color: SUB, marginTop: 6 }}>{q.note}</div>}
                      {q.zg && (
                        <div style={{ marginTop: 8 }}>
                          <ZgChip zg={q.zg} onOpen={setZgOpen} outline />
                        </div>
                      )}
                    </div>
                    {rayee && <span style={{ fontFamily: MONO, fontSize: 12, color: SUB_STRONG, paddingTop: 10 }}>{askedAt[q.num]}</span>}
                  </div>
                );
              })}
              {topic.questions.length === 0 && (
                <p style={{ fontSize: 16, color: LIVE_SUB }}>Aucune question sur ce topic.</p>
              )}
            </div>
            {suivant && (
              <div style={{ borderTop: `1px solid ${LIVE_HAIRLINE}`, marginTop: 26, paddingTop: 14, fontFamily: T_COND, fontSize: 13, color: SUB }}>Suivant · {suivant.titre}</div>
            )}
          </div>
        );
      })()}

      {mode !== "live" && (
      <main style={{ maxWidth: mode === "combat" ? 600 : 760, margin: "0 auto", padding: "0 20px", fontSize: mode === "combat" ? 17 : 15 }}>
        {/* Gate anti fiche vide (chantier 2 §3.1) : une section obligatoire vide
            rend la fiche non présentable, l'état est dit franchement, avec la cause. */}
        {data.incompletes.length > 0 && (
          <div style={{ marginTop: 16, background: ROUGE, color: "#FFF", padding: "18px 20px", borderRadius: 14, boxShadow: CARD_SHADOW }}>
            <div style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 32, lineHeight: 1.1, letterSpacing: "-0.014em" }}>Fiche incomplète · non présentable</div>
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: "10px 0 0 0" }}>
              Section(s) obligatoire(s) vide(s) : <b>{data.incompletes.map((id) => TITRE_OF.get(id) ?? id).join(", ")}</b>.
            </p>
            <p style={{ fontFamily: T_COND, fontSize: 12, lineHeight: 1.5, margin: "8px 0 0 0", opacity: 0.9 }}>
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
          <div style={{ marginTop: 16, borderLeft: `3px solid ${JAUNE}`, padding: "10px 14px", background: HAIRLINE_SOFT, borderRadius: 10 }}>
            <span style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", fontWeight: 700 }}>Génération en échec : {echecs.map((g) => g.groupe).join(" · ")}</span>
            <p style={{ fontSize: 14, lineHeight: 1.5, margin: "6px 0 0 0" }}>Relancer via Claude : « regénère le groupe {echecs[0].groupe} de la fiche {data.invite_nom} ».</p>
          </div>
        )}
        {echecs.length === 0 && enCours.length > 0 && (
          <div style={{ marginTop: 16, ...cardStyle, padding: "10px 14px" }}>
            <span style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em" }}>Génération en cours : {enCours.map((g) => g.groupe).join(" · ")} — recharger la page fait avancer.</span>
          </div>
        )}

        {/* 01 · Identité */}
        <section id="identite" style={{ padding: "44px 0 8px" }}>
          {/* Fil d'Ariane (A3.4) + statut, en tête de page. */}
          <div style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", color: SUB, marginBottom: 10, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>
              <a href="/" style={{ color: SUB, textDecoration: "none" }}>Board</a>
              {" / "}
              <a href="/fiches" style={{ color: SUB, textDecoration: "none" }}>Fiches</a>
              {" / "}
              <span style={{ color: SUB_STRONG }}>{data.invite_nom}</span>
            </span>
            <span>Statut : {data.statut} · v{data.version} · {numero}</span>
          </div>
          <div style={{ fontFamily: T_COND, fontSize: 12, color: SUB, letterSpacing: "0.01em" }}>01 · Identité</div>
          {(() => {
            // Le titre est cliquable vers Wikipedia quand la page existe
            // (règle systématique), sinon LinkedIn, sinon rien.
            const lienTitre = data.identite.liens.find((l) => /wikipedia/i.test(l.url)) ?? data.identite.liens.find((l) => /linkedin/i.test(l.url)) ?? null;
            const h1Inner = data.identite.titre_lignes.join(" ");
            return (
              <h1 style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 52, lineHeight: 1.05, margin: "10px 0 4px", letterSpacing: "-0.02em" }}>
                {lienTitre ? (
                  <a href={lienTitre.url} target="_blank" rel="noopener noreferrer" title={lienTitre.label} style={{ textDecorationThickness: 3 }}>{h1Inner}</a>
                ) : h1Inner}
              </h1>
            );
          })()}
          {data.identite.societe && (
            <div style={{ fontSize: 18, fontWeight: 600, margin: "2px 0" }}>{data.identite.societe}</div>
          )}
          {data.identite.date_naissance && (
            <div style={{ fontFamily: T_COND, fontSize: 13, color: SUB_STRONG, margin: "6px 0 14px" }}>
              Né le {new Date(data.identite.date_naissance).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              {data.identite.age !== undefined ? ` · ${data.identite.age} ans au jour de l'enregistrement` : ""}
            </div>
          )}
          {(data.identite.pilules.length > 0 || data.identite.liens.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {data.identite.pilules.map((p, i) => (
                <span key={i} style={{ fontFamily: T_COND, fontSize: 12, fontWeight: 500, background: INK, color: INK_INVERT, padding: "6px 12px", borderRadius: 999 }}>{p}</span>
              ))}
              {data.identite.liens.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ fontFamily: T_COND, fontSize: 12, border: `1px solid ${INK}`, padding: "6px 12px", borderRadius: 999, textDecoration: "none", transition: "160ms ease" }}>{l.label} »</a>
              ))}
            </div>
          )}
          {/* Champs saisis à la main : état vide « à confirmer » obligatoire. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", ...cardStyle, padding: "14px 16px", marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: T_COND, fontSize: 11, color: SUB, letterSpacing: "0.01em" }}>Accompagnants</div>
              {data.identite.accompagnants.length > 0 ? (
                <div style={{ fontSize: 15, marginTop: 3 }}>{data.identite.accompagnants.map((a) => `${a.nom}${a.fonction ? ` (${a.fonction})` : ""}`).join(", ")}</div>
              ) : (
                <div style={{ fontSize: 15, color: SUB, fontStyle: "italic", marginTop: 3 }}>à confirmer</div>
              )}
            </div>
            <div>
              <div style={{ fontFamily: T_COND, fontSize: 11, color: SUB, letterSpacing: "0.01em" }}>Mise en relation</div>
              {data.identite.mise_en_relation ? (
                <div style={{ fontSize: 15, marginTop: 3 }}>{[data.identite.mise_en_relation.qui, data.identite.mise_en_relation.canal].filter(Boolean).join(", ")}</div>
              ) : (
                <div style={{ fontSize: 15, color: SUB, fontStyle: "italic", marginTop: 3 }}>à confirmer</div>
              )}
            </div>
          </div>
          {data.identite.sous_titre && (
            <p style={{ fontSize: mode === "combat" ? 20 : 18, lineHeight: 1.55, margin: 0, maxWidth: "65ch" }}>{data.identite.sous_titre}</p>
          )}
        </section>

        {/* 02 · Checklist pré-rec : fusion visuelle 5e case + REC (le clic REC
            reste un geste séparé dans le sticky, décision Matthieu du 31/07). */}
        <section style={{ padding: "34px 0" }}>
          <div style={{ fontFamily: T_COND, fontSize: 12, color: SUB, letterSpacing: "0.01em", marginBottom: 14 }}>02 · Checklist pré-rec · {doneCount}/{data.checklist.length}</div>
          <div style={{ ...cardStyle, overflow: "hidden" }}>
            {data.checklist.map((label, i) => {
              const done = !!checked[i];
              const derniere = i === data.checklist.length - 1;
              const fusion = derniere && checklistComplete;
              return (
                <div
                  key={i}
                  onClick={() => toggleCheck(i)}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderBottom: i < data.checklist.length - 1 ? `1px solid ${HAIRLINE_SOFT}` : "none", cursor: "pointer", background: fusion ? INK : "transparent", color: fusion ? INK_INVERT : INK, transition: "160ms ease" }}
                >
                  <span style={{ width: 22, height: 22, boxSizing: "border-box", borderRadius: 6, border: `2px solid ${fusion ? JAUNE : done ? INK : MUTED_BAR}`, background: done ? (fusion ? JAUNE : INK) : "transparent", color: fusion ? INK : INK_INVERT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0, transition: "160ms ease" }}>
                    {done ? "✓" : ""}
                  </span>
                  <span style={{ fontSize: mode === "combat" ? 18 : 16, flex: 1, textDecoration: done ? "line-through" : "none", color: done ? (fusion ? LIVE_SUB : SUB) : "inherit" }}>{label}</span>
                  {derniere && (
                    <span style={{ fontFamily: T_COND, fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 999, background: checklistComplete ? JAUNE : HAIRLINE_SOFT, color: checklistComplete ? INK : SUB, whiteSpace: "nowrap" }}>
                      {checklistComplete ? (recStarted ? "REC en cours" : "REC déverrouillé →") : `Verrouille REC · ${doneCount}/${data.checklist.length}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontFamily: T_COND, fontSize: 12, color: SUB, marginTop: 10 }}>Checklist complète = REC déverrouillé dans le bandeau. Le clic REC reste un geste séparé.</div>
        </section>

        {/* ── BLOC A : comprendre (mode lecture) ── */}
        {ordreA.map(renderSection)}

        {/* ── Séparation nette : la console commence ici ── */}
        <div id="console" style={{ marginTop: 44, background: INK, color: INK_INVERT, padding: "12px 16px", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderRadius: 14 }}>
          <span style={{ fontFamily: T_COND, fontWeight: 600, fontSize: 24, lineHeight: 1.1, letterSpacing: "-0.014em" }}>Console d&apos;épisode</span>
          <span style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", color: LIVE_SUB }}>À scanner pendant l&apos;enregistrement</span>
        </div>

        {/* ── BLOC B : console ── */}
        {ordreB.map(renderSection)}

        {/* Carnet (B2) : où vivent moments clés, clips, notes et régie après la
            session. Clips en tête, timecode + libellé copiables pour le montage.
            L'email B1 et cette vue sont les deux seuls canaux, pas d'export. */}
        {(carnet.length > 0 || chat.length > 0 || derniereClose) && (
          <section id="carnet" style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontFamily: T_COND, fontWeight: 700, fontSize: 30, lineHeight: 1.1, letterSpacing: "-0.018em", margin: 0 }}>Carnet</h2>
              <span style={{ fontFamily: T_COND, fontSize: 11, color: SUB_STRONG, letterSpacing: "0.01em" }}>{carnet.filter((x) => x.tag === "CLIP").length} clip(s) · {carnet.filter((x) => x.tag === "NOTE").length} note(s)</span>
            </div>
            {/* État du flux de fin (B1) : envoi, non configuré, échec + renvoyer. */}
            {derniereClose && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", color: SUB_STRONG }}>
                <span>
                  {derniereClose.email_envoye_at
                    ? `Notes envoyées ${new Date(derniereClose.email_envoye_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}`
                    : emailStatut === "non_configure"
                      ? "Email non envoyé : destinataires non configurés (NOTES_EPISODE_EMAILS)"
                      : emailStatut === "echec"
                        ? `Email en échec${emailDetail ? ` : ${emailDetail}` : ""}`
                        : "Notes non envoyées"}
                </span>
                <button
                  onClick={renvoyerNotes}
                  disabled={renvoiEnCours}
                  style={{ border: `1px solid ${HAIRLINE_STRONG}`, borderRadius: 10, background: "none", cursor: "pointer", font: "inherit", padding: "4px 10px", transition: "160ms ease" }}
                >
                  {renvoiEnCours ? "Envoi…" : derniereClose.email_envoye_at ? "Renvoyer" : "Envoyer"}
                </button>
                {carnet.some((x) => x.tag === "CLIP") && (
                  <button
                    onClick={() => copier("tous-clips", carnet.filter((x) => x.tag === "CLIP").map((x) => `${x.time} · ${x.text}`).join("\n"))}
                    style={{ border: `1px solid ${HAIRLINE_STRONG}`, borderRadius: 10, background: "none", cursor: "pointer", font: "inherit", padding: "4px 10px", transition: "160ms ease" }}
                  >
                    {copie === "tous-clips" ? "Copié" : "Copier tous les clips"}
                  </button>
                )}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
              {carnet.length === 0 && (
                <p style={{ fontSize: 14, color: SUB_STRONG, margin: "8px 0" }}>Aucune saisie pendant cette session.</p>
              )}
              {[...carnet].sort((a, b) => (a.tag === b.tag ? 0 : a.tag === "CLIP" ? -1 : 1)).map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "10px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: item.tag === "CLIP" ? ROUGE : INK, flexShrink: 0 }}>{item.tag} {item.time}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.5, flex: 1, userSelect: "text" }}><TexteLie texte={item.text} /></span>
                  <span style={{ fontFamily: T_COND, fontSize: 11, color: SUB, flexShrink: 0 }}>{item.who}</span>
                  {item.tag === "CLIP" && (
                    <button
                      onClick={() => copier(`clip-${i}`, `${item.time} · ${item.text}`)}
                      style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 999, background: "none", cursor: "pointer", fontFamily: T_COND, fontSize: 10, letterSpacing: "0.01em", padding: "3px 8px", flexShrink: 0, transition: "160ms ease" }}
                      title="Copier timecode et libellé pour le montage"
                    >
                      {copie === `clip-${i}` ? "Copié" : "Copier"}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {chat.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", color: SUB_STRONG, fontWeight: 600 }}>Régie pendant le REC</div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
                  {chat.map((m, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "8px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
                      <span style={{ fontFamily: T_COND, fontSize: 11, color: SUB_STRONG, flexShrink: 0 }}>{m.who} · {m.time}</span>
                      <span style={{ fontSize: 14, lineHeight: 1.5, color: SUB_STRONG }}><TexteLie texte={m.text} /></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Journal de génération (contrat §3.6). */}
        {data.generation.length > 0 && (
          <div style={{ marginTop: 40, fontFamily: T_COND, fontSize: 11, lineHeight: 1.8, color: SUB }}>
            Journal de génération : {data.generation.map((g) => `${g.groupe} ${g.statut}`).join(" · ")}
          </div>
        )}

        <footer style={{ marginTop: 24, borderTop: `2px solid ${HAIRLINE_STRONG}`, padding: "18px 0 60px", fontFamily: T_COND, fontSize: 13, fontWeight: 600, letterSpacing: "0.01em", lineHeight: 1.8, color: INK }}>
          {data.footer}
        </footer>
      </main>
      )}

      {/* Drawer carnet */}
      {carnetOpen && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 64, zIndex: 70, display: "flex", justifyContent: "center", padding: "0 12px" }}>
          <div style={{ width: "100%", maxWidth: 680, background: "#FFF", color: INK, borderRadius: 18, boxShadow: FRAME_SHADOW, maxHeight: "55vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${HAIRLINE}`, padding: "6px 8px 6px 16px" }}>
              <span style={{ fontFamily: T_COND, fontSize: 12, letterSpacing: "0.01em", fontWeight: 700 }}>Carnet</span>
              <button onClick={() => setCarnetOpen(false)} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: T_COND, fontSize: 12, letterSpacing: "0.01em", padding: 10, borderRadius: 10, transition: "160ms ease" }}>Fermer ×</button>
            </div>
            <div style={{ overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {carnet.length === 0 && (
                <span style={{ fontSize: 14, color: SUB_STRONG }}>Rien pour l&apos;instant. CLIP marque un moment fort avec le timecode, la note capture une idée à la volée.</span>
              )}
              {carnet.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: item.tag === "CLIP" ? ROUGE : INK, flexShrink: 0 }}>{item.tag} {item.time}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.5, flex: 1 }}><TexteLie texte={item.text} /></span>
                  <span style={{ fontFamily: T_COND, fontSize: 11, color: SUB, flexShrink: 0 }}>{item.who}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", borderTop: `1px solid ${HAIRLINE}` }}>
              <input value={noteDraft} onChange={(e) => { signalerSaisie(); setNoteDraft(e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} placeholder="Note rapide, entrée pour valider" style={{ flex: 1, border: "none", outline: "none", padding: "14px 16px", fontSize: 15, fontFamily: "inherit", background: PAPER, minWidth: 0 }} />
              <button onClick={addNote} style={{ border: "none", background: INK, color: "#FFF", cursor: "pointer", padding: "0 20px", fontFamily: T_COND, fontSize: 12, letterSpacing: "0.01em", transition: "160ms ease" }}>Noter</button>
            </div>
          </div>
        </div>
      )}

      {/* Régie (tâche 8) : panneau latéral droit FIXE sur desktop, tiroir bas
          sur mobile. Même corps dans les deux : statut, liste avec ligne de
          flottaison NON LUS, saisie. Ancre en bas de liste. */}
      {(() => {
        const corps = (
          <>
            {/* Alerte de saisie (C2 du 27/07) : bandeau fixe en haut de la
                régie, rouge, clignotement 800 ms, tant qu'un autre opérateur
                écrit sur la fiche pendant le REC. Intra UI uniquement. */}
            {saisiesActives.length > 0 && (
              <div style={{ flexShrink: 0, background: ROUGE, color: "#FFF", padding: "8px 16px", fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", fontWeight: 700, animation: "gdiy-saisie 800ms linear infinite" }}>
                Saisie en cours sur la fiche par {saisiesActives.join(", ")}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${HAIRLINE}`, padding: "6px 8px 6px 16px", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: T_COND, fontSize: 12, letterSpacing: "0.01em", fontWeight: 700 }}>Régie</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: T_COND, fontSize: 11, color: SUB_STRONG }}>
                  <span style={{ width: 7, height: 7, background: syncMode === "realtime" ? "#29B37C" : JAUNE, borderRadius: 999 }} />
                  {presents.length > 1 ? `En ligne : ${presents.join(" · ")}` : syncMode === "realtime" ? "Partagé · temps réel" : "Partagé · synchro 2 s"}
                </span>
              </div>
              <button onClick={() => (estDesktop ? setPanneauOuvert(false) : setChatOpen(false))} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: T_COND, fontSize: 12, letterSpacing: "0.01em", padding: 10, borderRadius: 10, transition: "160ms ease" }}>Fermer ×</button>
            </div>
            <div ref={listeRegieRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {chat.length === 0 && (
                <span style={{ fontSize: 14, color: SUB_STRONG }}>Aucun message. La régie est partagée entre les opérateurs connectés.</span>
              )}
              {chat.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {i === premierNonLu && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ flex: 1, height: 1, background: ROUGE }} />
                      <span style={{ fontFamily: T_COND, fontSize: 10, letterSpacing: "0.01em", color: ROUGE, fontWeight: 700 }}>Non lus</span>
                      <span style={{ flex: 1, height: 1, background: ROUGE }} />
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: m.me ? "flex-end" : "flex-start" }}>
                    <span style={{ fontFamily: T_COND, fontSize: 10, letterSpacing: "0.01em", color: SUB }}>{m.who} · {m.time}</span>
                    <span style={{ fontSize: 14, lineHeight: 1.5, background: m.me ? INK : HAIRLINE_SOFT, color: m.me ? "#FFF" : INK, padding: "8px 12px", borderRadius: 16, maxWidth: "85%" }}><TexteLie texte={m.text} /></span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", borderTop: `1px solid ${HAIRLINE}`, flexShrink: 0 }}>
              <input value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder="Message à la régie" style={{ flex: 1, border: "none", outline: "none", padding: "14px 16px", fontSize: 15, fontFamily: "inherit", background: PAPER, minWidth: 0 }} />
              <button onClick={sendChat} style={{ border: "none", background: INK, color: "#FFF", cursor: "pointer", padding: "0 20px", fontFamily: MONO, fontSize: 14, transition: "160ms ease" }}>»</button>
            </div>
          </>
        );
        if (estDesktop) {
          return panneauOuvert ? (
            <aside style={{ position: "fixed", top: 52, right: 0, bottom: 0, width: 360, zIndex: 65, background: "#FFF", color: INK, borderLeft: `1px solid ${HAIRLINE}`, boxShadow: FRAME_SHADOW, display: "flex", flexDirection: "column" }}>
              {corps}
            </aside>
          ) : null;
        }
        return chatOpen ? (
          <div style={{ position: "fixed", left: 0, right: 0, bottom: 64, zIndex: 70, display: "flex", justifyContent: "center", padding: "0 12px" }}>
            <div style={{ width: "100%", maxWidth: 680, background: "#FFF", color: INK, borderRadius: 18, boxShadow: FRAME_SHADOW, maxHeight: "55vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {corps}
            </div>
          </div>
        ) : null;
      })()}

      {/* Échec d'écriture (incident du 30/07) : dit franchement, plus jamais
          un message qui disparaît en silence. */}
      {erreurEnvoi && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 64, zIndex: 85, background: ROUGE, color: "#FFF", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "center", borderRadius: 14, boxShadow: RAISED_SHADOW }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{erreurEnvoi}</span>
          <button onClick={() => setErreurEnvoi(null)} style={{ border: "1px solid #FFF", background: "none", color: "#FFF", cursor: "pointer", fontFamily: T_COND, fontSize: 11, letterSpacing: "0.01em", padding: "3px 10px", borderRadius: 999 }}>OK</button>
        </div>
      )}

      {/* Barre d'actions fixe : CLIP jaune (le rouge est réservé au REC).
          En live : CLIP + compteur + ligne de flottaison régie (jamais
          superposée aux questions), RÉGIE en accès direct. */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 80, background: INK, borderTop: `1px solid ${LIVE_HAIRLINE}`, display: "flex", alignItems: "stretch", height: 64 }}>
        <button onClick={markClip} style={{ border: "none", cursor: "pointer", background: JAUNE, color: INK, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: T_COND, fontWeight: 600, fontSize: 22, letterSpacing: "-0.012em", padding: "0 28px", transition: "160ms ease" }}>
          Clip <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{carnet.filter((c) => c.tag === "CLIP").length}</span>
        </button>
        {mode === "live" ? (
          <>
            <span style={{ display: "flex", alignItems: "center", fontFamily: T_COND, fontSize: 12, color: LIVE_SUB, padding: "0 16px", whiteSpace: "nowrap" }}>
              rattaché à la question en cours
            </span>
            {chat.length > 0 && (
              <span style={{ display: "flex", alignItems: "center", fontFamily: T_COND, fontSize: 12, color: SUB, marginLeft: "auto", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", padding: "0 12px", minWidth: 0, flex: 1, justifyContent: "flex-end" }}>
              Régie · {chat[chat.length - 1].who} : {chat[chat.length - 1].text}
              </span>
            )}
            <button
              onClick={() => { if (estDesktop) setPanneauOuvert(!panneauOuvert); else setChatOpen(!chatOpen); setCarnetOpen(false); }}
              style={{ border: "none", borderLeft: `1px solid ${LIVE_HAIRLINE}`, cursor: "pointer", background: regieVisible ? INK_INVERT : INK, color: regieVisible ? INK : INK_INVERT, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: T_COND, fontSize: 12, fontWeight: 600, padding: "0 18px", transition: "160ms ease", animation: nonLus.length > 0 && !regieVisible ? "gdiy-blink 1.1s steps(2, start) infinite" : undefined }}
            >
              Régie {nonLus.length > 0 && !regieVisible ? `· ${nonLus.length}` : ""}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => { setCarnetOpen(!carnetOpen); setChatOpen(false); }} style={{ flex: 1, border: "none", borderLeft: `1px solid ${LIVE_HAIRLINE}`, cursor: "pointer", background: carnetOpen ? INK_INVERT : INK, color: carnetOpen ? INK : INK_INVERT, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: T_COND, fontWeight: 600, fontSize: 22, letterSpacing: "-0.012em", transition: "160ms ease" }}>
              Carnet <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 400 }}>{carnet.length}</span>
            </button>
            <button
              onClick={() => {
                if (estDesktop) setPanneauOuvert(!panneauOuvert);
                else setChatOpen(!chatOpen);
                setCarnetOpen(false);
              }}
              style={{
                flex: 1, border: "none", borderLeft: `1px solid ${LIVE_HAIRLINE}`, cursor: "pointer",
                background: regieVisible ? INK_INVERT : INK, color: regieVisible ? INK : INK_INVERT,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                fontFamily: T_COND, fontWeight: 600, fontSize: 22, letterSpacing: "-0.012em",
                transition: "160ms ease",
                // Tâche 8 : clignote tant que des messages non lus attendent, régie fermée.
                animation: nonLus.length > 0 && !regieVisible ? "gdiy-blink 1.1s steps(2, start) infinite" : undefined,
              }}
            >
              Régie <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 400 }}>{nonLus.length > 0 && !regieVisible ? `${nonLus.length} non lu(s)` : chat.length}</span>
            </button>
          </>
        )}
      </div>

      {/* Popover zone grise : l'item complet au tap, sans navigation (repli :
          les ancres #zg_xxx existent toujours dans la section personnel). */}
      {zgOpen && (() => {
        const item = data.personnel.zone_grise.find((z) => z.id === zgOpen) ?? data.zone_grise.find((z) => z.id === zgOpen) ?? null;
        return (
          <div onClick={() => setZgOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(32,31,28,.55)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={(ev) => ev.stopPropagation()} style={{ background: INK, color: INK_INVERT, maxWidth: 640, width: "100%", margin: "0 16px 24px", borderRadius: 18, boxShadow: FRAME_SHADOW, overflow: "hidden" }}>
              <div style={{ background: JAUNE, height: 6 }} />
              <div style={{ padding: "20px 24px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: JAUNE }}>Zone grise · {zgOpen}</span>
                  <button onClick={() => setZgOpen(null)} style={{ background: "none", border: `1px solid ${LIVE_HAIRLINE}`, color: INK_INVERT, fontFamily: T_COND, fontSize: 12, padding: "5px 12px", borderRadius: 10, cursor: "pointer", transition: "160ms ease" }}>Fermer</button>
                </div>
                <div style={{ fontSize: 18, lineHeight: 1.55 }}>
                  {item ? item.texte : "Item introuvable dans la zone grise. Voir la section Personnel."}
                </div>
                {item?.origine && <div style={{ fontFamily: T_COND, fontSize: 12, color: LIVE_SUB, marginTop: 12 }}>{item.origine}</div>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

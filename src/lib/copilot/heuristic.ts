// Copilote en mode démo (sans clé API) : réponses heuristiques calées sur la
// même discipline que le vrai copilote. Donne un aperçu complet hors-ligne.

import { getCibles, getCibleDossier } from "../data";
import { getFreeSlots } from "../calendar";
import { CONTACT_LABELS } from "../domain";
import {
  ARCHETYPE_LABELS,
  CONSEIL_LABELS,
  computeResurgence,
  SIGNAL_LABELS,
} from "../domain";
import type { CibleEnrichie, Show } from "../types";

function ranked(cibles: CibleEnrichie[]): CibleEnrichie[] {
  return [...cibles].sort((a, b) => {
    if (a.voie !== b.voie) return a.voie === "froid" ? -1 : 1;
    return computeResurgence(b).score - computeResurgence(a).score;
  });
}

function dispoAnswer(show: Show, cibles: CibleEnrichie[]): string {
  const top = ranked(cibles).slice(0, 4);
  if (top.length === 0) return "Aucune cible dans ce show pour l'instant.";

  const lines = top.map((c) => {
    const r = computeResurgence(c);
    const qui =
      show.type_pipe === "invites"
        ? c.archetype
          ? ARCHETYPE_LABELS[c.archetype]
          : "à classer"
        : c.raison_de_selection ?? "raison à préciser";
    const pourquoi = r.raison ?? "pas de raison fraîche, à laisser mûrir";
    const conseil =
      r.conseil !== "relancer" ? ` (${CONSEIL_LABELS[r.conseil]})` : "";
    return `- ${c.nom} — ${qui}. Voie ${c.voie}. Pourquoi maintenant : ${pourquoi}${conseil}.`;
  });

  return [
    "Pour ce créneau, voici qui engager, voie froide en tête :",
    "",
    ...lines,
    "",
    "Je propose, je ne remplis pas à la mitraillette. Dis-moi si tu veux le dossier d'une cible ou un message prêt à envoyer.",
  ].join("\n");
}

function appuisAnswer(cibles: CibleEnrichie[]): string {
  const withAppuis = cibles.filter((c) => c.nb_appuis > 0);
  if (withAppuis.length === 0)
    return "Aucun appui identifié pour l'instant. Ajoute-les dans les dossiers cibles pour que je puisse t'orienter vers la bonne porte.";
  const lines = withAppuis.map(
    (c) => `- ${c.nom} : ${c.nb_appuis} appui(s) à activer. Ouvre le dossier pour le contact exact.`
  );
  return ["Les portes ouvrables :", "", ...lines].join("\n");
}

async function draftAnswer(
  show: Show,
  cibles: CibleEnrichie[],
  text: string
): Promise<string> {
  // Cherche une cible nommée dans la demande.
  const target = cibles.find((c) =>
    text.toLowerCase().includes(c.nom.toLowerCase())
  );
  const nom = target?.nom ?? "[nom]";
  const sujet = target?.sujets?.[0];
  const accroche =
    show.type_pipe === "invites"
      ? `votre parcours${sujet ? ` autour de ${sujet}` : ""}`
      : `votre maison${sujet ? ` et son rapport à ${sujet}` : ""}`;

  // Meilleure voie de contact : contacts enrichis, sinon via_qui / canal réel.
  let route = "";
  if (target) {
    const { contacts } = await getCibleDossier(target.id);
    const best = [...contacts].sort((a, b) => b.confiance - a.confiance)[0];
    if (best) {
      route = `Voie conseillée : ${CONTACT_LABELS[best.kind].toLowerCase()} — ${best.valeur}${best.label ? ` (${best.label})` : ""}.`;
    } else if (target.via_qui) {
      route = `Voie conseillée : via ${target.via_qui}${target.canal_reel ? ` sur ${target.canal_reel}` : ""}.`;
    } else {
      route =
        "Aucun contact en base : lance « Enrichir » depuis le dossier pour trouver par où passer.";
    }
  }

  return [
    `Brouillon, style maison (sobre, direct, sans emoji) :`,
    "",
    `Bonjour ${nom},`,
    "",
    `Je produis ${show.nom}. On y prend le temps d'un vrai entretien, sans complaisance et sans esbroufe. ${accroche.charAt(0).toUpperCase() + accroche.slice(1)} a sa place dans ce que l'on raconte.`,
    "",
    `Si le principe vous parle, je vous propose qu'on en discute dix minutes pour caler le fond et un créneau.`,
    "",
    `Bien à vous,`,
    route ? "" : "",
    route ? `Note — ${route}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

function analyseAnswer(cibles: CibleEnrichie[]): string {
  const fresh = cibles.filter((c) => c.signal_frais && c.dernier_signal_type);
  const stale = cibles.filter(
    (c) => (c.jours_depuis_touche ?? 0) >= 14 && !c.signal_frais
  );
  const out: string[] = ["Lecture rapide du pipe :", ""];
  if (fresh.length)
    out.push(
      `Fenêtres ouvertes (actualité fraîche) : ${fresh
        .map((c) => `${c.nom} (${SIGNAL_LABELS[c.dernier_signal_type!]})`)
        .join(", ")}.`
    );
  if (stale.length)
    out.push(
      `Silence prolongé sans raison fraîche : ${stale
        .map((c) => c.nom)
        .join(", ")} — attendre un signal ou passer par un appui.`
    );
  if (out.length === 2) out.push("Rien de saillant pour l'instant.");
  return out.join("\n");
}

async function slotsAnswer(
  show: Show,
  cibles: CibleEnrichie[],
  providerToken?: string | null
): Promise<string> {
  const { slots, demo } = await getFreeSlots(providerToken);
  if (slots.length === 0)
    return "Aucun créneau libre repéré sur les 7 prochains jours.";
  const top = ranked(cibles).slice(0, 3);
  const lines = slots.slice(0, 4).map((s, i) => {
    const c = top[i % top.length];
    if (!c) return `- ${s.label}`;
    const r = computeResurgence(c);
    return `- ${s.label} → ${c.nom}${r.raison ? ` (${r.raison})` : ""}`;
  });
  return [
    demo
      ? "Créneaux à venir (démo — branche Google Calendar pour le réel), avec une cible en face :"
      : "Créneaux libres à venir, avec une cible en face :",
    "",
    ...lines,
    "",
    "Je propose, je ne remplis pas à la mitraillette. À toi de confirmer.",
  ].join("\n");
}

export async function heuristicReply(
  show: Show,
  showId: string,
  lastMessage: string,
  providerToken?: string | null
): Promise<string> {
  const t = lastMessage.toLowerCase();
  const cibles = await getCibles(showId);

  const intentSlots = /\b(calendrier|agenda|libre|libres|quand suis|mes cr[ée]neaux|free)\b/.test(t);

  const intentDispo = /\b(dispo|disponib|créneau|creneau|qui|quoi|propos|remplir|slot|engager|cibler?|entreprise|marque|traiter|prioris|maintenant|semaine|prochaine?|prendre|sortir|invit)\b/.test(t);
  const intentAppui = /\b(appui|porte|intro|recommand|introduc)\b/.test(t);
  const intentDraft = /\b(message|écris|ecris|rédige|redige|mail|dm|relance|contacte?r?|brouillon)\b/.test(t);
  const intentAnalyse = /\b(analyse|avanc|tendance|bilan|état|etat du pipe)\b/.test(t);

  if (intentDraft) return draftAnswer(show, cibles, lastMessage);
  if (intentAppui) return appuisAnswer(cibles);
  if (intentAnalyse) return analyseAnswer(cibles);
  if (intentSlots) return slotsAnswer(show, cibles, providerToken);
  if (intentDispo) return dispoAnswer(show, cibles);

  return [
    "Mode démo (sans clé IA branchée) — je raisonne sur les données locales. Je peux :",
    "",
    "- proposer qui ou quoi engager pour un créneau (« qui pour mardi ? »),",
    "- regarder tes créneaux libres et mettre une cible en face (« mes créneaux libres ? »),",
    "- te montrer les appuis qui ouvrent une porte (« quels appuis ? »),",
    "- rédiger un message au style maison (« écris à Tony Parker »),",
    "- lire le pipe (« analyse l'état du pipe »).",
    "",
    "Branche ANTHROPIC_API_KEY pour activer le copilote conversationnel complet.",
  ].join("\n");
}

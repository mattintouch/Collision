// Migration v3.1 (brief du 31/07) : mapping PUR et testé des sections des
// contrats précédents vers le contrat v3.1. Rien ne se perd : ce qui migre
// change de section, ce qui ne migre pas est documenté en perte assumée et
// reste dans le versionnement (writeSection archive avant d'écraser).
//
// Idempotente : les sections sources vidées au premier passage ne produisent
// plus rien au second ; les items déjà présents dans la cible (même texte
// normalisé) ne sont jamais doublés.
//
// La passe de rédaction se relance APRÈS la migration : elle réécrit le TL;DR
// en neuf labels propres, répartit les questions migrées en topics à gate
// times et élague le palmarès. La migration est STRUCTURELLE, pas rédactionnelle.

import { asArray, asString, asStringArray, isEmptyContent, TLDR_LABELS } from "./schema";

type Content = Record<string, unknown>;

export interface ResultatMigration {
  /** Contenus v3.1 à écrire (fusionnés avec l'existant, sans doublon). */
  ecrits: Record<string, Content>;
  /** Sections sources à vider (contenu archivé par le versionnement). */
  vides: string[];
  /** Table de migration lisible, section par section (debrief). */
  table: string[];
  /** Pertes assumées (contenu archivé, non reporté). */
  pertes: string[];
}

const norme = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Ajoute à `cible` les items de `nouveaux` absents (par champ texte normalisé). */
function fusionne<T>(cible: T[], nouveaux: T[], cle: (x: T) => string): { liste: T[]; ajoutes: number } {
  const vus = new Set(cible.map((x) => norme(cle(x))));
  const ajouts = nouveaux.filter((x) => {
    const k = norme(cle(x));
    if (!k || vus.has(k)) return false;
    vus.add(k);
    return true;
  });
  return { liste: [...cible, ...ajouts], ajoutes: ajouts.length };
}

const tronqueMot = (s: string, max: number) => {
  if (s.length <= max) return s;
  const coupe = s.slice(0, max - 1).replace(/\s+\S*$/, "");
  return `${coupe || s.slice(0, max - 1)}…`;
};

/**
 * Calcule la migration v3.1 d'une fiche depuis la carte de ses sections
 * (ids CANONIQUES : entete arrive en identite, chiffres en data, playbook en
 * apprentissages, questions_reseaux en clips via les alias de lecture).
 */
export function migrerFicheV31(sections: Record<string, Content>): ResultatMigration {
  const get = (id: string): Content => sections[id] ?? {};
  const ecrits: Record<string, Content> = {};
  const vides: string[] = [];
  const table: string[] = [];
  const pertes: string[] = [];

  const nonVide = (id: string) => !isEmptyContent(get(id));
  const videApres = (id: string) => { if (nonVide(id)) vides.push(id); };

  // ── 03 TL;DR : squelette depuis trente_secondes + enjeu + mécanique +
  // polémiques. La passe de rédaction réécrit ensuite les neuf labels. ──
  {
    const existants = asArray(get("tldr").items, (x) => {
      const label = asString(x.label); const texte = asString(x.texte);
      return label && texte ? { label, texte } : null;
    });
    const parLabel = new Map(existants.map((t) => [t.label, t.texte]));
    const pose = (label: (typeof TLDR_LABELS)[number], texte?: string) => {
      if (texte && !parLabel.has(label)) parLabel.set(label, tronqueMot(texte, 240));
    };
    const trente = new Map(
      asArray(get("trente_secondes").items, (x) => {
        const label = asString(x.label); const texte = asString(x.texte);
        return label && texte ? { label, texte } : null;
      }).map((t) => [norme(t.label), t.texte])
    );
    pose("Qui", trente.get("qui"));
    pose("Fait d'armes", trente.get("fait d armes"));
    pose("Pourquoi maintenant", trente.get("pourquoi maintenant"));
    pose("État d'esprit", trente.get("etat d esprit"));
    pose("Fil rouge", asString(get("enjeu").texte));
    pose("Le comment", asString(get("mecanique_succes").definition));
    const pol0 = asArray(get("polemiques").items, (x) => asString(x.texte) ?? null)[0];
    pose("Polémique", pol0);
    if (parLabel.size > existants.length) {
      ecrits.tldr = { items: TLDR_LABELS.filter((l) => parLabel.has(l)).map((label) => ({ label, texte: parLabel.get(label)! })) };
      table.push(`tldr : squelette posé depuis trente_secondes (${trente.size} labels), enjeu.texte (Fil rouge), mecanique.definition (Le comment)${pol0 ? ", polemiques (Polémique)" : ""} ; la passe de rédaction réécrit les neuf labels`);
    }
    videApres("trente_secondes");
    videApres("enjeu");
    videApres("recit_canonique");
    if (nonVide("recit_canonique")) pertes.push("recit_canonique : prose de synthèse non reportée telle quelle (archivée en versions) ; le TL;DR réécrit par la passe de rédaction la remplace");
  }

  // ── 04 Data : kpis déjà là par alias (chiffres) ; univers → marche +
  // graphiques ; pairs de la mécanique → comparables. ──
  {
    const data = { ...get("data") } as Content;
    let change = false;
    const univers = get("univers");
    const introUnivers = asStringArray(univers.intro);
    const distinctions = asStringArray(univers.distinctions);
    const marche = (data.marche && typeof data.marche === "object" ? { ...(data.marche as Content) } : {}) as Content;
    if (!asString(marche.texte) && (introUnivers.length || distinctions.length)) {
      marche.texte = tronqueMot([...introUnivers, ...distinctions].join(" "), 900);
      change = true;
    }
    const pairs = asArray(get("mecanique_succes").pairs, (x) => {
      const nom = asString(x.nom);
      return nom ? { nom, position: asString(x.position) } : null;
    });
    const comparablesActuels = asArray(marche.comparables, (x) => {
      const nom = asString(x.nom);
      return nom ? { nom, position: asString(x.position) } : null;
    });
    if (pairs.length) {
      const f = fusionne(comparablesActuels, pairs, (p) => p.nom);
      if (f.ajoutes) { marche.comparables = f.liste; change = true; }
    }
    if (Object.keys(marche).length) data.marche = marche;
    for (const g of ["barres", "comparaison", "rentabilite"] as const) {
      if (!data[g] && univers[g]) { data[g] = univers[g]; change = true; }
    }
    if (change) {
      ecrits.data = data;
      table.push(`data : marché depuis univers.intro (${introUnivers.length} points) et distinctions (${distinctions.length}), comparables depuis mecanique.pairs (${pairs.length}), graphiques d'univers repris (2 max au stockage) ; les KPI de chiffres arrivent par renommage`);
    }
    if (!isEmptyContent(univers)) {
      vides.push("univers");
      if (univers.timeline) pertes.push("univers.timeline : frise biographique non reportée (la chronologie n'a plus de section), archivée en versions");
    }
  }

  // ── 05 Apprentissages : items de playbook déjà là par alias ; divergences,
  // contrefactuel et leçon s'y ajoutent. ──
  {
    const app = { ...get("apprentissages") } as Content;
    const itemsActuels = asArray(app.items, (x) => {
      const titre = asString(x.titre);
      return titre ? { titre, connu: asString(x.connu), manque: asString(x.manque), question: asString(x.question) } : null;
    });
    const mec = get("mecanique_succes");
    const nouveaux: { titre: string; connu?: string; manque?: string; question?: string }[] = [];
    for (const d of asArray(mec.divergences, (x) => {
      const date = asString(x.date); const decision = asString(x.decision);
      return date && decision ? { date, decision, effet: asString(x.effet) } : null;
    })) {
      nouveaux.push({ titre: tronqueMot(d.decision, 80), connu: `${d.date} : ${d.decision}${d.effet ? ` (${d.effet})` : ""}` });
    }
    const contrefactuel = asString(mec.contrefactuel);
    if (contrefactuel) nouveaux.push({ titre: "Contrefactuel (raisonnement, pas un fait)", connu: contrefactuel });
    const lecon = asString(get("enjeu").lecon);
    if (lecon) nouveaux.push({ titre: "La leçon transférable", connu: lecon });
    if (nouveaux.length) {
      const f = fusionne(itemsActuels, nouveaux, (i) => i.titre);
      if (f.ajoutes) {
        ecrits.apprentissages = { ...app, items: f.liste };
        table.push(`apprentissages : ${f.ajoutes} item(s) ajoutés depuis mecanique.divergences, contrefactuel et enjeu.lecon ; les leviers de playbook arrivent par renommage`);
      }
    }
    videApres("mecanique_succes");
  }

  // ── 06 Clips : questions_reseaux déjà là par alias ; les questions qui
  // fâchent des polémiques ferment la liste (décision Matthieu du 31/07). ──
  {
    const clips = { ...get("clips") } as Content;
    const questionsActuelles = asArray(clips.questions, (x) => {
      const question = asString(x.question);
      return question ? { question, ressort: asString(x.ressort), clip: asString(x.clip), meta: asString(x.meta), zg: asString(x.zg), fache: x.fache === true } : null;
    });
    const quiFachent = asArray(get("polemiques").items, (x) => {
      const question = asString(x.question);
      return question
        ? { question, ressort: undefined as string | undefined, clip: undefined as string | undefined, meta: undefined as string | undefined, zg: undefined as string | undefined, fache: true }
        : null;
    });
    if (quiFachent.length) {
      const f = fusionne(questionsActuelles, quiFachent, (q) => q.question);
      if (f.ajoutes) {
        // Les fâcheuses en fin de liste.
        const liste = f.liste;
        liste.sort((a, b) => Number(a.fache === true) - Number(b.fache === true));
        ecrits.clips = { ...clips, questions: liste };
        table.push(`clips : ${f.ajoutes} question(s) qui fâche(nt) ajoutées en fin de liste depuis polemiques ; les questions clips arrivent par renommage`);
      }
    }
  }

  // ── 07 Topics : terrain connu depuis questions_recurrentes ; les dix
  // questions dans un topic de transition que la passe de rédaction répartit. ──
  {
    const topics = { ...get("topics") } as Content;
    let change = false;
    const terrainActuel = asArray(topics.terrain_connu, (x) => {
      const question = asString(x.question);
      return question ? { question, reponse: asString(x.reponse), depassement: asString(x.depassement) } : null;
    });
    const recurrentes = asArray(get("questions_recurrentes").items, (x) => {
      const question = asString(x.question);
      return question ? { question, reponse: asString(x.reponse) } : null;
    });
    if (recurrentes.length) {
      const f = fusionne(terrainActuel, recurrentes, (q) => q.question);
      if (f.ajoutes) { topics.terrain_connu = f.liste; change = true; }
    }
    const dix = asArray(get("dix_questions").questions, (x) => {
      const texte = asString(x.texte);
      return texte ? { num: asString(x.num), texte, note: asString(x.note) } : null;
    });
    if (dix.length) {
      const listeTopics = asArray(topics.topics, (x) => (asString(x.titre) ? (x as Content) : null));
      const dejaQuestions = new Set(
        listeTopics.flatMap((t) => asArray(t.questions, (q) => asString(q.texte) ?? null)).map(norme)
      );
      const neuves = dix.filter((q) => !dejaQuestions.has(norme(q.texte)));
      if (neuves.length) {
        listeTopics.push({
          titre: "Questions à répartir",
          intention: "Questions du contrat précédent : la passe de rédaction les répartit en topics à gate times",
          questions: neuves,
        });
        topics.topics = listeTopics;
        change = true;
      }
    }
    if (change) {
      ecrits.topics = topics;
      table.push(`topics : terrain connu depuis questions_recurrentes (${recurrentes.length}), ${dix.length} question(s) versées dans un topic de transition à répartir par la passe de rédaction`);
    }
    videApres("questions_recurrentes");
    videApres("dix_questions");
    if (nonVide("sequencage")) {
      vides.push("sequencage");
      pertes.push("sequencage : déroulé minuté retiré depuis le 27/07, blocs archivés ; seuls les gate times des topics en héritent (posés par la passe de rédaction)");
    }
  }

  // ── 08 Personnel : entourage + anecdotes + tensions + polémiques (le fait)
  // + items v2 → sous-blocs ; zone grise déplacée avec ses identifiants. ──
  {
    const perso = { ...get("personnel") } as Content;
    let change = false;
    const entourageActuel = asArray(perso.entourage, (x) => {
      const nom = asString(x.nom);
      return nom ? { nom, role: asString(x.role), eclaire: asString(x.eclaire), preconfirmer: asString(x.preconfirmer) } : null;
    });
    const anciens = asArray(get("entourage").personnes, (x) => {
      const nom = asString(x.nom);
      return nom ? { nom, role: asString(x.role), eclaire: asString(x.texte) } : null;
    });
    if (anciens.length) {
      const f = fusionne(entourageActuel, anciens, (p) => p.nom);
      if (f.ajoutes) { perso.entourage = f.liste; change = true; }
    }
    const cacheesActuelles = asArray(perso.donnees_cachees, (x) => {
      const texte = asString(x.texte);
      return texte ? { texte, source: asString(x.source), zg: asString(x.zg) } : null;
    });
    const nouvellesCachees: { texte: string; source?: string; zg?: string }[] = [];
    for (const a of asArray(get("anecdotes").items, (x) => {
      const texte = asString(x.texte);
      return texte ? { texte, source: asString(x.source), cachee: x.cachee === true } : null;
    })) {
      nouvellesCachees.push({ texte: a.texte, source: a.source ?? "anecdote v2 (source archivée)" });
    }
    for (const p of asArray(get("polemiques").items, (x) => {
      const texte = asString(x.texte);
      return texte ? { texte, source: asString(x.source) } : null;
    })) {
      nouvellesCachees.push({ texte: p.texte, source: p.source ?? "polémique v2" });
    }
    for (const t of asArray(get("tensions").cartes, (x) => {
      const a = asString(x.a); const b = asString(x.b);
      return a && b ? { a, b, angle: asString(x.angle) } : null;
    })) {
      nouvellesCachees.push({ texte: `${t.a} VS ${t.b}${t.angle ? ` (angle : ${t.angle})` : ""}`, source: "tension v2 (deux faits vérifiés en fiche)" });
    }
    for (const it of asArray(perso.items, (x) => {
      const texte = asString(x.texte); const source = asString(x.source);
      return texte && source ? { texte, source } : null;
    })) {
      nouvellesCachees.push(it);
    }
    if (nouvellesCachees.length) {
      const f = fusionne(cacheesActuelles, nouvellesCachees, (i) => i.texte);
      if (f.ajoutes) { perso.donnees_cachees = f.liste; change = true; }
    }
    if (Array.isArray(perso.items) && perso.items.length) { delete perso.items; change = true; }
    const zgActuels = asArray(perso.zone_grise, (x) => {
      const texte = asString(x.texte);
      return texte ? { id: asString(x.id), texte, origine: asString(x.origine) } : null;
    });
    const zgAnciens = asArray(get("zone_grise").items, (x) => {
      const texte = asString(x.texte);
      return texte ? { id: asString(x.id), texte, origine: asString(x.origine) } : null;
    });
    if (zgAnciens.length) {
      const f = fusionne(zgActuels, zgAnciens, (z) => z.texte);
      if (f.ajoutes) { perso.zone_grise = f.liste; change = true; }
    }
    if (change) {
      ecrits.personnel = perso;
      table.push(`personnel : entourage (${anciens.length} depuis entourage v2), données cachées (anecdotes, polémiques, tensions, items personnels v2 : ${nouvellesCachees.length} candidates), zone grise déplacée avec ses identifiants (${zgAnciens.length})`);
    }
    videApres("entourage");
    videApres("anecdotes");
    videApres("tensions");
    videApres("polemiques");
    videApres("zone_grise");
  }

  // ── 09 Revue de presse : a_lire (niveaux conservés, optionnel → utile) +
  // parcours intégral versé au palmarès (la passe de rédaction élague). ──
  {
    const rdp = { ...get("revue_de_presse") } as Content;
    let change = false;
    const aLireActuel = asArray(rdp.a_lire, (x) => (asString(x.titre) ? (x as Content) : null));
    const anciensLiens = asArray(get("a_lire").liens, (x) => {
      const titre = asString(x.titre);
      if (!titre) return null;
      const niveau = asString(x.niveau);
      return {
        niveau: niveau === "optionnel" ? "utile" : niveau,
        titre,
        date: asString(x.date),
        temps_lecture: asString(x.temps_lecture),
        apport: asString(x.apport),
        url: asString(x.url),
      } as Content;
    });
    if (anciensLiens.length) {
      const f = fusionne(aLireActuel, anciensLiens, (l) => asString(l.titre) ?? "");
      if (f.ajoutes) { rdp.a_lire = f.liste; change = true; }
    }
    const palmaresActuel = asArray(rdp.palmares, (x) => {
      const texte = asString(x.texte);
      return texte ? { date: asString(x.date), texte } : null;
    });
    const jalons = asArray(get("parcours").lignes, (x) => {
      const annee = asString(x.annee); const texte = asString(x.texte);
      return annee && texte ? { date: annee, texte } : null;
    });
    if (jalons.length) {
      const f = fusionne(palmaresActuel, jalons, (j) => `${j.date ?? ""} ${j.texte}`);
      if (f.ajoutes) { rdp.palmares = f.liste; change = true; }
    }
    if (change) {
      ecrits.revue_de_presse = rdp;
      table.push(`revue_de_presse : à lire depuis a_lire (${anciensLiens.length}, optionnel devient utile), parcours intégral versé au palmarès (${jalons.length} jalons, la passe de rédaction élague les non palmarès)`);
    }
    videApres("a_lire");
    videApres("parcours");
  }

  table.push("identite : renommage d'entete (contenu conservé, nouveaux champs vides à saisir) · data : renommage de chiffres · apprentissages : renommage de playbook · clips : renommage de questions_reseaux · sources : inchangée en base");

  return { ecrits, vides: [...new Set(vides)], table, pertes };
}

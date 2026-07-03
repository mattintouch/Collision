// A2 — parsing propre des erreurs Google (Calendar, Gmail). Les réponses d'erreur
// Google sont du JSON { error: { code, message, status } }. On en tire un message
// COMPLET (jamais tronqué en pleine URL) + une action corrective exploitable par
// un agent comme par un humain.

export interface GoogleErrorInfo {
  code: number;
  message: string;
  cause: string;
  action: string;
}

export function parseGoogleError(status: number, rawBody: string, api: "Calendar" | "Gmail" = "Gmail"): GoogleErrorInfo {
  let message = rawBody?.trim() || `HTTP ${status}`;
  try {
    const j = JSON.parse(rawBody) as { error?: { code?: number; message?: string; status?: string } };
    if (j.error?.message) message = j.error.message;
  } catch {
    /* corps non JSON : on garde le texte brut complet */
  }

  // URL d'activation d'API souvent présente dans le message (ne pas la tronquer).
  const urlMatch = message.match(/https?:\/\/[^\s"'|]+/);
  const url = urlMatch?.[0];

  let cause = `google_${status}`;
  let action = "Voir la console Google Cloud.";
  const m = message.toLowerCase();
  if (m.includes("has not been used") || m.includes("is disabled") || m.includes("not been used in project")) {
    cause = "api_desactivee";
    action = url ? `Activer l'API ${api} : ${url}` : `Activer l'API ${api} dans la console Google Cloud du projet du compte de service.`;
  } else if (status === 403 || m.includes("insufficient") || m.includes("scope") || m.includes("permission")) {
    cause = "scope_ou_permission";
    action = `Vérifier la délégation domain-wide (scope ${api === "Gmail" ? "gmail.send" : "calendar.events"}) et l'identité impersonée (EPISODE_SENDER).`;
  }
  return { code: status, message, cause, action };
}

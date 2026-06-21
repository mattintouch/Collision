import { NextResponse } from "next/server";
import { getShow } from "@/lib/data";
import { copilotReply } from "@/lib/copilot/engine";
import type { ChatMessage } from "@/lib/copilot/config";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

/** Token d'accès Google (scope calendar.readonly) issu de la session OAuth. */
async function getProviderToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.provider_token ?? null;
  } catch {
    return null;
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { showSlug?: string; messages?: ChatMessage[]; slot?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const { showSlug, messages, slot } = body;
  if (!showSlug || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "showSlug et messages requis" },
      { status: 400 }
    );
  }

  const show = await getShow(showSlug);
  if (!show) {
    return NextResponse.json({ error: "Show introuvable" }, { status: 404 });
  }

  // Garde-fou : limiter la taille de l'historique transmis.
  const trimmed = messages.slice(-20).map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: String(m.content ?? "").slice(0, 8000),
  }));

  try {
    const providerToken = await getProviderToken();
    const result = await copilotReply(show, show.id, trimmed, slot, providerToken);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur copilote";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

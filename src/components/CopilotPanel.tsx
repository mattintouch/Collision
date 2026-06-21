"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import type { ChatMessage } from "@/lib/copilot/config";

const SUGGESTIONS_INVITES = [
  "Qui engager cette semaine ?",
  "Quels appuis ouvrent une porte ?",
  "Écris un premier message à Tony Parker",
  "Analyse l'état du pipe",
];
const SUGGESTIONS_THEMATIQUE = [
  "Quelle entreprise traiter maintenant ?",
  "Où en est la recherche ?",
  "Quels appuis pour obtenir un accès ?",
  "Analyse l'état du pipe",
];

export function CopilotPanel({
  showSlug,
  typePipe,
}: {
  showSlug: string;
  typePipe: "invites" | "thematique";
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [slot, setSlot] = useState("");
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestions =
    typePipe === "invites" ? SUGGESTIONS_INVITES : SUGGESTIONS_THEMATIQUE;

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showSlug, messages: next, slot: slot || undefined }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages([...next, { role: "assistant", content: `Erreur : ${data.error}` }]);
      } else {
        setDemo(data.demo);
        setMessages([...next, { role: "assistant", content: data.text }]);
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "Erreur réseau." }]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-12rem)] max-w-3xl flex-col">
      <div className="mb-3 flex items-center gap-3">
        <input
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
          placeholder="Créneau visé (ex : mardi 14h, semaine du 12)"
          className="flex-1 rounded-lg border border-noir-600 bg-noir-900 px-3 py-2 text-sm outline-none placeholder:text-blanc-muted/60 focus:border-jaune"
        />
        {demo !== null && (
          <span className="chip border-transparent bg-jaune/10 text-jaune">
            {demo ? "démo" : "IA"}
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-card border border-noir-600 bg-noir-800 p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-blanc-muted">
              Pose une dispo, demande des appuis, ou fais rédiger un message.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="chip border-noir-600 text-blanc-muted hover:border-jaune hover:text-blanc"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={clsx(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={clsx(
                  "max-w-[85%] whitespace-pre-wrap rounded-card px-4 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-jaune text-noir"
                    : "border border-noir-600 bg-noir-900"
                )}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-card border border-noir-600 bg-noir-900 px-4 py-2.5 text-sm text-blanc-muted">
              Le copilote réfléchit…
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Écris au copilote…"
          className="flex-1 rounded-lg border border-noir-600 bg-noir-900 px-3 py-2.5 text-sm outline-none placeholder:text-blanc-muted/60 focus:border-jaune"
        />
        <button type="submit" disabled={loading || !input.trim()} className="btn-jaune">
          Envoyer
        </button>
      </form>
    </div>
  );
}

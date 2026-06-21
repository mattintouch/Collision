"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logTouche } from "@/lib/actions";
import { Input, Textarea } from "./form";

export function CaptureForm({
  cibleId,
  showSlug,
}: {
  cibleId: string;
  showSlug: string;
}) {
  const [contenu, setContenu] = useState("");
  const [canal, setCanal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    start(async () => {
      const res = await logTouche({
        cible_id: cibleId,
        show_slug: showSlug,
        canal: canal || null,
        contenu,
        source: "saisie",
      });
      if (res.ok) {
        setContenu("");
        setCanal("");
        router.refresh();
      } else {
        setError(res.error ?? "Erreur");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={contenu}
        onChange={(e) => setContenu(e.target.value)}
        rows={3}
        placeholder="Collez le message ou décrivez la touche…"
      />
      <div className="flex gap-2">
        <Input
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          placeholder="Canal (Email, DM…)"
          className="flex-1"
        />
        <button
          onClick={submit}
          disabled={pending || !contenu.trim()}
          className="btn-jaune shrink-0"
        >
          {pending ? "…" : "Enregistrer"}
        </button>
      </div>
      <p className="text-xs text-blanc-muted">
        Capture d&apos;écran : la lecture par l&apos;IA (vision) arrive à
        l&apos;étape copilote.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

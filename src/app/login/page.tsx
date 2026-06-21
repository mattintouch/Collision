import { demoMode } from "@/lib/data";
import { ALLOWED_DOMAINS } from "@/lib/config";
import { LoginButton } from "@/components/LoginButton";
import { redirect } from "next/navigation";

export default function LoginPage() {
  // En mode démo, pas d'auth : on entre directement.
  if (demoMode) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card w-full max-w-md p-8">
        <div className="mb-1 text-sm font-medium text-jaune">Collision</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Magellan
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-blanc-muted">
          Moteur de conquête et de closing pour les podcasts. Accès réservé.
        </p>

        <div className="mt-8">
          <LoginButton />
        </div>

        <p className="mt-6 text-xs text-blanc-muted">
          Connexion Google restreinte aux domaines{" "}
          {ALLOWED_DOMAINS.map((d) => (
            <span key={d} className="text-blanc">
              {d}{" "}
            </span>
          ))}
          .
        </p>
      </div>
    </main>
  );
}

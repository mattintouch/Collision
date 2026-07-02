import Link from "next/link";
import { getMyProfile, getShows } from "@/lib/data";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
  const [shows, profile] = await Promise.all([getShows(), getMyProfile()]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-blanc-muted hover:text-blanc">
        ← Retour
      </Link>
      <p className="label mb-1 mt-3" style={{ color: "#FFD200" }}>Compte</p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Réglages
      </h1>

      {!profile ? (
        <p className="mt-4 text-sm text-blanc-muted">
          Profil introuvable — reconnecte-toi.
        </p>
      ) : (
        <div className="mt-6">
          <SettingsForm
            shows={shows}
            currentDefault={profile.default_show_slug}
            email={profile.email}
            role={profile.type}
          />
        </div>
      )}
    </main>
  );
}

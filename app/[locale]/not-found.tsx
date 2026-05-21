import { Link } from '@/i18n/routing';

export default function NotFound() {
  return (
    <section className="container-edit min-h-[60vh] flex flex-col justify-center py-32">
      <p className="eyebrow mb-6">404</p>
      <h1 className="display-title font-serif text-display-lg max-w-readable">
        Page <em>introuvable</em>.
      </h1>
      <p className="mt-6 text-ink/70 max-w-readable">
        {`Le contenu que vous cherchez n'existe plus, ou n'a pas encore été publié.`}
      </p>
      <div className="mt-10">
        <Link href="/" className="btn btn-primary">
          {`Retour à l'accueil`}
        </Link>
      </div>
    </section>
  );
}

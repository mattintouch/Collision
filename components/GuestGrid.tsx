import { FadeIn } from './FadeIn';
import { SectionTitle } from './SectionTitle';

type Guest = { name: string; role: string; country: string; photo?: string };

type Props = {
  eyebrow: string;
  pre: string;
  em: string;
  post: string;
  items: Guest[];
  fallback: string;
  fallbackPartners: string;
};

export function GuestGrid({ eyebrow, pre, em, post, items, fallback, fallbackPartners }: Props) {
  // Hide section logic: if fewer than 4 confirmed (non-placeholder) names,
  // show the fallback block instead, as specified in the brief.
  const confirmed = items.filter((g) => !g.name.includes('__TODO__'));
  const showGrid = confirmed.length >= 4;

  return (
    <section className="container-edit py-24 md:py-32">
      <FadeIn>
        <SectionTitle eyebrow={eyebrow} pre={pre} em={em} post={post} />
      </FadeIn>

      {showGrid ? (
        <div className="mt-16 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
          {confirmed.map((g, i) => (
            <FadeIn key={`${g.name}-${i}`} delay={i * 0.04}>
              <figure>
                <div className="aspect-[4/5] bg-ink/5 mb-4 grayscale">
                  {g.photo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={g.photo} alt={g.name} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <figcaption>
                  <p className="font-serif text-xl leading-tight">{g.name}</p>
                  <p className="text-sm text-mute mt-1">
                    {g.role}
                    {g.country ? ` — ${g.country}` : ''}
                  </p>
                </figcaption>
              </figure>
            </FadeIn>
          ))}
        </div>
      ) : (
        <FadeIn>
          <div className="mt-16 border border-ink/10 p-12 md:p-16">
            <p className="font-serif text-2xl md:text-3xl">{fallback}</p>
            <p className="mt-6 text-sm text-mute">
              <span className="todo">__TODO__</span> {fallbackPartners.replace('__TODO__', '').trim()}
            </p>
          </div>
        </FadeIn>
      )}
    </section>
  );
}

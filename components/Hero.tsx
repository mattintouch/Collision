import { type ReactNode } from 'react';
import { FadeIn } from './FadeIn';
import { EuropeMarker } from './EuropeMarker';

type CTA = {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary';
};

type Props = {
  eyebrow: string;
  titlePre: string;
  titleEm: string;
  titlePost: string;
  sub: ReactNode;
  ctas?: CTA[];
};

export function Hero({ eyebrow, titlePre, titleEm, titlePost, sub, ctas = [] }: Props) {
  return (
    <section className="relative overflow-hidden">
      <EuropeMarker className="pointer-events-none absolute -right-24 -top-24 w-[44rem] text-ink/30" />
      <div className="container-edit relative pt-28 pb-24 md:pt-40 md:pb-32">
        <FadeIn>
          <p className="eyebrow mb-8">{eyebrow}</p>
        </FadeIn>
        <FadeIn delay={0.05}>
          <h1 className="display-title font-serif text-display-xl max-w-[20ch]">
            {titlePre} <em>{titleEm}</em> {titlePost}
          </h1>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="mt-10 max-w-readable text-lg md:text-xl text-ink/80 font-sans leading-relaxed">
            {sub}
          </div>
        </FadeIn>
        {ctas.length ? (
          <FadeIn delay={0.15}>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              {ctas.map((cta) => (
                <a
                  key={cta.href + cta.label}
                  href={cta.href}
                  className={`btn ${cta.variant === 'secondary' ? 'btn-secondary' : 'btn-primary'}`}
                >
                  {cta.label}
                </a>
              ))}
            </div>
          </FadeIn>
        ) : null}
      </div>
    </section>
  );
}

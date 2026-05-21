import { FadeIn } from './FadeIn';
import { SectionTitle } from './SectionTitle';

type Cta = { label: string; href: string };

type Props = {
  id?: string;
  eyebrow: string;
  pre: string;
  em: string;
  post: string;
  body: string;
  primary: Cta;
  secondary?: Cta;
  tone?: 'editorial' | 'commercial';
};

export function ContactBlock({
  id,
  eyebrow,
  pre,
  em,
  post,
  body,
  primary,
  secondary,
  tone = 'editorial'
}: Props) {
  const isCommercial = tone === 'commercial';

  return (
    <section
      id={id}
      className={isCommercial ? 'bg-ink text-paper' : ''}
    >
      <div className="container-edit py-28 md:py-36">
        <FadeIn>
          <p className={`eyebrow ${isCommercial ? 'text-paper/60' : ''} mb-6`}>{eyebrow}</p>
          <h2 className={`display-title font-serif text-display-lg max-w-readable ${isCommercial ? 'text-paper' : ''}`}>
            {pre} <em>{em}</em>
            {post.startsWith('.') || post.startsWith(',') ? '' : ' '}
            {post}
          </h2>
        </FadeIn>
        <FadeIn delay={0.05}>
          <p className={`mt-8 max-w-readable text-lg ${isCommercial ? 'text-paper/75' : 'text-ink/75'}`}>
            {body}
          </p>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href={primary.href}
              className={
                isCommercial
                  ? 'btn bg-paper text-ink hover:bg-accent hover:text-paper'
                  : 'btn btn-primary'
              }
            >
              {primary.label.includes('__TODO__') ? (
                <span className="todo">__TODO__</span>
              ) : null}{' '}
              {primary.label.replace('__TODO__', '').trim()}
            </a>
            {secondary ? (
              <a
                href={secondary.href}
                className={
                  isCommercial
                    ? 'btn border border-paper/40 text-paper hover:bg-paper hover:text-ink'
                    : 'btn btn-secondary'
                }
              >
                {secondary.label.includes('__TODO__') ? (
                  <span className="todo">__TODO__</span>
                ) : null}{' '}
                {secondary.label.replace('__TODO__', '').trim()}
              </a>
            ) : null}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

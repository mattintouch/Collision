import { FadeIn } from './FadeIn';
import { SectionTitle } from './SectionTitle';

type Props = {
  id?: string;
  eyebrow: string;
  pre: string;
  em: string;
  post: string;
  paragraphs: string[];
};

export function Manifesto({ id, eyebrow, pre, em, post, paragraphs }: Props) {
  return (
    <section id={id} className="container-edit py-28 md:py-36">
      <FadeIn>
        <SectionTitle eyebrow={eyebrow} pre={pre} em={em} post={post} />
      </FadeIn>
      <div className="mt-12 grid md:grid-cols-12 gap-8">
        <div className="md:col-span-2 hidden md:block">
          <div className="rule mt-4" />
        </div>
        <div className="md:col-span-9 max-w-readable">
          {paragraphs.map((p, i) => (
            <FadeIn key={i} delay={i * 0.05}>
              <p className="mt-6 first:mt-0 text-lg md:text-xl leading-relaxed text-ink/80 font-serif">
                {p.includes('__TODO__') ? (
                  <>
                    <span className="todo">__TODO__</span> {p.replace('__TODO__', '').trim()}
                  </>
                ) : (
                  p
                )}
              </p>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

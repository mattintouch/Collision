import { FadeIn } from './FadeIn';
import { SectionTitle } from './SectionTitle';

type Column = { title: string; body: string };

type Props = {
  eyebrow: string;
  pre: string;
  em: string;
  post: string;
  columns: Column[];
};

export function BenefitColumns({ eyebrow, pre, em, post, columns }: Props) {
  return (
    <section className="container-edit py-24 md:py-32">
      <FadeIn>
        <SectionTitle eyebrow={eyebrow} pre={pre} em={em} post={post} />
      </FadeIn>
      <div className="mt-16 grid md:grid-cols-3 gap-10 md:gap-16">
        {columns.map((c, i) => (
          <FadeIn key={i} delay={i * 0.05}>
            <p className="font-serif text-2xl md:text-3xl">{c.title}</p>
            <div className="rule mt-6 mb-6" />
            <p className="text-ink/75 leading-relaxed">
              {c.body.includes('__TODO__') ? (
                <>
                  <span className="todo">__TODO__</span> {c.body.replace('__TODO__', '').trim()}
                </>
              ) : (
                c.body
              )}
            </p>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

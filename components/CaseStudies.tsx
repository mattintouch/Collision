import { FadeIn } from './FadeIn';
import { SectionTitle } from './SectionTitle';

type Item = {
  brand: string;
  context: string;
  execution: string;
  result: string;
};

type Props = {
  eyebrow: string;
  pre: string;
  em: string;
  post: string;
  items: Item[];
};

function todoOr(text: string) {
  if (text.includes('__TODO__')) {
    return (
      <>
        <span className="todo">__TODO__</span> {text.replace('__TODO__', '').trim()}
      </>
    );
  }
  return text;
}

export function CaseStudies({ eyebrow, pre, em, post, items }: Props) {
  return (
    <section className="container-edit py-24 md:py-32">
      <FadeIn>
        <SectionTitle eyebrow={eyebrow} pre={pre} em={em} post={post} />
      </FadeIn>
      <div className="mt-16 space-y-12">
        {items.map((item, i) => (
          <FadeIn key={i} delay={i * 0.05}>
            <article className="grid md:grid-cols-12 gap-8 border-t border-ink/10 pt-12">
              <div className="md:col-span-3">
                <p className="eyebrow mb-3">Case {String(i + 1).padStart(2, '0')}</p>
                <p className="font-serif text-3xl">{todoOr(item.brand)}</p>
              </div>
              <dl className="md:col-span-9 grid sm:grid-cols-3 gap-8 text-sm">
                <div>
                  <dt className="eyebrow mb-2">Contexte</dt>
                  <dd className="text-ink/80">{todoOr(item.context)}</dd>
                </div>
                <div>
                  <dt className="eyebrow mb-2">Exécution</dt>
                  <dd className="text-ink/80">{todoOr(item.execution)}</dd>
                </div>
                <div>
                  <dt className="eyebrow mb-2">Résultat</dt>
                  <dd className="font-serif text-xl">{todoOr(item.result)}</dd>
                </div>
              </dl>
            </article>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

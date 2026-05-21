import { FadeIn } from './FadeIn';

type Item = { quote: string; name: string; role: string };

type Props = {
  eyebrow: string;
  items: Item[];
};

export function TestimonialList({ eyebrow, items }: Props) {
  return (
    <section className="container-edit py-24 md:py-32">
      <FadeIn>
        <p className="eyebrow mb-12">{eyebrow}</p>
      </FadeIn>
      <div className="grid md:grid-cols-3 gap-12">
        {items.map((t, i) => (
          <FadeIn key={i} delay={i * 0.05}>
            <blockquote>
              <p className="font-serif text-xl md:text-2xl leading-snug">
                {t.quote.includes('__TODO__') ? (
                  <>
                    <span className="todo">__TODO__</span> {t.quote.replace('__TODO__', '').trim()}
                  </>
                ) : (
                  `"${t.quote}"`
                )}
              </p>
              <footer className="mt-6 text-sm text-mute">
                {t.name}
                {t.role ? <span> — {t.role}</span> : null}
              </footer>
            </blockquote>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

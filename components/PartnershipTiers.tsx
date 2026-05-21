import { FadeIn } from './FadeIn';
import { SectionTitle } from './SectionTitle';

type Tier = {
  name: string;
  volume: string;
  description: string;
  budget: string;
};

type Props = {
  eyebrow: string;
  pre: string;
  em: string;
  post: string;
  items: Tier[];
};

export function PartnershipTiers({ eyebrow, pre, em, post, items }: Props) {
  return (
    <section className="container-edit py-24 md:py-32">
      <FadeIn>
        <SectionTitle eyebrow={eyebrow} pre={pre} em={em} post={post} />
      </FadeIn>
      <div className="mt-16 grid md:grid-cols-3 gap-px bg-ink/10 border border-ink/10">
        {items.map((tier, i) => (
          <FadeIn key={i} delay={i * 0.05} className="bg-paper p-8 md:p-10 flex flex-col">
            <p className="eyebrow">{tier.volume}</p>
            <h3 className="font-serif text-3xl mt-4">{tier.name}</h3>
            <p className="mt-6 text-ink/75 leading-relaxed flex-1">{tier.description}</p>
            <div className="mt-8 pt-6 border-t border-ink/10">
              <p className="text-xs uppercase tracking-[0.18em] text-mute mb-2">Budget</p>
              <p className="font-serif text-xl">
                {tier.budget.includes('__TODO__') ? (
                  <span className="todo">__TODO__</span>
                ) : (
                  tier.budget
                )}
              </p>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

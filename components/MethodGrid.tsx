import { FadeIn } from './FadeIn';
import { SectionTitle } from './SectionTitle';

type Block = { label: string; value: string };

type Props = {
  eyebrow: string;
  pre: string;
  em: string;
  post: string;
  blocks: Block[];
  schedule?: string;
};

export function MethodGrid({ eyebrow, pre, em, post, blocks, schedule }: Props) {
  return (
    <section className="container-edit py-24 md:py-32">
      <FadeIn>
        <SectionTitle eyebrow={eyebrow} pre={pre} em={em} post={post} />
      </FadeIn>
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10 border border-ink/10">
        {blocks.map((b, i) => (
          <FadeIn key={i} delay={i * 0.05} className="bg-paper p-8 min-h-[180px] flex flex-col justify-between">
            <p className="eyebrow">{b.label}</p>
            <p className="font-serif text-2xl md:text-3xl mt-6">
              {b.value.includes('__TODO__') ? <span className="todo">__TODO__</span> : b.value}
            </p>
          </FadeIn>
        ))}
      </div>
      {schedule ? (
        <FadeIn>
          <p className="mt-10 text-sm text-mute">
            {schedule.includes('__TODO__') ? <span className="todo">__TODO__</span> : null}{' '}
            {schedule.replace('__TODO__', '').trim()}
          </p>
        </FadeIn>
      ) : null}
    </section>
  );
}

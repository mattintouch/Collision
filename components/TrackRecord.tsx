import { FadeIn } from './FadeIn';
import { SectionTitle } from './SectionTitle';

type Item = { title: string; meta: string; href: string };

type Props = {
  eyebrow: string;
  pre: string;
  em: string;
  post: string;
  items: Item[];
  sponsorsNote?: string;
};

export function TrackRecord({ eyebrow, pre, em, post, items, sponsorsNote }: Props) {
  return (
    <section className="container-edit py-24 md:py-32">
      <FadeIn>
        <SectionTitle eyebrow={eyebrow} pre={pre} em={em} post={post} />
      </FadeIn>
      <div className="mt-16 divide-y divide-ink/10 border-y border-ink/10">
        {items.map((item, i) => {
          const todoMeta = item.meta.includes('__TODO__');
          const todoHref = item.href.includes('__TODO__');
          return (
            <FadeIn key={i} delay={i * 0.04}>
              <a
                href={todoHref ? '#' : item.href}
                target={todoHref ? undefined : '_blank'}
                rel="noreferrer"
                className="group grid grid-cols-12 items-baseline py-6 hover:bg-ink/5 transition px-2 -mx-2"
              >
                <span className="col-span-1 text-xs text-mute tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="col-span-7 md:col-span-6 font-serif text-2xl md:text-3xl">
                  {item.title}
                </span>
                <span className="col-span-3 md:col-span-4 text-sm text-mute text-right md:text-left">
                  {todoMeta ? <span className="todo">__TODO__</span> : item.meta}
                </span>
                <span className="col-span-1 text-right text-mute group-hover:text-ink transition">
                  →
                </span>
              </a>
            </FadeIn>
          );
        })}
      </div>
      {sponsorsNote ? (
        <FadeIn>
          <p className="mt-8 text-sm text-mute">
            <span className="todo">__TODO__</span> {sponsorsNote.replace('__TODO__', '').trim()}
          </p>
        </FadeIn>
      ) : null}
    </section>
  );
}

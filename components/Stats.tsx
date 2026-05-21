import { FadeIn } from './FadeIn';

type Item = { value: string; label: string };

type Props = {
  items: Item[];
  note?: string;
};

export function Stats({ items, note }: Props) {
  return (
    <FadeIn as="section" className="container-edit py-20 md:py-28">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-6 border-y border-ink/10 py-12">
        {items.map((item, i) => (
          <div key={`${item.label}-${i}`} className="flex flex-col">
            <span className="font-serif text-display-md leading-none">
              {item.value.includes('__TODO__') ? <span className="todo">__TODO__</span> : item.value}
            </span>
            <span className="mt-3 text-xs uppercase tracking-[0.18em] text-mute">
              {item.label}
            </span>
          </div>
        ))}
      </div>
      {note ? <p className="text-xs text-mute mt-4">{note}</p> : null}
    </FadeIn>
  );
}

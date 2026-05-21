import { FadeIn } from './FadeIn';
import { SectionTitle } from './SectionTitle';

type Row = { label: string; value: string };
type Table = { title: string; rows: Row[] };

type Props = {
  eyebrow: string;
  pre: string;
  em: string;
  post: string;
  demographics: Table;
  chinaBreakdown: Table;
};

function TableBlock({ table }: { table: Table }) {
  return (
    <div>
      <h3 className="font-serif text-2xl mb-6">{table.title}</h3>
      <dl className="divide-y divide-ink/10 border-y border-ink/10">
        {table.rows.map((row, i) => (
          <div key={i} className="grid grid-cols-12 py-4 gap-4">
            <dt className="col-span-6 text-sm text-mute">{row.label}</dt>
            <dd className="col-span-6 font-serif text-lg text-right">
              {row.value.includes('__TODO__') ? (
                <span className="todo">__TODO__</span>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AudienceTables({ eyebrow, pre, em, post, demographics, chinaBreakdown }: Props) {
  return (
    <section className="container-edit py-24 md:py-32">
      <FadeIn>
        <SectionTitle eyebrow={eyebrow} pre={pre} em={em} post={post} />
      </FadeIn>
      <div className="mt-16 grid md:grid-cols-2 gap-16">
        <FadeIn>
          <TableBlock table={demographics} />
        </FadeIn>
        <FadeIn delay={0.05}>
          <TableBlock table={chinaBreakdown} />
        </FadeIn>
      </div>
    </section>
  );
}

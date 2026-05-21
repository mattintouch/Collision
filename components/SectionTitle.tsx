type Props = {
  eyebrow?: string;
  pre: string;
  em: string;
  post: string;
  size?: 'lg' | 'md';
  className?: string;
};

export function SectionTitle({ eyebrow, pre, em, post, size = 'lg', className }: Props) {
  const sizeClass = size === 'lg' ? 'text-display-lg' : 'text-display-md';

  return (
    <div className={className}>
      {eyebrow ? <p className="eyebrow mb-6">{eyebrow}</p> : null}
      <h2 className={`display-title font-serif ${sizeClass} max-w-readable`}>
        {pre} <em>{em}</em>
        {post.startsWith('.') || post.startsWith(',') ? '' : ' '}
        {post}
      </h2>
    </div>
  );
}

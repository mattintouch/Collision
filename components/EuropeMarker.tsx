type Props = {
  className?: string;
};

// Discrete European visual marker, mentioned in section 3 of the brief.
// SVG composition: a minimalist dotted arc evoking the European cartography
// without any actual flag, stars or political iconography.
export function EuropeMarker({ className }: Props) {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <circle cx="100" cy="100" r="92" strokeWidth="0.5" strokeDasharray="1 4" opacity="0.4" />
      <circle cx="100" cy="100" r="72" strokeWidth="0.5" strokeDasharray="2 6" opacity="0.3" />
      <g opacity="0.6">
        <circle cx="100" cy="32" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="148" cy="58" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="168" cy="108" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="142" cy="156" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="92" cy="172" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="44" cy="148" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="28" cy="98" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="48" cy="50" r="1.4" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

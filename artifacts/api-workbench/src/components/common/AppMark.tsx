/**
 * The app mark: a request leaves, strikes the cushion and comes back.
 *
 * The same drawing as brand/logo.svg, minus its background tile — here it sits
 * inside whatever badge it is placed in. Strokes inherit `currentColor` so one
 * copy serves the coloured sidebar badge and any monochrome use.
 */
export function AppMark({ size = 14, twoTone = false }: { size?: number; twoTone?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g strokeWidth="58" strokeLinecap="round">
        <path d="M104 140 L400 256" stroke={twoTone ? '#5b83f5' : 'currentColor'} />
        <path d="M400 256 L104 372" stroke={twoTone ? '#e0913f' : 'currentColor'} />
      </g>
      <rect x="386" y="100" width="44" height="312" rx="22" fill="currentColor" />
    </svg>
  );
}

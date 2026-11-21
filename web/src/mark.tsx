// The kestrel mark: three tapered feathers sweeping up, drawn once here and used by the header; the app icons
// (scripts/make-icons.ts) and the favicon (web/public/favicon.svg) carry the same geometry.
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" fill="var(--accent)">
      <polygon points="20.4,66.9 10.8,55.5 63.1,21.3" />
      <polygon points="35.0,74.4 26.6,64.4 67.6,38.5" />
      <polygon points="49.4,81.8 42.4,73.4 71.9,55.7" />
    </svg>
  );
}

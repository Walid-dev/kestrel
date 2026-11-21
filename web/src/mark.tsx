// The kestrel mark: a wolf howling, one polygon, with the moon when asked. The favicon (web/public/favicon.svg) and
// the app icons (scripts/make-icons.ts) carry the same geometry.
export const WOLF =
  "66,2 61,10 57,13 52,24 50,40 48,56 46,84 39,84 41,64 35,65 31,84 23,84 22,74 15,66 2,72 12,58 14,49 29,40 38,32 46,24 40,16 47,14 51,8";

export function Mark({ size = 26, moon = false }: { size?: number; moon?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {moon && <circle cx="80" cy="16" r="8" fill="var(--yellow)" />}
      <polygon points={WOLF} fill="var(--pink)" />
    </svg>
  );
}

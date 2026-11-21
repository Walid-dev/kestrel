// The kestrel mark: a wolf's face, one polygon with the eyes cut out in the ground's colour. The favicon
// (web/public/favicon.svg) and the app icons (scripts/make-icons.ts) carry the same geometry.
export const WOLF =
  "22,4 36,15 50,15 64,15 78,4 72,20 82,30 87,42 75,50 79,61 64,75 50,87 36,75 21,61 25,50 13,42 18,30 28,20";
export const EYES = ["56,36 70,33 62,44", "44,36 30,33 38,44"];

export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <polygon points={WOLF} fill="var(--accent)" />
      {EYES.map((e) => (
        <polygon key={e} points={e} fill="var(--bg)" />
      ))}
    </svg>
  );
}

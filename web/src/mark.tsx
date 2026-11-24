// The kestrel mark: a wolf howling, one polygon, with the moon when asked. Pink by default (the brand, on Home's
// title); fill="currentColor" draws it in the colour around it, as the Home tab and the dock's first item do; tight
// crops the box to the wolf, centred (no moon), so it fills an icon's box as the line icons do. The
// favicon (web/public/favicon.svg) and the app icons (scripts/make-icons.ts) carry the same geometry.
export const WOLF =
  "66,2 61,10 57,13 52,24 50,40 48,56 46,84 39,84 41,64 35,65 31,84 23,84 22,74 15,66 2,72 12,58 14,49 29,40 38,32 46,24 40,16 47,14 51,8";

export function Mark({
  size = 26,
  moon = false,
  fill = "var(--pink)",
  tight = false,
}: {
  size?: number;
  moon?: boolean;
  fill?: string;
  tight?: boolean;
}) {
  return (
    <svg viewBox={tight ? "-7 2 82 82" : "0 0 100 100"} width={size} height={size} aria-hidden="true">
      {moon && !tight && <circle cx="80" cy="16" r="8" fill="var(--yellow)" />}
      <polygon points={WOLF} fill={fill} />
    </svg>
  );
}

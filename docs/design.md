# The design system

One look for every screen, set here once. Components use the tokens; a new screen uses the components; a change to
the look happens in `web/src/styles.css`, nowhere else.

## The tokens (`web/src/styles.css`)

- **Ground:** `--bg` (near-black blue), `--surface` for cards, `--surface-2` for sunk chips, `--line` for hairlines.
- **Ink:** `--text` for body, `--strong` for headings, `--muted` for secondary lines.
- **The lead:** `--accent` — One Dark's blue. Primary buttons, links, focus rings, the active chip.
- **The working colours**, the editor's neon shades: `--pink` (the wolf, the note marks), `--purple`, `--green`
  (ok, done, diff plus), `--orange` (warnings), `--yellow` (the moon), `--red` (danger, diff minus).
- **Type:** IBM Plex Sans for text, Sans Condensed bold for headings and the wordmark, Mono for data
  (paths, chips, labels). All served from `web/public/fonts`.

## The components

- `.btn` — every button: 13.5 px, 6×12 padding, radius 8. `.btn-primary` (accent ground), `.btn-quiet` (muted),
  `.btn-danger` (red text). Never a one-off button style.
- `.card` — every surface block: `--surface`, `--line` hairline, radius 16, padding 16.
- Chips are mono 11 px pills: `--accent-soft` when active, `--surface-2` when waiting, `--add-soft`/`--warn-soft`
  for done/warn states.

## The rules

- **Enter submits** in any box; Shift+Enter makes the line. The box says so underneath.
- **Boxes are native dialogs** (`showModal`): Esc, Android's Back and a click outside all close them, and closing
  never loses typed words — drafts live on the device until Save or Discard.
- **One thing happens where the eye is**: when background work finishes on an open screen, its result opens itself.
- **Paths are shown in full** (mono, break-all) wherever two files could share a name.
- **Space before decoration:** cards breathe (16 px padding, 12 px gaps, relaxed leading) before any new visual
  element is added.
- **Phone first, computer wide:** one column on the phone; on a computer the shell widens and side rails may appear.
  Every screen is checked at both widths in a real browser before it ships.

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
- `Dialog` (`web/src/ui/dialog.tsx`) — every box: a native dialog opened with `showModal`. Props: `open`, `onClose`,
  `title`, `eyebrow`, `children`, `actions` (the main action last), `wide`, `busy`, `alert`. Esc, Back, a tap outside
  and ✕ close it; typed words stay; focus returns to the opener; a child marked `data-autofocus` gets the first focus.
- `Confirm` (`web/src/ui/confirm.tsx`) — every question before an action:
  `const sure = useConfirm(); if (await sure({ title, body, yes: "Delete", danger: true })) …`. The no-button is
  always Cancel; with `danger` the action is red and Cancel takes the focus; one question at a time, and a page left
  behind answers no.
- `Pills` (`web/src/ui/pills.tsx`) — every choice shown whole. Props: `label`, `showLabel`, `options` (`value`,
  `label`, `count`, `tone`, `hint`), `value`, `onChange`, `multiple`. They wrap, never scroll sideways, and stand 44 px
  tall on a phone.
- `/design` shows every shared part in its states; a new part is reviewed there before a page uses it.

## The rules

- **A choice is pills**, never a dropdown.
- **Ask before an action with Confirm**, never the browser's pop-up.
- **Enter submits** in any box; Shift+Enter makes the line. The box says so underneath.
- **Boxes are native dialogs** (`showModal`): Esc, Android's Back and a click outside all close them, and closing
  never loses typed words — drafts live on the device until Save or Discard.
- **One thing happens where the eye is**: when background work finishes on an open screen, its result opens itself.
- **Paths are shown in full** (mono, break-all) wherever two files could share a name.
- **Space before decoration:** cards breathe (16 px padding, 12 px gaps, relaxed leading) before any new visual
  element is added.
- **Phone first, computer wide:** one column on the phone; on a computer the shell widens and side rails may appear.
  Every screen is checked at both widths in a real browser before it ships.

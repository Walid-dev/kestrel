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

## The tokens as classes

The role variables stay on `:root` (dark by default, light with the system) and `@theme inline` in
`web/src/styles.css` names them as classes, read at run time; no `dark:` classes.

- **Colours by role:** `bg-page`, `bg-surface`, `bg-surface-2`, `border-line`, `text-ink` (`--text`), `text-strong`,
  `text-muted`, `text-accent`, `bg-accent-soft`; the working colours (`text-green`, `text-red`, `text-pink`, …) and the
  soft grounds. `text-tone`, `bg-tone` and `border-tone` read the nearest `tone-*`.
- **Fonts:** `font-sans`, `font-cond`, `font-mono`.
- **Eight type steps,** each with its line height: `text-label` 11 (mono labels), `text-small` 13 (hints, meta),
  `text-detail` 14 (a card's description), `text-body` 15.5, `text-read` 16.5 (what is read slowly), `text-head` 19
  (card and section headings, cond bold), `text-lead` 24 (one big line), `text-title` 34 (the page's title).
- A part in a colour takes a tone on itself: `eyebrow tone-accent`, `.btn[aria-pressed]` in the accent or its tone.

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
- `Doc` (`web/src/ui/doc.tsx`) — every document: Read, Edit and (1024 px and wider) Side by side, with a Download
  menu (the text, Save as PDF, Copy). Its Markdown is `src/shared/markdown.ts`, drawn by `web/src/ui/markdown.tsx` in
  `.md`: headings in `--strong`, `--purple` and `--cyan`, real bullets and numbers, code on `--surface-2`, quotes with
  an accent edge, tables in their own scrolling frame. A note's mark is `.doc-mark` (`--pink-soft`, a `--pink` line
  under). The editor `.doc-src` is mono, 16 px on a phone.
- `Page` and `PageHead` (`web/src/ui/page.tsx`) — every page's head: `title`, `eyebrow`, `line`, `actions`, `back`
  (`{ to, label }`), `sticky`, `width` (`wide`, or `reading`: 768 px at most). Both widths start at the shell's left
  edge. One title: 34 px cond bold, sentence case, the page's h1. A child page gets a bar: the back link on the left
  (it keeps about twenty letters, then ends in …), the page's buttons on the right (they drop to their own row when
  room runs out). A page's state chip goes in the line under the title.
- `Card` (`web/src/ui/card.tsx`) — plain; `to` makes the whole card a link; `title` adds `meta`, `to` or `onOpen`,
  `onRemove` and `removeLabel`; `tone` colours its edge; `wide` spans the grid's row. Parts stack 12 px apart.
- `EmptyState` (`web/src/ui/empty.tsx`) — nothing here yet, in one voice: `title`, `line`, `action`, `detail`.
- `Field` (`web/src/ui/field.tsx`) — a box where Enter sends (Shift+Enter makes a line), its round send button inside,
  a hint under it, 16 px; a long word or a pasted link breaks inside it. Without `onSend` it is a search box.
- `cx()` (`web/src/ui/cx.ts`) joins class names.
- An action pill: a Pills option with `onPress` (Show all) is a plain button among the choices, in the accent, never
  part of the value. A toggle beside a group (Not applied yet, Star) sits in `.pills-inline`, so it wraps in line.
- Patterns the pages share: a live list card is Card with a title, its meta a kind chip and the time; a page's view
  switch (Live's Now and Activity, Applications' period) is `.seg`; a page with more than three head buttons puts
  them in a wrapping row under the head; a read-only document is Doc without `onSave`; a page whose item is gone says
  so in plain words and doesn't retry. Pay and price pills are `.money` in the money scale's tone (dark ink on a tint
  in light, for contrast); the listing sheet is the wide Dialog, its head and actions kept in view on tall screens.
- Chips speak in the mono caps voice (`chip chip-caps`), one colour per meaning: needs me pink; review today cyan;
  learning, Ask and deep work purple; done and at work green; new muted.
- `/design` shows every shared part in its states; a new part is reviewed there before a page uses it.

## The rules

- **A choice is pills**, never a dropdown.
- **Ask before an action with Confirm**, never the browser's pop-up.
- **A document reads rendered**, never as its raw Markdown: Doc, everywhere a document shows.
- **Navigation follows the pointer**, never the width: the bottom bar on touch (a phone upright or turned, a tablet),
  the dock under a mouse.
- **The phone's floor:** on touch, `.btn`, `.pill`, `.seg` buttons, `.ask-send`, `.field-send` and a card's ✕ are at
  least 44 px; every text box is at least 16 px, so iOS never zooms.
- **No one-off inline value:** a colour, size or spacing in `style` outside `web/src/ui/` is counted by
  `scripts/check-design.ts` (inside the check), per file, against `scripts/design-baseline.json`; a count that rises
  fails, with the class to use. A value that truly changes at run time goes in a CSS variable. A deliberate exception
  says so on its line: `design-ok: <why>`.
- **Enter submits** in any box; Shift+Enter makes the line. The box says so underneath.
- **Boxes are native dialogs** (`showModal`): Esc, Android's Back and a click outside all close them, and closing
  never loses typed words — drafts live on the device until Save or Discard.
- **One thing happens where the eye is**: when background work finishes on an open screen, its result opens itself.
- **Paths are shown in full** (mono, break-all) wherever two files could share a name.
- **Space before decoration:** cards breathe (16 px padding, 12 px gaps, relaxed leading) before any new visual
  element is added.
- **Phone first, computer wide:** one column on the phone; on a computer the shell widens and side rails may appear.
  Every screen is checked at both widths in a real browser before it ships.

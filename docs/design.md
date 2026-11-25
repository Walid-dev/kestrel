# The design system

One look for every screen, set here once. Components use the tokens; a new screen uses the components; a change to
the look happens in `web/src/styles.css` and `web/src/ui/`, nowhere else. `/design` shows every part at its real size.

The look since 2026-11-24: small, calm and precise under a mouse, comfortable on touch. UI text is 13 px, running text
14, a page's title 26. Every control sits on one ladder. Cards are flat; a screen has one filled button.

## The tokens (`web/src/styles.css`)

- **Ground:** `--bg` (near-black blue; light #fafafa), `--surface` for cards, `--surface-2` for sunk blocks and chips,
  `--surface-hover` for a hovered row or card.
- **Lines:** `--line`, quiet, draws structure (cards, lists, dividers, bars); `--line-strong` draws a control's edge
  and a hovered card.
- **Ink:** `--text` for body, `--strong` for headings, `--muted` for secondary lines.
- **The lead:** `--accent` — One Dark's blue. The one filled button, links, focus rings.
- **The working colours**, the editor's neon shades: `--pink` (the wolf, the note marks, needs me), `--purple`,
  `--green` (ok, done, diff plus), `--orange` (warnings, asleep), `--yellow` (the moon), `--red` (danger), `--indigo`
  (News' own blue, between the accent and the purple: each app has its own colour and the accent is Notes'),
  `--teal` (Quiz) and `--magenta` (Writing).
- **Words in a colour:** `--tone-text` is how much of a working colour small words take: 100% in dark, 70% in light
  (the rest is `--strong`), so a chip, a tinted eyebrow, `text-tone` and a colour's class (`text-red`) read 4.5:1 in
  both themes (light's tones alone read 2.9 to 4.3). Marks keep the tone itself, 3:1 being their bar: a dot, an edge, a
  bar, an icon (`.app-mark`), the ★ (`text-yellow` stays the tone for it; a word in yellow is `text-tone tone-yellow`).
- **Shades** for what floats: `--shade-dialog`, `--shade-dock`, `--shade-pip`, `--shade-seg`, `--backdrop`.
- **Fonts:** IBM Plex Sans for text, Sans Condensed for headings and the wordmark, Mono for numbers, paths, labels and
  chips. All served from `web/public/fonts`. Only the weights that ship: Sans 400–600, Condensed 600/700, Mono
  400/500; `<b>` and `<strong>` are 600, so the browser never fakes a bold.

The role variables stay on `:root` (dark by default, light with the system); `@theme inline` names them as classes
read at run time: `bg-page`, `bg-surface`, `bg-surface-2`, `bg-surface-hover`, `border-line`, `border-line-strong`,
`text-ink`, `text-strong`, `text-muted`, `text-accent`, the working colours (their text-safe shade) and their soft
grounds. `text-tone` reads the nearest `tone-*` as words; `bg-tone`, `border-tone`, `fill-tone` and `stroke-tone` as
marks. No `dark:` classes.

## The type

Nine steps, each with its line height and, for a heading, its weight (never `font-bold` beside a heading step):

| Step           | Mouse      | Touch | For                                                  |
| -------------- | ---------- | ----- | ---------------------------------------------------- |
| `text-label`   | 11/16      | 11/16 | eyebrows and mono labels                             |
| `text-small`   | 12/16      | 13/18 | hints, meta, dates                                   |
| `text-detail`  | 13/20      | 14/20 | the UI's voice: controls, rows, a card's description |
| `text-body`    | 14/22      | 15/24 | running text                                         |
| `text-read`    | 16/26      | 16/26 | what is read slowly: a lesson, a document, a letter  |
| `text-head`    | 16/22, 600 |       | a card's or a row's title                            |
| `text-section` | 18/24, 600 |       | a section's heading, a dialog's title                |
| `text-lead`    | 22/28, 600 |       | one big line; a child page's title                   |
| `text-title`   | 26/30, 700 | 24/28 | a top page's title, nothing else                     |

Weights by role: 400 text, 500 controls and row titles, 600 headings and emphasis, 700 the page title only. Numbers in
Mono, tabular. Markdown: h1 lead, h2 section (purple), h3 head (cyan); inline code on the detail step.

## The control ladder

Every control's height is one of four steps, set by variables (`--h-*`) that one touch block switches. Heights come
from `min-height`, so a wrapped label grows.

| Step    | Mouse | Touch (drawn) | Parts                                                                   |
| ------- | ----- | ------------- | ----------------------------------------------------------------------- |
| small   | 24    | 32            | `.btn-sm`                                                               |
| choice  | 26    | 32            | `.pill`, a seg's option                                                 |
| control | 30    | 36            | `.btn`, `.btn-icon`, a seg's bar, `.input`, `.disclosure` and back rows |
| large   | 36    | 44            | `.btn-big`, Field's box, text boxes, rows                               |

**The hit-area rule:** on touch, anything drawn under 44 gets an invisible `::after` that makes it exactly 44 tall
(icon-only buttons 44 × 44, square). Rows keep their areas apart: 8 between rows of buttons, 12 between rows of pills;
`.pills-row` and `.pills-inline` do this themselves. Every text box is at least 16 px on touch, so iOS never zooms.

**Radii:** 6 (pills, chips, `.btn-sm`, a seg's options, money, tooltips), 8 (`.btn`, `.btn-big`, `.input`, Field,
the seg bar, tiles, inner blocks, dock items), 12 (cards, lists), 14 (dialogs, the dock, menus), 999 (round).

## Motion

Five tokens: `--ease-out`, `--ease-in`, `--t-fast` 120 ms, `--t-mid` 160 ms, `--t-slow` 220 ms, and `--t-move` for
marks that turn. Hover changes only ground, edge or colour. A press scales a control to 0.97. A page fades in once
when it opens; data that arrives later fades in. Dialogs ease in and out (the fade-out where the browser can animate
the top layer). The working dot pulses every 2 s. One block at the end of the file turns all of it down when the system
asks for reduced motion.

## The shell

No bar on top: each page starts at its own title, under the safe area (a strip under the phone's status bar stays as
the page scrolls). The wolf is Home: first in the tab bar on touch and in the dock under a mouse (Mark's `tight`
option). The open place's icon takes its app's colour (the wolf pink, Live in ink), its name in ink, the others grey;
no ground behind it. Live carries the status as a badge: an orange dot when the computer is asleep, a pink count when something
needs me, a pulsing green dot while something works, nothing when all is idle. Under a mouse the same mark sits in the
bottom-right corner (never on `/live`), in a lane the shell keeps free; its words open on hover or focus, and it opens
Live. The asleep strip leads every page. Gutters 16 / 24 / 32; the page gap is 24 under a mouse, 20 on touch; the
reading width is 720.

## The components

- `.btn` — every button: the control step, 13/500. `.btn-primary` is the one filled button on a screen (a dialog
  counts as its own); a list's per-item actions are plain `.btn`. `.btn-quiet` is a ghost (no edge, no ground).
  `.btn-danger` has red words. `.btn-sm` is a card's secondary action. `.btn-icon` is round, its name in
  `aria-label` and `title`. `.btn-big` is a page's one big action (Write it, Start): never full width under a mouse.
  Full width only on touch, only for the action that ends a form, and for a dialog's primary. Rare actions go at the
  page's foot; no ⋯ menus. A button whose work runs on (Search now) is disabled from the press until the work ends
  and says so: a small spinner and its word ("Searching…"; on touch "Searching") in muted ink, at its idle width.
- `.card` — a surface block: flat, radius 12, padding 14 / 16, on `--line`. A link card's hover is `--surface-hover`
  with `--line-strong`. A card that matters gets a 2 px left edge in its tone. `.card-actions` is its action row;
  `.inner` is a block inside a card (`--surface-2`, radius 8); never a card inside a card.
- `List` and `Row` (`web/src/ui/list.tsx`) — a list in place of a stack of small cards: `to`, `href` or `onOpen`,
  `icon`, `title`, `line`, `end`; `cols` gives two columns from 64rem. Rows are 40 / 48 (one line) or 54 / 62 (two),
  their hairlines start at the text.
- Chips are mono, 20 tall, in the caps voice (`chip chip-caps`), one colour per meaning: needs me pink; review today
  cyan; learning, Ask and deep work purple; done and at work green; new muted. On Live's Now, work at work reads the
  same whatever its kind: the green edge and pulsing dot, the kind in muted words, no chip; a search is muted in the
  Activity log too, never purple. `.money` is the pay or price pill
  (Mono 500 12, 22 tall) in the money scale's tone. A listing the rules set aside leads its card's head with its
  reason, in the Left out stage's grey ("Left out · US only"), until a stage is pressed. A filter's All comes first.
- `Dialog` (`web/src/ui/dialog.tsx`) — every box: a native dialog opened with `showModal`, 440 wide (900 with `wide`),
  radius 14, its title on the section step. Props: `open`, `onClose`, `title`, `eyebrow`, `children`, `actions` (the
  main action last), `wide`, `busy`, `alert`. Esc, Back, a tap outside and ✕ close it; typed words stay; focus returns
  to the opener; a child marked `data-autofocus` gets the first focus. Buttons at the right; on touch the primary takes
  the room.
- `Confirm` (`web/src/ui/confirm.tsx`) — every question before an action:
  `const sure = useConfirm(); if (await sure({ title, body, yes: "Delete", danger: true })) …`. The no-button is
  always Cancel; with `danger` the action is red and Cancel takes the focus; one question at a time, and a page left
  behind answers no.
- `Pills` (`web/src/ui/pills.tsx`) — every choice shown whole, on the choice step; a picked pill is neutral, not
  filled. Props: `label`, `showLabel`, `options` (`value`, `label`, `count`, `tone`, `hint`, or `onPress` for an
  action pill such as Show all), `value`, `onChange`, `multiple`. They wrap and never scroll sideways. A toggle beside
  a group sits in `.pills-inline`.
- `Seg` (`web/src/ui/seg.tsx`) — a choice among two to four, as one bar as wide as its words: `label`, `options` (with
  `hint`), `value`, `onChange`, `modes`. What a pick means goes in its hint line under the bar, never a second line
  inside it. `seg-modes` marks the picked mode with a dot.
- `Star` (`web/src/ui/star.tsx`) — anything kept for later. On a card or a row, `bare`: the ★ alone at the right end
  of the card's top line (a news story, where Searches' cards show theirs) or of the row (All days' Starred), and the
  toggle itself: grey while off, yellow while on, no word, named by `label` ("Star “<headline>”"), drawn 32 round (44
  on touch) with its margins taken back, so the row keeps its height. In a sheet (Searches' listing), the pill: a
  yellow ★ and Star or Starred, pressed while starred, beside the other actions. Props: `on`, `onPress`, `busy` (a
  press on its way: drawn in its new state, more presses ignored), `hint` (on hover), `label`. A page that keeps
  stars says where they are one tap away: News' head has "★ Starred N" beside All days.
- `.tile` — a big choice (56 / 60), only when two or more options each need a line under the name; picked, it takes
  the accent edge and a ✓, on its own ground (no tint).
- `Doc` (`web/src/ui/doc.tsx`) — every document: Read, Edit and (1024 px and wider) Side by side, with a Download
  menu (the text, Save as PDF, Copy). Its Markdown is `src/shared/markdown.ts`, drawn by `web/src/ui/markdown.tsx` in
  `.md`. A note's mark is `.doc-mark` (`--pink-soft`, a `--pink` line under). The editor `.doc-src` is mono, 16 px on
  touch. `tools` puts a page's own buttons in the document's head while reading. A document only read can leave its
  head out (`bar={false}`) when its page shows `Downloads` itself, in a card's actions (a Writing try: one card for
  the try, the document under it); the menu opens under its button, right edges lined up, or left edges near the
  screen's left. A control that floats over a document (Notes' Note button) is a soft accent, never filled.
- `Page` and `PageHead` (`web/src/ui/page.tsx`) — every page's head: `title`, `eyebrow`, `app`, `line`, `actions`,
  `back` (`{ to, label }`), `sticky`, `width` (`wide`, or `reading`: 720 at most), `titleAs`. Every page has an
  eyebrow, tinted by `app` in its app's colour (the head's one accent). A top page's eyebrow names what the app holds,
  or the area it sits in, in a word or two and never its own title again; a child page's says where it sits (its parent
  group, its part and topic), the app's word when it sits nowhere else. The words: Learn "Lessons", Interview prep
  "Answers to say", Quiz "Learn" (it quizzes the lessons), Notes "Documents", Tasks "To do", Research "From the web",
  Applications and Writing "Jobs", Cost and Models "The models", Chat "Agents". Searches tints its own by the hunt's
  kind; News' is the day, muted; Live's is the view, muted ("Now", "This week": it has no colour). The line under the
  title is one line, two at most, never a paragraph: facts with the values bold, or a state chip and facts; what a
  page needs explained goes in a hint or a title. A top page's title is the title step; a child page (one with
  `back`) gets a back row (30 / 44) and its title a step down. Under a mouse at 48rem or
  wider a top page's buttons sit on the title row; otherwise they wrap 12 under the line. A page's state chip goes in
  the line under the title. `aside` (Home's "One app, one computer, local models.") sets a short statement beside the
  head, past a thin rule: plain text on the small step with its own line height, centred on the eyebrow and the
  title, wrapping as words do (balanced), never stretched to their height. It takes the place of `line`, and it wraps
  before the title does.
- `Ask` (`web/src/ask.tsx`) — the same box on every app: its head, the conversation, starters, a line to ask. `bare`
  puts it inside a card that belongs to the page (a news story): no card and no head of its own, the page opens and
  closes it, Start over beside the line to ask.
- `Card` (`web/src/ui/card.tsx`) — plain; `to` makes the whole card a link; `title` gives it the Searches card's
  anatomy: `meta` (the top line's left: a chip first, then a muted group), `end` (its right end: the date or the
  source, small and muted, a time in `font-mono`), the title with `figure` beside it (its key number: a `.money` pill,
  a ring), what it holds under it (one muted subline, facts with only the values bold), then `actions` (`.btn-sm`,
  `.btn-quiet`). `to` or `onOpen` opens it by its title; `onRemove` and `removeLabel` give it the ✕ (it waits out of
  sight under a mouse until hover or focus); `tone` colours its edge; `wide` spans the grid's row. A card built by hand
  (a question in Practice) spells its top line with the same classes: `.card-meta`, `.card-meta-main`, `.card-end`, or
  `.card-end-link` for a link in the end's place (the lesson a question comes from: quiet, cut short, 44 tall on
  touch).
- `Figures` and `Figure` (`web/src/ui/figures.tsx`) — a page's figures, one strip of cells before its detail (Home's
  morning, Learn's lessons, Cost, Applications): each cell its `label` (an eyebrow), a dot in its `tone` and the
  `value` in mono, a `note` beside it or lines under it (`children`); `to` makes the cell a link, `hint` says what it
  counts on hover, `quiet` greys a value with nothing to count, `pulse` a figure at work, `wide` gives a cell a phone's
  whole row (Cost's cloud, with its lines). Three across on a phone (two when the cells that share rows would leave one
  alone), one row from 48rem. On `Figures`: `label` (read out), `tone` (the strip's 2 px left edge, for what matters
  now: lessons to review), `foot` (a row under all the cells for what reads them: Learn's bar and its one action),
  `busy` (dimmed while another period's figures come).
- `.data-table` — figures compared row by row (Cost's models and prices, the Models page's calls), in a card: names
  on the left, every figure in mono and right-aligned in its column, eyebrows for heads, rows 40 tall on hairlines; a
  count that means trouble in red, a nothing in grey.
- `SectionHead` (`web/src/ui/section.tsx`) — every section's heading: `title` on the section step, `count` in small
  muted mono beside it, `tone` a dot before it when the colour means something (News' sections, a lesson's state),
  `hint` one quiet line under it, `id` for the section's `aria-labelledby`. Never the count in the section's colour,
  never "Name · 12".
- `FilterPanel` and `FilterRow` (`web/src/ui/filters.tsx`) — Searches' filter card for every list that filters:
  `find` (the search box), `onReset` and `changed` (the round Reset, lit while a filter differs from how the page
  opens), `fold` (the button that folds the rows away: `name`, Filters unless said, and the `count` it shows folded),
  `folded` (what a folded card shows: the picks, each opening the rows again), `busy` (a bar sweeps its foot). A row:
  `label` (an eyebrow), `open` and `onToggle` (its own fold, `summary` said while folded), the pills beside it under
  a mouse, over them on touch; the names make one column as wide as the widest, up to 10rem (Searches' page spells
  the same rules with its own classes, `.search-part`, its names in a column of 72). A filter's All comes first in its
  row: Learn's rows are its parents, each opening with All (the parent's page), then its packs.
- `WithRail` and `RailPart` (`web/src/ui/rail.tsx`) — News' layout for a page with secondary things beside its main
  column (the history, the sources, a form, the done ones): from 64rem the main column (52rem at most) and the rail on
  its right (280 to 340, 32 apart); on a phone one column, the rail after the main one. `railFirst` where the rail
  starts the work (Research's question): the rail is first in the page, so a phone shows it first and the keyboard
  and a screen reader meet it first, and a computer still sets it on the right. Each column holds to its width (a
  document's wide table scrolls inside it). `className` carries a page's own rules: a rail that stays in view while a
  long main column scrolls (the reader's notes, a report's sources). A rail's part is headed by an eyebrow with its
  count ("Your notes · 3"), never a section heading; `headRef` makes that heading where the focus goes when what had
  it goes (a deleted note). The pages with a rail: News (its own classes, `.news-layout`, one rule with these), the
  Notes reader, Quiz, Tasks, Research and an answer, Writing.
- Blocks of words — words set apart inside a page or a card sit on the sunk ground (`.inner`), never on a tint behind
  them. A block in a tone (`.callout`, a guide's; `.read-box`, a verdict; `.quiz-answer`, the lesson's answer; the
  drawings' tip, warning and check) says its meaning with a 3 px edge in its tone (the accent unless a `tone-*` says
  otherwise) and its tinted eyebrow or chip. A change Ask proposes (`.ask-card`): its 2 px edge, the accent while it
  waits, green done, red failed.
- The app map (`web/src/ui/apps.tsx`) — each app's address, icon and colour, set once: `APPS`, `appTone(app)`,
  `AppIcon` (the icon in its colour, a mark). Home's rows, the tab bar and the dock, PageHead's `app` and the Models
  page's groups (their eyebrows; Ask's group purple, as Ask's mark) read it. Searches green, Chat cyan, Learn purple, Notes the accent, Tasks pink, News indigo, Research
  yellow, Quiz teal, Applications orange, Writing magenta, Interview prep good; Cost and Models the models' yellow;
  Live none.
- `EmptyState` (`web/src/ui/empty.tsx`) — nothing here yet, in one voice, plain text in the flow (no box): `title`,
  `line`, `action`, `detail`. A page whose item is gone says so with it (Notes' reader, a lesson: its title "This
  lesson didn't open", the state's words "This lesson isn't here any more.", the way back as a plain `.btn`) and never
  retries a 404: its query takes `retry: (n, e) => e.message !== "404" && n < 3`, the error's message being the
  status alone; any other failure says "It didn't load." with Try again.
- `Field` (`web/src/ui/field.tsx`) — a box where Enter sends (Shift+Enter makes a line), its round send button inside,
  a hint under it; `tall` starts at three lines; a long word or a pasted link breaks inside it. Without `onSend` it is
  a search box, and a tap anywhere on it focuses.
- `.input` — a plain text box where a form's button sends (a setting, a short answer): one line, on the control step,
  16 px on touch. Never `.btn` on a text box.
- `.disclosure` — every fold-out heading (a details' summary): a control row, 13/500 muted (ink when open), a ▶ that
  turns; never alone in a card of its own.
- `cx()` (`web/src/ui/cx.ts`) joins class names.
- An inline source (Research's site name after a claim) is a quiet link, as the facts line: the small step, regular,
  in a softened accent (60% accent, 40% muted: AA on a card in both themes); on hover an underline, the accent drawn
  a quarter toward the ink. Two with nothing between them part with a dot (`.cite-sep`).
- Patterns the pages share: a page's view switch (Live's Now and Activity, Applications' period) is a Seg; a read-only
  document is Doc without `onSave`; a page whose item is gone says so in plain words and doesn't retry; the listing
  sheet is the wide Dialog, its title and ✕ kept in view on tall screens, Apply at its foot; a stage's colour comes
  from one map (`STAGES`); a history (News' All days) lists by month, a hundred at a time with Show older, a find at
  its top and a ✕ per row that deletes after Confirm, and a Seg before them for what was starred (the page's head
  links straight to it, `?view=starred`): there a ★ taken off leaves its row in place, struck through, until the page
  is left, and gives the star back.
- Home, top to bottom: the head (the date over the wolf and kestrel, the aside beside them), the news card (News in
  indigo, its headlines in words alone), the live line and the figures (the shared `Figures`), the apps (each its own
  colour, from the app map), then Cost and Models.
- The Searches standard, for every page (Searches and News are the references): one card anatomy repeated (`Card`:
  a meta chip on the left, the date or source on the right; the title with its key number as a pill beside it; one
  muted subline; facts in muted text with only the values bold; the actions last); numbers in mono, on scales and
  tones; a page's figures as one strip of cells (`Figures`) before its detail; sections headed by `SectionHead`;
  filters in `FilterPanel`; secondary things in a rail on the right (`WithRail`); tables with aligned mono columns;
  explanations in hints and titles, never a paragraph over two lines.
- `/design` shows every shared part in its states, the ladder at real size with its drawn and touch heights measured
  on the device that shows it, and every type step with its roles; a new part is reviewed there first.

## The rules

- **One filled button per screen.** Everything else is a plain, quiet or small button.
- **Colour with meaning, small:** each app's colour on its eyebrow and icon, status tones on chips, dots and edges,
  numbers in mono; never a tint behind words. Small coloured words read 4.5:1 in both themes (`--tone-text`); a page
  in one grey goes back.
- **A choice is pills or a Seg**, never a dropdown.
- **Ask before an action with Confirm**, never the browser's pop-up.
- **A document reads rendered**, never as its raw Markdown: Doc, everywhere a document shows.
- **Navigation follows the pointer**, never the width: the bottom bar on touch (a phone upright or turned, a tablet),
  the dock under a mouse.
- **No one-off value:** `scripts/check-design.ts` (inside the check) counts inline colours, sizes and spacing outside
  `web/src/ui/`, raw colours, `font-bold` beside a heading step, `btn-head`, a px, rem or em font size in
  `styles.css` and a radius off the five; it reads every word of a `className={…}` expression. Each file's count may
  not rise above `scripts/design-baseline.json` (empty: every file is at zero). A value that truly changes at run time
  goes in a CSS variable; a deliberate exception says so on its line: `design-ok: <why>`.
- **Enter submits** in any one-line box; Shift+Enter makes the line. The box says so underneath.
- **Boxes are native dialogs** (`showModal`): Esc, Android's Back and a click outside all close them, and closing
  never loses typed words — drafts live on the device until Save or Discard.
- **One thing happens where the eye is**: when background work finishes on an open screen, its result opens itself.
- **Paths are shown in full** (mono, break-all) wherever two files could share a name.
- **Space before decoration:** room and hierarchy through weight and space, before any new visual element.
- **Phone first, computer wide:** one column on the phone; on a computer the shell widens and side rails may appear.
  Every screen is checked at both widths in a real browser before it ships.

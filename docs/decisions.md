# Decision log

One entry per decision: the date, what was decided, why, and what was rejected. Newest on top. Entries are short and
technical; the plan and the runbook carry the detail.

## Decided

- **2026-11-23 · Stop and Pause from kestrel; Enter sends; About me in Notes; deletes on every list.**
  Live's chat card and the Chat page carry Stop. On an application it asks: only this one (the next queued one
  starts), or this one and the queue (the queue pauses first, so nothing starts between). The queue line on Live has
  Pause and Play. Both go through kestrel's server to the old setup's existing routes (`/api/chat/stop`, which calls
  dsh's keyed `/chat/stop`, and `/api/queue/pause`, whose pause also holds kestrel's claims), so neither dsh nor hunt
  changed. Search cards and the listing sheet show the application's state (Queued, Applying, Needs me, Sent; Apply
  again after Not sent) in place of a fixed Apply. Text boxes show the focus by their border, not a ring. Enter sends
  in every box with a send button; Shift+Enter makes a line. The flow drawing lies across the page, a colour per step,
  and turns vertical when narrow. A quiz can ask new questions, each written by the model away from the lesson's own.
  Research and Writing's tries delete from their cards. About me left Research's page for a file opened in Notes, like
  the voice and the stories (versions kept; its path is in `platform/paths.ts`). A PDF's text says it never changes
  the PDF, and downloads or copies. Rejected: a stop route of kestrel's own into dsh (it would need dsh's key).
- **2026-11-23 · Notes reads like a lesson and keeps every version; lessons teach the field.**
  Picking words shows a Note button beside them (no mode to switch on); the page says what it is and how notes work;
  "Turn my notes into an edit" waits for a note instead of failing. Every save and undo keeps the words they replaced
  (migration 024), and Restore brings any of them back, never over a file changed outside kestrel. My voice and stories
  are reworked there (Writing opens them; its own editor went), so they have one way to change and a history. Outside
  my Personal packs, Ask, the quiz's questions and its explanations teach the field, not my setup; the 20 AI and
  Platform lessons written through my setup were rewritten by the careful model into the field's terms, the old text
  kept in the data folder's backups. Research lays its report beside its sources; the flow drawing became a vertical
  stepper. Chat on a computer opens dsh through its door, so the first visit carries the sign-in. Rejected: a lesson
  rewrite by hand, one by one.
- **2026-11-23 · One Ask on every page; Ask draws; PDFs through the computer's own engine.**
  Ask is one box, the page wide, at the same kind of place on every app; its head opens and closes it (kept per app
  in this browser). Notes' moves under the document (its side column was too narrow); Searches' sits under the
  title and its own Ask button opens it. Research, Writing and Applications get it (Applications proposes Retry as a
  card); Interview prep's answer-packs open on Learn's lesson page, which has it. Ask draws two kinds of picture the
  page lays out itself, a flow and a comparison, named in its prompt as JSON blocks: a model can't place a hand-made
  diagram's coordinates well in a chat, so Learn's diagrams stay for lessons. A PDF upload in Notes becomes its text
  through Apple's PDFKit, the engine Preview uses, in a small program of its own process that deploy builds: nothing
  to install, Apple's updates, and nothing in a PDF runs. Rejected: pdf.js through unpdf (a 3 MB package running
  inside kestrel). Writing takes Learn's tiles and headings; "Left to do only" became "Not applied yet".
- **2026-11-23 · Ask reads like a lesson; the switch in three colours; left to do only.**
  Ask's answer takes the lessons' boxes: the direct answer in its own tile, headings as a lesson's, each point of a
  list in a tile with its mark, a quote in the example's box (labelled by a short line before it); a one-line head
  and a line to ask with its send button inside, tightening in a narrow column instead of wrapping. The quiz shows
  what I said and the lesson's answer side by side as tiles. The hunt switch lights each mode in its own colour as
  the old pages did (On green, Quiet amber, Paused red). "Left to do only" (on by default) hides from the review
  views a job that has an application or that I applied to. The deep check chip stays one colour, its verdict's.
- **2026-11-23 · kestrel pings my phone, and the chair hunt lives here.**
  kestrel sends pings through ntfy, the old setup's channel (my yes): each channel's topic is read from its file at
  send time and never printed or kept. This lifts v0.3's "no push service that leaves the computer" for pings only;
  what a ping says is the deal (model, price against the usual, place, site), as the old ones did. A deal hunt that is
  On pings after a run for the new deals in view at 65% of the usual price or under, one ping per run. The 20 chair
  searches run at the old timer's 10:00 and 20:00, On; their first catch-up ran Quiet, so no ad already pinged by the
  old setup pinged again, and the old chair hunt is Paused (its own switch). The job hunt is Quiet: kestrel doesn't
  ping for jobs while the old Job Hunt does. Rejected for now: the old Deal Hunt's model read of every ad (the rules
  and a deep check on tap stand in for it).
- **2026-11-23 · Searches' head as the old hunt page, with its switch; Live shows the agent's steps.**
  The title, On / Quiet / Paused (written to the hunt's search files: auto and alerts), Search now, + New hunt,
  Settings and Ask on one row, the other hunts in a menu at its end; under it the goal and a status line (the last
  search added up over its go, the best find, the next search). Cards: the model's read blue, the deep check chip blue
  with only its verdict coloured, the last opened card marked, the picked filters shown while folded; applying green
  everywhere, and Home's live line opens Live. Live shows an application's chat step by step, read from the old
  setup's Live until kestrel reads dsh's chats itself (`settings.oldLive`).
- **2026-11-23 · Ask on Notes and Tasks.**
  Notes proposes notes (on exact words, or the whole document) that my tap adds; the page's own Ask for changes then
  edits, so a document keeps one way to change. Tasks proposes adding, changing and closing tasks. Both follow the
  Searches blocks; the domain tests cover a dropped card and each tap; a live question on each list was checked.
- **2026-11-23 · Ask acts on Searches: a find it runs, changes it proposes as cards.**
  The model sees the hunt (its counts, its best open listings, each line starting with the listing's id). It asks
  kestrel for more with a fenced `find` block (words, remote, pay, price, a stage, a match), whose matches go back to
  it before it answers, two looks at most; it proposes a change with a fenced `action` block (a stage, a deep check,
  an application), which becomes a card under the answer that only my tap runs, through the page's own functions.
  Blocks never show as code; a change on a listing that isn't there is dropped, and a link to one becomes plain
  words. Chosen over the door's tool calls: the blocks stream with the answer, need nothing from the client and read
  the same on both models; the live eval passed 24 of 24 on the final prompt, after three prompt changes it measured
  (docs/eval/2026-11-23-ask-searches.md), so Ask keeps the fast model. Rejected: a change made without a tap.
- **2026-11-23 · The apply queue gets its hands: the old setup's runner.**
  Apply queued in kestrel, and nothing ever claimed the queue: the old runner (hunt serve, one task at a time) now
  takes kestrel's next application once nothing works and its own queue is empty, starts the agent's chat as before,
  and reports the end back (sent, not sent and why, or waiting at the computer). kestrel's searches wait while an
  application is at work, and its claim waits while a search of kestrel's runs. Rejected for now: kestrel starting
  the chat itself (it would need the old runner's chat reading, report and ping again: the cutover's work).
- **2026-11-23 · A job open only elsewhere is set aside.**
  A search's scoring may say where a job must be open (`places.within`, the first word naming it) and what a posting
  says when it isn't (`places.closed`); a job whose place names somewhere else, marked US only, or whose text closes
  it is set aside with why, at scoring, on a spec save and in the nightly mirror. A short code in capitals counts only
  as its own word; a junk place line or a bare two-letter code keeps the job. A dry run on the real listings came
  first: what it newly set aside was all outside.
- **2026-11-23 · One tab per job search; searches at set times.**
  A job search without a hunt of its own no longer stamps its name on what it finds (migration 022 clears it), so its
  finds and the carried-over ones share one tab. A search may run at set times of the day (`times`), sleep-proof,
  ahead of moving the deal searches here on the old timer's hours.
- **2026-11-23 · The look: a plain dock, a colour per app, Chat from edge to edge, the Quiz start made over.**
  The dock's coloured tiles go (they didn't look good); on Home no two apps share a colour (Searches green, Learn
  purple, Quiz teal, Writing magenta: two new tokens). On a phone, Chat fills the screen between its title and the
  bottom bar, with no frame around it. The Quiz start page: the started quiz large with a ring, the new quiz as
  bars and tiles with one button that says what it starts, two columns on a computer. dsh's chats page drops its
  cards inside kestrel's frame, and keeps the old app menu when opened on its own (the setup's log, 2026-11-23).
- **2026-11-22 · Ask on every page, one conversation per page.**
  One Ask for every app (web/src/ask.tsx, /api/ask): each app's helper writes what its page shows; the
  conversation is kept per page (ask_messages, by app and ref); the answer is Markdown, streamed into its row and
  read by the page while it grows, so leaving the page loses nothing. One model use, `ask` (it replaces
  `learn-ask`; a saved pick carries over), the fast model by default after the live eval
  (docs/eval/2026-11-22-ask.md); the eval now scores Ask's prompt. Built on Learn's lessons and the quiz's
  questions; actions (reading ones at once, changing ones as a card to tap) come per app, Searches first
  (docs/tasks/v0.7-ask.md). Rejected: a JSON answer of ten lines (it could not stream, nor hold code or a table);
  Server-Sent Events per answer (polling a row while one writes is simpler and survives leaving the page).
- **2026-11-22 · A quiz is kept as I take it.**
  The questions, my answers and marks, and my place live in `quizzes`; the quiz page lists the started ones to
  continue and the ended ones with their score; a question opens again from the score, with its Ask. A question
  written for a lesson without a check is kept in the quiz. Rejected: keeping the quiz in the browser (leaving lost
  it).
- **2026-11-22 · A deep check's verdict in its colour; one colour per app.**
  The deep check chip takes its verdict's colour (apply or buy mint, maybe or negotiate orange, skip coral). Every
  app has its own colour, the same on Home's cards and on the dock's tiles. Rejected: one blue chip for every
  verdict (good and bad looked alike).
- **2026-11-22 · The money scale, loading that shows, and colour by meaning.**
  A pay or price pill takes the old hunt pages' scale by match or deal (mint, lime, amber, coral); the model's read
  is purple, the deep check blue, remote cyan; Learn's packs wear their parent's colour (Personal green, AI purple,
  Platform blue) and Review today is cyan. While a filter's results load, the old cards and counts stay dimmed
  under a sweeping bar (keepPreviousData), the first load shows skeletons, and a pressed stage shows at once.
  Rejected: one green for every good thing (the page read as a wall of green).
- **2026-11-22 · The quiz explains; Research asks, knows me and names its sources.**
  After each question the fast model writes the answer as a small lesson (in one line, break it down, an
  analogy, code when technical, the usual mistake, a line to remember), started while I answer and kept per
  question; I don't know counts as a miss. Research may ask up to three questions first (the fast model, a few
  seconds); About me and the context folder's files go into the writing prompt only, never into a search query;
  each [n] becomes a link named for its site. Rejected: a richer marking call (slower, and the mark is not the
  explanation).
- **2026-11-22 · Writing, not Cover letters; Tasks the old Hub's way; notes on just the words.**
  The writing lab writes a letter, a form's answer or any text for a job, each the application's way, a PDF only
  for a letter. Tasks takes the old Hub's list: whom a task is for, words edited in place, a round tick that asks me
  no note (an agent's close keeps its note), delete. A note's selection is decided once, when the pointer lifts: a
  click handler after the note box took the focus had found the selection gone and noted the paragraph.
- **2026-11-22 · A dock at a computer's edge; Chat by device.**
  On a computer the right edge slides in every app, the old pages' dock. Chat on a computer opens dsh's own app at
  the address its browser is signed in to, in a tab; on a phone it frames the chats page and opens its own window
  through dsh's door. Rejected: framing dsh on a computer through the private network's name, where the computer's
  browser is not signed in.
- **2026-11-22 · Research, Quiz and the letter lab reuse what exists.**
  Research answers in the lesson shape (the blocks Learn already draws, read by Listen), from the model door's own
  search and fetch: quick reads three pages from one search, deep reads six from the searches the model plans; each
  answer is kept. Quiz asks the lessons' own checks (missed lately first, then due, then the rest); the model only
  marks, or writes a question for a lesson without one; the answers are kept so misses come back. The letter lab reads
  the apply skill's letter step from the skill file at run time, writes with my voice, stories and facts, runs the
  applications' own check (each finding back to the model, two fixes at most) and their own PDF tool; voice and
  stories are edited in place, the old words kept in the data folder. Rejected: a letter prompt of kestrel's own (it
  would drift from the skill); a quiz that moves Learn's review ladder (not asked; the answers are kept for later).
- **2026-11-22 · The chair hunt runs in kestrel when asked, with the old collectors.**
  `convert-v1-specs --deals` turns the 20 old deal specs into kestrel searches that run the old collectors through
  node with the old engine's knobs (term, pages, price range, age), under the same file names, so each owns the
  listings the import brought. `auto: false` keeps them off the clock while the old setup still runs them twice a
  day; Search now runs every search of a hunt in the background and counts them down. The deal rules follow the old
  specs: required and excluded title words, a price floor and cap, the ad's age. Rejected: porting the collectors
  (they work, and Facebook's needs the agent's Chrome as it is); both setups on the clock (twice the load on the
  sites).
- **2026-11-22 · Cards keep the model's read; the page opens on To review.**
  The model's read is short and stays on the card; the deep check shows its verdict as a chip, or a blue button that
  starts one, and its report waits in the open listing. The page opens on To review, best first (Priority also counts
  jobs already applied to). Reset is a round button by the search box, always there, lit when a filter differs.
- **2026-11-22 · Chat frames dsh's chats page, in kestrel's look.**
  The chats page sent `frame-ancestors 'none'`, which blanked kestrel's Chat. It now allows the same machine name on
  any port, and nothing else, and wears kestrel's colours and IBM Plex fonts; the old app menu is gone. The page
  lives in the local dsh additions, outside this repo; the frame rule needs a dsh restart.
- **2026-11-22 · v1's stages, the activity log, Learn's parents, the phone bar.**
  To review, Possible and Left out follow v1's rules exactly (left out: new, set aside by a rule, no note; v1's fair
  is weak). An ended activity is kept, so Live's Activity shows the week with a link to each piece of work, and Live
  opens on it when nothing runs. Packs sit under a parent (Personal first, then the technical ones). The phone has a
  bottom bar: Home, Searches, Chat, Learn, Live. A search's settings page writes its file and rescores what it found;
  a skills list split into letters reads back as words (it had scored every posting great).
- **2026-11-22 · Two flakes fixed at the root, and room to think.**
  The deploy retries `launchctl bootstrap` for ten seconds: bootout returns before launchd lets the old service go,
  so every first deploy failed with status 5. A web search that comes back empty or refused is tried once more after
  two seconds. A model answer that ran out of room while thinking says so (the stream's finish reason), and the letter
  and Research budgets cover the thinking and the answer.
- **2026-11-22 · Port the old pages' strengths, not just their features.**
  The first pass built thin screens; the second ports what v1 already does well, checked against its own pages:
  Learn takes the old Learn's method (review from memory, Say it, Record me, the 1-1-3-7-16-35 ladder) and the
  guides' pages (a topic per lesson with its blocks and hand-placed diagrams); Searches takes the hunt page (tabs,
  stages with counts, cards with the pay or price pill, the match bar, the model's read, the whole listing on a
  tap); Live and Cost come over whole. Rejected: inventing new layouts where v1's were already settled by use.

- **2026-11-22 · Packs live in an area: Learn or Interview prep.**
  Learn is for learning; work-specific content (the work topic, the answer files for jobs and projects) starts in
  Interview prep, with the interview helper. One column and one tap move a pack either way, so where work content
  finally lives stays my call. Rejected: deleting or splitting the content — the move is reversible.

- **2026-11-22 · The import reads v1's owner column.**
  v1 keeps my own marks apart from the listing: stars, notes, and every application attempt. The import now carries
  them (193 attempts into Applications, the employer from `company`, the model's read, 42 deep checks), and a deal
  spec's head (hunt, model) groups the deals; a retired spec joins the only deal hunt. Deep checks run here as in
  v1: oMLX's own fetch and search, then the careful model, with a Models-screen use to pick it.

- **2026-11-22 · The computer's voice and ears are one local server.**
  Listen speaks with the Kokoro server v1 already runs (cached in the data folder), and the interview helper hears
  with its Parakeet; both doors must be loopback, like the model door. The device's voice is the fallback.

- **2026-11-21 · The v0.4+v0.5 sweep: one agent round, the rest triaged by hand.**
  The sweep's finders confirmed one serious miss — imported lesson ids hold slashes, so no imported lesson could
  open — plus a dozen honesty gaps (raw 500s for missing things, calm empty states over failed loads, a hot mic
  when the finger lifted during the grant, the brief capped at the practice queue's first page, import CLIs able
  to land real content in the dev folder). All are closed in one commit with tests. Process change, his ask
  ("do not overuse our usage"): verification fan-outs are done — findings are triaged in the main conversation
  by reading the named lines, and the independent read stays with the second model's review rounds.

- **2026-11-21 · A deal is its link; a job is its org and title.**
  The real deal items broke UNIQUE (search, dedupe): second-hand posts share titles and carry no seller name, so
  org|title is the wrong identity there. The engine's dedupe now follows the spec's kind — jobs keep org|title (a
  repost under a new link is the same job), deals use the link (two same-titled chairs are two chairs). The v1
  import carries the old deals the same way: 426 landed, the vocabulary mapped onto the one status set
  (contacted→applied, not→passed, sold→closed), the 0–10 score onto the 0–100 card. Rejected: widening the status
  vocabulary for deals — one set keeps every screen and filter shared.

- **2026-11-21 · The Learn import maps each old shape to the one lesson shape.**
  The old lessons land as packs by topic, their one-line short opening the explanation. A guide contributes its
  term entries as lessons (the {like} analogy lines read plain) and its glossary as a closing Words lesson; the
  prose stays on the old page until retirement. An interview answer file becomes an answer-pack: the A lines are
  the say lines, M/P/W the explanation, the K points the example, and the question itself a check — so Practice
  can quiz prepared answers and Live can find them. Stable ids everywhere: a rerun updates, never doubles. The
  real run: 12 packs, 325 lessons.

- **2026-11-21 · The door's ear is not a chat model.**
  Live transcribes through the door's own ear, found by name (EAR in src/ai/asr.ts), and the Models screen's picks
  filter ears out — a switch to one is refused. The ear's files fail to load in oMLX right now ("not supported for
  stt"); kestrel's side relays that in plain words and works unchanged once the door reloads it.

- **2026-11-21 · Ask's fallback is the careful model; the second live eval is on record.**
  The Ask eval ran live, 13 of 16 (docs/eval/2026-11-21-learn-ask.md): the careful model 8 of 8, the fast one 5 of
  8, every failure a line too long to say in one breath. Ask is awaited and Listen speaks it, so the fallback in
  `modelFor` moves to the careful model; the Models screen still switches it per use. Rejected: loosening the
  one-breath rule to fit the fast model — the rule serves the ear, not the model.

- **2026-11-21 · The v0.2 sweep's eleven findings are fixed in two rounds.**
  An orchestrated sweep (finders per lens, adversarial verifiers) confirmed eleven distinct findings; all are
  closed with tests: filters moved into SQL before the window (a starred row can never vanish behind newer rows);
  dedupe scoped to its own search, so two searches sharing a link each keep their own score; the scheduler takes one
  tick at a time, lands a crash as a run row, and one broken spec no longer stops the rest; pay annualizes its
  period before the floor and the card shows the honest range; the nightly mirror reports on the Searches page;
  the Models screen shows load failures and refused switches; phone form controls hold 16px so the keyboard never
  zooms; run-now refuses a switched-off search; the service log carries one-line errors, never stacks; and the
  fixtures went fictional, so the public tests read as fixtures, not as anyone's hunt. Two reported findings were
  checked and found false (the importer dying mid-loop; the backward clock).

- **2026-11-21 · The v0.2 plan review's three findings are in the contract.**
  (1) The collector door's whole contract is stated and built: a script runs in its own folder with the spec's env
  and budgets, browser-down is its own problem kind, and runs go one at a time whoever asks — the collectors share
  one browser tab. (2) The import is idempotent with the old database as the status authority until cutover; its dry
  run proves stars and scores, not just row counts; a converter turns the old hunt specs into data-folder files; pay
  carries its period and an hourly wage annualizes before the floor. (3) The side-by-side week never double-drives
  the browser: the old setup keeps the browser scripts, kestrel mirrors nightly through the import and runs only its
  generic jobspy wrapper until cutover. Also from the review: a Models pick must be one the loopback door offers (the
  switch is refused when the door is down), and the old "refuses a model not listed in my settings" line in AGENTS.md
  now states the real rule.

- **2026-11-21 · Auto mode for v0.2–v0.5; the search engine is generic, the sites are data.**
  The builder builds the remaining versions without per-step GOs, pushing continuously to this repo only; reviews
  run per version by orchestrated agents and at the end by a second model over the whole repo. For Searches, the
  repo holds a generic engine (specs, runs, limits, scoring, reporting) and speaks the old setup's collector
  convention; the per-site scripts and my search terms live in the data folder, since they are personal and
  site-fragile. Rejected: porting site scrapers into a public repo.

- **2026-11-21 · Round 2 is applied: ten findings, ten commits, each with its test.**
  The rules it added: the model door must be loopback — documents never leave the computer; a change must cite a
  real open note on its own document, and a note the model forgets is named, never dropped; documents travel to the
  model under their full path, so same-named files cannot cross; undo refuses a file changed since the save; a
  mixed-line-endings file is refused rather than rewritten; uploads send their raw bytes for the server to judge;
  the review diff is bounded; settings errors are path-free; content decides what is text. The outcome table:
  docs/review/round-2-v0.1.md.

- **2026-11-21 · Darker ground, the neon working colours, pink kept; Enter submits; the review opens itself.**
  The One Dark structure stays, on a darker ground (`#15171c`) with brighter text, and the working colours step up to
  the editor-neon shades the code palette uses — pink comes back for the note marks. Enter submits in any box
  (Shift+Enter makes the line), the app's rule from here on. When an ask finishes while the screen is open, the
  review opens by itself. Clicking outside a box closes it, like Esc and Android's Back — the common flows hold
  everywhere.

- **2026-11-21 · The colours are the editor's own theme; noting is a mode.**
  The palette is Atom One Dark, read from the editor's theme file (and One Light for light mode): blue `#61afef`
  leads, with the theme's purple, green, orange, yellow and red as the working colours; the pink accent is retired.
  Buttons speak with one voice (`.btn` in styles.css, the hunt pages' size), headings use `--strong`. The review
  reads as a code diff: minus lines red, plus lines green, the whole document when it is small, the changed parts
  with context when it is big; a draft keeps the text it was made from for that. Noting is off by default: a switch
  turns it on, and then selecting words or tapping a line asks for the note at once; each note in the rail carries
  its own delete.
  Replaces: the pink-led palette of the same day. Rejected: pink as the main colour; the two-colour inline word diff.

- **2026-11-21 · The models for Notes, and how they are asked.**
  The first live eval (docs/eval/2026-11-21-changes.md): 31 of 32 runs pass. Qwen3.8-27B-oQ4e-mtp is the careful
  model (16 of 16, 9–40 s) and Ornith-1.5-35B-A3B-MLX-4bit the fast one (15 of 16, 2–53 s; one empty answer on the
  trickiest case, which the app turns into a failed draft). Asks run with thinking on — the fast model drifts from
  the shape without it. The model door's JSON mode stays off for the big write: its grammar pushed both models into
  top-level arrays; the prompt asks for one object, and the client parses the whole text, falls back to the brace
  slice, and unwraps a one-object array. Defaults live in `src/platform/config.ts` (MODEL_DEFAULTS); settings.json
  overrides them.
  Rejected: the door's JSON mode; thinking off for the fast model.

- **2026-11-21 · The palette is the code palette; the mark is a wolf's face.**
  The second look judgment: the copper palette didn't fit either. The ground is now the hunt pages' dark
  (`#11141b` family) and light; the colours are the editor's code palette, the same shades `/hub/code.js` uses —
  pink `#ff757f` as the accent, violet, green and orange, each app card's glyph in its own one. The type is the
  hunt's: IBM Plex Sans for text, Sans Condensed for headings and the wordmark, Mono for data, all served from
  `web/public/fonts`. The mark is one wolf-face polygon, the eyes cut back to the ground, the same points in
  `web/src/mark.tsx`, `favicon.svg` and `scripts/make-icons.ts` (a ray-cast polygon fill, sampled 3×3; first a
  howling silhouette, swapped for the face on the same day's ask). GO 2 was given on this design.
  Replaces: the 2026-11-20 palette and feather mark; the entry below keeps that day's other fix (the fonts are
  really served).

- **2026-11-20 · The design system is kestrel's own.**
  The gate-2 look judgment failed the guides' palette: flat, not polished. Two causes fixed. The palette is now
  kestrel's (warm graphite, cream, copper — the bird's colours), dark and light, all tokens in `web/src/styles.css`.
  And the IBM Plex fonts were named but never served, so every screen fell back to system fonts; they are now served
  from `web/public/fonts` (Sans variable, Serif for the wordmark and headings, Mono for data), never from the
  internet. One feather mark, drawn once and reused (`web/src/mark.tsx`, `favicon.svg`, `scripts/make-icons.ts`).
  Rejected: keeping the guides' palette; loading fonts from a CDN.

- **2026-11-20 · Navigation: a launcher, then one app at a time.**
  Home is the launcher. An app takes the whole screen, on the phone and on the computer; the top bar's mark returns
  home; the browser's Back always works (real routes, no overlays that trap it). Built from the Notes screens on.
  Rejected: apps beside each other on one page, as the old setup's hub does.

- **2026-11-17 · Deploy takes main, or a gate branch being judged.**
  A gate's GO is a judgment of the deployed app, which happens before the merge; so deploy accepts `gate-*` besides
  main. Committed code only still holds: deploy refuses a dirty tree and checks out an exact commit.
  Rejected: merging before the judgment, which would put unjudged work on main.

- **2026-11-16 · The review's round 1 is applied.**
  Ten findings, all fixed in the plan: the guard moved to the first build step, so nothing is pushed unguarded; its
  scope now covers email addresses, phone numbers and this computer's user and host names; Notes resolves symbolic
  links before the folder rule and takes UTF-8 only; the pre-migration copy is SQLite's own snapshot (VACUUM INTO),
  proven with WAL data; offline is checked on an opened document with notes; a note being typed survives closing the
  app; a model refusal is a tested failure; npm's 7-day rule is described as the filter it is; dialogs open with
  showModal(), which Android's Back closes. docs/review/round-1-plan.md has the findings and the outcome.

- **2026-11-16 · Decision entries are short and technical.**
  What was decided and why, in a few lines; no quotes, no personal details.

- **2026-11-16 · One design system for every screen.**
  One set of tokens (colors, type, spacing) and shared components, so no screen drifts into a look of its own. The
  tokens start from the learning guides' design (IBM Plex, the same dark and light palettes) and are set at the
  app-shell step, judged on the phone and the computer. The result must feel polished on both.
  Rejected: styling screens one by one.

- **2026-11-16 · The repository is public, with generic names.**
  Public needs no sharing setup and keeps the privacy rules honest: the repo holds code and made-up data only.
  App names say what a thing does, not whose it is: Notes, Searches, Applications, Learn.
  Rejected: a private repo; names tied to one use (Job Hunt, Deal Hunt).

- **2026-11-15 · Claude Code builds; a second model reviews.**
  The builder works one step at a time; every step is one commit, explained first and committed on a GO. Codex
  reviews the plan before a version is built (round 1) and the code after (round 2); plan findings are fixed in one
  commit, code findings one commit each with a failing test, one GO per batch.
  Rejected: a local model as the builder, driven by step cards (sessions exceeded the computer's memory; the process
  needed 35 files for three steps).

- **2026-11-15 · Three independent reviews before round 1.**
  The draft plan was reviewed for buildability, simplicity and fit: 74 findings, all applied. The serious ones: the
  sign-in rule admitted other devices; launchd would have run uncommitted code on real data; the first push came
  before the guard; the guard read a file no step created; the eval came after the feature it tests; text replacement
  had no rule for repeated matches.

- **2026-11-15 · Fresh history; only main and gate branches are pushed.**
  The plan is the first commit. Earlier work stays on the computer in `old/*` branches, which the pre-push hook
  refuses.

- **2026-11-15 · One branch per build gate, Conventional Commits.**
  Gate 1 (the plan) commits on main. Each build gate is `gate-<N>-<name>`, merged with a merge commit on its GO.
  Messages: `<type>(<scope>): <what changed>`; v0.1 is tagged at the review gate's GO.

- **2026-11-15 · Only the next version is planned step by step.**
  Steps planned weeks ahead go stale. Each version's runbook is written, and reviewed, when its turn comes.

- **2026-11-15 · Notes is the first app.**
  It is small and self-contained, and it proves every layer: the database, the phone app, the model client, an eval,
  and writing to a real file. Searches and Applications come next.
  Rejected: Tasks first (too little daily value); Applications first (the riskiest part, better on a proven base).

- **2026-11-15 · One source of truth.**
  Each fact is stored once, and every page and agent reads it there instead of keeping a copy.

- **2026-11-15 · One package, one Node process.**
  The process serves the API and the app's files, and runs the background jobs. Folders and one lint rule keep the
  parts apart.
  Rejected: a workspace of packages; separate server, worker and model-queue services.

- **2026-11-15 · Node 26 runs the TypeScript directly.**
  Type stripping is stable in Node 26 (long-term support until 2029-04-30), so the server has no build step. Node
  26.11 or later, for `node:sqlite`'s current class names. Only erasable TypeScript: no enum, namespace or parameter
  properties.

- **2026-11-15 · npm, exact versions, releases at least 7 days old.**
  npm comes with Node, and one package needs no workspace; `.npmrc` keeps the rules in the repo. The age rule is a
  filter (min-release-age): npm picks an older qualifying version or fails, it does not wait.
  Rejected: pnpm workspaces.

- **2026-11-15 · SQLite through `node:sqlite`, with plain SQL.**
  Numbered `.sql` migrations tracked with `PRAGMA user_version`; a small `tx()` helper; WAL mode and STRICT tables.
  The database is copied before migrations run with SQLite's own snapshot (`VACUUM INTO`), which includes committed
  WAL-mode changes; an applied migration is never edited: a fix is a new migration.
  `node:sqlite` is built in, and a few tables need no ORM; zod checks what comes in.
  Rejected: Drizzle 1.0 (its `node:sqlite` support is a release candidate). Fallback: Drizzle 0.45 with
  better-sqlite3.

- **2026-11-15 · Hono 4 for the server, zod 4 at every input, plain fetch to the model server.**
  Hono is small and typed; fetch is built in, and one client of under a hundred lines covers JSON answers and
  streaming.
  Rejected: the openai package (built for an API the local model server doesn't offer); the Vercel AI SDK (an agent
  framework's weight).

- **2026-11-15 · The app: React 19 and Vite 8, kept lean.**
  React Router in its simplest mode, TanStack Query for server data, Tailwind 4 with the tokens in one file, native
  HTML elements first (a panel is a `<dialog>` opened with `showModal()`, which Android's Back closes). Measured on this computer: the server's
  tools are 10 packages and 127 MB; the app adds about 50 packages and 65 MB.
  Rejected: htmx with server-rendered pages (lightest, but weaker offline and less app-like; the runner-up); Preact
  (no lighter on disk with Vite 8); Next.js (heaviest, and a poor fit for offline and background work).

- **2026-11-15 · Installable, and read-only offline.**
  A static manifest and one hand-written service worker, network first with a 3-second fallback to the last copy
  ("Computer asleep since …").
  Rejected: offline writes with sync (among the hardest parts of any app); vite-plugin-pwa (322 packages).

- **2026-11-15 · Live updates wait for v0.3.**
  In v0.1 a screen refetches when it comes back to the front, and polls while a draft is being made. One
  server-sent-events stream arrives with Applications, which actually has live state.

- **2026-11-15 · Every request carries my Tailscale login.**
  Tailscale Serve adds it for my devices and strips forged copies; there is no local-request exception, because a
  request from any program or page on the computer looks local too. Deploy reads the login from Tailscale and writes
  it into the settings. Writes must come from the app's own address.
  Rejected: trusting requests made on the computer itself.

- **2026-11-15 · launchd runs committed main only, from a second checkout.**
  `node --run deploy` refuses uncommitted changes and other branches, updates a separate worktree, builds there and
  restarts. A crash can then never restart unreviewed code on real data.

- **2026-11-15 · Personal data lives in one folder outside the repo.**
  `~/Library/Application Support/kestrel/` holds the database, uploads and `settings.json`, and only the deployed app
  uses it; development, tests and evals run on a folder of made-up data. Logs hold ids, counts, durations and kinds
  of error, never words, names or paths.

- **2026-11-15 · A guard in the git hooks, as the first build step.**
  Before every commit and push: gitleaks for keys and passwords, any staged file `.gitignore` covers, home paths with
  a user name, email addresses, phone-number shapes, and this computer's user and host names, read when the guard
  runs. It never prints what it found. Free-form details (an employer, a search's words) have no pattern: they stay a
  rule for the builder and the reviews. The whole history is scanned before the first push, and the guard is built
  before any other commit.
  Rejected: a hand-written list of private terms (one more file to maintain); per-line fingerprints.

- **2026-11-15 · Few tests, each for a behaviour that would be noticed if it broke.**
  Node's built-in test runner; Biome and TypeScript 7 as the only checkers; one `node --run check` command, run by
  the pre-commit hook. Edge cases are handled in code; a test is added when one actually breaks.
  Rejected: Vitest on the server; ESLint and Prettier; CI on hosted runners for now.

- **2026-11-15 · Evals are written before each AI feature.**
  A few labelled, made-up cases and a scorer in code; the stand-in model runs inside the check; a live run on the
  local models picks the default model before the feature is first used.
  Rejected: Inspect AI (a second language toolchain); promptfoo (608 packages, telemetry on by default); vitest-evals
  (pre-1.0).

- **2026-11-15 · The app's AI runs on the computer's own models.**
  Through the existing model queue (Qwen careful, Ornith fast) until the queue moves into kestrel. The client refuses
  a model not listed in the settings. A cloud model only per feature, chosen explicitly and shown on screen; Notes
  never uses one.

- **2026-11-15 · Notes edits text files where they are.**
  Text files from settings-listed folders, or uploads, up to 200 KB: UTF-8 only, paths resolved through symbolic
  links before the folder rule. The reader shows the file as written, so a note is a range of the file's own
  characters. The model answers with an overview and find-and-replace changes tied to
  the notes; code places each change only where its text matches once (or nearest its note), and lists the rest. A
  draft stays until saved or discarded; save requires the file unchanged since the draft, keeps encoding and line
  endings, and keeps one previous version for Undo.
  Rejected: rewriting the whole file with the model (slow, and it can reword untouched parts); anchoring notes on
  rendered Markdown; a version folder per file.

- **2026-11-15 · Guides join Learn (v0.4).**
  A guide is data in the guide prompt's format, one lesson per page, read aloud; its check questions become practice
  cards.

- **2026-11-15 · Chats stay in the existing chat app; kestrel links to them.**

- **2026-11-15 · Not now.**
  An MCP server (commands come first), a Python bench, a Rust track. A notification channel is decided in v0.3,
  where it is first needed.

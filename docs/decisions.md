# Decision log

One entry per decision: the date, what was decided, why, and what was rejected. Newest on top. Entries are short and
technical; the plan and the runbook carry the detail.

## Decided

- **2026-11-21 · The palette is the code palette; the mark is a wolf howling.**
  The second look judgment: the copper palette didn't fit either. The ground is now the hunt pages' dark
  (`#11141b` family) and light; the colours are the editor's code palette, the same shades `/hub/code.js` uses —
  pink `#ff757f` as the accent, violet, green and orange, each app card's glyph in its own one. The type is the
  hunt's: IBM Plex Sans for text, Sans Condensed for headings and the wordmark, Mono for data, all served from
  `web/public/fonts`. The mark is one wolf-howling-at-the-moon polygon, the same points in `web/src/mark.tsx`,
  `favicon.svg` and `scripts/make-icons.ts` (a ray-cast polygon fill, sampled 3×3). GO 2 was given on this design.
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

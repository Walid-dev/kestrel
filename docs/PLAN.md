# Plan

## The problem

My local AI setup grew one piece at a time: a hub of small apps, job and deal searches with an agent that applies
for me, an interview helper, a page for the models, and a queue in front of the local models. Each piece works.
Together they sprawl: eight addresses on one computer for different programs, four programs that run all the time, two
phone web apps, helpers copied from file to file until they drift apart, and the same rule written in three to five
places. Failures stay silent for days. An application that stops is lost among the other jobs. Private data sits
next to code. I spend more time keeping the setup running than using it.

## What we build

kestrel: one app on my computer that I open on my phone and on the computer itself. It replaces the setup one part
at a time. A part moves when its kestrel version is ready, and the old one stops after two weeks without use.

- **Home:** what needs me, what runs now, and the apps.
- **Notes** (the first app): open a document, leave notes on its words, and have the computer's own model propose
  the changes. I see every change before I save it to the file.
- **Searches:** saved searches that run on their own (jobs first, deals later), their matches, and a Priority list
  that keeps what I care about in view, whatever happens to it.
- **Applications:** one page by state. An agent fills in and sends applications. What needs me (a human check, a
  question) waits for me on the phone or at the computer, and parks after 5 minutes so the next one can start.
  Nothing gets lost.
- **Learn and Interview:** my guides, one topic per page and read aloud; prepared answers for interviews; practice
  and live help.
- **The rest:** Tasks, deal searches, the models and what they cost, the morning news, small apps.

### Who uses it

Only me, on my computer and my phone, over my private network (Tailscale: a network between my own devices). Agents
(the apply agent, the chat app) use it through commands.

### How it stays simple

- **Few moving parts:** one program on the computer, one file for all the data, one folder for everything
  personal.
- **Built in first:** it uses what Node (the program that runs it) already includes before adding anything: about
  60 add-ons in all, measured in `docs/decisions.md`.
- **One source of truth:** each fact is stored once, and every page and agent reads it there instead of keeping a
  copy.
- **Private:** the computer's own models do the AI work, and nothing personal enters git. My data stays on the
  computer; the phone keeps only what it last showed, for reading while the computer sleeps.
- **Planned in steps:** the next version is planned step by step. Later versions are outlined here, then planned
  when their turn comes.

Technical detail: one package and one Node process. Node runs the TypeScript directly, so the server has no build
step; Vite builds the phone app. Node's own SQLite database, test runner, fetch and argument parser replace packages.

## v0.1 · The foundation, and Notes

Planned step by step in `docs/tasks/kestrel-execution-plan.html`.

### Acceptance criteria

1. The app opens on my phone and on the computer at its Tailscale address, and installs to the phone's home screen.
   With the computer asleep, it opens with what it last showed and says "Computer asleep since …".
2. Only my devices reach it. The server listens on the computer only, and every request must carry my Tailscale
   login, which Tailscale Serve adds for my devices and removes when a request tries to fake it.
3. All personal data is in one data folder outside the repo. The app uses it only when the computer's service
   keeper starts it; development, tests and evals use a folder of made-up data.
4. No commit or push can carry a key, a password, my name or a path with my user name. The guard, a check that runs
   before every commit and push, refuses it without printing what it found.
5. Notes opens a UTF-8 text file (Markdown, plain text or any other text format, shown as written) from the folders
   I allow in my settings, or a file I upload, up to 200 KB. A path is checked at its real place, symbolic links
   resolved, so a link out of an allowed folder is refused. A PDF, a Word file or another encoding is refused with
   the reason.
6. I can leave a note on some words or on the whole document. Notes stay after a reload and show on my other device.
   A note is never dropped: after Save it moves to Done, and a note whose words are gone shows as detached.
7. "Ask for changes" sends the documents and my notes to a local model, careful or fast. The model answers with an
   overview and a list of changes, each tied to the notes it answers, and the code applies them. A change that can't
   be placed, or a note left unanswered, is shown with the reason, never dropped.
8. A draft, and a note I'm still typing, stay until I save or discard them, even if I leave the page, lock the phone
   or close the app. Back closes an open panel instead of leaving the app.
9. Before saving, I see every change (the words removed and the words added) and which file Save writes.
10. Save writes the real file only if it hasn't changed since the draft was made; otherwise it says so and offers a
    new draft. It keeps the file's encoding, line endings and permissions. The previous version is kept once, for
    Undo.
11. I can review several documents together, with notes on each and notes on all of them. The overview covers each
    document. A request too long for the model is refused before it is sent, with what to do instead.
12. A model call never crashes the app. A timeout, a refusal or an answer in the wrong shape becomes a failed draft
    with the reason. Each call records the model, the prompt version, the time and the token counts, never the words.
    Logs never hold a file name or a document's words.
13. The check (lint, types, tests and the eval on a stand-in model) runs before every commit. The eval's labelled,
    made-up cases are written before the feature they test, and a live run on the local models picks the default
    model for each speed before I first use Notes.
14. The app runs under launchd, macOS's service keeper, from committed code only. It comes back after a crash and
    after a restart of the computer, and a restart loses nothing. The database is copied before any change to its
    tables.
15. The repo holds made-up data only, and its whole history was scanned before the first push.

## Later versions (outlined)

Each gets its own step-by-step plan, reviewed, before it starts.

### v0.2 · Searches, jobs first

- A Models screen: which model each use runs on (Notes' careful and fast first), switched there and recorded, so
  testing another model is one tap — the way the old setup's Models page works. Until then the settings file decides.

- The job searches move in: the sources I still use, the scores, each site's limits, and a page that comes back
  empty reported as a problem, never as "nothing new".
- The list opens on All, and filters combine. A Priority list holds every great match and every job I star, in view
  whatever happens to it (applied, failed, waiting for me, interview). A job leaves Priority only when I unstar it or
  set it aside; jobs I set aside fold away.
- One import of the jobs my current setup found (a dry run first, counts that match), a week side by side, then the old searches
  stop (sooner than the two-week rule, since they run on a timer).
- Nightly copies of the database, 7 kept, arrive with the job data.

### v0.3 · Applications

- One Applications page by state: queued, applying, needs me, sent, and not sent with its reason and a Retry. Every
  application that stopped is counted, whatever stage its job is in.
- The apply agent starts from kestrel and reports back through `kestrel` commands (at first, the current agent in my
  chat app). The old apply flow stops the day kestrel's starts, so no job gets two applications.
- Human checks: on my phone or at the computer, a setting. My OK never counts as passed: the agent checks the page
  first. A check the phone can't do (a reCAPTCHA) always asks me at the computer, where the form comes to the front.
  After 5 minutes, the application parks under "needs me" and the next one starts.
- kestrel tells me on the phone when something needs me (how, local first, is decided in v0.3's plan), and Home
  shows what needs me and what runs now, updated live.

### v0.4 · Learn and Interview

- One Learn app absorbs the old setup's two (Guides and Learn, decided 2026-11-20): Learn's lesson shape (say,
  explain, example, words, check — built from research on how people learn), written in the plain style, with Ask on
  every lesson, simple hand-drawn diagrams, and richer lessons. One lesson per page, read aloud by the computer's
  voice.
- Packs of prompts and answers: one kind of content for prepared answers, lessons, demo scripts and the guides'
  check questions.
- One reader with Listen, Follow, notes and search; Practice with spaced review; Live (the question heard, the best
  answer in large text).

### v0.5 · The rest, and the old setup retired

- Tasks with commands for agents, deal searches (in Searches), the models and what they cost, the morning news
  (built 2026-11-24: the day in AI and tech from 19 public feeds, in plain words with links; the same day its own
  app: every day kept, found and deleted, Ask on each story with the web), small apps.
- Each old part stops after two weeks without use; the last one closes the old setup.

### v0.7 · Ask on every page

- Every app gets the same Ask: a conversation with the computer's model about what the page shows, kept per page.
  The model sees the page and, step by step, acts in the app (find, filter, add, mark), any change only on my tap.
- Built first on Learn's lessons and the quiz's questions, with quizzes kept as I take them; then Searches, where it
  finds through the whole hunt and proposes a stage, a delete, a deep check or an application as cards I tap, and a
  change to many listings as one rule kestrel resolves, with Undo. The other apps follow, one at a time. The design
  and the steps: [docs/tasks/v0.7-ask.md](tasks/v0.7-ask.md).
- A chat that keeps its context (my questions, its answers and what its looks found, as much as the model reads at
  once), with the web on every page: on a page of my own each search shows its exact words and runs only on my tap
  (decisions.md, 2026-11-25).

### v0.8 · One set of blocks for every page (GO 2026-11-23; steps 1 to 3 built)

- Every agent in kestrel writes with one catalog of blocks the page draws itself (code, steps, a comparison, a tree,
  a timeline, a small chart, a check, a source), checked before it is drawn, and reads with one set of tools (the
  page's data, a lesson or a note by id, the web). MCP only as a thin adapter later, when another program needs the
  tools. The proposal and its sources: [docs/tasks/v0.8-blocks.md](tasks/v0.8-blocks.md).
- Alongside, the review of what an application sends: every text Writing writes, and every letter and answer the
  apply agent writes (`apply-review`), is read as the company would read it (the match, the fit, the voice), and its
  better version is kept when the applications' check passes it.

### v0.9 · The design system (built 2026-11-23: the parts, /design, every page moved, the check at zero)

- One component library every page is built from (the page head, buttons, cards, chips, the segmented choice,
  tiles, fields that send on Enter, a list card with its ✕, sheets, empty states, the drawings), its tokens in one
  file, and a page that shows every part in both themes, on a phone and a computer. The pages move to it one at a
  time; a check names a one-off style. The proposal: [docs/tasks/v0.9-design-system.md](tasks/v0.9-design-system.md).

### v1.0 · Searches on its own (planned 2026-11-25)

- kestrel runs every search with what it owns, with no reach into the old setup: the agent's browser in the engine
  (a window kept open, waits and caps per site, a login pause), its own collectors in the data folder, the job
  engine's rules in `src/domain/search`, Live and Search now, and the pings. Each hunt runs Quiet beside the old one
  for three days, then takes over; the bridges (the mirror, Search now and Live through the old server, the old
  collectors) go after two quiet weeks. The plan: [docs/tasks/v1.0-searches-own.md](tasks/v1.0-searches-own.md).

### v1.2 · Shopping (GO 2026-11-25; built and reviewed, the live eval next)

- A list of my wants, each in plain words. Each runs on its own: it understands the kind of product (up to three
  quick questions, never waiting for them), compares the products worth considering on the criteria that matter for
  that kind (from the sources that test, every value checked against its source, labels such as best overall and best
  value computed in code), finds where to buy each pick from the stores' own page data (the stores that turn a plain
  reader away are links until the agent's Chrome reads them), judges the deal against its own price history, and
  watches a price when I ask, with a ping on my target or a drop. Ask on each want; nothing of mine goes into a
  search.
- Built on shared parts: one list engine for every kind of listing (fields, filters, sorts, a card, marks), Research's
  page gathering, News' public fetch; a category, a region or a source tier is a data file. The homes hunt follows on
  the same engine. The plan: [docs/tasks/v1.2-shopping.md](tasks/v1.2-shopping.md).

## The structure

How the one process is organised and who talks to whom: the diagram in
[the runbook](tasks/kestrel-execution-plan.html#structure). The folder layout and its boundaries are in AGENTS.md.

## Out of scope

- Chats inside kestrel. My chat app keeps them, and kestrel links to them.
- Writing while the computer is asleep: offline is read-only.
- PDF, Word and images in Notes, for now: v0.1 edits text. Documents edited by hand stay edited by hand: nothing
  generates them.
- An MCP server (a plug-in door for AI tools), a Python bench, a Rust track, Next.js, and a self-hosted notification
  server (decided with v0.3, where it is first needed).
- Running the check on hosted machines (CI), for now: it runs before every commit on the computer.
- Other users, public pages, hosting in the cloud.
- Solving human checks by program or through a paid service, or disguising the agent's browser.

## How the plan evolved

- **Draft 1, 2026-11-11.** An assessment of the existing setup: what works, what hurts, what to fix first.
- **Draft 2, 2026-11-12 to 11-14.** A full plan in 8 gates: a monorepo of 12 packages, a Python bench, separate
  services, and a local model as the builder, driven by step cards. Three steps were built. Kept: the problem, the
  privacy rules, the phone design, the map from old apps to new ones. Dropped: the process cost more than it
  returned (long sessions exceeded the computer's memory, 35 process files for three steps, and the first real
  screen was three gates away).
- **Draft 3, 2026-11-15.** This plan: one builder working step by step with a GO per commit, a second model
  reviewing before and after each version, one package and one process, built-in parts before dependencies, evals
  written before each AI feature, Notes first. Three independent reviews of the draft raised 74 points; all are
  applied.

The step-by-step runbook is `docs/tasks/kestrel-execution-plan.html`.

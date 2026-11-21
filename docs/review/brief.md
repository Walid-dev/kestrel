# Review brief

An independent review of kestrel by a second AI model, Codex. Claude Code builds kestrel. This brief says what to
look at and how to report.

Review the repo only. Don't open `~/Library/Application Support/kestrel/`, `~/Library/Logs/kestrel/` or the running
app.

## Round 1: the plan, before any code

The repo holds only the plan for now. Read, in this order:

1. `README.md` and `docs/PLAN.md`: the problem, what is built, v0.1's acceptance criteria, the later versions.
2. `docs/decisions.md`: each decision, why, and what was rejected.
3. `docs/tasks/kestrel-execution-plan.html`: v0.1 step by step. Each step lists its files, a check and a commit
   message.
4. `AGENTS.md`, `docs/process.md` and `.gitignore`: the rules and the way of working.

Three reviews already ran on this draft (whether it can be built, whether it is simple, whether it fits what was
asked), and their 74 points are applied. Since then the plan was made lighter on purpose: fewer tests, no hand-written
privacy list, a public repo. Look for what they missed, and don't ask for tests back unless a behaviour is at risk.

## What to review

1. **Fit:** does v0.1 address what the problem section names, and is Notes a sound first app?
2. **Simplicity:** what could be cut or postponed without losing an acceptance criterion? What is heavier than it
   needs to be?
3. **Steps:** can each check fail? Does the order work, with nothing used before it is built? Do the listed files
   cover the step?
4. **Facts:** check the versions and claims (Node 26 and its type stripping, `node:sqlite`, Hono 4, zod 4, React 19,
   Vite 8, React Router, TanStack Query, Tailwind 4, TypeScript 7, Biome, npm's `min-release-age`, gitleaks, Tailscale
   Serve's identity headers, Chrome on Android closing a `<dialog>` with Back, the CSS Custom Highlight API) against
   official sources. Report anything outdated or wrong.
5. **Privacy:** any path by which personal data could reach git, a log, a cloud model or another device.
6. **Consistency:** do README.md, PLAN.md, decisions.md, AGENTS.md, process.md and the runbook agree?

## Out of scope

The details of the later versions (v0.2 to v0.5, which are only outlined), and the look of the app. Don't report
them as findings.

## How to report

Write the findings to `docs/review/round-1-plan.md`, one entry per finding:

- **ID** (P1, P2, …) and **severity**: high, medium or low.
- **Where:** `file:line`.
- **What is wrong:** stated as a fact.
- **Why it matters:** the concrete failure it would cause.
- **Suggested fix:** one or two sentences.

Skip style comments unless they hide a real problem. If an area has no findings, say so in one line.

## Round 3: the whole project, v0.2 to v0.5

Every planned version is built. This round reviews the finished repo as one piece — the first round read the plan,
the second the Notes code; this one reads everything, with the whole context in one pass.

Read, in this order:

1. `README.md`, `docs/PLAN.md`, `docs/retirement.md`: what was promised, what stands, how the old setup retires.
2. `docs/tasks/v0.2-searches.md` to `v0.5-rest.md`: each version's build plan with its status.
3. `docs/decisions.md` and `docs/eval/`: every decision with its reason; the two live eval records.
4. The code, by room: `src/domain/` (notes, search, apply, learn, tasks, models, brief), `src/server/`, `src/ai/`,
   `src/db/migrations/`, `scripts/` (the imports and the kestrel CLI), `web/src/`, `evals/`.

### What to review

1. **Promises kept:** does each version's task page say true things about the code? Does the retirement map cover
   every old part the plan named?
2. **The seams:** the places two versions meet — the search engine carrying deals, Learn's packs feeding Live, the
   brief counting other rooms' tables, the one status vocabulary. Anything one room assumes that another doesn't keep.
3. **Honesty:** every error path answers in plain words; no silent drops; counts and statuses shown match the
   database; the dry runs write nothing.
4. **Privacy:** any path by which personal data could reach git, a log, a cloud model or another device. The repo's
   fixtures, seeds and evals must stay made-up; the imports must land real content only in the data folder.
5. **Simplicity:** what is heavier than it needs to be, duplicated across rooms, or dead since the route split.
6. **Facts:** claims about Node 26, node:sqlite STRICT, Hono, zod 4, React 19, MediaRecorder on phones, Web Speech,
   oMLX's OpenAI-shaped doors — against official sources where they decide a behaviour.

### How to report

As before: one finding per heading with where, what is wrong, why it matters, and a suggested fix, ordered by
severity, in `docs/review/round-3-whole.md`. Confirmed-good areas get one line each, so the next round knows what
was already read closely.

### Out of scope

The look of the screens (set in docs/design.md and settled per version); the old setup's own code; anything under
the data folder; the door's own models (oMLX is outside the repo).

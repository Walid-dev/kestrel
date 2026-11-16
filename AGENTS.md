# kestrel: rules for the agents that work here

kestrel is my personal app: one Node process on my computer, which I open on my phone and on the computer over
Tailscale.
`docs/PLAN.md` says what it is and `docs/decisions.md` why it is built this way. The runbook, step by step, is
`docs/tasks/kestrel-execution-plan.html`.

## How we work

- One step at a time, from the runbook. A step is one commit: its files, a check that can fail, and its message.
  Each step's commit also updates the runbook: its status line, the Now box and the counters.
- Before the commit, explain the step in plain words, under these headings:
  1. **What it is for:** the part of kestrel this step builds, and what it lets me do.
  2. **What I did:** what changed, and what would go wrong without it.
  3. **How it works:** the files, functions and commands.
  4. **The tools, and why:** each library or tool, what it is in one plain sentence, and what it did here.
  5. **Problems, and how they were solved** ("None" if none).
  6. **The check:** its last lines.
  7. **Unsure about** ("Nothing" if nothing).

  Write the first two for someone who has never programmed. Keep them short, and explain each technical word the
  first time it appears, with an everyday comparison.
- Then wait for my GO. On GO: commit, then push. Never commit or push without it, and never use `--no-verify`. One GO
  can cover a batch of review fixes, each in its own commit.
- Anything the plan didn't foresee: stop and ask. Then note it under "Plan changes" in `docs/process.md`, and add it
  to `docs/decisions.md` if it is a decision.
- Gate 1 is committed on main. Each build gate has a branch, `gate-<N>-<name>`, merged into main with a merge commit
  on the gate's GO. Push main and the gate branches only: the `old/*` branches never leave this computer.

## Commands

- From step 2: `node --run check` (lint, types, tests; the stand-in eval joins at step 12) and `node --run dev` (its
  own port, 8791, and a folder of made-up data).
- From step 6: `node --run build`. From step 7: `node --run deploy`.

## Commit messages

Conventional Commits: `<type>(<scope>): <what changed>`. Types: feat, fix, test, refactor, docs, build, chore. Scopes:
repo, plan, platform, guard, db, web, ops, notes, ai, eval, review.

## Layout and boundaries

- `src/server/` the routes; `src/domain/` each app's rules; `src/db/` the database and its migrations; `src/ai/`
  model calls and prompts; `src/platform/` the data folder, settings and secrets; `src/shared/` the zod shapes the
  phone app shares; `web/` the phone app; `evals/` the evals; `scripts/` the guard, deploy, the launchd template, the
  model probe and the made-up data for development; `.githooks/` the git hooks; `docs/`.
- Only `src/domain/` writes to the database; `src/server/main.ts` opens it and passes it in. `src/ai/` never imports
  `src/db/` or `src/domain/`. `web/` never imports server code, only `src/shared/`. Biome enforces these, and step 2's
  check proves a forbidden import fails.

## Code rules

- TypeScript that Node can run by stripping the types: local imports end in `.ts`, types come in with
  `import type`, and there is no enum, namespace, parameter property or decorator.
- zod checks every input: request bodies, command-line arguments, model answers, files read from disk, settings.
- A model call never throws. It returns a result or a failure with its reason, and records the model, the prompt
  version, the time and the token counts, never the words. Tests use a stand-in model.
- Dependencies are passed in (the database, the model client, the clock), so tests need no mocking tricks.
- Tests use an in-memory database built from the real migrations, and made-up data only. Few tests: each one checks a
  behaviour I would notice if it broke.
- An applied migration is never edited: a fix is a new numbered migration.
- A new package only with my yes, and with what it costs (packages, MB).
- Comments say why, in plain words.

## Privacy

- Personal data lives only in the data folder, `~/Library/Application Support/kestrel/`, and only the deployed app
  uses it. The builder and the reviewer work on the repo only: they never open the data folder, my private files, the
  deployed app (its Tailscale address or port 8790) or its API. Every run they start (the dev server, tests, evals,
  screen checks) uses a folder of made-up data.
- Nothing personal in a committed file: no names, email addresses, phone numbers, employers, job-search details,
  home paths with a user name (write `~`), device or network names. Tests and evals use made-up data.
- Logs hold no personal data: ids, counts, durations and kinds of error, never a file name, a path or the words of a
  document, a note or a model's answer.
- Never read or print a secret. Secrets are in the Keychain, read by one module.
- The git hooks run the guard on every commit and push. If it refuses, fix the cause; never go around it.

## Models

- The app's AI runs on the computer's own models (served locally: Qwen for careful work, Ornith for fast work),
  through the setup's model queue. The client refuses any model not listed in my settings. A cloud model only for a
  feature where I pick it, and that feature says on screen what it sends; Notes never uses one.

## Docs

- Plain words first, technical detail after. Explain a term where it first appears.
- First person ("my phone", "ask me") or neutral wording: never "he", "him", "his" or "the owner". No other project of
  mine is named.
- Diagrams drawn by hand, as SVG.
- In the same step, update every doc that mentions what changed.

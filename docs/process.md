# Process

How kestrel is built: who does what, how each step is checked, and how the work is reviewed.

## Who does what

- **Me:** I decide, read each step's explanation and its changes, and give the GO.
- **Claude Code, the builder:** writes the plan and the code one step at a time, runs the checks, explains each
  step in plain words, then commits and pushes on my GO.
- **Codex, the reviewer:** a second model. It reviews the plan before a version is built and the version after,
  against `docs/review/brief.md`.

Both work on the repo only, with made-up data. Neither opens my data folder or the deployed app.

## The loop

1. The builder takes the next step from the runbook (`docs/tasks/kestrel-execution-plan.html`).
2. It builds the step and runs `node --run check`. A new screen is checked on the dev server, with made-up data, in a
   real browser at a phone size.
3. It explains the step in plain words (AGENTS.md lists the headings).
4. I read the changes and the commit message, and say GO.
5. It commits and pushes. At a gate's GO, the gate's branch merges into main.

## Reviews

- **Before:** the plan of each version, before its first build step. The findings go to
  `docs/review/round-1-plan.md` and are fixed together in one commit, with one GO. Gate 2 starts on that GO.
- **After:** the finished version. The findings go to `docs/review/round-2-v0.1.md`. Each is fixed in its own commit,
  with a test that fails without the fix, or answered in writing; one GO covers the batch. Then a confirmation pass.

## How AI output is checked

- Versions and library facts come from the package registries and official docs, not from memory. The stack was
  installed and measured on this computer before it was chosen.
- Before Codex, three independent reviews of the plan asked whether it can be built, whether it is simple, and
  whether it fits what I asked. Each claim about a tool was checked against its documentation.
- Every step has a check written so that it can fail.
- Each AI feature's eval is written before the feature, with labelled, made-up cases, and a live run on the local
  models comes before I first use it.
- Each screen is checked in a real browser at a phone size.
- A second model reviews the plan and each version.

## Plan changes during the build

- **2026-11-20, gate 2:** the look judgment failed the guides' palette; the design system became kestrel's own, and
  the fonts are now really served (`docs/decisions.md`). The gate's GO repeats on the new look.
- **2026-11-17, step 7:** deploy takes main or a gate branch being judged, not main only. A gate's GO looks at the
  deployed app, which exists before the merge. Recorded in `docs/decisions.md`.

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

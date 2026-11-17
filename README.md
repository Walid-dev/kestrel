# kestrel

My personal app: one Node process on my computer, opened on my phone and on the computer over my private network.
It replaces my local AI setup one part at a time, starting with **Notes**: notes on a document, changes proposed by
the computer's own model, and every change shown before it is saved.

**Status:** building v0.1. The skeleton runs; Notes is next.

- What it is, and v0.1's acceptance criteria: [docs/PLAN.md](docs/PLAN.md)
- Why it is built this way: [docs/decisions.md](docs/decisions.md)
- The runbook, step by step: [docs/tasks/kestrel-execution-plan.html](docs/tasks/kestrel-execution-plan.html)
- How it is built and reviewed: [docs/process.md](docs/process.md)
- Rules for the agents that work here: [AGENTS.md](AGENTS.md)

Privacy: the repo holds code and made-up data only. My personal data is stored on the computer, in a folder outside
the repo; the phone keeps only what it last showed, for reading while the computer sleeps. The app's AI runs on the
computer's own models.

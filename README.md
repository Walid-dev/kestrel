# kestrel

My personal app: one Node process on my computer, opened on my phone and on the computer over my private network.
It replaces my local AI setup one part at a time, starting with **Notes**: a document from my folders or an upload,
my notes on its words, and the changes the computer's own model proposes — every change shown, placed by code and
saved only when I say so. Nothing leaves the computer.

**Status:** every planned version is built — Notes (v0.1, tagged), Searches with the side-by-side mirror (v0.2), Applications with the agent commands (v0.3), Learn with Ask, Practice and Live (v0.4), and the rest — Tasks, deal searches, the models' costs, the morning brief (v0.5). The old setup retires by the map in [docs/retirement.md](docs/retirement.md); the final review round is in flight.

## Run it

```
npm ci
node --run check                    # style, types, tests, boundaries, and the eval on a stand-in model
PORT=8791 node src/server/main.ts   # the API, on made-up data
node --run web                      # the screens at http://localhost:5199 (vite forwards /api)
node --run deploy                   # committed code only: builds, installs the service, publishes on the tailnet
```

## What v0.1 does

- **Documents**: a UTF-8 text file from the folders my settings allow (paths checked at their real place, symbolic
  links resolved) or an upload, up to 200 KB, shown as written. How the bytes looked — BOM, line endings, the final
  newline — is remembered, so saving changes nothing else.
- **Notes**: on some words or on the whole document. A note finds its words again when the text moves, and is kept
  as detached when they are gone. The sheet is a native dialog; words still being typed live on the device.
- **Ask for changes**: the careful or the fast local model answers in a set shape; the code alone places each change
  (once; repeats by the note's words; of two overlaps, the first), and the rest are listed with the reason.
- **Review and Save**: every change as a word diff, the target file named. Save writes only if the file hasn't
  changed since the draft, keeps its permissions and encoding, keeps one previous version for Undo, and moves the
  answered notes to Done. Several documents review together and save one by one.
- **Offline**: with the computer asleep, the phone shows the last copies and says so; nothing can be saved.
- **The eval**: labelled, made-up cases written before the feature, run on a stand-in model inside every check, and
  run live on both local models before first use (`docs/eval/`).

- What it is, and v0.1's acceptance criteria: [docs/PLAN.md](docs/PLAN.md)
- Why it is built this way: [docs/decisions.md](docs/decisions.md)
- The runbook, step by step: [docs/tasks/kestrel-execution-plan.html](docs/tasks/kestrel-execution-plan.html)
- How it is built and reviewed: [docs/process.md](docs/process.md)
- Rules for the agents that work here: [AGENTS.md](AGENTS.md)

Privacy: the repo holds code and made-up data only. My personal data is stored on the computer, in a folder outside
the repo; the phone keeps only what it last showed, for reading while the computer sleeps. The app's AI runs on the
computer's own models.

# Round 1: plan review

## Findings

### P1 — high: Two build steps are pushed before the guard exists

**Where:** `docs/tasks/kestrel-execution-plan.html:315`, `:331`, `:347`; `docs/process.md:20-22`.

**What is wrong:** Step 4 creates the hooks, but steps 2 and 3 are already separate GO commits. The process says each approved step is pushed, so those two pushes happen before the guard is installed.

**Why it matters:** A secret or personal detail added by mistake in either step can reach the public repository. The one-time history scan before the first push does not scan these later commits before they are pushed.

**Suggested fix:** Install the guard before the first build commit, or document a full staged-diff/history scan before every push until the hooks are active.

### P2 — high: The guard does not cover the full privacy rule

**Where:** `docs/tasks/kestrel-execution-plan.html:349-353`; `AGENTS.md:71-74`; `docs/decisions.md:112-116`.

**What is wrong:** The planned guard checks secrets, ignored files, home paths and the account's own name. The privacy rule also forbids email addresses, phone numbers, employers, job-search details, and device or network names. Gitleaks describes its scope as finding secrets such as passwords, API keys and tokens; it does not cover those other categories ([Gitleaks](https://github.com/gitleaks/gitleaks)).

**Why it matters:** Those details can be committed to this public repository without any planned check refusing them.

**Suggested fix:** Add generic checks for structured personal data such as emails and phone numbers, and require a content review for free-form personal details. Keep any account-specific values out of the repository.

### P3 — high: A symlink can escape an allowed Notes folder

**Where:** `docs/PLAN.md:64-65`; `docs/tasks/kestrel-execution-plan.html:432-433`.

**What is wrong:** The plan says Notes refuses paths that leave an allowed folder, but does not require resolving symbolic links before enforcing that boundary.

**Why it matters:** A link inside an allowed folder can point outside it, letting Notes read an unapproved local file and serve its contents to the phone.

**Suggested fix:** Resolve the selected file and configured folder to canonical paths, reject targets outside the allowed roots, and include an in-folder symlink to an outside file in the step 8 check.

### P4 — high: The migration backup method is undefined for WAL mode

**Where:** `docs/decisions.md:68-70`; `docs/tasks/kestrel-execution-plan.html:365-370`.

**What is wrong:** The plan enables SQLite WAL mode and says to copy the database before migrations, but does not specify a consistent SQLite snapshot or what happens to the `-wal` file. In WAL mode, committed changes may still be in that separate file; separating it from the database can lose committed transactions or corrupt the copy ([SQLite WAL documentation](https://sqlite.org/wal.html)).

**Why it matters:** A backup taken before a migration could restore to an older state, undermining the stated protection against migration damage.

**Suggested fix:** Specify a SQLite-consistent backup method, then make the step 5 check back up and restore a database with committed, uncheckpointed WAL data.

### P5 — high: Supported file encodings are not defined or checked

**Where:** `docs/PLAN.md:64-75`; `docs/tasks/kestrel-execution-plan.html:425-427`, `:503-510`.

**What is wrong:** Notes accepts any text format and promises to preserve encoding, but the plan does not define which encodings it can detect and round-trip or when it must refuse a file. The save check covers writing, conflicts and Undo, but not encoding, line endings or permissions.

**Why it matters:** A file using an unsupported or ambiguous encoding could be decoded and saved in a different encoding, corrupting the original even though the ordinary save check passes.

**Suggested fix:** Define the supported encodings and refuse files that cannot be identified safely. Check a round trip with a BOM or non-UTF-8 fixture, line endings, final newline and permissions.

### P6 — medium: The offline check covers only the empty app shell

**Where:** `docs/tasks/kestrel-execution-plan.html:377-390`, `:423-431`.

**What is wrong:** Step 6 creates the service worker and tests the shell with the server stopped. The later Notes steps do not list service-worker or cache work, and no check opens a document with notes, stops the server, then confirms that the last view remains available.

**Why it matters:** The shell check can pass while the phone loses the document and notes when the computer sleeps, contrary to acceptance criterion 1.

**Suggested fix:** Specify which document and note responses the service worker keeps, update the relevant Notes step, and check the offline view and “Computer asleep since …” message after opening real made-up Notes data.

### P7 — medium: Unsaved note text is not checked across app closure

**Where:** `docs/PLAN.md:71-73`; `docs/tasks/kestrel-execution-plan.html:439-447`.

**What is wrong:** Acceptance criterion 8 protects a note while it is still being typed across leaving the page, locking the phone or closing the app. Step 9 checks that Back keeps the text and that a saved note survives reload, but does not define or check persistence for an unfinished note.

**Why it matters:** Text can disappear when the app is closed or the phone is locked, while the listed check still passes.

**Suggested fix:** State where in-progress note text is persisted and add a check that closes and reopens the app before the note is saved.

### P8 — medium: Model refusal is an acceptance case without a matching check

**Where:** `docs/PLAN.md:79-80`; `docs/tasks/kestrel-execution-plan.html:462-464`.

**What is wrong:** The acceptance criteria say a model refusal becomes a failed draft with a reason. The client check covers a wrong-shaped answer, timeout and unlisted model, but not a refusal response.

**Why it matters:** A refusal returned in a different response form could be mishandled or lose its reason without failing the planned check.

**Suggested fix:** Add a refusal response to the stand-in-server check and assert that it produces a failed draft with a reason and does not crash the app.

### P9 — medium: `min-release-age` is described as waiting

**Where:** `docs/tasks/kestrel-execution-plan.html:317-318`; `docs/decisions.md:64-65`.

**What is wrong:** The plan says npm “waits 7 days before taking a new release.” npm's `min-release-age` filters out versions published within that window; it does not wait and retry later. npm selects an older eligible version or errors if none is available ([npm config docs](https://docs.npmjs.com/cli/using-npm/config/#min-release-age)).

**Why it matters:** A fresh install or dependency update can resolve to an older version or fail immediately, rather than waiting seven days for the newest release.

**Suggested fix:** Describe the setting as an age filter and note that installation can fail when no compatible version is old enough.

### P10 — medium: Android Back closes only a modal `<dialog>`

**Where:** `docs/tasks/kestrel-execution-plan.html:442`, `:490`.

**What is wrong:** The plan says Back closes the native dialogs but does not say to open them modally. Chrome's Android Back/gesture close request applies to a modal dialog opened with `showModal()`; a non-modal dialog does not get that behavior ([Chrome for Developers](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/platform-controls-dismiss-dialog)).

**Why it matters:** If either panel uses a non-modal dialog, Back can leave the app instead of closing the panel.

**Suggested fix:** Specify `showModal()` for these dialogs and retain the planned phone-size Back check.

## Areas checked with no separate finding

**Simplicity:** No cut was identified that preserves the v0.1 acceptance criteria.

**Other version and API facts:** Node 26 type stripping is stable; `node:sqlite` remains release-candidate status, and Node 26.11 renamed `DatabaseSync`/`StatementSync` to `Database`/`Statement`, matching the stated minimum. Hono 4 is the latest stable line while v5 is still a release candidate; the current Hono Zod validator supports Zod 4. React 19, Vite 8, the `react-router` package, TanStack Query, Tailwind 4, TypeScript 7 and Biome are available in the stated roles. Tailscale Serve adds identity headers and removes spoofed incoming identity headers. The CSS Custom Highlight API is standardized and available in current browsers; the plan does not depend on it. Sources: [Node TypeScript](https://nodejs.org/dist/latest/docs/api/typescript.html), [Node SQLite](https://nodejs.org/api/sqlite.html), [Node 26.11 release](https://nodejs.org/en/blog/release/v26.11.0), [Hono releases](https://github.com/honojs/hono/releases), [Hono Zod validator](https://github.com/honojs/middleware/blob/main/packages/zod-validator/src/index.ts), [React 19](https://react.dev/blog/2024/12/05/react-19), [Vite 8](https://vite.dev/blog/announcing-vite8-1), [React Router](https://api.reactrouter.com/), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/installation), [Tailwind 4](https://tailwindcss.com/docs/upgrade-guide), [TypeScript](https://www.typescriptlang.org/), [Biome](https://biomejs.dev/), [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve), [CSS Custom Highlight specification](https://www.w3.org/TR/css-highlight-api-1/).

**Consistency:** No separate conflict found beyond the guard timing and the missing acceptance checks listed above.

## Outcome, 2026-11-16

All ten findings are applied in this commit.

| Finding | Applied                                                                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1      | The guard is now step 2, the first build commit: nothing is pushed before the hooks exist. It needs no packages (Node runs it directly; gitleaks is installed; `core.hooksPath` is set in the step, then by npm's `prepare`).                 |
| P2      | The guard also refuses email addresses, phone-number shapes, and this computer's user and host names, read when it runs. Free-form details (employers, search words) are documented as a rule for the builder and the reviews, not a pattern. |
| P3      | Notes resolves a path to its real place before the folder rule; step 8's check includes an in-folder symlink pointing outside.                                                                                                                |
| P4      | The pre-migration copy is SQLite's own snapshot (`VACUUM INTO`); step 5's check proves it on a database with committed, uncheckpointed WAL rows.                                                                                              |
| P5      | UTF-8 (with or without a byte-order mark) is the defined format; anything else is refused with the reason, and step 13 keeps its round-trip of line endings, final newline and permissions.                                                   |
| P6      | The service worker keeps the last answer of each read it saw; step 9's check opens a document with notes, stops the server, and expects the view plus "Computer asleep since …".                                                              |
| P7      | A note still being typed is kept on the device; step 9's check closes and reopens the app mid-typing.                                                                                                                                         |
| P8      | A model refusal joins the stand-in-server check as a failure with its reason.                                                                                                                                                                 |
| P9      | The 7-day rule is described as npm's age filter: an older qualifying version is picked, or the install fails; it never waits.                                                                                                                 |
| P10     | The note sheet and the review open with `showModal()`, so Android's Back closes them.                                                                                                                                                         |

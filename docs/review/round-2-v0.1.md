# Round 2: v0.1 code review

## Scope

`docs/review/brief.md` in this checkout has only Round 1 instructions. As `docs/process.md` and the runbook direct, this pass reviews the finished v0.1 against `docs/PLAN.md` acceptance criteria and the repo privacy rules. This was a static source review; no tests or app were run.

## Findings

### R2-1 — high: Notes can send document text to any configured server

**Where:** `src/platform/config.ts:23-30`; `src/ai/client.ts:45-60`.

**What is wrong:** The settings schema accepts any string for `models.url`, and the client posts the full document and note prompt to that URL. Nothing restricts it to this computer.

**Why it matters:** A remote URL in `settings.json` sends personal documents and notes off the computer, despite the local-model privacy promise.

**Suggested fix:** Parse and validate the URL at startup; allow only loopback HTTP endpoints for Notes. If remote models are ever supported, require a separate explicit opt-in that makes the data transfer clear.

### R2-2 — high: Model changes are not checked against the notes they claim to answer

**Where:** `src/ai/changes/shape.ts:6-22`; `src/domain/notes/drafts.ts:123-129`; `src/domain/notes/place.ts:21-36`.

**What is wrong:** The response schema accepts arbitrary note IDs. Runtime code does not check that a change names an open note on that document, or that every requested note is either answered or listed as unanswered. A uniquely occurring `find` is placed even when its note IDs are invented or unrelated.

**Why it matters:** A ready draft can contain and save a change that no note requested, while a real note omitted from both lists is not shown as unanswered.

**Suggested fix:** Validate note IDs and document ownership after parsing. Require every requested open note to be accounted for by a valid change or an `unanswered` entry; fail the draft or leave invalid changes out with a clear reason.

### R2-3 — high: Two files with the same name can receive each other's changes

**Where:** `src/domain/notes/drafts.ts:82-89, 125-128`; `src/domain/notes/documents.ts:106-113`.

**What is wrong:** Documents are identified to the model and matched back by basename. Two allowed folders can contain different files named, for example, `plan.md`; a response for that name is then applied to both documents.

**Why it matters:** In a multi-document review, saving one file can apply a change intended for another file with the same basename.

**Suggested fix:** Give each document a unique request label and match changes by that label, not by basename. Show the corresponding file target in the review.

### R2-4 — high: Undo can overwrite edits made after Save

**Where:** `src/domain/notes/save.ts:78-83, 95-106`.

**What is wrong:** Save records the new text hash, but Undo does not compare the file's current bytes with that saved version before replacing it.

**Why it matters:** If another editor changes the file after Kestrel saves it, Undo silently replaces those newer edits with the older text.

**Suggested fix:** Store the post-save hash for the undo record and refuse Undo if the file no longer matches it. Explain that the file changed and leave its contents untouched.

### R2-5 — medium: Saving a mixed-line-ending file changes its line endings

**Where:** `src/domain/notes/documents.ts:70-73`; `src/domain/notes/save.ts:27-32`.

**What is wrong:** Opening stores only whether any CRLF exists, then converts every CRLF to LF. Saving converts every LF to CRLF when that flag is set.

**Why it matters:** A file that mixes LF and CRLF is rewritten with uniform CRLF endings, contrary to the promise to preserve line endings.

**Suggested fix:** Preserve the original per-line separators and reapply them when encoding, or refuse to save mixed-ending files with a clear explanation.

### R2-6 — medium: Upload validation cannot reject the original invalid UTF-8 bytes

**Where:** `web/src/notes/list.tsx:73-76`; `src/domain/notes/documents.ts:117-121`.

**What is wrong:** The browser converts the selected file with `File.text()` before upload. The server receives a JavaScript string and re-encodes it, so its fatal UTF-8 decoder no longer sees the original bytes; invalid byte sequences have already been replaced during text decoding. The [File API](https://www.w3.org/TR/FileAPI/#dom-blob-text) specifies UTF-8 decoding for `Blob.text()`.

**Why it matters:** An invalidly encoded file can be accepted as altered text instead of being refused as required by the UTF-8 rule.

**Suggested fix:** Send the raw file bytes (for example as an `ArrayBuffer` or base64) and perform the fatal UTF-8 decode on the server before storing it.

### R2-7 — medium: A failed note save clears the only kept draft

**Where:** `web/src/notes/note-sheet.tsx:69-73`; `web/src/notes/reader.tsx:64-81, 362-369`.

**What is wrong:** Submit removes the local-storage copy before the request succeeds. The parent immediately closes the sheet, and a failed request has no recovery path to restore the text.

**Why it matters:** A transient connection failure or a server rejection loses a note that the user had typed, contrary to the draft-survival rule.

**Suggested fix:** Keep the local draft until the save request succeeds; on failure, keep the sheet open or restore the saved text and show the error.

### R2-8 — medium: The diff can exhaust the browser on accepted documents

**Where:** `web/src/notes/diff.ts:5-12, 30-33`; `docs/PLAN.md:64-67, 75`.

**What is wrong:** `lineDiff` allocates and fills a matrix proportional to the product of the old and new line counts before the UI trims unchanged context. The input limit is 200 KB but does not limit line count.

**Why it matters:** A permitted document with many short lines can require an enormous matrix and freeze or crash the phone browser before the user can review or save a small change.

**Suggested fix:** Use a diff with bounded memory for large inputs, or detect unsafe sizes and provide a safe review path that still exposes every change before saving.

### R2-9 — medium: A settings error writes the full data path to the service log

**Where:** `src/platform/config.ts:34-52`; `src/server/main.ts:16-22`; `scripts/kestrel.plist:21-22`.

**What is wrong:** Missing or invalid settings errors include the absolute settings-file path, and startup prints the full error to stderr, which launchd sends to `kestrel.log`.

**Why it matters:** The persistent log can contain the user's home path, although the privacy rule says logs never hold paths.

**Suggested fix:** Keep the actionable error but omit the absolute path from the logged message; use a non-personal label such as `settings.json`.

### R2-10 — medium: The file allowlist rejects text formats promised by the plan

**Where:** `src/domain/notes/documents.ts:13-14, 97-101`; `docs/PLAN.md:64-67`.

**What is wrong:** Notes accepts only `.md`, `.markdown`, `.txt`, and `.text`, while the acceptance criterion includes “any other text format.”

**Why it matters:** UTF-8 text files such as `.csv`, `.json`, or `.rst` in an allowed folder cannot be opened, despite meeting the stated size and encoding rules.

**Suggested fix:** Decide text-versus-binary based on the content and UTF-8 validation rather than a four-extension allowlist, while continuing to reject known binary formats with a clear reason.

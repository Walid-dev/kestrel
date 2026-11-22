// The lab follows the skill's own letter step, says what's missing in words, keeps a file's previous words before a
// save, and serves a try's PDF only from its own folder. Made-up files only, in a made-up folder.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Settings } from "../platform/config.ts";
import { dataDir } from "../platform/paths.ts";
import { labMissing, letterPdf, letterStep, saveFile, tidy } from "./letters.ts";

const SKILL = `# Applying
1. Open the posting.
2. Read it.
   - every line of it
3. Write the texts, the cover letter and each answer, in voice.md's voice:
   - Pick the stories first.
   - The cover letter is \`letter.txt\`: its text only.
4. Fill the form.
`;

function lab(): Settings {
  const base = mkdtempSync(join(tmpdir(), "kestrel-letters-"));
  const folder = join(base, "apply");
  mkdirSync(folder);
  for (const f of ["voice.md", "stories.md", "profile.md"]) writeFileSync(join(folder, f), `# ${f}\nMade-up words.\n`);
  writeFileSync(join(base, "SKILL.md"), SKILL);
  return {
    apply: { folder, skill: join(base, "SKILL.md"), pdf: "", check: "" },
  } as unknown as Settings;
}

test("the letter step is the skill's numbered step about the letter, as written, up to the next one", () => {
  const step = letterStep(SKILL);
  assert.match(step, /^3\. Write the texts/);
  assert.match(step, /letter\.txt/);
  assert.doesNotMatch(step, /Fill the form/);
  assert.equal(letterStep("# no steps here"), "");
});

test("what's missing is said in words that say how to fix it", () => {
  const s = lab();
  assert.equal(labMissing(s), null);
  assert.match(
    labMissing({ apply: { folder: "", skill: "", pdf: "", check: "" } } as unknown as Settings) ?? "",
    /apply\.folder/,
  );
  assert.match(
    labMissing({ apply: { ...s.apply, skill: "/nowhere/SKILL.md" } } as unknown as Settings) ?? "",
    /apply\.skill/,
  );
});

test("a save keeps the previous words first, keeps the file's mode, and refuses to empty it", () => {
  const s = lab();
  const voice = join(s.apply.folder, "voice.md");
  const mode = statSync(voice).mode & 0o777;
  saveFile(s, "voice", "# voice.md\nWarmer, shorter sentences.", new Date("2026-11-22T12:00:00Z"));
  assert.equal(readFileSync(voice, "utf8"), "# voice.md\nWarmer, shorter sentences.\n");
  assert.equal(statSync(voice).mode & 0o777, mode);
  const kept = readdirSync(join(dataDir(), "letters", "history")).filter((f) => f.startsWith("voice-2026-11-22T12-00"));
  assert.equal(kept.length, 1);
  assert.throws(() => saveFile(s, "stories", "  "), /empty the file/);
});

test("a letter is tidied for the PDF tool; a try's PDF is found only under a real try id", () => {
  assert.equal(
    tidy("Dear team,\r\n\r\n\r\nHello.\n\n\n\nBest,\nA. Person\n"),
    "Dear team,\n\nHello.\n\nBest,\nA. Person",
  );
  assert.equal(letterPdf("../../etc"), null);
  assert.equal(letterPdf("00000000-0000-0000-0000-000000000000"), null);
});

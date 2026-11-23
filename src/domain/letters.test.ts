// The lab follows the skill's own letter step, says what's missing in words, keeps a file's previous words before a
// save, and serves a try's PDF only from its own folder. Made-up files only, in a made-up folder.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { letterPrompt, whatToWrite } from "../ai/letter/prompt.ts";
import { LetterDraft, LetterReview } from "../ai/letter/shape.ts";
import { startStandIn } from "../ai/stand-in.ts";
import { migrate } from "../db/migrate.ts";
import type { Settings } from "../platform/config.ts";
import { dataDir } from "../platform/paths.ts";
import { deleteLetter, labMissing, letterPdf, letterStep, reviewForApplication, tidy } from "./letters.ts";

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

test("a letter is tidied for the PDF tool; a try's PDF is found only under a real try id", () => {
  assert.equal(
    tidy("Dear team,\r\n\r\n\r\nHello.\n\n\n\nBest,\nA. Person\n"),
    "Dear team,\n\nHello.\n\nBest,\nA. Person",
  );
  assert.equal(letterPdf("../../etc"), null);
  assert.equal(letterPdf("00000000-0000-0000-0000-000000000000"), null);
});

test("the text comes as its paragraphs and is joined with a blank line between them; one string still reads", () => {
  const d = LetterDraft.parse({
    needs: "Pouring tea",
    stories: ["The teapot story"],
    letter: ["Dear team,", "  I pour tea well, every morning, for twelve years.  ", "", "Best,", "A. Person"],
  });
  assert.equal(d.text, "Dear team,\n\nI pour tea well, every morning, for twelve years.\n\nBest,\n\nA. Person");
  assert.deepEqual(d.needs, ["Pouring tea"]);
  const one = LetterDraft.parse({ letter: "Dear team,\n\nI pour tea well, every morning, for twelve years." });
  assert.match(one.text, /^Dear team,/);
});

test("three kinds of text, each asked in the step's own terms; an older answer under letter still reads", () => {
  assert.match(whatToWrite("letter", ""), /letter\.txt/);
  assert.match(whatToWrite("answer", "Why this team?"), /question on the application form: Why this team\?/);
  assert.match(
    whatToWrite("text", "a two-line note to the recruiter"),
    /Write this, for this application: a two-line note/,
  );
  const input = {
    step: "3. Write the texts.",
    voice: "v",
    stories: "s",
    profile: "p",
    title: "Teapot maker",
    org: "Made Co",
    job: "j",
  };
  assert.match(letterPrompt(input, "answer", "Why us?"), /"text": \[/);
  const old = LetterDraft.parse({ letter: ["Dear team,", "I pour tea well, every morning, for twelve years."] });
  assert.match(old.text, /^Dear team,\n\nI pour tea/);
});

test("a try is deleted with its folder; one still being written, and one that isn't there, are refused", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-letterdel-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const add = (id: string, state: string) => {
    db.prepare(
      "INSERT INTO letters (id, listing, title, state, step, started) VALUES (?, 'l1', 'A made-up job', ?, '', ?)",
    ).run(id, state, "2026-11-23T10:00:00Z");
    mkdirSync(join(dataDir(), "letters", id), { recursive: true });
  };
  const done = "11111111-1111-4111-8111-111111111111";
  const running = "22222222-2222-4222-8222-222222222222";
  add(done, "done");
  add(running, "running");
  deleteLetter(db, done);
  assert.equal(db.prepare("SELECT id FROM letters WHERE id = ?").get(done), undefined);
  assert.equal(existsSync(join(dataDir(), "letters", done)), false);
  assert.throws(() => deleteLetter(db, running), /still being written/);
  assert.throws(() => deleteLetter(db, "../../etc"), /no such try/);
});

test("the review: the better version is read by the check; a letter not naming its company is marked, whatever the model says", async () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-review-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const folder = join(base, "apply");
  mkdirSync(folder);
  for (const f of ["voice.md", "stories.md", "profile.md"]) writeFileSync(join(folder, f), `# ${f}\nMade-up words.\n`);
  writeFileSync(join(base, "SKILL.md"), SKILL);
  // a stand-in check: it fails a text that says "always"
  const check = join(base, "check.sh");
  writeFileSync(check, '#!/bin/sh\nif grep -q always "$1"; then echo "a word it does not back: always"; exit 1; fi\n');
  chmodSync(check, 0o755);
  let better =
    "Dear team,\n\nI kept forty hives healthy through a cold winter, and I would bring that care to Made-up Honey.";
  const s = await startStandIn(() => ({
    content: JSON.stringify({
      verdict: "better",
      match: { company: true, job: true, note: "Right company." },
      issues: [
        { quote: "I am passionate", why: "Any company could get it.", fix: "Name a real story." },
        { quote: "x" },
      ],
      better: better.split("\n\n"),
    }),
  }));
  const settings = {
    models: { url: s.url, careful: "careful-model", fast: "fast-model", contextChars: 100_000 },
    apply: { folder, skill: join(base, "SKILL.md"), pdf: "", check },
  } as unknown as Settings;
  const job = "A made-up posting for a beekeeper. ".repeat(10);
  const got = await reviewForApplication(db, settings, {
    text: "Dear team,\n\nI am passionate about bees.",
    job,
    org: "Made-up Honey",
  });
  assert.equal(got.verdict, "better");
  assert.equal(got.issues.length, 1); // the issue without a why is dropped
  assert.equal(got.findings, ""); // the better version passed the check
  assert.equal(got.match.company, false); // the text reviewed never named the company
  assert.match(got.match.note, /doesn't name Made-up Honey/);
  better = "Dear team,\n\nI always kept forty hives healthy at Made-up Honey.";
  const held = await reviewForApplication(db, settings, {
    text: "Dear team at Made-up Honey,\n\nBees.",
    job,
    org: "Made-up Honey",
  });
  assert.match(held.findings, /always/);
  assert.equal(held.match.company, true);
  await s.close();
  // a review reads tolerantly: a missing match is right, a lone string is the text
  assert.deepEqual(
    LetterReview.parse({ better: "A made-up better text, long enough to be a text of its own." }).match,
    {
      company: true,
      job: true,
      note: "",
    },
  );
});

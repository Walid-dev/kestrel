// The cover letter lab: a letter for a real job, written the way an application writes it (the apply skill's own
// letter step, my voice, my stories, the posting), then checked with the applications' own check — each problem it
// names goes back to the model to fix, twice at most — and laid out with the applications' own PDF tool, so what I
// see here is what an employer would get. My voice and stories are edited here: each save keeps the previous version
// in the data folder. Each try keeps its folder: the letter, the posting, the PDF, the voice it was written with.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { callModel } from "../ai/client.ts";
import { fixPrompt, LETTER_VERSION, type LetterInput, letterPrompt, SYSTEM } from "../ai/letter/prompt.ts";
import { LetterDraft, LetterFix } from "../ai/letter/shape.ts";
import { fetchPage } from "../ai/web.ts";
import { begin } from "../platform/activity.ts";
import type { Settings } from "../platform/config.ts";
import { dataDir } from "../platform/paths.ts";
import { recordCall } from "./calls.ts";
import { modelFor } from "./models.ts";
import { Refused } from "./notes/documents.ts";
import { getListing } from "./search/listings.ts";

const FILES = { voice: "voice.md", stories: "stories.md", profile: "profile.md" } as const;
export type Editable = "voice" | "stories";
const ID = /^[0-9a-f-]{36}$/;
const str = (v: unknown) => (typeof v === "string" ? v : "");

// the skill's numbered step about the letter, as written: the lab follows the same rule, never a copy of it
export function letterStep(skill: string): string {
  const lines = skill.split("\n");
  const starts = lines.flatMap((l, i) => (/^\d+\.\s/.test(l) ? [i] : []));
  for (const [k, s] of starts.entries()) {
    const block = lines.slice(s, starts[k + 1] ?? lines.length).join("\n");
    if (/cover letter|letter\.txt/i.test(block)) return block.trim();
  }
  return "";
}

// null when the lab can write, else what is missing, in words that say how to fix it
export function labMissing(settings: Settings): string | null {
  const { folder, skill } = settings.apply;
  if (!folder)
    return "set apply.folder in settings.json: the applications' folder, with voice.md, stories.md and profile.md";
  for (const f of Object.values(FILES))
    if (!existsSync(join(folder, f))) return `${f} isn't in the applications' folder`;
  if (!skill || !existsSync(skill))
    return "set apply.skill in settings.json: the apply skill whose letter step the lab follows";
  return null;
}

export function readFiles(settings: Settings): { voice: string; stories: string } {
  const missing = labMissing(settings);
  if (missing) throw new Refused(missing);
  const read = (f: string) => readFileSync(join(settings.apply.folder, f), "utf8");
  return { voice: read(FILES.voice), stories: read(FILES.stories) };
}

// a save keeps the file's previous words in the data folder first, then replaces it whole, its mode kept
export function saveFile(settings: Settings, which: Editable, text: string, now = new Date()): void {
  const missing = labMissing(settings);
  if (missing) throw new Refused(missing);
  if (text.trim().length < 20) throw new Refused("that would empty the file: keep its words");
  const file = join(settings.apply.folder, FILES[which]);
  const history = join(dataDir(), "letters", "history");
  mkdirSync(history, { recursive: true });
  copyFileSync(file, join(history, `${which}-${now.toISOString().replaceAll(":", "-")}.md`));
  writeFileSync(`${file}.tmp`, text.endsWith("\n") ? text : `${text}\n`);
  chmodSync(`${file}.tmp`, statSync(file).mode & 0o777);
  renameSync(`${file}.tmp`, file);
}

// one of the applications' tools: its exit code and everything it said
function run(cmd: string, args: string[], env: Record<string, string>, timeoutMs: number) {
  return new Promise<{ code: number; out: string }>((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, maxBuffer: 2_000_000, encoding: "utf8", env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        const code = !error ? 0 : typeof (error as { code?: unknown }).code === "number" ? Number(error.code) : -1;
        resolve({ code, out: `${stdout ?? ""}\n${stderr ?? ""}`.trim() });
      },
    );
  });
}

// the letter as the PDF tool wants it: paragraphs split by one blank line, nothing around
export const tidy = (s: string) =>
  s
    .replaceAll("\r\n", "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

let busy = false;

export function startLetter(db: DatabaseSync, settings: Settings, listingId: string): string {
  const missing = labMissing(settings);
  if (missing) throw new Refused(missing);
  const l = getListing(db, listingId);
  if (!l) throw new Refused("no such job");
  if (busy) throw new Refused("a letter is being written: one at a time, like the model");
  const id = randomUUID();
  const title = str(l.data.title);
  const org = str(l.data.org) || str(l.data.company);
  db.prepare(
    "INSERT INTO letters (id, listing, title, state, step, started) VALUES (?, ?, ?, 'running', 'Starting', ?)",
  ).run(id, listingId, org ? `${title} · ${org}` : title, new Date().toISOString());
  busy = true;
  const dir = join(dataDir(), "letters", id);
  mkdirSync(dir, { recursive: true });
  const live = begin("letter", `Cover letter: ${title}`.slice(0, 120), `/letters?try=${id}`);
  const step = (s: string) => {
    db.prepare("UPDATE letters SET step = ? WHERE id = ?").run(s, id);
    live.step(s);
  };
  const finish = (state: "done" | "failed", text: string, notes: Record<string, unknown>, error = "") => {
    db.prepare(
      "UPDATE letters SET state = ?, step = '', finished = ?, text = ?, notes = ?, error = ? WHERE id = ?",
    ).run(state, new Date().toISOString(), text, JSON.stringify(notes), error, id);
    live.end(state, error);
  };
  void (async () => {
    const { folder, skill, check, pdf } = settings.apply;
    const model = modelFor(db, settings, "letter");
    const effective = { ...settings.models, careful: model, fast: model };
    try {
      step("Reading the posting");
      let job = str(l.data.description) || str(l.data.excerpt);
      if (job.length < 1500 && /^https:\/\//.test(l.link)) {
        try {
          job = (await fetchPage(settings.models, l.link, 10_000)) || job;
        } catch {
          // the page didn't open: the listing's own words, if they are enough
        }
      }
      if (job.length < 200)
        return finish("failed", "", { model }, "the posting's text couldn't be read: try again later");
      const read = (f: string) => readFileSync(join(folder, f), "utf8");
      const stepText = letterStep(readFileSync(skill, "utf8"));
      const input: LetterInput = {
        step: stepText || "Write a cover letter in voice.md's voice, shape and length, from stories.md's facts only.",
        voice: read(FILES.voice),
        stories: read(FILES.stories),
        profile: read(FILES.profile),
        title,
        org,
        job,
      };
      const letterFile = join(dir, "letter.txt");
      const jobFile = join(dir, "job.txt");
      writeFileSync(jobFile, job);
      writeFileSync(join(dir, "voice.md"), input.voice); // the voice this try was written with, to compare later

      step("Writing the letter");
      const draft = await callModel(
        effective,
        { model, system: SYSTEM, prompt: letterPrompt(input), maxTokens: 3000, thinking: true },
        LetterDraft,
      );
      recordCall(db, `letter:v${LETTER_VERSION}`, draft);
      if (!draft.ok) return finish("failed", "", { model }, `the model didn't write it well: ${draft.why}`);
      let letter = tidy(draft.value.letter);
      const fixed: string[] = []; // what each check named before a fix
      let findings = "";
      for (let round = 0; check && round < 3; round++) {
        step(round === 0 ? "Checking it with the applications' check" : `Checking the fix (${round} of 2)`);
        writeFileSync(letterFile, `${letter}\n`);
        const c = await run(check, [letterFile, "--job", jobFile], { APPLY_HOME: folder }, 60_000);
        findings = c.code === 0 ? "" : c.out || `the check stopped (exit ${c.code})`;
        if (!findings || round === 2) break;
        fixed.push(findings);
        step("Fixing what the check named");
        const fix = await callModel(
          effective,
          { model, system: SYSTEM, prompt: fixPrompt(input, letter, findings), maxTokens: 3000, thinking: true },
          LetterFix,
        );
        recordCall(db, `letter-fix:v${LETTER_VERSION}`, fix);
        if (!fix.ok) break;
        letter = tidy(fix.value.letter);
      }
      writeFileSync(letterFile, `${letter}\n`);
      step("Laying out the PDF");
      const laid = pdf ? await run(pdf, [letterFile], { APPLY_HOME: folder }, 120_000) : null;
      const file = readdirSync(dir).find((f) => f.endsWith(".pdf")) ?? null;
      finish("done", letter, {
        model,
        needs: draft.value.needs,
        stories: draft.value.stories,
        fixed,
        findings,
        checked: Boolean(check),
        pdf: file,
        pdfNote: !pdf
          ? "set apply.pdf in settings.json to see the PDF"
          : laid && laid.code !== 0
            ? laid.out.slice(-600)
            : "",
        stepFound: Boolean(stepText),
      });
    } catch (e) {
      finish(
        "failed",
        "",
        { model },
        `the letter stopped: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`,
      );
    } finally {
      busy = false;
    }
  })();
  return id;
}

export function listLetters(db: DatabaseSync, listing?: string) {
  return db
    .prepare(
      `SELECT id, listing, title, state, step, started, finished, error, json_extract(notes, '$.pdf') AS pdf
       FROM letters ${listing ? "WHERE listing = ?" : ""} ORDER BY started DESC LIMIT 100`,
    )
    .all(...(listing ? [listing] : [])) as Record<string, unknown>[];
}

export function getLetter(db: DatabaseSync, id: string) {
  const r = db.prepare("SELECT * FROM letters WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  const dir = join(dataDir(), "letters", String(r.id));
  const voice = existsSync(join(dir, "voice.md")) ? readFileSync(join(dir, "voice.md"), "utf8") : "";
  return { ...r, notes: JSON.parse(String(r.notes)) as Record<string, unknown>, voice };
}

// the PDF of one try, or null: the id is checked, the file is the one the PDF tool made in the try's own folder
export function letterPdf(id: string): string | null {
  if (!ID.test(id)) return null;
  const dir = join(dataDir(), "letters", id);
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).find((n) => n.endsWith(".pdf"));
  return f ? join(dir, f) : null;
}

// the jobs a letter can be tried for: the latest application of each, then the jobs I marked Interested
export function letterJobs(db: DatabaseSync) {
  const applied = db
    .prepare(
      `SELECT a.listing AS id, a.title, a.org, a.state, max(a.updated) AS at FROM applications a
       WHERE a.listing IS NOT NULL GROUP BY a.listing ORDER BY at DESC LIMIT 80`,
    )
    .all() as { id: string; title: string; org: string; state: string; at: string }[];
  const seen = new Set(applied.map((a) => a.id));
  const interested = (
    db
      .prepare(
        "SELECT id, data, updated FROM listings WHERE kind = 'jobs' AND status = 'interested' ORDER BY updated DESC LIMIT 40",
      )
      .all() as { id: string; data: string; updated: string }[]
  )
    .filter((r) => !seen.has(r.id))
    .map((r) => {
      const d = JSON.parse(r.data) as Record<string, unknown>;
      return { id: r.id, title: str(d.title), org: str(d.org) || str(d.company), state: "interested", at: r.updated };
    });
  return [...applied, ...interested];
}

export function sweepLetters(db: DatabaseSync): void {
  db.prepare(
    "UPDATE letters SET state = 'failed', step = '', error = 'kestrel restarted while it ran: write again' WHERE state = 'running'",
  ).run();
}

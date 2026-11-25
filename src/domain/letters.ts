// Writing: a text for a real job, written the way an application writes it (the apply skill's own step for its texts,
// my voice, my stories, the posting) — a cover letter, the answer to a form's question, or any text I describe — then
// checked with the applications' own check — each problem it names goes back to the model to fix, twice at most — and,
// for a letter, laid out with the applications' own PDF tool, so what I see here is what an employer would get. My voice and stories are reworked in Notes,
// each save kept as a version. Each try keeps its folder: the letter, the posting, the PDF, the voice it was written with.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { callModel, failureWords } from "../ai/client.ts";
import {
  fixPrompt,
  type Kind,
  LETTER_VERSION,
  type LetterInput,
  letterPrompt,
  REVIEW_VERSION,
  reviewPrompt,
  SYSTEM,
} from "../ai/letter/prompt.ts";
import { LetterDraft, LetterFix, LetterReview } from "../ai/letter/shape.ts";
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

// the review a reader gives (reviewPrompt): the match, what to make better, the better version. A letter that doesn't
// name the company it goes to is marked so, whatever the model says.
export type Reviewed = LetterReview & { better: string };
async function reviewText(
  db: DatabaseSync,
  models: Settings["models"],
  model: string,
  input: LetterInput,
  text: string,
  kind: Kind,
  ask: string,
): Promise<{ ok: true; review: Reviewed } | { ok: false; why: string }> {
  const got = await callModel(
    { ...models, careful: model, fast: model },
    { model, system: SYSTEM, prompt: reviewPrompt(input, text, kind, ask), maxTokens: 12_000, thinking: true },
    LetterReview,
  );
  recordCall(db, `letter-review:v${REVIEW_VERSION}`, got);
  if (!got.ok) return { ok: false, why: failureWords(got.why) };
  const r = got.value;
  const named = !input.org || kind !== "letter" || text.toLowerCase().includes(input.org.toLowerCase());
  return {
    ok: true,
    review: {
      ...r,
      better: tidy(r.better),
      match: {
        ...r.match,
        company: r.match.company && named,
        note: named ? r.match.note : `It doesn't name ${input.org}. ${r.match.note}`.trim(),
      },
    },
  };
}

// the applications' own review, outside Writing (the apply skill's apply-review): the text and its posting in, the
// review out, its better version read by the applications' check, so the agent takes it only when the check is clean
export async function reviewForApplication(
  db: DatabaseSync,
  settings: Settings,
  given: { text: string; job: string; title?: string; org?: string; kind?: Kind; ask?: string },
): Promise<Reviewed & { checked: boolean; findings: string }> {
  const missing = labMissing(settings);
  if (missing) throw new Refused(missing);
  const { folder, skill, check } = settings.apply;
  const read = (f: string) => readFileSync(join(folder, f), "utf8");
  const input: LetterInput = {
    step:
      letterStep(readFileSync(skill, "utf8")) ||
      "Write in voice.md's voice, shape and length, from stories.md's facts only.",
    voice: read(FILES.voice),
    stories: read(FILES.stories),
    profile: read(FILES.profile),
    title: given.title ?? "",
    org: given.org ?? "",
    job: given.job,
  };
  const kind = given.kind ?? "letter";
  const model = modelFor(db, settings, "letter");
  const live = begin(
    "letter",
    `Reviewing ${WHAT[kind]}${input.org ? ` for ${input.org}` : ""}`.slice(0, 120),
    "/writing",
  );
  try {
    const got = await reviewText(db, settings.models, model, input, tidy(given.text), kind, given.ask ?? "");
    if (!got.ok) throw new Refused(got.why);
    let findings = "";
    if (check && got.review.verdict === "better") {
      live.step("Checking the better version");
      const dir = join(dataDir(), "letters", "reviews", randomUUID());
      mkdirSync(dir, { recursive: true });
      try {
        writeFileSync(join(dir, "letter.txt"), `${got.review.better}\n`);
        writeFileSync(join(dir, "job.txt"), input.job);
        const c = await run(
          check,
          [join(dir, "letter.txt"), "--job", join(dir, "job.txt")],
          { APPLY_HOME: folder },
          60_000,
        );
        findings = c.code === 0 ? "" : c.out || `the check stopped (exit ${c.code})`;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    live.end("done", got.review.verdict === "ready" ? "ready" : `${got.review.issues.length} to make better`);
    return { ...got.review, checked: Boolean(check), findings };
  } catch (e) {
    live.end("failed", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

let busy = false;

const WHAT: Record<Kind, string> = { letter: "the letter", answer: "the answer", text: "the text" };

export function startLetter(
  db: DatabaseSync,
  settings: Settings,
  listingId: string,
  kind: Kind = "letter",
  askFor = "",
): string {
  const missing = labMissing(settings);
  if (missing) throw new Refused(missing);
  const l = getListing(db, listingId);
  if (!l) throw new Refused("no such job");
  const ask = askFor.trim();
  if (kind !== "letter" && !ask)
    throw new Refused(kind === "answer" ? "paste the form's question first" : "say what to write first");
  if (busy) throw new Refused("a text is being written: one at a time, like the model");
  const id = randomUUID();
  const title = str(l.data.title);
  const org = str(l.data.org) || str(l.data.company);
  db.prepare(
    "INSERT INTO letters (id, listing, title, state, step, started, kind, ask) VALUES (?, ?, ?, 'running', 'Starting', ?, ?, ?)",
  ).run(id, listingId, org ? `${title} · ${org}` : title, new Date().toISOString(), kind, ask);
  busy = true;
  const dir = join(dataDir(), "letters", id);
  mkdirSync(dir, { recursive: true });
  const live = begin("letter", `Writing ${WHAT[kind]}: ${title}`.slice(0, 120), `/writing?try=${id}`);
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

      step(`Writing ${WHAT[kind]}`);
      const draft = await callModel(
        effective,
        // the files are long and the model thinks before it writes: room for both (3,000 ran out while thinking)
        { model, system: SYSTEM, prompt: letterPrompt(input, kind, ask), maxTokens: 12_000, thinking: true },
        LetterDraft,
      );
      recordCall(db, `letter:v${LETTER_VERSION}`, draft);
      if (!draft.ok) return finish("failed", "", { model }, failureWords(draft.why, "Write it again"));
      let letter = tidy(draft.value.text);
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
          { model, system: SYSTEM, prompt: fixPrompt(input, letter, findings), maxTokens: 12_000, thinking: true },
          LetterFix,
        );
        recordCall(db, `letter-fix:v${LETTER_VERSION}`, fix);
        if (!fix.ok) break;
        letter = tidy(fix.value.text);
      }
      // the review: what a reader would make better. Its better version is kept only when the check passes it too;
      // the first draft stays in the notes
      step("Reviewing it");
      const reviewed = await reviewText(db, settings.models, model, input, letter, kind, ask);
      let review: Record<string, unknown>;
      if (reviewed.ok) {
        const r = reviewed.review;
        let adopted = false;
        let held = "";
        const before = letter;
        if (r.verdict === "better" && r.better && r.better !== letter) {
          if (check) {
            step("Checking the better version");
            writeFileSync(letterFile, `${r.better}\n`);
            const c = await run(check, [letterFile, "--job", jobFile], { APPLY_HOME: folder }, 60_000);
            held = c.code === 0 ? "" : c.out || `the check stopped (exit ${c.code})`;
          }
          if (!held) {
            letter = r.better;
            findings = "";
            adopted = true;
          }
        }
        review = { verdict: r.verdict, match: r.match, issues: r.issues, adopted, before: adopted ? before : "", held };
      } else review = { failed: reviewed.why };
      writeFileSync(letterFile, `${letter}\n`);
      // only a letter is laid out as a document; an answer or a text goes on a form as it is
      if (kind === "letter") step("Laying out the PDF");
      const laid = kind === "letter" && pdf ? await run(pdf, [letterFile], { APPLY_HOME: folder }, 120_000) : null;
      const file = kind === "letter" ? (readdirSync(dir).find((f) => f.endsWith(".pdf")) ?? null) : null;
      finish("done", letter, {
        model,
        needs: draft.value.needs,
        stories: draft.value.stories,
        fixed,
        findings,
        checked: Boolean(check),
        pdf: file,
        pdfNote:
          kind !== "letter"
            ? ""
            : !pdf
              ? "set apply.pdf in settings.json to see the PDF"
              : laid && laid.code !== 0
                ? laid.out.slice(-600)
                : "",
        stepFound: Boolean(stepText),
        review,
      });
    } catch (e) {
      finish(
        "failed",
        "",
        { model },
        `the writing stopped: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`,
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
      `SELECT id, listing, title, state, step, started, finished, error, kind, ask, json_extract(notes, '$.pdf') AS pdf
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

// a try I don't want, gone with its folder (its PDF and the voice it read); one still writing stays until it ends
export function deleteLetter(db: DatabaseSync, id: string): void {
  const r = db.prepare("SELECT state FROM letters WHERE id = ?").get(id) as { state: string } | undefined;
  if (!r || !ID.test(id)) throw new Refused("no such try");
  if (r.state === "running") throw new Refused("this try is still being written: delete it once it ends");
  db.prepare("DELETE FROM letters WHERE id = ?").run(id);
  rmSync(join(dataDir(), "letters", id), { recursive: true, force: true });
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

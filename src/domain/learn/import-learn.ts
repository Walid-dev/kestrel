// The one-time import from the old setup: the old Learn lessons by topic, a guide's term entries with its
// glossary, and the interview answer files. Ids are stable, so a rerun updates — it never doubles.
import type { DatabaseSync } from "node:sqlite";
import { LessonBody } from "./lessons.ts";

export type ImportCounts = { packs: number; lessons: number; skipped: string[] };

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 60) || "x";
// a line is a string, or the guide's analogy form { like: "..." }
const txt = (v: unknown): string =>
  typeof v === "string"
    ? v.trim()
    : v !== null && typeof v === "object" && "like" in v
      ? txt((v as { like: unknown }).like)
      : "";
const lines = (v: unknown): string[] => (Array.isArray(v) ? v.map(txt).filter(Boolean) : []);
const pair = (v: unknown, a: string, b: string): { q: string; a: string } | null => {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const q = txt(o[a]);
  const ans = txt(o[b]);
  return q && ans ? { q, a: ans } : null;
};

function upsertPack(db: DatabaseSync, id: string, name: string, kind: "lesson-pack" | "answer-pack"): void {
  db.prepare(
    `INSERT INTO packs (id, name, kind, added_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind`,
  ).run(id, name, kind, new Date().toISOString());
}

function upsertLesson(
  db: DatabaseSync,
  id: string,
  pack: string,
  position: number,
  title: string,
  body: unknown,
): boolean {
  const read = LessonBody.safeParse(body);
  if (!read.success || title.trim() === "") return false;
  db.prepare(
    `INSERT INTO lessons (id, pack, position, title, body, added_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET pack = excluded.pack, position = excluded.position,
       title = excluded.title, body = excluded.body`,
  ).run(id, pack, position, title.trim(), JSON.stringify(read.data), new Date().toISOString());
  return true;
}

// The old Learn app's lessons.json: a list of { id, topic, title, short, say, explain, example, words, check }.
// Each topic becomes a pack; the one-line short opens the explanation.
export function importOldLearn(db: DatabaseSync, old: unknown): ImportCounts {
  const counts: ImportCounts = { packs: 0, lessons: 0, skipped: [] };
  if (!Array.isArray(old)) {
    counts.skipped.push("the lessons file is not a list");
    return counts;
  }
  const packs = new Map<string, number>(); // pack id -> next position
  for (const raw of old) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const topic = txt(o.topic) || "untopiced";
    const packId = `old:${slug(topic)}`;
    if (!packs.has(packId)) {
      upsertPack(db, packId, topic, "lesson-pack");
      counts.packs++;
      packs.set(packId, 1);
    }
    const position = packs.get(packId) ?? 1;
    const short = txt(o.short);
    const explain = lines(o.explain);
    const body = {
      say: lines(o.say),
      explain: short && short !== explain[0] ? [short, ...explain] : explain,
      example: txt(o.example),
      words: (Array.isArray(o.words) ? o.words : [])
        .map((w) => pair(w, "w", "m"))
        .filter((w) => w !== null)
        .map((w) => ({ w: w.q, m: w.a })),
      check: (Array.isArray(o.check) ? o.check : []).map((c) => pair(c, "q", "a")).filter((c) => c !== null),
    };
    const title = txt(o.title);
    if (upsertLesson(db, `${packId}/${txt(o.id) || slug(title)}`, packId, position, title, body)) {
      counts.lessons++;
      packs.set(packId, position + 1);
    } else counts.skipped.push(`old lesson without a title or a readable body: ${txt(o.id) || "?"}`);
  }
  return counts;
}

// A guide file: its term entries become the lessons, its glossary becomes a closing "The words" lesson. The
// prose around the entries stays in the old guide page, which keeps working.
export function importGuide(db: DatabaseSync, guide: unknown): ImportCounts {
  const counts: ImportCounts = { packs: 0, lessons: 0, skipped: [] };
  const g = (guide ?? {}) as Record<string, unknown>;
  const meta = (g.meta ?? {}) as Record<string, unknown>;
  const name = txt(meta.title);
  if (!name) {
    counts.skipped.push("a guide without meta.title");
    return counts;
  }
  const packId = `guide:${slug(name)}`;
  upsertPack(db, packId, name, "lesson-pack");
  counts.packs++;
  let position = 1;
  for (const part of Array.isArray(g.parts) ? g.parts : []) {
    const sections = (part as Record<string, unknown>)?.sections;
    for (const section of Array.isArray(sections) ? sections : []) {
      const blocks = (section as Record<string, unknown>)?.blocks;
      for (const block of Array.isArray(blocks) ? blocks : []) {
        const b = (block ?? {}) as Record<string, unknown>;
        if (b.type !== "entry") continue;
        const check = pair(b.check, "q", "a");
        const body = {
          explain: lines(b.explain),
          example: lines(b.example).join(" "),
          check: check ? [check] : [],
        };
        const term = txt(b.term);
        if (upsertLesson(db, `${packId}/${txt(b.id) || slug(term)}`, packId, position, term, body)) {
          counts.lessons++;
          position++;
        } else counts.skipped.push(`a guide entry without a term: ${txt(b.id) || "?"}`);
      }
    }
  }
  const glossary = (Array.isArray(g.glossary) ? g.glossary : [])
    .map((w) => pair(w, "term", "meaning"))
    .filter((w) => w !== null)
    .map((w) => ({ w: w.q, m: w.a }));
  if (glossary.length > 0 && upsertLesson(db, `${packId}/words`, packId, position, "The words", { words: glossary }))
    counts.lessons++;
  return counts;
}

// An interview answer file: blocks split by blank lines, each a question with its spoken answer.
//   Q: the question · W: what they check · M: what the question asks · P: the plain words
//   A: a line to say (repeatable) · K: a key point (repeatable)
export function importAnswers(db: DatabaseSync, name: string, text: string): ImportCounts {
  const counts: ImportCounts = { packs: 0, lessons: 0, skipped: [] };
  const packId = `answers:${slug(name)}`;
  let position = 1;
  for (const block of text.split(/\n\s*\n/)) {
    const field: Record<string, string[]> = { Q: [], W: [], M: [], P: [], A: [], K: [] };
    let last = "";
    for (const line of block.split("\n")) {
      const m = line.match(/^([QWMPAK]):\s*(.*)$/);
      if (m) {
        last = m[1];
        field[last].push(m[2].trim());
      } else if (last && line.trim()) field[last][field[last].length - 1] += ` ${line.trim()}`;
    }
    const q = field.Q.join(" ").trim();
    const say = field.A.filter(Boolean);
    if (!q || say.length === 0) {
      if (block.trim()) counts.skipped.push(`a block without a question and an answer: "${block.trim().slice(0, 40)}"`);
      continue;
    }
    if (counts.packs === 0) {
      upsertPack(db, packId, name, "answer-pack");
      counts.packs++;
    }
    const body = {
      say,
      explain: [field.M.join(" "), field.P.join(" "), field.W.length ? `They check: ${field.W.join(" ")}` : ""]
        .map((s) => s.trim())
        .filter(Boolean),
      example: field.K.filter(Boolean).join(" · "),
      check: [{ q, a: say[0] }],
    };
    if (upsertLesson(db, `${packId}/${slug(q)}`, packId, position, q, body)) {
      counts.lessons++;
      position++;
    }
  }
  return counts;
}

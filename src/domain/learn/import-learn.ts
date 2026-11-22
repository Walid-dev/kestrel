// The one-time import from the old setup: the old Learn lessons by topic, each guide as its topics (one lesson per
// topic page, its blocks and diagrams kept as written), and the interview answer files. Ids are stable, so a rerun
// updates — it never doubles. Two sources minting the same id in one run collide, and the later one is skipped by
// name rather than silently overwriting the first. A guide owns its pack: a topic it no longer has is removed.
import type { DatabaseSync } from "node:sqlite";
import type { Area } from "./lessons.ts";
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
const lines = (v: unknown): string[] => (Array.isArray(v) ? v.map(txt).filter(Boolean) : txt(v) ? [txt(v)] : []);
const pair = (v: unknown, a: string, b: string): { q: string; a: string } | null => {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const q = txt(o[a]);
  const ans = Array.isArray(o[b]) ? lines(o[b]).join(" ") : txt(o[b]);
  return q && ans ? { q, a: ans } : null;
};
// the first letter up, the rest as written: "work" reads "Work", "AI models" stays
const titled = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

function upsertPack(db: DatabaseSync, id: string, name: string, kind: "lesson-pack" | "answer-pack", area: Area) {
  db.prepare(
    `INSERT INTO packs (id, name, kind, area, added_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind`,
  ).run(id, name, kind, area, new Date().toISOString());
}

// one run's minted ids: a second lesson minting the same id is a collision, skipped by name
function freshId(minted: Set<string>, id: string): boolean {
  if (minted.has(id)) return false;
  minted.add(id);
  return true;
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

export type OldLearnOptions = {
  labels?: Record<string, string>; // topic id → its display name ("ai" → "AI models")
  interviewTopics?: string[]; // topics that belong in Interview prep, not Learn
};

// The old Learn app's lessons.json: a list of { id, topic, title, short, say, explain, example, words, check }.
// Each topic becomes a pack named by its label; the one-line short stays the lede under the title.
export function importOldLearn(db: DatabaseSync, old: unknown, opts: OldLearnOptions = {}): ImportCounts {
  const counts: ImportCounts = { packs: 0, lessons: 0, skipped: [] };
  if (!Array.isArray(old)) {
    counts.skipped.push("the lessons file is not a list");
    return counts;
  }
  const packs = new Map<string, number>(); // pack id -> next position
  const minted = new Set<string>();
  for (const raw of old) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const topic = txt(o.topic) || "untopiced";
    const label = titled(opts.labels?.[topic] ?? topic);
    const packId = `old:${slug(topic)}`;
    if (!packs.has(packId)) {
      upsertPack(db, packId, label, "lesson-pack", opts.interviewTopics?.includes(topic) ? "interview" : "learn");
      counts.packs++;
      packs.set(packId, 1);
    }
    const position = packs.get(packId) ?? 1;
    const body = {
      eyebrow: label,
      short: txt(o.short),
      say: lines(o.say),
      explain: lines(o.explain),
      example: txt(o.example),
      words: (Array.isArray(o.words) ? o.words : [])
        .map((w) => pair(w, "w", "m"))
        .filter((w) => w !== null)
        .map((w) => ({ w: w.q, m: w.a })),
      check: (Array.isArray(o.check) ? o.check : []).map((c) => pair(c, "q", "a")).filter((c) => c !== null),
    };
    const title = txt(o.title);
    const id = `${packId}/${txt(o.id) || slug(title)}`;
    if (!freshId(minted, id)) {
      counts.skipped.push(`two old lessons share the id ${txt(o.id) || slug(title)}: the later one is skipped`);
      continue;
    }
    if (upsertLesson(db, id, packId, position, title, body)) {
      counts.lessons++;
      packs.set(packId, position + 1);
    } else counts.skipped.push(`old lesson without a title or a readable body: ${txt(o.id) || "?"}`);
  }
  return counts;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// A guide file: { meta, intro, parts[{ title, sections[{ id, num, eyebrow, title, short, blocks }] }], glossary,
// references }. Each topic page is one lesson with its blocks as written — entries, examples, diagrams, tables — and
// its entries' checks gathered for Practice. The glossary closes the pack; the references follow it.
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
  upsertPack(db, packId, name, "lesson-pack", "learn");
  counts.packs++;
  const minted = new Set<string>();
  let position = 1;
  const checksOf = (blocks: unknown[]) =>
    blocks
      .map((b) => (b && typeof b === "object" ? pair((b as Record<string, unknown>).check, "q", "a") : null))
      .filter((c) => c !== null);
  const topic = (s: Record<string, unknown>, part: string, fallbackEyebrow: string) => {
    const title = txt(s.title);
    const own = txt(s.id) || slug(title);
    const id = `${packId}/${own}`;
    if (!title || !freshId(minted, id)) {
      counts.skipped.push(
        title ? `two topics share the id ${own}: the later one is skipped` : "a topic without a title",
      );
      return;
    }
    const blocks = (Array.isArray(s.blocks) ? s.blocks : []).filter((b) => b && typeof b === "object");
    const body = {
      eyebrow: txt(s.eyebrow) || fallbackEyebrow,
      part,
      short: txt(s.short),
      blocks,
      check: checksOf(blocks),
    };
    if (upsertLesson(db, id, packId, position, title, body)) {
      counts.lessons++;
      position++;
    }
  };
  if (g.intro && typeof g.intro === "object") topic(g.intro as Record<string, unknown>, "", "Start here");
  (Array.isArray(g.parts) ? g.parts : []).forEach((p, i) => {
    const part = (p ?? {}) as Record<string, unknown>;
    const label = `Part ${ROMAN[i] ?? i + 1} · ${txt(part.title)}`;
    for (const s of Array.isArray(part.sections) ? part.sections : [])
      if (s && typeof s === "object") {
        const num = txt((s as Record<string, unknown>).num);
        topic(s as Record<string, unknown>, label, `Part ${ROMAN[i] ?? i + 1}${num ? ` · Topic ${num}` : ""}`);
      }
  });
  const glossary = (Array.isArray(g.glossary) ? g.glossary : [])
    .map((w) => pair(w, "term", "meaning"))
    .filter((w) => w !== null)
    .map((w) => ({ w: w.q, m: w.a }));
  if (glossary.length > 0) {
    minted.add(`${packId}/words`);
    if (upsertLesson(db, `${packId}/words`, packId, position++, "Glossary", { eyebrow: "Look up", words: glossary }))
      counts.lessons++;
  }
  const refs = (Array.isArray(g.references) ? g.references : [])
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : null))
    .filter((r) => r !== null && typeof r.url === "string")
    .map((r) => ({ title: txt(r?.title) || String(r?.url), url: String(r?.url) }));
  if (refs.length > 0) {
    minted.add(`${packId}/references`);
    if (
      upsertLesson(db, `${packId}/references`, packId, position++, "References", {
        eyebrow: "Look up",
        short: txt(g.references_note),
        blocks: [{ type: "links", items: refs }],
      })
    )
      counts.lessons++;
  }
  // the guide owns its pack: a lesson it no longer mints goes (its reviews with it)
  const gone = (db.prepare("SELECT id FROM lessons WHERE pack = ?").all(packId) as { id: string }[]).filter(
    (r) => !minted.has(r.id),
  );
  for (const r of gone) db.prepare("DELETE FROM lessons WHERE id = ?").run(r.id);
  if (gone.length) counts.skipped.push(`${gone.length} older lessons of this guide were replaced by its topics`);
  return counts;
}

// The old Learn's job preps, kept in its store as "job:<id>": what one role wants and what I have, and five short
// lessons written for it. Each becomes an Interview prep pack: an overview page (the role, then what they want beside
// what I have), then its lessons in the one shape.
export function importJobPreps(db: DatabaseSync, store: unknown): ImportCounts {
  const counts: ImportCounts = { packs: 0, lessons: 0, skipped: [] };
  if (store === null || typeof store !== "object") return counts;
  for (const [key, value] of Object.entries(store)) {
    if (!key.startsWith("job:") || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const title = txt(v.title);
    const company = txt(v.company);
    if (!title) {
      counts.skipped.push(`a job prep without a title: ${key}`);
      continue;
    }
    const packId = `prep:${slug(txt(v.id) || key.slice(4))}`;
    upsertPack(db, packId, `Prep: ${title}${company ? ` · ${company}` : ""}`, "lesson-pack", "interview");
    counts.packs++;
    const minted = new Set<string>();
    const needs = (Array.isArray(v.needs) ? v.needs : [])
      .map((n) => (n && typeof n === "object" ? (n as Record<string, unknown>) : null))
      .filter((n) => n !== null)
      .map((n) => [txt(n.need), txt(n.have)])
      .filter(([need]) => need);
    const overview = {
      eyebrow: company,
      short: lines(v.about)[0] ?? "",
      blocks: [
        { type: "lines", lines: lines(v.about).slice(1) },
        ...(needs.length ? [{ type: "table", head: ["They want", "I have"], rows: needs }] : []),
      ],
    };
    minted.add(`${packId}/overview`);
    if (upsertLesson(db, `${packId}/overview`, packId, 0, "What they want, and what I have", overview))
      counts.lessons++;
    let position = 1;
    for (const raw of Array.isArray(v.lessons) ? v.lessons : []) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const lt = txt(o.title);
      const id = `${packId}/${txt(o.id) || slug(lt)}`;
      if (!lt || !freshId(minted, id)) {
        counts.skipped.push(lt ? `two prep lessons share the id ${txt(o.id)}` : "a prep lesson without a title");
        continue;
      }
      const body = {
        eyebrow: company,
        short: txt(o.short),
        say: lines(o.say),
        explain: lines(o.explain),
        example: txt(o.example),
        words: (Array.isArray(o.words) ? o.words : [])
          .map((w) => pair(w, "w", "m"))
          .filter((w) => w !== null)
          .map((w) => ({ w: w.q, m: w.a })),
        check: (Array.isArray(o.check) ? o.check : []).map((c) => pair(c, "q", "a")).filter((c) => c !== null),
      };
      if (upsertLesson(db, id, packId, position, lt, body)) {
        counts.lessons++;
        position++;
      }
    }
  }
  return counts;
}

// An interview answer file: blocks split by blank lines, each a question with its spoken answer.
//   Q: the question · W: what they check · M: what the question asks · P: the plain words
//   A: a line to say (repeatable) · K: a key point (repeatable)
// Answer files belong in Interview prep.
export function importAnswers(db: DatabaseSync, name: string, text: string): ImportCounts {
  const counts: ImportCounts = { packs: 0, lessons: 0, skipped: [] };
  const packId = `answers:${slug(name)}`;
  const minted = new Set<string>();
  let position = 1;
  let block = 0;
  for (const chunk of text.split(/\n\s*\n/)) {
    block++;
    const field: Record<string, string[]> = { Q: [], W: [], M: [], P: [], A: [], K: [] };
    let last = "";
    for (const line of chunk.split("\n")) {
      const m = line.match(/^([QWMPAK]):\s*(.*)$/);
      if (m) {
        last = m[1];
        field[last].push(m[2].trim());
      } else if (last && line.trim()) field[last][field[last].length - 1] += ` ${line.trim()}`;
    }
    const q = field.Q.join(" ").trim();
    const say = field.A.filter(Boolean);
    if (!q || say.length === 0) {
      if (chunk.trim()) counts.skipped.push(`block ${block} of the file has no question or no answer line`);
      continue;
    }
    if (!freshId(minted, `${packId}/${slug(q)}`)) {
      counts.skipped.push(`two questions read the same once slugged (${slug(q)}): the later one is skipped`);
      continue;
    }
    if (counts.packs === 0) {
      upsertPack(db, packId, titled(name), "answer-pack", "interview");
      counts.packs++;
    }
    const body = {
      eyebrow: field.W.join(" "),
      short: field.M.join(" "),
      say,
      explain: [field.P.join(" ")].map((s) => s.trim()).filter(Boolean),
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

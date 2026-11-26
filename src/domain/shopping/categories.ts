// The categories: one file per kind of product, what matters for it and how the testers test it. Six starters ship
// beside this file; any other kind Understand drafts at a want's first run and saves in the data folder
// (shopping/categories/<key>.json, draft: true). The key comes from the model, so code guards it: ^[a-z0-9-]{2,40}$, the
// path inside the folder, and a draft never takes a key that is there already (a starter's or another draft's: tv-2).
// A file I write there by hand, without draft, may replace a starter.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { dataDir } from "../../platform/paths.ts";
import type { Criterion } from "../../shared/shopping.ts";
import { Refused } from "../notes/documents.ts";

export const KEY = /^[a-z0-9-]{2,40}$/;
const STARTERS = fileURLToPath(new URL("./categories/", import.meta.url));
export const draftsDir = (): string => join(dataDir(), "shopping", "categories");

const HardShape = z.object({
  criterion: z.string(),
  says: z.string(),
  min: z.number().optional(),
  max: z.number().optional(),
  is: z.union([z.boolean(), z.string()]).optional(),
});
const CriterionShape = z.object({
  key: z.string().regex(KEY),
  label: z.string().min(1).max(60),
  type: z.enum(["number", "score", "bool", "enum"]),
  unit: z.string().max(12).optional(),
  better: z.enum(["higher", "lower"]),
  weight: z.number().min(0),
  how: z.string().max(200).optional(),
  measured: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});
export const Category = z.object({
  key: z.string().regex(KEY, "a key of 2 to 40 lowercase letters, digits and dashes"),
  name: z.string().min(1).max(60),
  words: z.array(z.string()).default([]),
  refreshMonths: z.number().int().min(1).max(60).default(12),
  listSize: z.number().int().min(3).max(12).default(6),
  criteria: z.array(CriterionShape).min(4).max(7),
  uses: z.record(z.string(), z.record(z.string(), z.number())).default({}),
  implied: z.array(z.object({ when: z.string(), needs: z.array(z.string()) })).default([]),
  questions: z
    .array(
      z.object({
        key: z.string(),
        q: z.string(),
        options: z.array(
          z.object({
            label: z.string(),
            weights: z.record(z.string(), z.number()),
            hard: z.array(HardShape).optional(),
          }),
        ),
        default: z.number().int().min(0),
      }),
    )
    .default([]),
  traps: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  storeGroups: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
});
export type Category = z.infer<typeof Category>;

// a file read: a broken one is left out alone (its key named in the log), so one bad draft never hides the others
function readDir(dir: string): Category[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => {
      try {
        const c = Category.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
        return c.key === f.slice(0, -5) ? [c] : [];
      } catch {
        console.error(`a category file doesn't read: ${f.slice(0, 40)}`);
        return [];
      }
    });
}

// the categories kestrel knows: the starters, each replaced by a hand-written file of its key, then the drafts
export function loadCategories(drafts: string = draftsDir()): Category[] {
  const mine = readDir(drafts);
  const starters = readDir(STARTERS).map((s) => mine.find((m) => m.key === s.key && !m.draft) ?? s);
  return [...starters, ...mine.filter((m) => !starters.some((s) => s.key === m.key))];
}

// the category whose words my want's words hold, the longest word first
export function matchCategory(words: string, categories: Category[]): Category | null {
  const text = ` ${words.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  let best: { c: Category; n: number } | null = null;
  for (const c of categories)
    for (const w of [...c.words, c.name]) {
      const plain = w
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      if (plain && text.includes(` ${plain} `) && (!best || plain.length > best.n)) best = { c, n: plain.length };
    }
  return best?.c ?? null;
}

// weights scaled to a sum of 100, whole numbers that still add up
export function toHundred(criteria: Criterion[]): Criterion[] {
  const sum = criteria.reduce((n, c) => n + Math.max(0, c.weight), 0);
  if (sum <= 0) return criteria.map((c) => ({ ...c, weight: Math.round(100 / criteria.length) }));
  const scaled = criteria.map((c) => ({ ...c, weight: Math.round((Math.max(0, c.weight) * 100) / sum) }));
  const off = 100 - scaled.reduce((n, c) => n + c.weight, 0);
  if (off !== 0) {
    const top = scaled.reduce((a, b) => (b.weight > a.weight ? b : a));
    top.weight += off;
  }
  return scaled;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

// a key the model gave, made safe: its own when it is one, else one from the kind's name; never one that reaches
// outside the folder
export function safeKey(key: string, name: string): string | null {
  for (const k of [key, slug(name)]) if (KEY.test(k) && !k.startsWith("-")) return k;
  return null;
}

// a drafted category saved: its key guarded, its path inside the folder, never over a key that is there already
export function saveDraft(raw: unknown, known: Category[], dir: string = draftsDir()): Category {
  const given = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const key = safeKey(String(given.key ?? ""), String(given.name ?? ""));
  if (!key) throw new Refused("the drafted kind of product has no usable key");
  const criteria = (Array.isArray(given.criteria) ? given.criteria : [])
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
    .map((c) => ({
      ...c,
      key: safeKey(String(c.key ?? ""), String(c.label ?? "")) ?? "",
      weight: Number(c.weight ?? 0),
    }))
    .filter((c) => c.key)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 7);
  const parsed = Category.safeParse({
    ...given,
    key,
    listSize: given.listSize ?? 6,
    criteria: toHundred(criteria as unknown as Criterion[]),
    draft: true,
  });
  if (!parsed.success)
    throw new Refused(`the drafted kind of product doesn't read: ${parsed.error.issues[0]?.message ?? ""}`);
  let free = key;
  const taken = (k: string) => known.some((c) => c.key === k) || existsSync(join(dir, `${k}.json`));
  for (let n = 2; taken(free); n++) free = `${key.slice(0, 36)}-${n}`;
  const root = resolve(dir);
  const file = resolve(root, `${free}.json`);
  if (!file.startsWith(root + sep)) throw new Refused("the drafted kind of product has no usable key");
  mkdirSync(root, { recursive: true });
  const cat = { ...parsed.data, key: free };
  writeFileSync(`${file}.tmp`, `${JSON.stringify(cat, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  return cat;
}

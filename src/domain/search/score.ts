// The scoring engine: generic rules a spec configures — nothing about me or any site lives here. Every part answers
// a number and a plain reason; the score is their sum, the match a tier, the why readable on the card.
import { z } from "zod";

// a spec file is written by hand: a lone string where a list belongs still reads (split on commas or semicolons),
// and anything unreadable falls back to a harmless default instead of a crash
const splitWords = (s: string) =>
  s
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
const words = z.preprocess(
  (v) =>
    typeof v === "string"
      ? splitWords(v)
      : // a list of single letters is a string that was split letter by letter by mistake: joined back, then split
        // on its commas (a corrupted list once scored every posting as naming most of 123 "skills")
        Array.isArray(v) && v.length > 3 && v.every((x) => typeof x === "string" && x.length <= 1)
        ? splitWords(v.join(""))
        : v,
  z.array(z.string()).catch([]),
);
export const ScoringShape = z
  .object({
    title: z.object({ want: words.default([]), avoid: words.default([]) }).catch({ want: [], avoid: [] }),
    skills: words.default([]),
    level: z.object({ want: words.default([]), avoid: words.default([]) }).catch({ want: [], avoid: [] }),
    pay: z
      .object({ floor: z.number().catch(0), usdToCad: z.number().optional() })
      .optional()
      .catch(undefined),
    places: z
      .object({ words: words.default([]), remoteOk: z.boolean().default(true) })
      .optional()
      .catch(undefined),
    price: z
      .object({ cap: z.number().catch(0) })
      .optional()
      .catch(undefined),
    freshDays: z.number().catch(7),
  })
  .catch({ title: { want: [], avoid: [] }, skills: [], level: { want: [], avoid: [] }, freshDays: 7 });
export type Scoring = z.infer<typeof ScoringShape>;
export type ScoredJob = {
  title: string;
  location?: string;
  workMode?: string;
  seniority?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  posted?: string; // ISO date
  usOnly?: boolean;
  excerpt?: string;
  price?: number | null; // a deal's money: judged against the cap, shown on the card
};
export type Score = {
  score: number;
  match: "great" | "good" | "weak" | "poor";
  why: string;
  parts: Record<string, number>;
};

const WEIGHTS = { title: 25, skills: 25, level: 15, pay: 10, place: 15, fresh: 10 };
const has = (text: string, word: string) => text.toLowerCase().includes(word.toLowerCase());

export function scoreJob(raw: unknown, job: ScoredJob, now: Date): Score {
  const scoring = ScoringShape.parse(raw ?? {});
  const parts: Record<string, number> = {};
  const why: string[] = [];
  const text = `${job.title} ${job.excerpt ?? ""}`;

  const titleHits = scoring.title.want.filter((w) => has(job.title, w));
  const titleMiss = scoring.title.avoid.filter((w) => has(job.title, w));
  parts.title = titleMiss.length ? 0 : Math.round((WEIGHTS.title * Math.min(titleHits.length, 2)) / 2);
  if (titleMiss.length) why.push(`the title says ${titleMiss[0]}`);
  else if (titleHits.length) why.push(`title matches ${titleHits.join(", ")}`);

  const skills = scoring.skills;
  const skillHits = skills.filter((s) => has(text, s));
  parts.skills = skills.length ? Math.round((WEIGHTS.skills * Math.min(skillHits.length, 4)) / 4) : 0;
  if (skillHits.length) why.push(`${skillHits.length} of ${skills.length} skills named`);

  const levelText = `${job.seniority ?? ""} ${job.title}`;
  const levelBad = scoring.level.avoid.some((w) => has(levelText, w));
  const levelGood = scoring.level.want.some((w) => has(levelText, w));
  parts.level = levelBad ? 0 : levelGood ? WEIGHTS.level : Math.round(WEIGHTS.level / 2);
  if (levelBad) why.push("another level");

  if (scoring.price?.cap) {
    parts.pay =
      job.price === null || job.price === undefined
        ? Math.round(WEIGHTS.pay * 0.6)
        : job.price <= scoring.price.cap
          ? WEIGHTS.pay
          : 0;
    if (job.price !== null && job.price !== undefined && job.price > scoring.price.cap)
      why.push("the price sits over the cap");
  } else if (scoring.pay?.floor) {
    const toCad = job.salaryCurrency === "USD" ? (scoring.pay.usdToCad ?? 1.35) : 1;
    // every period annualizes before the floor: an hourly wage is a year of hours, a monthly one twelve months
    const period = (job.salaryPeriod ?? "").toLowerCase();
    const yearly = period.includes("hour")
      ? 2080
      : period.includes("day")
        ? 260
        : period.includes("week")
          ? 52
          : period.includes("month")
            ? 12
            : 1;
    const top = (job.salaryMax ?? job.salaryMin ?? 0) * toCad * yearly;
    parts.pay = top === 0 ? Math.round(WEIGHTS.pay * 0.6) : top >= scoring.pay.floor ? WEIGHTS.pay : 0;
    if (top !== 0 && top < scoring.pay.floor) why.push("the pay sits under the floor");
  } else parts.pay = Math.round(WEIGHTS.pay * 0.6);

  const placeText = `${job.location ?? ""} ${job.workMode ?? ""}`;
  const placeHit = (scoring.places?.words ?? []).some((w) => has(placeText, w));
  const remote = has(placeText, "remote") && (scoring.places?.remoteOk ?? true);
  parts.place = job.usOnly ? 0 : placeHit || remote ? WEIGHTS.place : Math.round(WEIGHTS.place / 3);
  if (job.usOnly) why.push("US only");

  const days = job.posted ? (now.getTime() - new Date(job.posted).getTime()) / 86_400_000 : 999;
  const window = scoring.freshDays;
  parts.fresh = days <= window ? WEIGHTS.fresh : days <= window * 4 ? Math.round(WEIGHTS.fresh / 2) : 0;

  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  const match = score >= 80 ? "great" : score >= 60 ? "good" : score >= 40 ? "weak" : "poor";
  return { score, match, why: why.join("; ") || "nothing stood out", parts };
}

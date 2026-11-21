// The scoring engine: generic rules a spec configures — nothing about me or any site lives here. Every part answers
// a number and a plain reason; the score is their sum, the match a tier, the why readable on the card.
export type Scoring = {
  title: { want: string[]; avoid?: string[] };
  skills?: string[];
  level?: { want?: string[]; avoid?: string[] };
  pay?: { floor: number; usdToCad?: number };
  places?: { words: string[]; remoteOk?: boolean };
  freshDays?: number; // full freshness points inside this window
};
export type ScoredJob = {
  title: string;
  location?: string;
  workMode?: string;
  seniority?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  posted?: string; // ISO date
  usOnly?: boolean;
  excerpt?: string;
};
export type Score = {
  score: number;
  match: "great" | "good" | "weak" | "poor";
  why: string;
  parts: Record<string, number>;
};

const WEIGHTS = { title: 25, skills: 25, level: 15, pay: 10, place: 15, fresh: 10 };
const has = (text: string, word: string) => text.toLowerCase().includes(word.toLowerCase());

export function scoreJob(scoring: Scoring, job: ScoredJob, now: Date): Score {
  const parts: Record<string, number> = {};
  const why: string[] = [];
  const text = `${job.title} ${job.excerpt ?? ""}`;

  const titleHits = scoring.title.want.filter((w) => has(job.title, w));
  const titleMiss = (scoring.title.avoid ?? []).filter((w) => has(job.title, w));
  parts.title = titleMiss.length ? 0 : Math.round((WEIGHTS.title * Math.min(titleHits.length, 2)) / 2);
  if (titleMiss.length) why.push(`the title says ${titleMiss[0]}`);
  else if (titleHits.length) why.push(`title matches ${titleHits.join(", ")}`);

  const skills = scoring.skills ?? [];
  const skillHits = skills.filter((s) => has(text, s));
  parts.skills = skills.length ? Math.round((WEIGHTS.skills * Math.min(skillHits.length, 4)) / 4) : 0;
  if (skillHits.length) why.push(`${skillHits.length} of ${skills.length} skills named`);

  const levelText = `${job.seniority ?? ""} ${job.title}`;
  const levelBad = (scoring.level?.avoid ?? []).some((w) => has(levelText, w));
  const levelGood = (scoring.level?.want ?? []).some((w) => has(levelText, w));
  parts.level = levelBad ? 0 : levelGood ? WEIGHTS.level : Math.round(WEIGHTS.level / 2);
  if (levelBad) why.push("another level");

  if (scoring.pay?.floor) {
    const toCad = job.salaryCurrency === "USD" ? (scoring.pay.usdToCad ?? 1.35) : 1;
    const top = (job.salaryMax ?? job.salaryMin ?? 0) * toCad;
    parts.pay = top === 0 ? Math.round(WEIGHTS.pay * 0.6) : top >= scoring.pay.floor ? WEIGHTS.pay : 0;
    if (top !== 0 && top < scoring.pay.floor) why.push("the pay sits under the floor");
  } else parts.pay = Math.round(WEIGHTS.pay * 0.6);

  const placeText = `${job.location ?? ""} ${job.workMode ?? ""}`;
  const placeHit = (scoring.places?.words ?? []).some((w) => has(placeText, w));
  const remote = has(placeText, "remote") && (scoring.places?.remoteOk ?? true);
  parts.place = job.usOnly ? 0 : placeHit || remote ? WEIGHTS.place : Math.round(WEIGHTS.place / 3);
  if (job.usOnly) why.push("US only");

  const days = job.posted ? (now.getTime() - new Date(job.posted).getTime()) / 86_400_000 : 999;
  const window = scoring.freshDays ?? 7;
  parts.fresh = days <= window ? WEIGHTS.fresh : days <= window * 4 ? Math.round(WEIGHTS.fresh / 2) : 0;

  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  const match = score >= 80 ? "great" : score >= 60 ? "good" : score >= 40 ? "weak" : "poor";
  return { score, match, why: why.join("; ") || "nothing stood out", parts };
}

// The deep-check prompts, the old setup's in their words: concrete, honest, only the facts given, plain English, one
// JSON object back. The profile and the wants come from the data folder; the web results are numbered.
import { type Hit, hitsText } from "../web.ts";

export const DEEP_VERSION = 1;
export const SYSTEM = "You help one person decide. Reply with ONE JSON OBJECT only, no prose around it.";

export type Profile = { level?: string; years?: number; skills?: string[]; summary?: string };
export type Wants = {
  name: string;
  about: string;
  titles: string[];
  skills: string[];
  level: string[];
  floor: number;
  places: string[];
};
export type JobFacts = {
  title: string;
  org: string;
  location: string;
  workMode: string;
  pay: string;
  posted: string;
  source: string;
  score: number | null;
  why: string;
  read: string;
};

export function jobPrompt(
  job: JobFacts,
  wants: Wants,
  profile: Profile,
  posting: string,
  postingNote: string,
  hits: Hit[],
) {
  const him = [
    profile.level ? `level ${profile.level}` : "",
    profile.years != null ? `${profile.years} years` : "",
    profile.skills?.length ? `skills ${profile.skills.join(", ")}` : "",
    profile.summary ?? "",
  ]
    .filter(Boolean)
    .join("; ");
  return `You help one job seeker decide whether to apply to one job, and how. Be concrete and honest; use only the facts below and say when something is unknown. Plain, simple English.

THE SEEKER: ${him || "not set"}.
WHAT THEY WANT (${wants.name}): ${wants.about || wants.titles.join(", ")}. Titles: ${wants.titles.join(", ") || "not set"}. Skills that matter: ${wants.skills.join(", ") || "not set"}. Level: ${wants.level.join(", ") || "not set"}. Places: ${wants.places.join(", ") || "not set"}. Lowest pay: ${wants.floor ? `$${wants.floor} a year` : "not set"}.

THE JOB: ${job.title} at ${job.org || "a company not named"}. Place: ${job.location || "unknown"}; setup: ${job.workMode || "unknown"}. Pay: ${job.pay || "not stated"}. Posted: ${job.posted || "unknown"}. Source: ${job.source}.
The search's score: ${job.score ?? "?"}/100 (${job.why}).${job.read ? ` Quick read: ${job.read}.` : ""}
The posting's text:
${posting ? posting.slice(0, 8000) : `(not read: ${postingNote || "no text"})`}

FROM THE WEB (search results; numbers in brackets):
${hitsText(hits) || "(no results)"}

Reply with one JSON object:
- verdict: apply, maybe, or skip
- headline: one sentence
- strengths: where the seeker fits this job well (2 to 5)
- gaps: what is missing or uncertain against what the job asks (0 to 5)
- pay: one or two sentences on the pay against the lowest pay (and the market, if the results say)
- company: 2 to 4 sentences: what they do, size or stage, any recent news from the results (say if unknown)
- red_flags: worrying signs (an old or reposted posting, an agency, vague duties, layoffs; empty if none)
- questions: 3 to 5 questions to ask the recruiter or in an interview
- pitch: 2 to 4 points to put forward in the application for this job
- sources: the web pages above you actually used (title and url)`;
}

export type DealFacts = {
  title: string;
  category: string;
  price: number | null;
  location: string;
  posted: string;
  source: string;
  prices: { at: string; price: number }[];
};

export function dealPrompt(
  deal: DealFacts,
  usual: { median: number; p25: number; p75: number; n: number } | null,
  ad: string,
  adNote: string,
  hits: Hit[],
) {
  const history =
    deal.prices.length > 1 ? deal.prices.map((p) => `$${p.price} (${p.at.slice(0, 10)})`).join(" → ") : "";
  return `You help one buyer decide on one used item. Be concrete and honest; use only the facts below and say when something is unknown. Plain, simple English.

THE AD: ${deal.title}${deal.category ? ` (the model: ${deal.category})` : ""}. Asking: ${deal.price != null ? `$${deal.price}` : "not stated"}. Place: ${deal.location || "unknown"}. Posted: ${deal.posted || "unknown"}. Source: ${deal.source}.${history ? ` Its price over time: ${history}.` : ""}
${usual ? `The usual asking price for this model (${usual.n} ads seen): low $${usual.p25}, median $${usual.median}, high $${usual.p75}.` : "Not enough ads yet to know the usual price."}
The ad's text:
${ad ? ad.slice(0, 6000) : `(not read: ${adNote || "no text"})`}

FROM THE WEB (search results; numbers in brackets):
${hitsText(hits) || "(no results)"}

Reply with one JSON object:
- verdict: buy (a good item at a fair price), negotiate (worth it at a lower price), skip, or unsure (too little to tell)
- headline: one sentence
- fair_low, fair_high: a fair price range in dollars for this item as described (numbers, or null when unknown)
- offer: the price to offer first, in dollars (a number, or null)
- price_why: one or two sentences on the price
- checks: 4 to 7 things to check in person or in photos, specific to this model and this ad
- red_flags: worrying signs (empty if none)
- questions: 2 to 4 questions to ask the seller
- about: 2 to 4 sentences on the model itself (versions, what matters most when buying used)
- sources: the web pages above you actually used (title and url)`;
}

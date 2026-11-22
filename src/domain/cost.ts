// What the models cost: everything this computer's models did since oMLX started counting, what the same use would
// have cost in the cloud at my reference prices, and what it cost in electricity. Read only: oMLX's hourly table
// (usage.sqlite3 in its home, which settings.json names) and my prices.json in the data folder, each price with where
// it was seen and when. A model with no price shows "no reference price", never 0.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const perMillion = z.number().min(0);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const; // as Date's getUTCDay counts them
const Price = z.object({
  match: z.string().min(1).optional(), // a part of a local model's name: this price is for those only; none: every model
  model: z.string().min(1), // the cloud model it is priced as
  input: perMillion, // fresh input, US dollars per million tokens
  cachedInput: perMillion, // input read from the cloud's cache: the tokens oMLX reused
  output: perMillion,
  // a vendor's peak hours: the prices above apply then, their offPeakShare at every other hour
  peak: z
    .object({
      days: z.array(z.enum(DAYS)).min(1),
      utcHours: z.array(z.tuple([z.int().min(0).max(23), z.int().min(1).max(24)])).min(1),
      offPeakShare: z.number().min(0).max(1),
    })
    .optional(),
  source: z.string().min(1),
  seen: z.string().min(1),
  note: z.string().optional(),
});
const Reference = z.object({ id: z.string().min(1), name: z.string().min(1), prices: z.array(Price).min(1) });
const Electricity = z.object({
  watts: z.number().positive(), // what the computer draws while a model works
  wattsSource: z.string().min(1),
  pricePerKwh: z.number().min(0),
  currency: z.string().min(1),
  source: z.string().min(1),
  seen: z.string().min(1),
  note: z.string().optional(),
});
export const PricesFile = z.object({
  about: z.string().optional(),
  cloud: z.array(Reference),
  electricity: Electricity,
});
export type Prices = z.infer<typeof PricesFile>;
type PriceT = z.infer<typeof Price>;
type ReferenceT = z.infer<typeof Reference>;

export function loadPrices(file: string): { prices: Prices | null; error: string | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {
      prices: null,
      error: "prices.json can't be read: put it in the data folder to see the cloud and power figures",
    };
  }
  const r = PricesFile.safeParse(raw);
  if (r.success) return { prices: r.data, error: null };
  return {
    prices: null,
    error: `prices.json: ${r.error.issues.map((i) => `${i.path.join(".") || "the file"}: ${i.message}`).join("; ")}`,
  };
}

export type Hour = {
  hour: number;
  model: string;
  requests: number;
  prompt: number;
  cached: number;
  output: number;
  seconds: number;
};

// every hour oMLX kept, oldest first; throws, saying why, when the table can't be read
export function usageHours(omlxHome: string): Hour[] {
  if (!omlxHome) throw new Error("oMLX's home isn't set for kestrel (settings.json: omlxHome)");
  const file = join(omlxHome, "usage.sqlite3");
  if (!existsSync(file))
    throw new Error("oMLX's usage table isn't there: oMLX writes it once a request ends, with Usage history on");
  let d: DatabaseSync | undefined;
  try {
    d = new DatabaseSync(file, { readOnly: true, timeout: 2000 });
    return d
      .prepare(
        `SELECT timestamp_hour AS hour, model_id AS model, requests, prompt_tokens AS prompt, cached_tokens AS cached,
                completion_tokens AS output, prefill_seconds + generation_seconds AS seconds
         FROM model_usage_hourly ORDER BY timestamp_hour, model_id`,
      )
      .all() as Hour[];
  } catch (e) {
    throw new Error(`oMLX's usage table can't be read: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
  } finally {
    d?.close();
  }
}

export type Use = { requests: number; fresh: number; reused: number; out: number; computeHours: number };
export type Power = { kwh: number; cost: number; currency: string };
const round = (x: number) => Math.round(x * 1e6) / 1e6;
const priceFor = (ref: ReferenceT, model: string): PriceT | null =>
  ref.prices.find((p) => !p.match || model.toLowerCase().includes(p.match.toLowerCase())) ?? null;
function shareAt(p: PriceT, hour: number): number {
  if (!p.peak) return 1;
  const at = new Date(hour * 1000);
  const h = at.getUTCHours();
  const peak = p.peak.days.includes(DAYS[at.getUTCDay()]) && p.peak.utcHours.some(([from, to]) => h >= from && h < to);
  return peak ? 1 : p.peak.offPeakShare;
}
const usdOf = (h: Hour, p: PriceT) =>
  (((h.prompt - h.cached) * p.input + h.cached * p.cachedInput + h.output * p.output) / 1e6) * shareAt(p, h.hour);
function power(computeHours: number, prices: Prices | null): Power | null {
  if (!prices) return null;
  const { watts, pricePerKwh, currency } = prices.electricity;
  const kwh = (computeHours * watts) / 1000;
  return { kwh: round(kwh), cost: round(kwh * pricePerKwh), currency };
}
const empty = (): Use => ({ requests: 0, fresh: 0, reused: 0, out: 0, computeHours: 0 });
function add(u: Use, v: Use) {
  u.requests += v.requests;
  u.fresh += v.fresh;
  u.reused += v.reused;
  u.out += v.out;
  u.computeHours += v.computeHours;
}
const tokens = (u: Use) => u.fresh + u.reused + u.out;

// the figures of a set of hours: in total, and each model apart, the most used first
export function summarize(hours: Hour[], prices: Prices | null) {
  const refs = prices?.cloud ?? [];
  const byModel = new Map<string, { use: Use; usd: (number | null)[] }>();
  for (const h of hours) {
    let m = byModel.get(h.model);
    if (!m) {
      m = { use: empty(), usd: refs.map((ref) => (priceFor(ref, h.model) ? 0 : null)) };
      byModel.set(h.model, m);
    }
    add(m.use, {
      requests: h.requests,
      fresh: h.prompt - h.cached,
      reused: h.cached,
      out: h.output,
      computeHours: h.seconds / 3600,
    });
    for (const [i, ref] of refs.entries()) {
      const p = priceFor(ref, h.model);
      if (p) m.usd[i] = (m.usd[i] ?? 0) + usdOf(h, p);
    }
  }
  const total = empty();
  for (const { use } of byModel.values()) add(total, use);
  const models = [...byModel]
    .map(([model, { use, usd }]) => ({
      model,
      ...use,
      computeHours: round(use.computeHours),
      cloud: refs.map((ref, i) => ({
        id: ref.id,
        usd: usd[i] === null ? null : round(usd[i] as number),
        as: priceFor(ref, model)?.model ?? null,
      })),
      electricity: power(use.computeHours, prices),
    }))
    .sort((a, b) => tokens(b) - tokens(a));
  const cloud = refs.map((ref, i) => {
    const priced = [...byModel.values()].flatMap((m) => m.usd[i] ?? []);
    const unpriced = [...byModel].filter(([, m]) => m.usd[i] === null).map(([model]) => model);
    // every model unpriced: no reference price at all, never a 0 that reads as free
    const usd = priced.length || !unpriced.length ? round(priced.reduce((a, b) => a + b, 0)) : null;
    return { id: ref.id, name: ref.name, usd, unpriced };
  });
  return {
    total: { ...total, computeHours: round(total.computeHours), cloud, electricity: power(total.computeHours, prices) },
    models,
  };
}

const dayOf = (seconds: number) => {
  const d = new Date(seconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function startOfDay(now: number, back: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - back);
  return d.getTime() / 1000;
}

export const PERIODS = ["1", "7", "30", "all"];

// since the start, and one period with each model apart, and the last 30 days one by one for the chart
export function costReport(omlxHome: string, pricesFile: string, days: string, now = Date.now()) {
  if (!PERIODS.includes(days)) throw new RangeError("send ?days=1, 7, 30 or all");
  const hours = usageHours(omlxHome);
  const { prices, error } = loadPrices(pricesFile);
  const all = summarize(hours, prices);
  const from = days === "all" ? null : startOfDay(now, Number(days) - 1);
  const period = summarize(from === null ? hours : hours.filter((h) => h.hour >= from), prices);
  const daily = new Map<string, Hour[]>();
  for (let back = 29; back >= 0; back--) daily.set(dayOf(startOfDay(now, back)), []);
  const month = startOfDay(now, 29);
  for (const h of hours) if (h.hour >= month) daily.get(dayOf(h.hour))?.push(h);
  const first = hours[0]?.hour;
  return {
    at: new Date(now).toISOString(),
    since: first === undefined ? null : new Date(first * 1000).toISOString(),
    total: all.total,
    days,
    period: period.total,
    models: period.models,
    daily: [...daily].map(([day, of]) => {
      const t = summarize(of, null).total;
      return { day, tokens: t.fresh + t.reused + t.out };
    }),
    prices,
    pricesError: error,
  };
}

// A value under its criterion, checked in code (pure). The quote check proves a number is on the page; this proves it
// measures the criterion: the unit the page writes after the number is of the criterion's kind (a weight in grams is
// never a comfort score), it converts to the criterion's unit (g, oz and lb; minutes and hours), it sits in the
// criterion's sane range, and the quote, its line or its table's header names what the criterion measures. The first
// live run kept a headphone's 254 g as its comfort and a jacket's 4.65 lbs as 4.65 g.
import type { Criterion } from "../../shared/shopping.ts";

export type Kind =
  | "mass"
  | "time"
  | "sound"
  | "share"
  | "pressure"
  | "brightness"
  | "length"
  | "temp"
  | "scale"
  | "other";

// each unit as pages write it, its kind and its size in the kind's base unit (g, min, mm); longest spellings first
const UNITS: { re: RegExp; unit: string; kind: Kind; size: number }[] = [
  { re: /^(kilograms?|kgs?)\b/i, unit: "kg", kind: "mass", size: 1000 },
  { re: /^(grams?|gr|g)\b/i, unit: "g", kind: "mass", size: 1 },
  { re: /^(ounces?|oz)\b/i, unit: "oz", kind: "mass", size: 28.3495 },
  { re: /^(pounds?|lbs?)\b/i, unit: "lb", kind: "mass", size: 453.592 },
  { re: /^(hours?|hrs?|h)\b/i, unit: "h", kind: "time", size: 60 },
  { re: /^(minutes?|mins?)\b/i, unit: "min", kind: "time", size: 1 },
  { re: /^(seconds?|secs?)\b/i, unit: "s", kind: "time", size: 1 / 60 },
  { re: /^db(a|\(a\))?(?![a-z])/i, unit: "dB", kind: "sound", size: 1 },
  { re: /^(%|percent\b)/i, unit: "%", kind: "share", size: 1 },
  { re: /^kpa\b/i, unit: "kPa", kind: "pressure", size: 1000 },
  { re: /^pa\b/i, unit: "Pa", kind: "pressure", size: 1 },
  { re: /^(nits?\b|cd\/m(2|²))/i, unit: "nits", kind: "brightness", size: 1 },
  { re: /^(millimet(er|re)s?|mm)\b/i, unit: "mm", kind: "length", size: 1 },
  { re: /^(centimet(er|re)s?|cm)\b/i, unit: "cm", kind: "length", size: 10 },
  { re: /^inch(es)?\b/i, unit: "in", kind: "length", size: 25.4 },
  { re: /^[°º]\s?c\b|^degrees? c(elsius)?\b/i, unit: "°C", kind: "temp", size: 1 },
  { re: /^[°º]\s?f\b|^degrees? f(ahrenheit)?\b/i, unit: "°F", kind: "temp", size: 1 },
  // a source's own scale: "8.8/10", "9.2 out of 10", "23 of 24 points", "4 stars"
  { re: /^(\/\s?\d+|out of \d+|of \d+|points?\b|pts\b|stars?\b)/i, unit: "score", kind: "scale", size: 1 },
];
const byUnit = (u: string) => UNITS.find((x) => x.re.test(u.trim()));

// the unit written right after the number in the quote ("254g", "4.65 lbs", "30-hour", "9.2/10"); null when none
export function unitAfter(quote: string, v: number): { unit: string; kind: Kind; size: number } | null {
  for (const m of quote.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) {
    if (Math.abs(Number.parseFloat(m[0].replace(/,/g, "")) - v) > 1e-9) continue;
    const after = quote.slice((m.index ?? 0) + m[0].length).replace(/^[\s-]{0,2}/, "");
    const u = UNITS.find((x) => x.re.test(after));
    if (!u) continue;
    // a unit per something ("250 grams/ sq meter", "5 g per hour") is another measure, never a plain weight or time
    const rest = after.replace(u.re, "");
    if (u.kind !== "scale" && /^\s*(\/|per\b)/i.test(rest)) return { unit: `${u.unit}/…`, kind: "other", size: 1 };
    return u;
  }
  return null;
}

// the kind a criterion measures: its unit's, or a scale for a score
export const kindOf = (c: Pick<Criterion, "type" | "unit">): Kind | null =>
  c.type === "score" ? "scale" : c.unit ? (byUnit(c.unit)?.kind ?? null) : null;

// the words that say what a criterion measures: its own list, else the words of its label and key
const STOP = new Set(["the", "and", "for", "with", "how", "its", "out"]);
export function namesOf(c: Pick<Criterion, "key" | "label" | "names">): string[] {
  if (c.names?.length) return c.names;
  return [...new Set(`${c.label} ${c.key}`.toLowerCase().split(/[^a-z0-9]+/))].filter(
    (w) => w.length >= 3 && !STOP.has(w),
  );
}
// a name in folded text: a phrase as it is, a word by its start (five letters at most: "comfort" holds "comfortable")
export function names(text: string, list: string[]): boolean {
  const t = text.toLowerCase();
  return list.some((n) => {
    const w = n.toLowerCase().trim();
    if (!w) return false;
    if (/[^a-z0-9]/.test(w)) return t.includes(w);
    const stem = w.slice(0, Math.max(3, Math.min(w.length, 5)));
    return new RegExp(`(?<![a-z0-9])${stem}`).test(t);
  });
}

// a score's sane range when its category gives none: a source's scale tops out at 100
const SCORE_RANGE: [number, number] = [0, 100];

export type Fit = { ok: true; v: number; unit?: string } | { ok: false; why: string };

// a number under its criterion: its unit from the quote (else the model's), converted to the criterion's unit, inside
// the range, and named by the context (the quote, its line, its table's header) unless its unit already says the kind
export function fitNumber(c: Criterion, v: number, quote: string, context: string, modelUnit?: string): Fit {
  const want = kindOf(c);
  const got = unitAfter(quote, v) ?? (modelUnit ? (byUnit(modelUnit) ?? null) : null);
  let value = v;
  let unit = c.unit;
  if (got && want) {
    if (c.type === "score") {
      // a score takes its source's scale or a share, never a physical unit (254 g is no comfort score)
      if (got.kind !== "scale" && got.kind !== "share")
        return { ok: false, why: `${v} ${got.unit} isn't a ${c.label.toLowerCase()} score` };
      unit = got.kind === "share" ? "%" : undefined;
    } else if (got.kind !== want) {
      return { ok: false, why: `${v} ${got.unit} doesn't measure ${c.label.toLowerCase()} (${c.unit})` };
    } else if (got.kind === "temp" || !c.unit) {
      if (got.kind === "temp" && got.unit !== c.unit) value = got.unit === "°F" ? ((v - 32) * 5) / 9 : (v * 9) / 5 + 32;
    } else {
      const to = byUnit(c.unit);
      if (to) value = (v * got.size) / to.size;
    }
  }
  value = Math.round(value * 100) / 100;
  const range = c.range ?? (c.type === "score" ? SCORE_RANGE : undefined);
  if (range && (value < range[0] || value > range[1]))
    return {
      ok: false,
      why: `${value}${unit ? ` ${unit}` : ""} is outside ${c.label.toLowerCase()}'s range (${range[0]} to ${range[1]})`,
    };
  // the unit names the kind for a physical criterion; otherwise the words must
  const sayKind = got !== null && want !== null && want !== "scale" && got.kind === want;
  if (!sayKind && !names(context, namesOf(c)))
    return { ok: false, why: `the quote doesn't say it is ${c.label.toLowerCase()}` };
  return { ok: true, v: value, ...(unit ? { unit } : {}) };
}

// a yes in its own quote: one of the criterion's yes words, not negated ("not waterproof", "non-waterproof"). The
// names alone prove the quote is about the criterion, not that it says yes: "Water resistant" names water and is no
// waterproof shell (the first live run kept it as Waterproof: yes)
export function saysYes(yes: string[], quote: string): boolean {
  const q = quote.toLowerCase();
  return yes.some((w) => {
    const word = w.toLowerCase();
    for (let at = q.indexOf(word); at !== -1; at = q.indexOf(word, at + 1))
      if (!/(?:\bnot|\bnon|\bno|\bisn't|\baren't)[\s-]*$/.test(q.slice(Math.max(0, at - 8), at))) return true;
    return false;
  });
}

// a yes-or-no or a word under its criterion: the context names what the criterion measures, and a yes says it in its
// own quote when the criterion lists its yes words
export function fitWords(c: Criterion, context: string, v?: unknown, quote = ""): Fit {
  if (!names(context, namesOf(c))) return { ok: false, why: `the quote doesn't say it is ${c.label.toLowerCase()}` };
  if (v === true && c.yes?.length && !saysYes(c.yes, quote))
    return { ok: false, why: `the quote doesn't say yes to ${c.label.toLowerCase()} (${c.yes[0]})` };
  return { ok: true, v: 0 };
}

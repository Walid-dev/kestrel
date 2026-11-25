// A deep check: on my tap, the local model takes a longer look at one listing. It reads the posting or the ad, searches
// the web (the model door's own search), weighs what kestrel knows (the hunt's wants and my profile for a job; the
// usual price and the price history for a deal), and writes the old setup's report. One check at a time; each step
// is written as it happens, so Live can show it.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { callModel, failureWords } from "../../ai/client.ts";
import { DEEP_VERSION, dealPrompt, jobPrompt, SYSTEM, type Wants } from "../../ai/deep/prompt.ts";
import { DealReport, JobReport } from "../../ai/deep/shape.ts";
import { fetchPage, searchWeb } from "../../ai/web.ts";
import { begin } from "../../platform/activity.ts";
import type { Settings } from "../../platform/config.ts";
import { recordCall } from "../calls.ts";
import { modelFor } from "../models.ts";
import { Refused } from "../notes/documents.ts";
import { getListing, usualPrices } from "./listings.ts";
import { ScoringShape } from "./score.ts";
import { loadSpecs } from "./specs.ts";

export type DeepCheck = {
  id: string;
  listing: string;
  state: "running" | "done" | "failed";
  step: string;
  started: string;
  finished: string | null;
  report: Record<string, unknown> | null;
  error: string;
};

let busy: string | null = null; // the listing being checked: one at a time, like the model itself

export function latestDeepCheck(db: DatabaseSync, listing: string): DeepCheck | null {
  const r = db.prepare("SELECT * FROM deep_checks WHERE listing = ? ORDER BY started DESC LIMIT 1").get(listing) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;
  let report: Record<string, unknown> | null = null;
  try {
    report = r.report ? (JSON.parse(String(r.report)) as Record<string, unknown>) : null;
  } catch {
    report = null;
  }
  return {
    id: String(r.id),
    listing: String(r.listing),
    state: r.state as DeepCheck["state"],
    step: String(r.step),
    started: String(r.started),
    finished: r.finished == null ? null : String(r.finished),
    report,
    error: String(r.error),
  };
}

const wantsOf = (search: string): Wants => {
  const spec = loadSpecs().specs.find((s) => s.id === search);
  const s = ScoringShape.parse(spec?.scoring ?? {});
  return {
    name: spec?.name ?? search,
    about: spec?.about ?? "",
    titles: s.title.want,
    skills: s.skills,
    level: s.level.want,
    floor: s.pay?.floor ?? 0,
    places: s.places?.words ?? [],
  };
};

export function startDeepCheck(
  db: DatabaseSync,
  settings: Settings,
  listingId: string,
  onStep: (step: string) => void = () => {},
): string {
  const l = getListing(db, listingId);
  if (!l) throw new Refused("no such listing");
  if (busy) throw new Refused("another deep check is running: one at a time, like the model");
  const id = randomUUID();
  db.prepare("INSERT INTO deep_checks (id, listing, state, step, started) VALUES (?, ?, 'running', 'Starting', ?)").run(
    id,
    listingId,
    new Date().toISOString(),
  );
  busy = listingId;
  const live = begin(
    "deep",
    `Deep check: ${String(l.data.title ?? "a listing")}`,
    `/searches?open=${encodeURIComponent(listingId)}`,
  );
  const step = (s: string) => {
    db.prepare("UPDATE deep_checks SET step = ? WHERE id = ?").run(s, id);
    live.step(s);
    onStep(s);
  };
  const finish = (state: "done" | "failed", report: unknown, error = "") => {
    db.prepare("UPDATE deep_checks SET state = ?, step = '', finished = ?, report = ?, error = ? WHERE id = ?").run(
      state,
      new Date().toISOString(),
      report ? JSON.stringify(report) : null,
      error,
      id,
    );
    live.end(state, error);
  };
  void (async () => {
    try {
      const d = l.data;
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      const model = modelFor(db, settings, "search-deep");
      const effective = { ...settings.models, careful: model, fast: model };
      if (l.kind === "deals") {
        // a deal: the ad, a buying guide and the model's common problems, then the report
        step("Reading the ad");
        let ad = "";
        let adNote = "";
        try {
          ad = await fetchPage(settings.models, l.link, 6000);
        } catch (e) {
          adNote = e instanceof Error ? e.message.slice(0, 120) : "the ad didn't open";
        }
        const thing = str(d.category) || str(d.title);
        step("Searching the web");
        const hits = [
          ...(await searchWeb(settings.models, `used ${thing} buying guide what to check`)).slice(0, 3),
          ...(await searchWeb(settings.models, `${thing} common problems review`)).slice(0, 3),
        ];
        step("Writing the report");
        const usual = usualPrices(db).get(str(d.category) || l.search) ?? null;
        const prompt = dealPrompt(
          {
            title: str(d.title),
            category: str(d.category),
            price: typeof d.price === "number" ? d.price : null,
            location: str(d.location),
            posted: str(d.posted),
            source: l.source,
            prices: Array.isArray(d.prices) ? (d.prices as { at: string; price: number }[]) : [],
          },
          usual,
          ad,
          adNote,
          hits,
        );
        const got = await callModel(
          effective,
          { model, system: SYSTEM, prompt, maxTokens: 3000, thinking: true },
          DealReport,
        );
        recordCall(db, `deep-deal:v${DEEP_VERSION}`, got);
        if (!got.ok) return finish("failed", null, failureWords(got.why, "Check again"));
        return finish("done", { ...got.value, read: { ad: ad.length > 0, ad_note: adNote, web: hits.length, model } });
      }
      // a job: the posting, the company and its news, the pay around here, then the report
      step("Reading the posting");
      let posting = str(d.excerpt);
      let postingNote = "";
      if (posting.length < 1500 && /^https:\/\//.test(l.link)) {
        try {
          posting = (await fetchPage(settings.models, l.link, 8000)) || posting;
        } catch (e) {
          postingNote = e instanceof Error ? e.message.slice(0, 120) : "the posting didn't open";
        }
      }
      step("Searching the web");
      const org = str(d.org) || str(d.company);
      const hits = [
        ...(org ? await searchWeb(settings.models, `${org} company what they do employees`) : []).slice(0, 3),
        ...(org ? await searchWeb(settings.models, `${org} layoffs OR funding OR acquisition 2026`) : []).slice(0, 3),
        ...(await searchWeb(settings.models, `${str(d.title)} salary ${str(d.location) || "Canada"}`)).slice(0, 3),
      ];
      step("Writing the report");
      const lo = typeof d.salaryMin === "number" ? d.salaryMin : null;
      const hi = typeof d.salaryMax === "number" ? d.salaryMax : null;
      const prompt = jobPrompt(
        {
          title: str(d.title),
          org,
          location: str(d.location),
          workMode: str(d.workMode),
          pay:
            lo != null || hi != null
              ? `${lo ?? "?"}-${hi ?? "?"} ${str(d.salaryCurrency)} per ${str(d.salaryPeriod) || "year"}`
              : "",
          posted: str(d.posted),
          source: l.source,
          score: l.score,
          why: str(d.why),
          read: typeof d.fit === "number" ? `${d.fit}/10, ${str(d.fitWhy)}` : "",
        },
        wantsOf(l.search),
        settings.profile,
        posting,
        postingNote,
        hits,
      );
      const got = await callModel(
        effective,
        { model, system: SYSTEM, prompt, maxTokens: 3000, thinking: true },
        JobReport,
      );
      recordCall(db, `deep-job:v${DEEP_VERSION}`, got);
      if (!got.ok) return finish("failed", null, failureWords(got.why, "Check again"));
      finish("done", {
        ...got.value,
        read: { posting: posting.length > 0, posting_note: postingNote, web: hits.length, model },
      });
    } catch (e) {
      finish("failed", null, `the check stopped: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
    } finally {
      busy = null;
    }
  })();
  return id;
}

// kestrel restarted while a check ran: it can't finish now, so it says so, and its button works again
export function sweepDeepChecks(db: DatabaseSync): void {
  db.prepare(
    "UPDATE deep_checks SET state = 'failed', step = '', finished = ?, error = 'kestrel restarted while it ran: check again' WHERE state = 'running'",
  ).run(new Date().toISOString());
}

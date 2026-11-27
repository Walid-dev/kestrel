// The run: one want at a time, as the model works one request at a time. A new want while one runs waits, queued with
// its job; when a run ends it starts the next queued one itself, the oldest first. While an application is at work a run
// waits for the scheduler's tick (it needs the model). A whole run: Understanding, Searching, Reading reviews, Comparing,
// Writing, Checking, Finding offers, Done, each step on the want's row and on Live. A want that names one product finds
// its offers first, then reads what compares with it. Find offers on products I picked runs that step alone. A failure
// ends the run with its words and keeps what the last good run found; a restart marks a running want failed. Run again
// keeps my marks on the products it finds again (by key) and logs what changed. Every model call is recorded.
import type { DatabaseSync } from "node:sqlite";
import { failureWords, type ModelAnswer, type Outcome } from "../../ai/client.ts";
import {
  askTextPrice,
  PACER,
  readStorePage,
  SHOP_AGENT,
  type StoreRead,
  type Wanted,
} from "../../ai/shopping/product-data.ts";
import { SHOPPING_VERSION } from "../../ai/shopping/prompt.ts";
import type { TextPrice } from "../../ai/shopping/shape.ts";
import { fetchPage, fetchPublic, type Hit, searchWeb } from "../../ai/web.ts";
import { begin } from "../../platform/activity.ts";
import { type Alert, sendAlert } from "../../platform/alert.ts";
import { type Settings, shoppingOf } from "../../platform/config.ts";
import { plainWords } from "../../platform/plain.ts";
import { formatMoney } from "../../shared/kinds.ts";
import type { Need, SourceRef } from "../../shared/shopping.ts";
import { recordCall } from "../calls.ts";
import { modelFor } from "../models.ts";
import { draftsDir, loadCategories, saveDraft } from "./categories.ts";
import { type Found, gatherReviews, planSearches, readReviewPage, reviewText, tierOf } from "./compare.ts";
import { beforeYouBuy, composeList, keyOf, type Merged, mergeFound, type Source } from "./compose.ts";
import { findOffers } from "./offers.ts";
import { hostEntry, hostOf, loadHosts, loadRegion, placeOf, type Region, type Store } from "./region.ts";
import { scrubContext, scrubQuery, withWords } from "./scrub.ts";
import {
  addLog,
  claimNext,
  getWant,
  type Job,
  type Kept,
  offersOf,
  type ProductRow,
  productsOf,
  saveProduct,
  setRank,
  setWords,
  updateWant,
  type WantRow,
} from "./store.ts";
import { understand } from "./understand.ts";
import { groupsOf } from "./verdict.ts";
import { budgetOf, DROPPED, namedProduct, priceOf, rankingPrice, rerank } from "./view.ts";
import { checkWatches, isDue, watched } from "./watch.ts";

export const SEARCHES = 24; // a run's searches, every step together
const GAP_MS = 2000; // the search tool drops requests sent faster
const NO_REACH = { read: 0, links: 0, blocked: 0, unsearched: 0, mismatch: 0 };
const OUTCOMES = new Set(["unlisted", "too-long", "down", "timeout", "refusal", "out-of-room", "shape"]);
// a failure in the words every screen uses: a model's, through the one mapping (ai/client.ts); the code's as it is
const words = (why: string) => (OUTCOMES.has(why) ? failureWords(why as Outcome, "Run again") : why);

// how a run reaches the web; tests pass made-up ones
export type RunWeb = {
  search: (q: string) => Promise<Hit[]>;
  page: (url: string) => Promise<string>; // a review page as the model reads it
  store: (
    url: string,
    wanted: Wanted,
    store: Store,
    textPrice: (text: string, w: Wanted) => Promise<TextPrice | null>,
  ) => Promise<StoreRead>;
};
export type RunDeps = { web?: RunWeb; now?: () => Date; gapMs?: number; region?: Region; drafts?: string };

// the web on this computer: the door's search; review pages read by kestrel itself (tables kept), the door's reader when
// it can't; store pages through the store-page reader
export function networkWeb(settings: Settings, region: Region): RunWeb {
  const own = shoppingOf(settings).read;
  return {
    search: (q) => searchWeb(settings.models, q),
    page: async (url) => {
      if (own) {
        const got = await fetchPublic(url, { accept: "text/html", agent: SHOP_AGENT, maxBytes: 4_000_000 });
        const text = got.ok ? reviewText(got.text) : "";
        if (text.length > 600) return text;
      }
      return fetchPage(settings.models, url, 20_000);
    },
    store: (url, wanted, store, textPrice) =>
      readStorePage(url, wanted, {
        currency: region.currency,
        storeName: store.name,
        modelRules: region.modelRules,
        region: region.key,
        pacer: PACER,
        textPrice,
      }),
  };
}

let busy = false; // one run at a time in this process

// the oldest queued want started in the background, unless one runs or an application has the model; its id
export function startNext(db: DatabaseSync, settings: Settings, deps: RunDeps = {}): string | null {
  if (busy) return null;
  const now = deps.now?.() ?? new Date();
  const applying = db
    .prepare("SELECT 1 FROM applications WHERE state = 'applying' AND updated > ? LIMIT 1")
    .get(new Date(now.getTime() - 2 * 3600_000).toISOString());
  if (applying) return null;
  const w = claimNext(db, now);
  if (!w) return null;
  busy = true;
  void runWant(db, settings, w, deps)
    .catch((e) => console.error(`a Shopping run failed: ${plainWords(e instanceof Error ? e.message : String(e))}`))
    .finally(() => {
      busy = false;
      startNext(db, settings, deps);
    });
  return w.id;
}
// the run in flight, for the tests: settles when the queue is empty
export const idle = async (limitMs = 30_000): Promise<void> => {
  const until = Date.now() + limitMs;
  while (busy) {
    if (Date.now() > until) throw new Error("a Shopping run is still going: it never ended");
    await new Promise((r) => setTimeout(r, 5));
  }
};

export async function runWant(db: DatabaseSync, settings: Settings, w: WantRow, deps: RunDeps = {}): Promise<void> {
  const region = deps.region ?? loadRegion(settings);
  const web = deps.web ?? networkWeb(settings, region);
  const now = () => deps.now?.() ?? new Date();
  const job: Job = w.job ?? { do: "full" };
  const live = begin("shopping", `Shopping: ${w.words}`.slice(0, 120), `/shopping/${w.id}`);
  const notes: string[] = [];
  const step = (s: string) => {
    updateWant(db, w.id, { step: s }, now());
    live.step(s);
  };
  const model = modelFor(db, settings, "shopping");
  const checkModel = modelFor(db, settings, "shopping-check");
  const record = (purpose: string) => (a: ModelAnswer<unknown>) =>
    recordCall(db, `shopping-${purpose}:v${SHOPPING_VERSION}`, a);
  // the run's searches: 24 at most, one at a time, two seconds apart; null once spent
  let left = SEARCHES;
  let last = 0;
  const search = async (q: string): Promise<Hit[] | null> => {
    if (left <= 0) return null;
    left--;
    const wait = last + (deps.gapMs ?? GAP_MS) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      return await web.search(q);
    } finally {
      last = Date.now();
    }
  };
  const textPrice = async (text: string, wanted: Wanted) => {
    const a = await askTextPrice(settings.models, model, text, wanted, region.currency);
    record("read")(a);
    return a.ok ? a.value : null;
  };
  const fail = (why: string) => {
    updateWant(db, w.id, { state: "failed", step: "", job: null, error: why }, now());
    live.end("failed", why);
  };
  try {
    let need = w.need;
    if (job.do === "full") {
      // Understanding: once; Run again keeps the need card, so my answers keep their meaning
      if (!need) {
        step("Understanding");
        const drafts = deps.drafts ?? draftsDir();
        const list = loadCategories(drafts);
        const got = await understand(
          w,
          { models: settings.models, model, record: record("understand") },
          { list, save: (d) => saveDraft(d, list, drafts) },
          region.currency,
          groupsOf(region),
        );
        if (!got.ok) return fail(words(got.why));
        need = got.need;
        updateWant(db, w.id, { need }, now());
      }
      const before = new Map(productsOf(db, w.id).map((p) => [p.key, p]));
      const prices = new Map(
        [...before.values()].map((p) => [p.key, rankingPrice(priceOf(p, offersOf(db, p.id), placeOf(region)))]),
      );
      // one product named: its offers first, then what compares with it
      const pinned =
        need.mode === "one" ? await pinNamed(db, settings, w, need, region, web, search, textPrice, step, now) : null;
      const composed = await compareAndCompose(
        db,
        settings,
        w,
        need,
        region,
        web,
        search,
        { model, checkModel, record },
        step,
        notes,
        now,
      );
      if (!composed)
        return fail("no source that tests this kind of product turned up: Run again later, or say it in other words");
      // the run's changes: products added and dropped
      const after = productsOf(db, w.id);
      // a first run adds everything: only a run again has changes to tell
      for (const p of before.size ? after : [])
        if (!before.has(p.key)) addLog(db, w.id, { kind: "change", text: `${p.name} added` }, now());
      for (const p of before.values())
        if (!after.some((x) => x.key === p.key && x.out !== DROPPED))
          addLog(db, w.id, { kind: "change", text: `${p.name} dropped: ${DROPPED}` }, now());
      // Finding offers: every finalist up to the list's size, the labelled first and then by place, so best value, budget
      // and premium (which need a price) can be named by the rerank after; the run's searches decide how far it reaches,
      // and a store left when they run out keeps its search link (the alternatives, in one mode)
      const finalists = productsOf(db, w.id)
        .filter((p) => p.place !== null && p.id !== pinned?.id)
        .sort((a, b) => Number(b.labels.length > 0) - Number(a.labels.length > 0) || (a.place ?? 0) - (b.place ?? 0));
      const picked = finalists.slice(0, need.listSize);
      const reach = await offersFor(db, settings, w, need, picked, region, web, search, textPrice, step, now);
      if (pinned) for (const k of Object.keys(reach) as (keyof typeof reach)[]) reach[k] += pinned.reach[k];
      const pages = getWant(db, w.id)?.result?.pages ?? 0;
      const compared = finalists.length + (pinned ? 1 : 0);
      addLog(
        db,
        w.id,
        {
          kind: "run",
          text: `Compared ${compared} ${compared === 1 ? "product" : "products"} from ${pages} ${pages === 1 ? "page" : "pages"}; ${reach.read} ${reach.read === 1 ? "offer" : "offers"} read, ${reach.links + reach.unsearched} ${reach.links + reach.unsearched === 1 ? "link" : "links"}, ${reach.blocked} blocked`,
        },
        now(),
      );
      rerank(db, w.id, placeOf(region), now());
      for (const p of productsOf(db, w.id)) {
        const was = prices.get(p.key);
        const is = rankingPrice(priceOf(p, offersOf(db, p.id), placeOf(region)));
        if (was != null && is !== null && was !== is)
          addLog(
            db,
            w.id,
            {
              kind: "change",
              text: `${p.name}: ${formatMoney(was, region.currency)} → ${formatMoney(is, region.currency)}`,
            },
            now(),
          );
      }
    } else {
      if (!need) return fail("it hasn't run yet: Run again first");
      const picked = productsOf(db, w.id).filter((p) => job.do === "offers" && job.products.includes(p.id));
      const reach = await offersFor(db, settings, w, need, picked, region, web, search, textPrice, step, now);
      rerank(db, w.id, placeOf(region), now());
      addLog(
        db,
        w.id,
        {
          kind: "run",
          text: `Found offers for ${picked.length}: ${reach.read} read, ${reach.links + reach.unsearched} links`,
        },
        now(),
      );
    }
    // what the run couldn't do, and the searches it used, kept with the last good result
    const result = getWant(db, w.id)?.result;
    if (result)
      updateWant(
        db,
        w.id,
        { result: { ...result, notes: [...new Set([...result.notes, ...notes])], searches: SEARCHES - left } },
        now(),
      );
    updateWant(db, w.id, { state: "done", step: "", job: null, error: "", ran: now().toISOString() }, now());
    live.end("done");
  } catch (e) {
    fail(`the run stopped: ${plainWords(e instanceof Error ? e.message : String(e))}`);
  }
}

// one mode: the named product pinned (its name searched; its maker codes from the first store page read), its offers
// found before any review is read
async function pinNamed(
  db: DatabaseSync,
  settings: Settings,
  w: WantRow,
  need: Need,
  region: Region,
  web: RunWeb,
  search: (q: string) => Promise<Hit[] | null>,
  textPrice: (text: string, w: Wanted) => Promise<TextPrice | null>,
  step: (s: string) => void,
  now: () => Date,
) {
  const brand = need.product.split(/\s+/)[0] ?? "";
  const id = saveProduct(
    db,
    w.id,
    {
      key: keyOf(brand, need.product),
      name: need.product,
      brand,
      models: [],
      facts: {},
      words: { why: [], tradeoff: null, notFor: null, pros: [], cons: [], skip: [] },
      usual: null,
      evidence: { sources: 0, a: 0, b: 0, newest: null, thin: true, old: false, refs: [] },
    },
    now(),
  );
  if (!id) return null;
  setRank(db, id, { score: null, place: 1, labels: [], out: "", flags: [] });
  const p = productsOf(db, w.id).find((x) => x.id === id);
  const reach = p ? await offersFor(db, settings, w, need, [p], region, web, search, textPrice, step, now) : NO_REACH;
  return { id, reach };
}

// Searching, Reading reviews, Comparing, Writing, Checking: the products saved with my marks kept, the result kept
async function compareAndCompose(
  db: DatabaseSync,
  settings: Settings,
  w: WantRow,
  need: Need,
  region: Region,
  web: RunWeb,
  search: (q: string) => Promise<Hit[] | null>,
  ask: { model: string; checkModel: string; record: (purpose: string) => (a: ModelAnswer<unknown>) => void },
  step: (s: string) => void,
  notes: string[],
  now: () => Date,
): Promise<boolean> {
  const hosts = loadHosts(region);
  const named = need.mode === "one" ? [{ name: need.product }] : [];
  const ctx = withWords(scrubContext(w, need, named), [need.name, ...(need.words ?? [])]);
  const queries =
    need.mode === "one"
      ? [`"${need.product}" review`, `"${need.product}" vs`, `${need.product} review ${region.searchWords}`]
          .map((q) => scrubQuery(q, ctx))
          .filter((q): q is string => Boolean(q))
      : planSearches(need, region, hosts, ctx, now().getUTCFullYear());
  const reviews = await gatherReviews(
    queries,
    hosts,
    { search: async (q) => (await search(q)) ?? [], read: (url) => web.page(url), onStep: step },
    need.mode === "one" ? 3 : 8,
  );
  // each page through the model, then the code's checks
  const found: Found[] = [];
  const sources: Source[] = [];
  const refused: string[] = [];
  for (const [i, page] of reviews.pages.entries()) {
    step(`Reading reviews (${i + 1} of ${reviews.pages.length})`);
    const ref = `s${sources.length + 1}`;
    const got = await readReviewPage(
      page,
      need,
      { models: settings.models, model: ask.model, record: ask.record("read") },
      region.currency,
      ref,
      // a bare "$" on a page from the region's own web is the region's currency; elsewhere, US dollars
      hostOf(page.url).endsWith(`.${region.key}`) ? region.currency : "USD",
    );
    if (!got.ok) {
      notes.push(
        got.why === "out-of-room"
          ? `the reader ran out of room on ${hostOf(page.url)}`
          : `${hostOf(page.url)} couldn't be read`,
      );
      continue;
    }
    const tier = tierOf(hosts, page.url, got.method);
    if (tier === "never") continue;
    refused.push(...got.refused);
    sources.push({
      ref,
      host: hostOf(page.url),
      url: page.url,
      title: page.title,
      tier,
      date: got.method.date,
      read: "page",
      family: hostEntry(hosts, page.url)?.family ?? hostOf(page.url),
    });
    found.push(...got.products);
  }
  const snippets: SourceRef[] = reviews.snippets.map((s, i) => ({ ...s, ref: `s${sources.length + i + 1}` }));
  step("Comparing");
  const merged = mergeFound(found, sources, need, region, now());
  if (!merged.length && need.mode !== "one") return false;
  // one mode keeps the named product and three alternatives at most
  const kept = need.mode === "one" ? keepOne(merged, need.product) : merged;
  const budget = budgetOf(w);
  const composed = await composeList(
    {
      seed: w.id,
      need,
      answers: w.answers,
      budget,
      merged: kept,
      price: (m) => m.usual,
      other: (m) =>
        m.evidence.list && m.evidence.list.currency !== region.currency
          ? { price: m.evidence.list.price, currency: m.evidence.list.currency }
          : null,
    },
    { models: settings.models, model: ask.model, checkModel: ask.checkModel, record: (p, a) => ask.record(p)(a), step },
  );
  notes.push(...composed.notes);
  // what the checks kept out, said once each: a value off its criterion, the reasons lost on the way
  if (refused.length)
    notes.push(
      `${refused.length} ${refused.length === 1 ? "value" : "values"} left out for not measuring ${refused.length === 1 ? "its criterion" : "their criteria"} (${refused[0]})`,
    );
  if (composed.lost) addLog(db, w.id, { kind: "run", text: composed.lost }, now());
  // saved together: a failure before here keeps the last good run's products and result
  const ids = new Map<string, string>();
  for (const m of kept) {
    const id = saveProduct(db, w.id, m, now());
    if (id) ids.set(m.key, id);
  }
  for (const r of composed.ranked) {
    const id = ids.get(r.id);
    if (id) setRank(db, id, r);
  }
  for (const [key, words] of composed.words) {
    const id = ids.get(key);
    if (id) setWords(db, id, words);
  }
  // a product found before and not now stays, with my marks and its history, out of the ranking; a want that names one
  // product keeps it first
  const lead = need.mode === "one" ? namedProduct(productsOf(db, w.id), need.product) : undefined;
  for (const p of productsOf(db, w.id)) {
    if (p.id === lead?.id) setRank(db, p.id, { score: p.score, place: 0, labels: p.labels, out: "", flags: p.flags });
    else if (![...ids.values()].includes(p.id))
      setRank(db, p.id, { score: null, place: null, labels: [], out: DROPPED, flags: [] });
  }
  const result: Kept = {
    assumptions: composed.assumptions,
    changeIf: composed.changeIf,
    conflicts: composed.conflicts,
    before: beforeYouBuy(need, region),
    checked: composed.checked,
    notes,
    searches: 0,
    pages: sources.length,
    sources: [...sources.map(({ family: _f, ...s }) => s), ...snippets],
  };
  updateWant(db, w.id, { result }, now());
  return true;
}

// the named product and the three it is most compared with
function keepOne(merged: Merged[], product: string): Merged[] {
  const name = product.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mine = merged.find((m) =>
    m.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .includes(name),
  );
  const rest = merged.filter((m) => m !== mine).slice(0, 3);
  return mine ? [mine, ...rest] : rest;
}

async function offersFor(
  db: DatabaseSync,
  settings: Settings,
  w: WantRow,
  need: Need,
  products: ProductRow[],
  region: Region,
  web: RunWeb,
  search: (q: string) => Promise<Hit[] | null>,
  textPrice: (text: string, w: Wanted) => Promise<TextPrice | null>,
  step: (s: string) => void,
  now: () => Date,
) {
  if (!products.length) return { ...NO_REACH };
  step(`Finding offers (${products.length} ${products.length === 1 ? "product" : "products"})`);
  return findOffers(db, products, need, {
    region,
    read: shoppingOf(settings).read,
    search,
    readPage: (url, wanted, store) => web.store(url, wanted, store, textPrice),
    scrub: scrubContext(w, need, productsOf(db, w.id)),
    now,
    step,
  });
}

// ── The scheduler's hook ─────────────────────────────────────────────────────────────────────────────────────────

let checking = false; // one round of price checks at a time

// the tick's Shopping hook: it returns at once. It starts a want a restart left queued (unless an application has the
// model) and the due price checks, in the background, and says what it started
export function shoppingTick(
  db: DatabaseSync,
  settings: Settings,
  now: Date,
  applying: boolean,
  deps: RunDeps & { ping?: (a: Alert) => Promise<{ sent: boolean; why: string }> } = {},
): string | null {
  const did: string[] = [];
  if (!applying && startNext(db, settings, deps)) did.push("run");
  const due = watched(db).some((p) => p.watch && (isDue(p.watch, now) || Date.parse(p.watch.until) <= now.getTime()));
  if (due && !checking) {
    checking = true;
    const region = deps.region ?? loadRegion(settings);
    const web = deps.web ?? networkWeb(settings, region);
    void checkWatches(db, {
      region,
      read: shoppingOf(settings).read,
      readPage: (url, wanted, store) => web.store(url, wanted, store, async () => null),
      ping: deps.ping ?? ((a) => sendAlert(settings, a)),
      page: settings.alerts?.page ?? "",
      now: () => deps.now?.() ?? new Date(),
    })
      .catch((e) =>
        console.error(`Shopping's price checks failed: ${plainWords(e instanceof Error ? e.message : String(e))}`),
      )
      .finally(() => {
        checking = false;
      });
    did.push("watch");
  }
  return did.length ? did.join("+") : null;
}
// the checks in flight, for the tests
export const checked = async (): Promise<void> => {
  while (checking) await new Promise((r) => setTimeout(r, 5));
};

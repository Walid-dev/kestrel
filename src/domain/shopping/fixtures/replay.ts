// The first live run, replayed: its three wants through the whole pipeline on a stand-in door and a stand-in web. The
// web answers with tonight's hits (Bing's ads among them) and tonight's public pages (fixtures/live-run.ts); the store
// pages are tonight's too. The door answers each call in the shapes the real models wrote: the readers' values with a
// weight under comfort and weather resistance under hood, names without their brand, an implied need twice; the
// writer's reasons as plain strings with their refs inside, refs as numbers, the products as an object by id, and one
// answer cut off. replay.test.ts checks the want pages that come out; the screen check runs it into a made-up folder.
// The prices in search results below are made up (the run kept no snippet); everything else is as recorded.
import { Pacer, readStorePage } from "../../../ai/shopping/product-data.ts";
import type { StandInBody, StandInPlan } from "../../../ai/stand-in.ts";
import type { Hit } from "../../../ai/web.ts";
import { reviewText } from "../compare.ts";
import type { Region } from "../region.ts";
import type { RunWeb } from "../run.ts";
import {
  COSTCO_KEYBOARD,
  COSTCO_UNSAID,
  GEARLAB,
  GUIDESPOT,
  MAVERICKS,
  RTINGS_PAGE,
  VACUUM_HITS,
  VACUUMWARS,
  VISIONS_XM4C,
} from "./live-run.ts";

export const WANTS = {
  vacuum: { words: "a robot vacuum for pet hair", budget: 600 },
  headphones: { words: "noise-cancelling headphones for flights" },
  jacket: { words: "a winter jacket for -30", budget: 400 },
};

const URL = {
  vacuumwars: "https://vacuumwars.com/best-robot-vacuum-for-pet-hair/",
  rtings: "https://www.rtings.com/headphones/reviews/best/by-usage/commute-travel",
  mavericks: "https://soundmavericks.com/best-noise-cancelling-headphones-for-travel/",
  gearlab: "https://www.outdoorgearlab.com/topics/clothing-mens/best-winter-jacket-men",
  guidespot: "https://www.guidespot.com/best-winter-jacket/",
  jacketAd: "https://www.bing.com/aclick?ld=e8DFM9RStTodgzPWFFBOYIITVUCUx6kXXgtwDNizNPniTl8mjnRzvJitETlVksDaz",
  costcoXm6: "https://www.costco.ca/p/-/sony-wh-1000xm6-wireless-noise-cancelling-headphones/4000377234",
  costcoKeyboard: "https://www.costco.ca/p/-/incase-desktop-850-wireless-optical-keyboard-mouse-bundle/4201028003",
  visionsXm4c: "https://www.visions.ca/sony-1000x-series-headphones-silver-wh1000xm4c-s",
};
const PAGES: Record<string, string> = {
  [URL.vacuumwars]: VACUUMWARS,
  [URL.rtings]: reviewText(RTINGS_PAGE),
  [URL.mavericks]: MAVERICKS,
  [URL.gearlab]: GEARLAB,
  [URL.guidespot]: GUIDESPOT,
  // an ad's landing page, were it ever read: it must never be
  [VACUUM_HITS[1].url]: "Robot vacuums for pet hair: the top 5 robot vacuums of 2026. Shop now and save. ".repeat(6),
  [URL.jacketAd]: "Black Friday sale for winter jackets: up to 70% off every winter jacket. Shop now. ".repeat(6),
};
const STORE_PAGES: Record<string, string> = {
  [URL.costcoXm6]: COSTCO_UNSAID,
  [URL.costcoKeyboard]: COSTCO_KEYBOARD,
  [URL.visionsXm4c]: VISIONS_XM4C,
};

const hit = (title: string, url: string, snippet = ""): Hit => ({ title, url, snippet });
// the review searches by the kind they name, the store searches by the product they quote
function searchAnswer(q: string): Hit[] {
  if (!q.includes('"')) {
    if (/vacuum/i.test(q)) return VACUUM_HITS;
    if (/headphone/i.test(q))
      return [
        hit("The 5 Best Travel Headphones - RTINGS.com", URL.rtings),
        hit("Best Noise Cancelling Headphones for Travel (2026)", URL.mavericks),
      ];
    if (/jacket|parka|coat/i.test(q))
      return [
        hit("The Best Winter Jackets for Men | Tested & Ranked", URL.gearlab),
        hit("Black Friday Sale for Winter Jackets - Mountain Warehouse", URL.jacketAd, "Ad"),
        hit("Best Winter Jacket 2026: 12 Tested Coats for Extreme Cold", URL.guidespot),
      ];
    return [];
  }
  if (q.includes("WH-1000XM6"))
    return [
      hit("Sony WH-1000XM6 Wireless Noise Cancelling Headphones | Costco", URL.costcoXm6),
      // made-up price: a search result's words for a store kestrel only links to
      hit(
        "Sony WH-1000XM6 Over-Ear Noise Cancelling Headphones | Best Buy Canada",
        "https://www.bestbuy.ca/en-ca/product/sony-wh-1000xm6-over-ear-noise-cancelling-headphones/18931234",
        "Sony WH-1000XM6 Over-Ear Wireless Noise Cancelling Headphones - Black. $499.99. Free shipping on orders over $35.",
      ),
    ];
  if (q.includes("WH-1000XM4C"))
    return [hit("Sony 1000X Series Headphones Silver WH1000XM4C/S | Visions Electronics", URL.visionsXm4c)];
  // what a search for a short number finds: a keyboard, never a parka's page
  if (q.includes("850")) return [hit("Incase Desktop 850 Wireless Keyboard & Mouse | Costco", URL.costcoKeyboard)];
  return [];
}

// the web: the searches above, the review pages as text, the store pages through the real store-page reader
export function replayWeb(region: Region, searched: string[] = []): RunWeb {
  const pacer = new Pacer({ sleep: async () => {} });
  const net = {
    reach: { resolve: async () => ["93.184.215.14"], head: async () => ({ status: 200, location: null }) },
    fetch: (async (input: string | URL | Request) => {
      const body = STORE_PAGES[String(input)];
      return body ? new Response(body, { status: 200 }) : new Response("", { status: 404 });
    }) as typeof fetch,
  };
  return {
    search: async (q) => {
      searched.push(q);
      return searchAnswer(q);
    },
    page: async (url) => PAGES[url] ?? "",
    store: (url, wanted, store, textPrice) =>
      readStorePage(url, wanted, {
        currency: region.currency,
        storeName: store.name,
        modelRules: region.modelRules,
        region: region.key,
        net,
        pacer,
        textPrice,
      }),
  };
}

type Fact = { v: number | boolean; unit?: string; quote: string };
const said = (quote: string) => ({ text: quote, quote });
const product = (
  name: string,
  brand: string,
  facts: Record<string, Fact>,
  more: { models?: string[]; label?: string; pros?: string[]; cons?: string[]; price?: number } = {},
) => ({
  name,
  brand,
  models: more.models ?? [],
  label: more.label ?? "",
  facts,
  pros: (more.pros ?? []).map(said),
  cons: (more.cons ?? []).map(said),
  skip: [],
  price: more.price ? { amount: more.price, currency: "" } : null,
});
const READS: Record<string, unknown> = {
  [URL.vacuumwars]: {
    method: { buysOwn: true, numbers: true, date: "2026-11" },
    products: [
      product(
        "Dreame L60 Ultra PE",
        "Dreame",
        {
          "pickup-carpet": { v: 94, unit: "%", quote: "it scored 94% in carpet deep cleaning" },
          "pickup-hard": { v: 100, unit: "%", quote: "100% flattened pet-hair pickup" },
          tangle: { v: 0, unit: "%", quote: "0% brush wrap" },
          navigation: { v: 21, quote: "It avoided 21 of 24 obstacles" },
        },
        { price: 999.99, pros: ["100% flattened pet-hair pickup with 0% brush wrap"] },
      ),
      product(
        "Narwal Freo 20",
        "Narwal",
        {
          "pickup-carpet": { v: 93, unit: "%", quote: "recovered 93% of embedded sand from carpet" },
          navigation: { v: 23, quote: "earned 23 of 24 possible points in our obstacle-avoidance tests" },
        },
        { pros: ["had no brush-roll tangles with seven-inch hair"] },
      ),
      // the name a page gives without its maker
      product("L60 Pro Ultra", "", {
        "pickup-carpet": { v: 90, unit: "%", quote: "90% sand removal in the carpet deep-clean test" },
        tangle: { v: 0, unit: "%", quote: "0% hair tangles in the anti-tangle test" },
      }),
    ],
  },
  [URL.rtings]: {
    method: { buysOwn: true, numbers: true, date: "2026-10" },
    products: [
      product(
        "Sony WH-1000XM6",
        "Sony",
        { battery: { v: 32, unit: "hours", quote: "the battery lasts for close to 32 hours" } },
        { label: "Best Travel Headphones", pros: ["Their overall noise isolation filters out sound"] },
      ),
      product("JBL Live 780NC", "JBL", {}, { label: "Best Mid-Range Travel Headphones" }),
    ],
  },
  [URL.mavericks]: {
    method: { buysOwn: false, numbers: true, date: "2026-10" },
    products: [
      product(
        "Sony WH-1000XM6",
        "Sony",
        {
          anc: { v: 87, unit: "%", quote: "SoundGuys’ lab testing measured roughly 87% noise reduction" },
          comfort: { v: 254, unit: "g", quote: "At 254g it’s comfortable for long sessions" },
          weight: { v: 254, unit: "g", quote: "At 254g it’s comfortable for long sessions" },
          battery: { v: 30, unit: "h", quote: "The 30-hour battery (40 with ANC off)" },
          multipoint: { v: true, quote: "Multipoint pairing switches between phone and laptop" },
        },
        { pros: ["the best figure we’ve seen on a current wireless headphone"] },
      ),
      product(
        "Sony WH-1000XM4C",
        "Sony",
        {
          comfort: { v: 253, unit: "g", quote: "At 253g it’s light enough for long wear" },
          weight: { v: 253, unit: "g", quote: "At 253g it’s light enough for long wear" },
          battery: { v: 27, unit: "h", quote: "27 hours of ANC playback still covers a full travel day" },
          multipoint: { v: true, quote: "multipoint pairing and a user-replaceable battery" },
        },
        { models: ["WH-1000XM4C"], pros: ["a user-replaceable battery"] },
      ),
    ],
  },
  [URL.gearlab]: {
    method: { buysOwn: true, numbers: true, date: "2026-11" },
    products: [
      product(
        "Nuuk Parka",
        "Fjallraven",
        {
          warmth: { v: 8.5, quote: "Warmth 8.5" },
          weight: { v: 4.6, unit: "pounds", quote: "At 4.6 pounds (size 2XL), the Nuuk delivers" },
          durability: { v: 9.5, quote: "Construction Quality 9.5" },
          waterproof: { v: true, quote: "dense, heavy, waterproof, and warm" },
        },
        { pros: ["dense, heavy, waterproof, and warm"] },
      ),
      product(
        "Expedition Parka Heritage",
        "Canada Goose",
        {
          warmth: { v: 9.5, quote: "Warmth 9.5" },
          hood: { v: 10, quote: "Weather Resistance 10.0" },
          waterproof: { v: true, quote: "Weatherproof" },
          durability: { v: 9.5, quote: "Construction Quality 9.5" },
        },
        { models: ["Heritage"], price: 1895, pros: ["Massive hood"] },
      ),
      product(
        "Stormhenge 850 Down Hybrid Parka",
        "REI Co-op",
        {
          warmth: { v: 6.5, quote: "Warmth 6.5" },
          durability: { v: 7, quote: "Construction Quality 7.0" },
          waterproof: { v: true, quote: "Water resistant" },
        },
        { models: ["850"], price: 299, pros: ["Affordable"], cons: ["Struggles in colder temps"] },
      ),
    ],
  },
  [URL.guidespot]: {
    method: { buysOwn: true, numbers: false, date: "2025-11" },
    products: [
      product(
        "Carhartt Men's 103826 Bartlett Jacket",
        "Carhartt",
        { weight: { v: 4.65, quote: "4.65 lbs" } },
        { models: ["103826"], pros: ["Durable duck canvas"] },
      ),
    ],
  },
};
const UNDERSTOOD: Record<string, unknown> = {
  [WANTS.vacuum.words]: {
    mode: "compare",
    category: "robot-vacuum",
    use: "pets",
    implied: ["tangle-resistant brushroll"],
    questions: [
      {
        key: "floors",
        q: "Mostly carpet or hard floors?",
        options: [
          { label: "Mostly carpet", weights: { "pickup-carpet": 35 } },
          { label: "A mix", weights: {} },
        ],
        default: 1,
      },
    ],
    searchWords: "robot vacuum pet hair",
  },
  [WANTS.headphones.words]: {
    mode: "compare",
    category: "headphones",
    use: "travel",
    implied: ["strong noise cancelling for flights"],
    questions: [],
    searchWords: "noise cancelling headphones flights",
  },
  [WANTS.jacket.words]: {
    mode: "compare",
    category: "winter-jacket",
    use: "extreme-cold",
    implied: ["warm to extreme cold"],
    questions: [],
    searchWords: "winter jacket extreme cold",
  },
};

// the door: each call answered as the real models answered it, in their shapes
export function replayDoor(): (body: StandInBody) => StandInPlan {
  let writes = 0;
  return (body) => {
    const prompt = body.messages?.at(-1)?.content ?? "";
    if (prompt.startsWith("I need to buy something")) {
      const words = /^MY WANT: (.+)$/m.exec(prompt)?.[1] ?? "";
      return { content: JSON.stringify(UNDERSTOOD[words] ?? {}) };
    }
    const page = /<<<THE PAGE: .* \((https:\/\/[^)]+)\) \(data/.exec(prompt)?.[1] ?? "";
    if (prompt.startsWith("Below is a web page"))
      return { content: JSON.stringify(READS[page] ?? { method: {}, products: [] }) };
    if (prompt.startsWith("Write short reasons")) {
      writes++;
      const ids = [...prompt.matchAll(/^(p\d+) · /gm)].map((m) => m[1]);
      const firstQuote = (id: string) => /\[(q\d+)\]/.exec(prompt.slice(prompt.indexOf(`${id} · `)))?.[1] ?? "q1";
      // every third answer cut off mid-word, as two of the first run's three were
      if (writes % 3 === 0) return { content: `{"products": [{"id": "${ids[0]}", "why": [{"text": "It recov` };
      return {
        content: JSON.stringify({
          products: Object.fromEntries(
            ids.map((id, i) => [
              id,
              i % 2 === 0
                ? {
                    why: [`Its sources measured it near the top on what matters here [${firstQuote(id)}].`],
                    notFor: "Not for anyone who wants the lightest option.",
                  }
                : { reasons: [{ sentence: "A source rates it well.", refs: [Number(firstQuote(id).slice(1))] }] },
            ]),
          ),
          changeIf: [],
        }),
      };
    }
    if (prompt.startsWith("Each sentence below"))
      return {
        content: JSON.stringify({
          verdicts: [...prompt.matchAll(/^(\d+)\. /gm)].map((m) => ({ n: Number(m[1]), supported: true })),
        }),
      };
    if (prompt.startsWith("Below is text from a store's page")) return { content: '{"price": null, "regular": null}' };
    return { content: "{}" };
  };
}

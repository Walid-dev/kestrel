// The first live run (2026-11-26), kept as fixtures: short excerpts of the public review and store pages it read (as
// pageText gave them to the model), the search hits it got, and the answers in the shapes the real models wrote. Each
// of the run's failures is a test built from these (live-run.test.ts, and the replay in run.test.ts). Public product
// pages only: no person, no account, nothing of mine.
import type { Hit } from "../../../ai/web.ts";

// soundmavericks.com, "Best Noise Cancelling Headphones for Travel": the weight written beside "comfortable"
export const MAVERICKS = [
  "## Best Noise Cancelling Headphones for Travel (2026)",
  "We fly with every pair and measure what we can.",
  "## 1. Sony WH-1000XM6 Editor’s Choice Check Price on Amazon",
  "9.5 /10",
  "SoundMavericks Score",
  "The WH-1000XM6 is our default recommendation. SoundGuys’ lab testing measured roughly 87% noise reduction, the best figure we’ve seen on a current wireless headphone. The 30-hour battery (40 with ANC off) covers even a delayed trans-Pacific itinerary. Multipoint pairing switches between phone and laptop. At 254g it’s comfortable for long sessions, though fit against a headrest is personal.",
  "## 3. Sony WH-1000XM4C Best Value Check Price on Amazon",
  "9.0 /10",
  "SoundMavericks Score",
  "You give up very little on a plane: 27 hours of ANC playback still covers a full travel day. For travelers, the XM4C hits the practical notes: multipoint pairing and a user-replaceable battery. At 253g it’s light enough for long wear.",
].join("\n");

// outdoorgearlab.com, "The Best Winter Jackets for Men": the scores as lines, a list price in US dollars
export const GEARLAB = [
  "## The Best Winter Jackets for Men",
  "We buy every jacket and wear them side by side through the winter.",
  "## Fjallraven Nuuk Parka",
  "Warmth 8.5",
  "Weather Resistance 8.0",
  "Construction Quality 9.5",
  "Fill Weight | 250 grams/ sq meter",
  "The Swedish-born Fjallraven Nuuk Parka is dense, heavy, waterproof, and warm. At 4.6 pounds (size 2XL), the Nuuk delivers.",
  "## Canada Goose Expedition Parka Heritage",
  "List Price: $1,895",
  "Warmth 9.5",
  "Weather Resistance 10.0",
  "Construction Quality 9.5",
  "PROS",
  "Massive hood",
  "Weatherproof",
  "## REI Co-op Stormhenge 850 Down Hybrid Parka",
  "List Price: $299",
  "Warmth 6.5",
  "Weather Resistance 7.0",
  "Construction Quality 7.0",
  "PROS",
  "Affordable",
  "Water resistant",
  "CONS",
  "Struggles in colder temps",
].join("\n");

// guidespot.com, "Best Winter Jacket 2026": a weight in pounds with no word beside it
export const GUIDESPOT = [
  "## Best Winter Jacket 2026: 12 Tested Coats for Extreme Cold",
  "## Carhartt Men's 103826 Bartlett Jacket",
  "- Sherpa lined",
  "- Durable duck canvas",
  "- 4.65 lbs",
  "## Winter Jacket Comparison Table",
  "PRODUCT | KEY FEATURES | ACTION",
  "Carhartt Men's 103826 Bartlett Jacket | Sherpa lined 100% cotton duck 4.65 lbs Work grade | Check Latest Price",
].join("\n");

// vacuumwars.com, "The Best Robot Vacuum For Pet Hair": hair wrap as a share (0% is none), list prices in US dollars
export const VACUUMWARS = [
  "## The Best Robot Vacuum For Pet Hair",
  "We use one gram of seven-inch hair on a test surface, then measure how much remains wrapped around the brushes.",
  "Dreame L60 Ultra PE ★ 3.92 · $999.99 $849.99",
  "## Dreame L60 Ultra PE",
  "In testing, it scored 94% in carpet deep cleaning, plus 100% flattened pet-hair pickup with 0% brush wrap. It avoided 21 of 24 obstacles.",
  "## Narwal Freo 20",
  "In Vacuum Wars testing, it recovered 93% of embedded sand from carpet, earned 23 of 24 possible points in our obstacle-avoidance tests, and had no brush-roll tangles with seven-inch hair.",
  "## Dreame L60 Pro Ultra",
  "It achieved 90% sand removal in the carpet deep-clean test and recorded 0% hair tangles in the anti-tangle test.",
].join("\n");

// consumerreports.org's pet-hair page, read through an ad: the L40 Ultra named without its maker
export const CR_PETS = [
  "## Best Robot Vacuums for Pet Hair",
  "Our testers measure how well each robot vacuum picks up pet hair.",
  "## Dreame L40 Ultra",
  "The L40 Ultra is superb at picking up pet hair from carpets and very good at mopping up dried stains.",
].join("\n");

// the hits DuckDuckGo gave: Bing's ads among them (bing.com/aclick), one of them dressed as Consumer Reports
export const VACUUM_HITS: Hit[] = [
  {
    title: "The Best Robot Vacuum For Pet Hair | Vacuum Wars",
    url: "https://vacuumwars.com/best-robot-vacuum-for-pet-hair/",
    snippet: "",
  },
  {
    title: "Robot Vacuums For Pet Hair - Top 5 Robot Vacuums 2026",
    url: "https://www.bing.com/aclick?ld=e8PKrkzBngJtbdZzo7X3T24TVUCUwt3k33&u=aHR0cHMlM2ElMmYlMmZ3d3cuY29uc3VtZXJwaWNrcy5vcmc",
    snippet: "Compare the top 5 robot vacuums for pet hair.",
  },
  {
    title: "Best Robot Vacuum for Pet Hair - Consumer Reports 2026",
    url: "https://www.bing.com/aclick?ld=e8gQsDMmUgiyZNzkrzNX50NTVUCUxXFxVs",
    snippet: "Ad · consumerreports.org",
  },
  {
    title: "10 Best Robot Vacuums for Pet Hair in Canada",
    url: "https://www.bing.com/aclick?ld=e8bcNK6z6zTW5h4s3bbdm5PDVUCUwGakJC",
    snippet: "",
  },
];

// visions.ca's page for the WH-CH730N: its data and its words both say out of stock
export const VISIONS_OUT = `<!doctype html><html><head><title>Sony WH-CH730N Headphones White | Visions Electronics</title>
<meta property="product:price:currency" content="CAD"/><meta property="product:availability" content="out of stock"/>
<script type="application/ld+json">{"@context":"https://schema.org/","@type":"Product","name":"Sony WH-CH730N Headphones White",
"brand":{"@type":"Brand","name":"Sony"},"sku":"WHCH730N/W","offers":{"@type":"Offer","priceCurrency":"CAD",
"url":"https://www.visions.ca/sony-wh-ch730n-headphones-white-whch730n-w","availability":"https://schema.org/OutOfStock",
"price":"138.00","priceValidUntil":"2026-11-26"}}</script></head><body><h1>Sony WH-CH730N Headphones White</h1>
<div class="product-info-stock-sku"><div class="stock unavailable" title="Online Availability"><span>Online Availability:</span> <span>Out of stock</span></div></div>
<p>Up to 50 hours of battery life with Noise Cancelling on.</p></body></html>`;

// costco.ca's page for the WH-1000XM6: its data says OutOfStock before the page asks its stock service; its words say
// nothing of stock (the first run read it as out of stock)
export const COSTCO_UNSAID = `<!doctype html><html><head><title>Sony WH-1000XM6 Wireless Noise Cancelling Headphones | Costco</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Sony WH-1000XM6 Wireless Noise Cancelling Headphones",
"sku":"6143010","url":"https://www.costco.ca/p/-/sony-wh-1000xm6-wireless-noise-cancelling-headphones/4000377234",
"brand":{"@type":"Brand","name":"Sony"},"offers":{"@type":"Offer","url":"https://www.costco.ca/p/-/sony-wh-1000xm6-wireless-noise-cancelling-headphones/4000377234",
"availability":"https://schema.org/OutOfStock","priceCurrency":"CAD","price":478}}</script></head><body>
<h1>Sony WH-1000XM6 Wireless Noise Cancelling Headphones</h1><p>Up to 30-hour battery life with quick charging.</p>
<p>Item availability varies by area.</p></body></html>`;

// costco.ca's page the store search found for "850": a keyboard, for a parka
export const COSTCO_KEYBOARD = `<!doctype html><html><head><title>Incase Desktop 850 Wireless Optical Keyboard &amp; Mouse Bundle | Costco</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Incase Desktop 850 Wireless Optical Keyboard & Mouse Bundle",
"sku":"4201028003","brand":{"@type":"Brand","name":"Incase"},"offers":{"@type":"Offer","availability":"https://schema.org/InStock",
"priceCurrency":"CAD","price":54.99}}</script></head><body><h1>Incase Desktop 850 Wireless Optical Keyboard &amp; Mouse Bundle</h1></body></html>`;

// rtings.com's "Best Travel Headphones": its picks live in a JSON attribute; its visible words are the menu alone (the
// first run read it as a page with no product). The JSON is cut to two picks and one blurred update, its "<" written
// as \u003c as the page writes it
const RTINGS_DATA = {
  page_data: {
    page: {
      recommendation: {
        product_recommendations: [
          {
            title: "Best Travel Headphones",
            description:
              "<p>The Sony WH-1000XM6 are the best travel headphones we've tested. Their overall noise isolation filters out sound, including rumbling bus engines, plane cabin din, chatty passengers, and screeching trains. With ANC enabled, the battery lasts for close to 32 hours.</p>",
            linked_description_cached:
              "<p>The Sony WH-1000XM6 are the best travel headphones we've tested. Their overall noise isolation filters out sound, including rumbling bus engines, plane cabin din, chatty passengers, and screeching trains. With ANC enabled, the battery lasts for close to 32 hours.</p>",
            product: { id: "63313", fullname: "Sony WH-1000XM6" },
          },
          {
            title: "Best Mid-Range Travel Headphones",
            description:
              "<p>For something premium at a cheaper price, try the JBL Live 780NC. Despite their significantly lower price than our top pick, the JBL have a lot to like for travelers. Their noise isolation only falls short compared to the Sony in the mid-range.</p>",
            product: { id: "70001", fullname: "JBL Live 780NC" },
          },
        ],
        recommendation_updates: [
          {
            blurred_message:
              '<p>We\'ve replaced the <span class="product-mentions">XXXX XX-XXXXXXX XXXXXXXX</span> with the <span class="product-mentions">XXX XXXX XXXXX</span>, which is more available and in stock.</p>',
          },
        ],
      },
    },
  },
};
export const RTINGS_PAGE = `<!DOCTYPE HTML><html lang="en-US"><head><title>The 5 Best Travel Headphones - RTINGS.com</title></head>
<body><nav><a href="/headphones">Headphones</a> <a href="/tv">TVs</a></nav>
<div class="app-header">Best Headphones Noise Cancelling Wireless Earbuds Gaming</div>
<p>936 Headphones bought and tested</p>
<div data-react-class="RecommendationPage" data-props="${JSON.stringify(RTINGS_DATA)
  .replaceAll("<", "\\u003c")
  .replaceAll(">", "\\u003e")
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")}"></div>
<footer>About us</footer></body></html>`;

// visions.ca's page for the WH-1000XM4C: out of stock in its data and in its words
export const VISIONS_XM4C = `<!doctype html><html><head><title>Sony 1000X Series Headphones Silver | Visions Electronics</title>
<script type="application/ld+json">{"@context":"https://schema.org/","@type":"Product","name":"Sony 1000X Series Headphones Silver",
"brand":{"@type":"Brand","name":"Sony"},"sku":"WH1000XM4C/S","offers":{"@type":"Offer","priceCurrency":"CAD",
"url":"https://www.visions.ca/sony-1000x-series-headphones-silver-wh1000xm4c-s","availability":"https://schema.org/OutOfStock","price":"278.00"}}</script>
</head><body><h1>Sony 1000X Series Headphones Silver</h1><p>Model WH-1000XM4C</p>
<div class="stock unavailable"><span>Online Availability:</span> <span>Out of stock</span></div></body></html>`;

// Ask, on any page: a chat with the computer's model about what the page shows — a lesson, a quiz question with my
// answer, a hunt's listings, a document, a task, a story. Each app says what its page shows (its helper, below), and
// may let the model act there: find (a reading action whose result goes back to the model, which answers from it) and
// changes it proposes as cards, which only my tap runs. Every page also has the read tools and the web (tools.ts): on
// a page of my own each search waits for my tap. The conversation is kept per page, so leaving loses nothing and coming
// back continues it, and each answer rereads as much of it as fits what the model reads at once: my questions, its
// answers and what its looks found. The answer streams into its row as the model writes, and the page reads it as it
// grows. One answer at a time per page: while one is written, the next question waits on the page (no queue). Ask's
// own model pick (the fast one unless I change it), on this computer.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ASK_MAX_TOKENS, ASK_VERSION, type AskPage, askSystem } from "../../ai/ask/prompt.ts";
import { chatModel, failureWords, type Turn } from "../../ai/client.ts";
import { begin } from "../../platform/activity.ts";
import type { Settings } from "../../platform/config.ts";
import { plainWords } from "../../platform/plain.ts";
import { recordCall } from "../calls.ts";
import { lessonPage, lessonTools, quizTools } from "../learn/ask.ts";
import { quizPage } from "../learn/quiz.ts";
import { modelFor } from "../models.ts";
import { newsHelper } from "../news/ask.ts";
import { notesHelper } from "../notes/ask.ts";
import { Refused } from "../notes/documents.ts";
import { searchesHelper } from "../search/ask.ts";
import { shoppingHelper } from "../shopping/ask.ts";
import { tasksHelper } from "../tasks/ask.ts";
import { applicationsHelper, researchHelper, writingHelper } from "./pages.ts";
import {
  DOING,
  isTool,
  pageLook,
  queryOf,
  readLook,
  type Source,
  searchLook,
  type ToolName,
  toolsText,
  webMode,
} from "./tools.ts";

// an app's helper: what its page shows the model, found by the page's ref (a lesson's id; a quiz's id and question; a
// hunt), and what the model may do there
type Helper = {
  page: (db: DatabaseSync, ref: string) => AskPage | null;
  // a reading action: its words go back to the model, which then answers from them
  find?: (db: DatabaseSync, ref: string, query: unknown) => string;
  // the changes the model may propose: describe says what one would do (null: not one this page can make; a Proposal
  // for a change to many, which it resolves now), run makes it on my tap and says what happened (with what Undo needs,
  // when it can be undone), and undo takes it back
  act?: {
    describe: (db: DatabaseSync, ref: string, action: unknown) => string | Proposal | null;
    run: (
      db: DatabaseSync,
      settings: Settings,
      ref: string,
      action: unknown,
      card: Card,
    ) => string | { result: string; undo?: unknown };
    undo?: (db: DatabaseSync, ref: string, card: Card) => string;
  };
  // the answer's words before they are kept (a link to something that isn't there becomes plain words)
  tidy?: (db: DatabaseSync, ref: string, words: string) => string;
  // the shared tools this page lists (tools.ts), for the app or per page. A page that lists the web searches as the
  // model writes; one that doesn't (read alone, when unsaid) is a page of my own, which has the web too, each search
  // on my tap
  tools?: ToolName[] | ((db: DatabaseSync, ref: string) => ToolName[]);
  // code's guard on the web tools for a page that holds something private (a want's budget and note): a search's words
  // cleaned, or the look refused in words, before it runs
  scrub?: (
    db: DatabaseSync,
    ref: string,
    tool: "web" | "page",
    args: unknown,
  ) => { args: unknown } | { refused: string };
};
const WEB: ToolName[] = ["read", "web", "page"];
const HELPERS: Record<string, Helper> = {
  learn: { page: lessonPage, tools: lessonTools },
  quiz: { page: quizPage, tools: quizTools },
  searches: { ...searchesHelper, tools: WEB },
  notes: notesHelper,
  tasks: tasksHelper,
  research: { ...researchHelper, tools: WEB },
  writing: writingHelper,
  applications: applicationsHelper,
  news: { ...newsHelper, tools: WEB },
  shopping: { ...shoppingHelper, tools: WEB },
};
export const ASK_APPS = Object.keys(HELPERS) as [string, ...string[]];

// a change the model proposed: what it would do, the action itself, and what my tap made of it. A change to many also
// keeps what it leaves out (detail) and the listings it covers, as they were when it was proposed (items: the tap
// changes exactly those); undo holds what Undo needs, until Undo is used. A web search is a card too (search: its
// exact words): open while it waits for my tap on a page of my own, done or failed once it ran (failed: it found
// nothing or didn't work), skipped when I said no or asked something else; never Do it or Undo
export type Card = {
  label: string;
  action: unknown;
  state: "open" | "done" | "failed" | "undone" | "skipped";
  result: string;
  detail?: string;
  items?: { id: string; title: string; was: string }[];
  undo?: unknown;
  search?: string;
};
// what a page says of a change it could make: its words; for a change to many, also what it leaves out and what it
// covers; failed: one it can't make, said on its card
export type Proposal = { label: string; detail?: string; items?: Card["items"]; failed?: string };
// a card as the page reads it: the titles it covers, and whether Undo is there (what it needs stays on the server)
export type CardView = Omit<Card, "items" | "undo"> & { items?: { id: string; title: string }[]; undoable: boolean };
// a line of the conversation: my question, or the model's answer with its cards, the web pages it cites by number and
// how many of the oldest questions its call left out
export type AskMessage = {
  id: string;
  role: "me" | "model";
  text: string;
  state: "writing" | "done" | "failed";
  error: string;
  model: string;
  at: string;
  cards: CardView[];
  sources: Source[];
  leftOut: number;
};

const TURN_CHARS = 6000; // a turn as the model rereads it; a longer one is cut
const FIND_ROUNDS = 2; // rounds of looks the model may take before it answers
const LOOKS = 3; // looks in one round
const CARDS = 5;

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s);
const size = (turns: Turn[]) => turns.reduce((n, t) => n + t.content.length, 0);
const json = (v: unknown) => JSON.stringify(v);

const view = ({ items, undo, ...card }: Card): CardView => ({
  ...card,
  ...(items ? { items: items.map((i) => ({ id: i.id, title: i.title })) } : {}),
  undoable: card.state === "done" && undo !== undefined,
});

// a row as kept: the answer's own looks (steps) and the work a waiting search holds (paused) stay on the server
type Row = Omit<AskMessage, "cards" | "sources" | "leftOut"> & {
  cards: string;
  steps: string;
  sources: string;
  left_out: number;
  paused: string;
};
const rowsOf = (db: DatabaseSync, app: string, ref: string) =>
  db
    .prepare(
      "SELECT id, role, text, state, error, model, at, cards, steps, sources, left_out, paused FROM ask_messages WHERE app = ? AND ref = ? ORDER BY rowid",
    )
    .all(app, ref) as Row[];
const sourcesOf = (rows: Row[]) => rows.flatMap((r) => JSON.parse(r.sources || "[]") as Source[]);

export function conversation(db: DatabaseSync, app: string, ref: string): AskMessage[] {
  return rowsOf(db, app, ref).map((r) => ({
    id: r.id,
    role: r.role,
    text: r.text,
    state: r.state,
    error: r.error,
    model: r.model,
    at: r.at,
    cards: (JSON.parse(r.cards || "[]") as Card[]).map(view),
    sources: JSON.parse(r.sources || "[]") as Source[],
    leftOut: r.left_out,
  }));
}

const stillWriting = (db: DatabaseSync, app: string, ref: string) =>
  db.prepare("SELECT 1 FROM ask_messages WHERE app = ? AND ref = ? AND state = 'writing' LIMIT 1").get(app, ref) !==
  undefined;

// the model's fenced blocks, each a JSON object (one that isn't is dropped): its looks (the page's find, the shared
// read tools) in order, the changes it proposes, and its words without them
export function blocksOf(text: string): {
  find: unknown[];
  looks: { tool: "find" | ToolName; args: unknown }[];
  actions: unknown[];
  words: string;
} {
  const looks: { tool: "find" | ToolName; args: unknown }[] = [];
  const actions: unknown[] = [];
  const words = text.replace(
    /```(find|action|read|web|page)[^\n]*\n([\s\S]*?)(?:```|$)/g,
    (_, kind: string, body: string) => {
      try {
        const parsed = JSON.parse(body.trim()) as unknown;
        // an object only: a list or a bare value is no look or change any page can run
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          if (kind === "action") actions.push(parsed);
          else looks.push({ tool: kind === "find" || isTool(kind) ? kind : "find", args: parsed });
        }
      } catch {
        // not JSON: nothing to run
      }
      return "";
    },
  );
  const find = looks.filter((l) => l.tool === "find").map((l) => l.args);
  return { find, looks, actions, words: words.replace(/\n{3,}/g, "\n\n").trim() };
}

// an answer's last turn as the model rereads it: its words, with the changes it proposed and what became of them, the
// searches it made and its sources by number (so "the second source" still means one page)
function saidOf(a: Row): string {
  const cards = JSON.parse(a.cards || "[]") as Card[];
  const changes = cards.filter((c) => !c.search);
  const searches = cards.filter((c) => c.search);
  const sources = JSON.parse(a.sources || "[]") as Source[];
  const how = (c: Card) => (c.state === "open" ? "waiting for my tap" : c.state === "skipped" ? "skipped" : c.result);
  return [
    a.text,
    changes.length
      ? `(Proposed: ${changes.map((c) => `${c.label} — ${c.state === "open" ? "not tapped" : c.state}`).join("; ")})`
      : "",
    searches.length ? `(Searched the web: ${searches.map((c) => `"${c.search}" — ${how(c)}`).join("; ")})` : "",
    sources.length
      ? `(Its sources: ${sources.map((s) => `[${s.n}] ${s.title ? `${s.title} ` : ""}${s.url}`).join("; ")})`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// the conversation as the model rereads it: one exchange per question whose answer landed (a failed or unfinished one
// stays out with its question), each its turns: my question, the answer's own looks and what they returned, its words
function exchanges(rows: Row[]): Turn[][] {
  const out: Turn[][] = [];
  rows.forEach((q, i) => {
    const a = rows[i + 1];
    if (q.role !== "me" || a?.role !== "model" || a.state !== "done") return;
    out.push([
      { role: "user", content: cut(q.text, TURN_CHARS) },
      ...(JSON.parse(a.steps || "[]") as Turn[]).map((t) => ({ role: t.role, content: cut(t.content, TURN_CHARS) })),
      { role: "assistant", content: cut(saidOf(a), TURN_CHARS) },
    ]);
  });
  return out;
}

// the exchanges that fit what the model reads at once beside the page, the question and this answer's own looks: the
// latest, whole, as many as fit. leftOut: how many of the oldest stayed out
function fit(system: string, past: Turn[][], current: Turn[], limit: number): { kept: Turn[]; leftOut: number } {
  let room = limit - system.length - size(current);
  let from = past.length;
  while (from > 0 && size(past[from - 1]) <= room) {
    room -= size(past[from - 1]);
    from--;
  }
  return { kept: past.slice(from).flat(), leftOut: from };
}

// an answer's work while it is written: its question; its own turns after it (the model's look, then what it
// returned); the next round's number; the pages the conversation knows (the page's own numbered sources and the earlier
// answers'), and the ones this answer found, numbered after them; its search cards; how many old exchanges its calls
// left out. While a search waits for my tap it is kept whole (ask_messages.paused) with the round's words and looks
// (said), what the round's other looks returned (found) and the search's words (query), so my tap goes on from there
type Work = {
  question: string;
  steps: Turn[];
  round: number;
  known: Source[];
  sources: Source[];
  cards: Card[];
  leftOut: number;
};
type Paused = Work & { said: string; found: string[]; query: string };

// the page's helper, the page itself with its tools, and how it meets the web
function setting(db: DatabaseSync, app: string, ref: string) {
  const helper = HELPERS[app];
  const shown = helper?.page(db, ref);
  if (!helper || !shown) return null;
  const tools = typeof helper.tools === "function" ? helper.tools(db, ref) : (helper.tools ?? ["read"]);
  const mode = webMode(tools);
  const page: AskPage = { ...shown, tools: [shown.tools, toolsText(mode)].filter(Boolean).join("\n\n") };
  return { helper, mode, page };
}
type Setting = NonNullable<ReturnType<typeof setting>>;
// the page as the model reads it on Ask, its tools and the web's way included (the web eval asks with it)
export const askPageOf = (db: DatabaseSync, app: string, ref: string): AskPage | null =>
  setting(db, app, ref)?.page ?? null;

// a search left waiting when I ask something else: skipped, and the answer it held stays as it was
function skipWaiting(db: DatabaseSync, rows: Row[]): void {
  for (const r of rows.filter((m) => m.paused)) {
    const cards = (JSON.parse(r.cards || "[]") as Card[]).map((c) =>
      c.search && c.state === "open" ? { ...c, state: "skipped" as const, result: "You asked something else." } : c,
    );
    db.prepare("UPDATE ask_messages SET cards = ?, paused = '' WHERE id = ?").run(json(cards), r.id);
  }
}

// my question, kept, and the model's answer started: it returns at once with the conversation (the answer's row
// empty and writing); `done` settles when the answer has landed, for the tests. A search that waited for my tap is
// skipped: I asked something else
export function askPage(
  db: DatabaseSync,
  settings: Settings,
  input: { app: string; ref: string; text: string },
): { messages: AskMessage[]; done: Promise<void> } {
  if (!HELPERS[input.app]) throw new Refused(`there is no Ask on ${input.app}`);
  const question = input.text.trim();
  if (!question) throw new Refused("ask something");
  const set = setting(db, input.app, input.ref);
  if (!set) throw new Refused("that page isn't there any more");
  let before = rowsOf(db, input.app, input.ref);
  if (before.some((m) => m.state === "writing")) throw new Refused("the model is still answering: wait for it");
  if (before.some((m) => m.paused)) {
    skipWaiting(db, before);
    before = rowsOf(db, input.app, input.ref);
  }
  const at = new Date().toISOString();
  const model = modelFor(db, settings, "ask");
  const id = randomUUID();
  const add = db.prepare(
    "INSERT INTO ask_messages (id, app, ref, role, text, state, model, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  add.run(randomUUID(), input.app, input.ref, "me", question, "done", "", at);
  add.run(id, input.app, input.ref, "model", "", "writing", model, at);
  const work: Work = {
    question,
    steps: [],
    round: 0,
    known: [...(set.page.sources ?? []), ...sourcesOf(before)],
    sources: [],
    cards: [],
    leftOut: 0,
  };
  const row = { id, app: input.app, ref: input.ref, model };
  const done = write(db, id, set.page, (live) => answer(db, settings, row, set, exchanges(before), work, live));
  return { messages: conversation(db, input.app, input.ref), done };
}

// an answer's work, on Live. Anything that breaks while it is written (a page's find, its tidy, a record) ends it as
// failed: a row left writing would refuse every question and Start over until a restart. Live first: if the database
// itself closed under it (a test's end, a stop), the write below throws too, and there is nothing left to tell. The
// log keeps what broke, pathless.
async function write(
  db: DatabaseSync,
  id: string,
  page: AskPage,
  go: (live: ReturnType<typeof begin>) => Promise<void>,
): Promise<void> {
  const live = begin("model", `Ask: ${page.title}`.slice(0, 120), page.link);
  try {
    await go(live);
  } catch (e) {
    console.error(`an Ask answer failed: ${plainWords(e instanceof Error ? e.message : String(e))}`);
    live.end("failed", "something went wrong while it answered");
    try {
      db.prepare(
        "UPDATE ask_messages SET state = 'failed', error = ?, paused = '' WHERE id = ? AND state = 'writing'",
      ).run("Something went wrong while it answered. Ask again.", id);
    } catch {
      // the database closed under it: nothing left to tell
    }
  }
}

// a round's looks returned: the model's words with its looks, then what they returned (cut to the room the model has
// left), and the next round begins. After the last round the model is told to answer now: without it, one that wanted
// a third look ended on its preamble ("Let me look once more"), which became the whole answer
function goOn(work: Work, said: string, found: string[], systemChars: number, limit: number): void {
  work.steps.push({ role: "assistant", content: said });
  const end =
    work.round + 1 >= FIND_ROUNDS
      ? "That was your last look: answer my question now from what you have, with no more blocks."
      : "Now answer my question from it.";
  const room = limit - systemChars - work.question.length - size(work.steps) - end.length - 120;
  work.steps.push({
    role: "user",
    content: `WHAT YOUR LOOKS RETURNED (for you; I don't see it):\n${cut(found.join("\n\n"), Math.max(500, room))}\n\n${end}`,
  });
  work.round++;
}

async function answer(
  db: DatabaseSync,
  settings: Settings,
  row: { id: string; app: string; ref: string; model: string },
  set: Setting,
  past: Turn[][],
  work: Work,
  live: ReturnType<typeof begin>,
): Promise<void> {
  const { helper, mode, page } = set;
  live.step(`${row.model} answers`);
  const system = askSystem(page);
  const limit = settings.models.contextChars;
  const grow = db.prepare("UPDATE ask_messages SET text = ? WHERE id = ? AND state = 'writing'");
  const keep = db.prepare("UPDATE ask_messages SET cards = ?, sources = ? WHERE id = ? AND state = 'writing'");
  const models = { ...settings.models, careful: row.model, fast: row.model };
  const allowed = new Set<string>([...(helper.find ? ["find"] : []), "read", "web", "page"]);
  const tidy = (w: string) => (helper.tidy ? helper.tidy(db, row.ref, w) : w);
  let last = 0;
  for (;;) {
    // the conversation so far, as much of it as fits beside the page, the question and this answer's own looks
    const current: Turn[] = [{ role: "user", content: work.question }, ...work.steps];
    const fitted = fit(system, past, current, limit);
    work.leftOut = Math.max(work.leftOut, fitted.leftOut);
    const got = await chatModel(
      models,
      {
        model: row.model,
        system,
        messages: [...fitted.kept, ...current],
        maxTokens: ASK_MAX_TOKENS,
        thinking: true,
      },
      (soFar) => {
        // the page reads the row about three times a second: writing it more often buys nothing
        if (Date.now() - last < 250) return;
        last = Date.now();
        grow.run(soFar, row.id);
      },
    );
    recordCall(db, `ask-${row.app}:v${ASK_VERSION}`, got);
    if (!got.ok) {
      // the failure in plain words, on the answer's row and on Live; the developer's detail stays in the calls log
      const said = failureWords(got.why, "Ask again, or ask in fewer words");
      db.prepare(
        "UPDATE ask_messages SET state = 'failed', error = ?, cards = ?, sources = ?, steps = ?, left_out = ? WHERE id = ?",
      ).run(said, json(work.cards), json(work.sources), json(work.steps), work.leftOut, row.id);
      live.end("failed", said);
      return;
    }
    const { looks, actions, words } = blocksOf(got.value);
    // its looks (through the page's data, or with a shared tool): what they return goes back to the model, which
    // answers from it
    const runnable = looks.filter((l) => allowed.has(l.tool)).slice(0, LOOKS);
    if (runnable.length && work.round < FIND_ROUNDS) {
      const found: string[] = [];
      let wait = "";
      // a page that holds something private (a want's budget and note) cleans a look's words or refuses it, in code,
      // before it runs
      const guard = (tool: "web" | "page", args: unknown): { args: unknown } | { refused: string } =>
        helper.scrub ? helper.scrub(db, row.ref, tool, args) : { args };
      for (const l of runnable) {
        if (l.tool === "find") {
          live.step("Looking through the page");
          found.push(helper.find?.(db, row.ref, l.args) ?? "");
        } else if (l.tool === "read") {
          live.step(DOING.read);
          found.push(readLook(db, l.args, mode));
        } else if (l.tool === "page") {
          live.step(DOING.page);
          const g = guard("page", l.args);
          found.push("refused" in g ? g.refused : await pageLook(settings, g.args, mode, work.known, work.sources));
        } else {
          // the words as they will go: only what draws (queryOf), then a private page's scrub (a want's budget)
          const seen = queryOf(l.args);
          const g = seen ? guard("web", { query: seen }) : null;
          const q = g && !("refused" in g) ? queryOf(g.args) : "";
          if (g && "refused" in g) found.push(g.refused);
          else if (!q) found.push("A search needs words: that one had none, so nothing ran.");
          else if (mode === "tap") {
            // a page of my own: the search waits for my tap with its exact words, one at a time
            if (!wait) wait = q;
            else found.push(`Only one search waits for my tap at a time: "${q}" didn't run.`);
          } else {
            live.step(DOING.web);
            const card: Card = {
              label: `Search the web for “${q}”`,
              action: { search: q },
              state: "done",
              result: "",
              search: q,
            };
            work.cards.push(card);
            keep.run(json(work.cards), json(work.sources), row.id); // the page shows it searching
            const s = await searchLook(settings, q, work.known, work.sources);
            card.state = s.state;
            card.result = s.result;
            found.push(s.text);
            keep.run(json(work.cards), json(work.sources), row.id);
          }
        }
      }
      if (wait) {
        // the answer stops here, its words so far over the search's card; my tap goes on from this work (searchOn)
        work.cards.push({
          label: `Search the web for “${wait}”`,
          action: { search: wait },
          state: "open",
          result: "",
          search: wait,
        });
        const paused: Paused = { ...work, said: got.value, found, query: wait };
        db.prepare(
          "UPDATE ask_messages SET text = ?, state = 'done', cards = ?, sources = ?, steps = ?, left_out = ?, paused = ? WHERE id = ? AND state = 'writing'",
        ).run(tidy(words), json(work.cards), json(work.sources), json(work.steps), work.leftOut, json(paused), row.id);
        live.end("done", "a web search waits for my tap");
        return;
      }
      goOn(work, got.value, found, system.length, limit);
      grow.run("", row.id);
      continue;
    }
    // the changes it proposed, each a card that says what it would do (a change to many: resolved now, its listings
    // kept); one this page can't make is dropped, one it can't read says why on its card
    const changes: Card[] = [];
    for (const action of actions) {
      const said = helper.act?.describe(db, row.ref, action);
      if (!said) continue;
      const p: Proposal = typeof said === "string" ? { label: said } : said;
      if (changes.some((c) => c.label === p.label) || changes.length >= CARDS) continue;
      changes.push({
        label: p.label,
        action,
        state: p.failed ? "failed" : "open",
        result: p.failed ?? "",
        ...(p.detail ? { detail: p.detail } : {}),
        ...(p.items ? { items: p.items } : {}),
      });
    }
    // a look it still wanted after its last round: its words stand, and say so, so the next question can go on
    const text = [tidy(words), runnable.length ? "*(I wanted to look further: ask me to go on)*" : ""]
      .filter(Boolean)
      .join("\n\n");
    db.prepare(
      "UPDATE ask_messages SET text = ?, state = 'done', cards = ?, sources = ?, steps = ?, left_out = ?, paused = '' WHERE id = ?",
    ).run(
      text || (changes.length ? "" : "I found nothing to say to that here: ask it another way."),
      json([...work.cards, ...changes]),
      json(work.sources),
      json(work.steps),
      work.leftOut,
      row.id,
    );
    live.end("done", "");
    return;
  }
}

// my tap on a search waiting on a page of my own: Search runs its exact words and the answer goes on from what they
// found; Skip goes on without the web. It returns at once with the conversation; `done` settles when the answer has
// landed, for the tests
export function searchOn(
  db: DatabaseSync,
  settings: Settings,
  input: { id: string; card: number; go: boolean },
): { messages: AskMessage[]; done: Promise<void> } {
  const r = db.prepare("SELECT app, ref, model, cards, paused FROM ask_messages WHERE id = ?").get(input.id) as
    | { app: string; ref: string; model: string; cards: string; paused: string }
    | undefined;
  if (!r) throw new Refused("that answer isn't there any more");
  const cards = JSON.parse(r.cards || "[]") as Card[];
  const card = cards[input.card];
  if (!card?.search) throw new Refused("there is no such search");
  if (card.state !== "open" || !r.paused) throw new Refused("that search was answered already");
  const set = setting(db, r.app, r.ref);
  if (!set) throw new Refused("that page isn't there any more");
  const work = JSON.parse(r.paused) as Paused;
  work.cards = cards;
  card.state = input.go ? "done" : "skipped";
  card.result = input.go ? "" : "It answers without the web.";
  db.prepare("UPDATE ask_messages SET state = 'writing', text = '', cards = ?, paused = '' WHERE id = ?").run(
    json(cards),
    input.id,
  );
  // the conversation before this answer's question, as when it started
  const rows = rowsOf(db, r.app, r.ref);
  const at = rows.findIndex((x) => x.id === input.id);
  const past = exchanges(rows.slice(0, Math.max(0, at - 1)));
  const row = { id: input.id, app: r.app, ref: r.ref, model: r.model };
  const done = write(db, input.id, set.page, async (live) => {
    const found = [...work.found];
    if (input.go) {
      live.step(DOING.web);
      const s = await searchLook(settings, work.query, work.known, work.sources);
      card.state = s.state;
      card.result = s.result;
      found.push(s.text);
    } else
      found.push(
        `I skipped the search for "${work.query}": answer without the web, and say plainly what you couldn't check.`,
      );
    db.prepare("UPDATE ask_messages SET cards = ?, sources = ? WHERE id = ? AND state = 'writing'").run(
      json(cards),
      json(work.sources),
      input.id,
    );
    goOn(work, work.said, found, askSystem(set.page).length, settings.models.contextChars);
    await answer(db, settings, row, set, past, work, live);
  });
  return { messages: conversation(db, r.app, r.ref), done };
}

// an answer's cards, by the answer's id, with its page's helper
function cardsOf(db: DatabaseSync, id: string) {
  const m = db.prepare("SELECT app, ref, cards FROM ask_messages WHERE id = ?").get(id) as
    | { app: string; ref: string; cards: string }
    | undefined;
  if (!m) throw new Refused("that answer isn't there any more");
  return { ...m, act: HELPERS[m.app]?.act, cards: JSON.parse(m.cards || "[]") as Card[] };
}

// my tap on a card: its change runs through the app's own functions, and the card says what happened
export function actOn(db: DatabaseSync, settings: Settings, input: { id: string; card: number }): AskMessage[] {
  const { app, ref, act, cards } = cardsOf(db, input.id);
  const card = cards[input.card];
  if (!act || !card || card.search) throw new Refused("there is no such change to make");
  if (card.state !== "open") throw new Refused("that change was already made");
  try {
    const got = act.run(db, settings, ref, card.action, card);
    card.result = typeof got === "string" ? got : got.result;
    if (typeof got !== "string" && got.undo !== undefined) card.undo = got.undo;
    card.state = "done";
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    card.result = e.message;
    card.state = "failed";
  }
  db.prepare("UPDATE ask_messages SET cards = ? WHERE id = ?").run(json(cards), input.id);
  return conversation(db, app, ref);
}

// Undo on a card my tap ran: the app takes its change back, once, and the card says what came back
export function undoOn(db: DatabaseSync, input: { id: string; card: number }): AskMessage[] {
  const { app, ref, act, cards } = cardsOf(db, input.id);
  const card = cards[input.card];
  if (!act?.undo || !card || card.search) throw new Refused("there is no such change to undo");
  if (card.state !== "done" || card.undo === undefined) throw new Refused("that change can't be undone");
  card.result = act.undo(db, ref, card);
  card.state = "undone";
  delete card.undo;
  db.prepare("UPDATE ask_messages SET cards = ? WHERE id = ?").run(json(cards), input.id);
  return conversation(db, app, ref);
}

// start the page's conversation over (a search waiting for my tap goes with it)
export function clearConversation(db: DatabaseSync, app: string, ref: string): void {
  if (stillWriting(db, app, ref)) throw new Refused("the model is still answering: wait for it");
  db.prepare("DELETE FROM ask_messages WHERE app = ? AND ref = ?").run(app, ref);
}

// kestrel restarted while an answer was being written: it can't finish now, so it says so instead of spinning. A
// search waiting for my tap stays: its work is kept, so my tap still goes on from it
export function sweepAsks(db: DatabaseSync): void {
  db.prepare(
    "UPDATE ask_messages SET state = 'failed', error = 'kestrel restarted while it wrote. Ask again.' WHERE state = 'writing'",
  ).run();
}

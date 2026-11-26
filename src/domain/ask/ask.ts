// Ask, on any page: a conversation with the computer's model about what the page shows — a lesson, a quiz question
// with my answer, a hunt's listings, and later a note, a task. Each app says what its page shows (its helper, below),
// and may let the model act there: find (a reading action whose result goes back to the model, which answers from it)
// and changes it proposes as cards, which only my tap runs. The conversation is kept per page, so leaving loses
// nothing and coming back continues it. The answer streams into its row as the model writes, and the page reads it as
// it grows. One answer at a time per page, on Ask's own model pick (the fast one unless I change it). Nothing leaves
// the computer.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ASK_MAX_TOKENS, ASK_VERSION, type AskPage, askMessages } from "../../ai/ask/prompt.ts";
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
import { isTool, runTool, TOOLS, type ToolName, toolLines } from "./tools.ts";

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
  // the shared read tools this page allows (tools.ts), for the app or per page; read alone when unsaid: a page of my
  // own gets no web tool
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
// changes exactly those); undo holds what Undo needs, until Undo is used
export type Card = {
  label: string;
  action: unknown;
  state: "open" | "done" | "failed" | "undone";
  result: string;
  detail?: string;
  items?: { id: string; title: string; was: string }[];
  undo?: unknown;
};
// what a page says of a change it could make: its words; for a change to many, also what it leaves out and what it
// covers; failed: one it can't make, said on its card
export type Proposal = { label: string; detail?: string; items?: Card["items"]; failed?: string };
// a card as the page reads it: the titles it covers, and whether Undo is there (what it needs stays on the server)
export type CardView = Omit<Card, "items" | "undo"> & { items?: { id: string; title: string }[]; undoable: boolean };
export type AskMessage = {
  id: string;
  role: "me" | "model";
  text: string;
  state: "writing" | "done" | "failed";
  error: string;
  model: string;
  at: string;
  cards: CardView[];
};

const HISTORY = 12; // the turns the model rereads; older ones stay on the page
const TURN_CHARS = 6000;
const FIND_ROUNDS = 2; // rounds of looks the model may take before it answers
const LOOKS = 3; // looks in one round
const CARDS = 5;

const view = ({ items, undo, ...card }: Card): CardView => ({
  ...card,
  ...(items ? { items: items.map((i) => ({ id: i.id, title: i.title })) } : {}),
  undoable: card.state === "done" && undo !== undefined,
});

export function conversation(db: DatabaseSync, app: string, ref: string): AskMessage[] {
  return (
    db
      .prepare(
        "SELECT id, role, text, state, error, model, at, cards FROM ask_messages WHERE app = ? AND ref = ? ORDER BY rowid",
      )
      .all(app, ref) as (Omit<AskMessage, "cards"> & { cards: string })[]
  ).map((m) => ({ ...m, cards: (JSON.parse(m.cards || "[]") as Card[]).map(view) }));
}

const stillWriting = (db: DatabaseSync, app: string, ref: string) =>
  conversation(db, app, ref).some((m) => m.state === "writing");

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

// the shared tools a page allows, as its prompt lists them after the page's own
const toolsText = (names: ToolName[]) =>
  [
    "To look further before you answer, write one of these; kestrel runs it and gives you what it returned (two",
    "rounds of looks at most, then answer):",
    ...toolLines(names),
  ].join("\n");

// my question, kept, and the model's answer started: it returns at once with the conversation (the answer's row
// empty and writing); `done` settles when the answer has landed, for the tests
export function askPage(
  db: DatabaseSync,
  settings: Settings,
  input: { app: string; ref: string; text: string },
): { messages: AskMessage[]; done: Promise<void> } {
  const helper = HELPERS[input.app];
  if (!helper) throw new Refused(`there is no Ask on ${input.app}`);
  const question = input.text.trim();
  if (!question) throw new Refused("ask something");
  const shown = helper.page(db, input.ref);
  if (!shown) throw new Refused("that page isn't there any more");
  const tools = typeof helper.tools === "function" ? helper.tools(db, input.ref) : (helper.tools ?? ["read"]);
  const page = { ...shown, tools: [shown.tools, toolsText(tools)].filter(Boolean).join("\n\n") };
  const before = conversation(db, input.app, input.ref);
  if (before.some((m) => m.state === "writing")) throw new Refused("the model is still answering: wait for it");
  // the turns so far, each answer with the cards it proposed and what became of them
  const history: Turn[] = before
    .filter((m) => m.state === "done" && m.text)
    .slice(-HISTORY)
    .map((m) => ({
      role: m.role === "me" ? "user" : "assistant",
      content:
        `${m.text}${m.cards.length ? `\n\n(Proposed: ${m.cards.map((c) => `${c.label} — ${c.state === "open" ? "not tapped" : c.state}`).join("; ")})` : ""}`.slice(
          0,
          TURN_CHARS,
        ),
    }));
  const at = new Date().toISOString();
  const model = modelFor(db, settings, "ask");
  const answer = randomUUID();
  const add = db.prepare(
    "INSERT INTO ask_messages (id, app, ref, role, text, state, model, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  add.run(randomUUID(), input.app, input.ref, "me", question, "done", "", at);
  add.run(answer, input.app, input.ref, "model", "", "writing", model, at);
  const done = write(
    db,
    settings,
    { id: answer, app: input.app, ref: input.ref, model },
    helper,
    tools,
    page,
    history,
    question,
  ).catch(() => {
    // the database closed under it (a test's end, a stop): nothing left to tell
  });
  return { messages: conversation(db, input.app, input.ref), done };
}

async function write(
  db: DatabaseSync,
  settings: Settings,
  row: { id: string; app: string; ref: string; model: string },
  helper: Helper,
  tools: ToolName[],
  page: AskPage,
  history: Turn[],
  question: string,
): Promise<void> {
  const live = begin("model", `Ask: ${page.title}`.slice(0, 120), page.link);
  try {
    await answer(db, settings, row, helper, tools, page, history, question, live);
  } catch (e) {
    // anything that breaks while the answer is written (a page's find, its tidy, a record) ends it as failed: a row
    // left writing would refuse every question and Start over until a restart. Live first: if the database itself
    // closed under it, the write below throws too, and askPage's catch takes it. The log keeps what broke, pathless.
    console.error(`an Ask answer failed: ${plainWords(e instanceof Error ? e.message : String(e))}`);
    live.end("failed", "something went wrong while it answered");
    db.prepare("UPDATE ask_messages SET state = 'failed', error = ? WHERE id = ? AND state = 'writing'").run(
      "Something went wrong while it answered. Ask again.",
      row.id,
    );
  }
}

async function answer(
  db: DatabaseSync,
  settings: Settings,
  row: { id: string; app: string; ref: string; model: string },
  helper: Helper,
  tools: ToolName[],
  page: AskPage,
  history: Turn[],
  question: string,
  live: ReturnType<typeof begin>,
): Promise<void> {
  live.step(`${row.model} answers`);
  const { system, messages } = askMessages(page, history, question);
  const grow = db.prepare("UPDATE ask_messages SET text = ? WHERE id = ? AND state = 'writing'");
  const models = { ...settings.models, careful: row.model, fast: row.model };
  let last = 0;
  for (let round = 0; ; round++) {
    const got = await chatModel(
      models,
      { model: row.model, system, messages, maxTokens: ASK_MAX_TOKENS, thinking: true },
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
      db.prepare("UPDATE ask_messages SET state = 'failed', error = ? WHERE id = ?").run(said, row.id);
      live.end("failed", said);
      return;
    }
    const { looks, actions, words } = blocksOf(got.value);
    // its looks (through the page's data, or with a shared tool the page allows): what they return goes back to the
    // model, which answers from it. A tool the page doesn't allow is not run.
    const allowed = new Set<string>([...(helper.find ? ["find"] : []), ...tools]);
    const runnable = looks.filter((l) => allowed.has(l.tool)).slice(0, LOOKS);
    if (runnable.length && round < FIND_ROUNDS) {
      const found: string[] = [];
      for (const l of runnable) {
        if (l.tool === "find") {
          live.step("Looking through the page");
          found.push(helper.find?.(db, row.ref, l.args) ?? "");
        } else {
          live.step(TOOLS[l.tool].doing);
          const guarded =
            helper.scrub && l.tool !== "read" ? helper.scrub(db, row.ref, l.tool, l.args) : { args: l.args };
          found.push("refused" in guarded ? guarded.refused : await runTool(db, settings, l.tool, guarded.args, tools));
        }
      }
      messages.push(
        { role: "assistant", content: got.value },
        {
          role: "user",
          content: `WHAT YOUR LOOKS RETURNED (for you; I don't see it):\n${found.join("\n\n")}\n\nNow answer my question from it.`,
        },
      );
      grow.run("", row.id);
      continue;
    }
    // the changes it proposed, each a card that says what it would do (a change to many: resolved now, its listings
    // kept); one this page can't make is dropped, one it can't read says why on its card
    const cards: Card[] = [];
    for (const action of actions) {
      const said = helper.act?.describe(db, row.ref, action);
      if (!said) continue;
      const p: Proposal = typeof said === "string" ? { label: said } : said;
      if (cards.some((c) => c.label === p.label) || cards.length >= CARDS) continue;
      cards.push({
        label: p.label,
        action,
        state: p.failed ? "failed" : "open",
        result: p.failed ?? "",
        ...(p.detail ? { detail: p.detail } : {}),
        ...(p.items ? { items: p.items } : {}),
      });
    }
    db.prepare("UPDATE ask_messages SET text = ?, state = 'done', cards = ? WHERE id = ?").run(
      (helper.tidy ? helper.tidy(db, row.ref, words) : words) ||
        (cards.length ? "" : "I found nothing to say to that here: ask it another way."),
      JSON.stringify(cards),
      row.id,
    );
    live.end("done", "");
    return;
  }
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
  if (!act || !card) throw new Refused("there is no such change to make");
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
  db.prepare("UPDATE ask_messages SET cards = ? WHERE id = ?").run(JSON.stringify(cards), input.id);
  return conversation(db, app, ref);
}

// Undo on a card my tap ran: the app takes its change back, once, and the card says what came back
export function undoOn(db: DatabaseSync, input: { id: string; card: number }): AskMessage[] {
  const { app, ref, act, cards } = cardsOf(db, input.id);
  const card = cards[input.card];
  if (!act?.undo || !card) throw new Refused("there is no such change to undo");
  if (card.state !== "done" || card.undo === undefined) throw new Refused("that change can't be undone");
  card.result = act.undo(db, ref, card);
  card.state = "undone";
  delete card.undo;
  db.prepare("UPDATE ask_messages SET cards = ? WHERE id = ?").run(JSON.stringify(cards), input.id);
  return conversation(db, app, ref);
}

// start the page's conversation over
export function clearConversation(db: DatabaseSync, app: string, ref: string): void {
  if (stillWriting(db, app, ref)) throw new Refused("the model is still answering: wait for it");
  db.prepare("DELETE FROM ask_messages WHERE app = ? AND ref = ?").run(app, ref);
}

// kestrel restarted while an answer was being written: it can't finish now, so it says so instead of spinning
export function sweepAsks(db: DatabaseSync): void {
  db.prepare(
    "UPDATE ask_messages SET state = 'failed', error = 'kestrel restarted while it wrote. Ask again.' WHERE state = 'writing'",
  ).run();
}

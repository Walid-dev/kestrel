// Ask, on any page: a conversation with the computer's model about what the page shows — a lesson, a quiz question
// with my answer, a hunt's listings, and later a note, a task. Each app says what its page shows (its helper, below),
// and may let the model act there: find (a reading action whose result goes back to the model, which answers from it)
// and changes it proposes as cards, which only my tap runs. The conversation is kept per page, so leaving loses
// nothing and coming back continues it. The answer streams into its row as the model writes, and the page reads it as
// it grows. One answer at a time per page, on Ask's own model pick (the fast one unless I change it). Nothing leaves
// the computer.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ASK_VERSION, type AskPage, askMessages } from "../../ai/ask/prompt.ts";
import { chatModel, type Turn } from "../../ai/client.ts";
import { begin } from "../../platform/activity.ts";
import type { Settings } from "../../platform/config.ts";
import { recordCall } from "../calls.ts";
import { lessonPage } from "../learn/ask.ts";
import { quizPage } from "../learn/quiz.ts";
import { modelFor } from "../models.ts";
import { notesHelper } from "../notes/ask.ts";
import { Refused } from "../notes/documents.ts";
import { searchesHelper } from "../search/ask.ts";
import { tasksHelper } from "../tasks/ask.ts";

// an app's helper: what its page shows the model, found by the page's ref (a lesson's id; a quiz's id and question; a
// hunt), and what the model may do there
type Helper = {
  page: (db: DatabaseSync, ref: string) => AskPage | null;
  // a reading action: its words go back to the model, which then answers from them
  find?: (db: DatabaseSync, ref: string, query: unknown) => string;
  // the changes the model may propose: describe says what one would do (null: not one this page can make), run makes
  // it on my tap and says what happened
  act?: {
    describe: (db: DatabaseSync, ref: string, action: unknown) => string | null;
    run: (db: DatabaseSync, settings: Settings, ref: string, action: unknown) => string;
  };
  // the answer's words before they are kept (a link to something that isn't there becomes plain words)
  tidy?: (db: DatabaseSync, ref: string, words: string) => string;
};
const HELPERS: Record<string, Helper> = {
  learn: { page: lessonPage },
  quiz: { page: quizPage },
  searches: searchesHelper,
  notes: notesHelper,
  tasks: tasksHelper,
};
export const ASK_APPS = Object.keys(HELPERS) as [string, ...string[]];

// a change the model proposed: what it would do, the action itself, and whether my tap ran it
export type Card = { label: string; action: unknown; state: "open" | "done" | "failed"; result: string };
export type AskMessage = {
  id: string;
  role: "me" | "model";
  text: string;
  state: "writing" | "done" | "failed";
  error: string;
  model: string;
  at: string;
  cards: Card[];
};

const HISTORY = 12; // the turns the model rereads; older ones stay on the page
const TURN_CHARS = 6000;
const FIND_ROUNDS = 2; // looks the model may take before it answers
const CARDS = 5;

export function conversation(db: DatabaseSync, app: string, ref: string): AskMessage[] {
  return (
    db
      .prepare(
        "SELECT id, role, text, state, error, model, at, cards FROM ask_messages WHERE app = ? AND ref = ? ORDER BY rowid",
      )
      .all(app, ref) as (Omit<AskMessage, "cards"> & { cards: string })[]
  ).map((m) => ({ ...m, cards: JSON.parse(m.cards || "[]") as Card[] }));
}

const stillWriting = (db: DatabaseSync, app: string, ref: string) =>
  conversation(db, app, ref).some((m) => m.state === "writing");

// the model's fenced blocks, ```find and ```action, each a JSON object (one that isn't is dropped), and its words
// without them
export function blocksOf(text: string): { find: unknown[]; actions: unknown[]; words: string } {
  const find: unknown[] = [];
  const actions: unknown[] = [];
  const words = text.replace(/```(find|action)[^\n]*\n([\s\S]*?)(?:```|$)/g, (_, kind: string, body: string) => {
    try {
      const parsed = JSON.parse(body.trim()) as unknown;
      if (parsed && typeof parsed === "object") (kind === "find" ? find : actions).push(parsed);
    } catch {
      // not JSON: nothing to run
    }
    return "";
  });
  return { find, actions, words: words.replace(/\n{3,}/g, "\n\n").trim() };
}

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
  const page = helper.page(db, input.ref);
  if (!page) throw new Refused("that page isn't there any more");
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
  page: AskPage,
  history: Turn[],
  question: string,
): Promise<void> {
  const live = begin("model", `Ask: ${page.title}`.slice(0, 120), page.link);
  live.step(`${row.model} answers`);
  const { system, messages } = askMessages(page, history, question);
  const grow = db.prepare("UPDATE ask_messages SET text = ? WHERE id = ? AND state = 'writing'");
  const models = { ...settings.models, careful: row.model, fast: row.model };
  let last = 0;
  for (let round = 0; ; round++) {
    const got = await chatModel(
      models,
      { model: row.model, system, messages, maxTokens: 6000, thinking: true },
      (soFar) => {
        // the page reads the row about three times a second: writing it more often buys nothing
        if (Date.now() - last < 250) return;
        last = Date.now();
        grow.run(soFar, row.id);
      },
    );
    recordCall(db, `ask-${row.app}:v${ASK_VERSION}`, got);
    if (!got.ok) {
      db.prepare("UPDATE ask_messages SET state = 'failed', error = ? WHERE id = ?").run(
        `${got.why}: ${got.detail}`.slice(0, 300),
        row.id,
      );
      live.end("failed", got.why);
      return;
    }
    const { find, actions, words } = blocksOf(got.value);
    // a look through the page's data: its result goes back to the model, which answers from it
    if (find.length && helper.find && round < FIND_ROUNDS) {
      live.step("Looking through the page");
      const found = find
        .slice(0, 2)
        .map((q) => helper.find?.(db, row.ref, q) ?? "")
        .join("\n\n");
      messages.push(
        { role: "assistant", content: got.value },
        {
          role: "user",
          content: `WHAT YOUR FIND RETURNED (for you; I don't see it):\n${found}\n\nNow answer my question from it.`,
        },
      );
      grow.run("", row.id);
      continue;
    }
    // the changes it proposed, each a card that says what it would do; one this page can't make is dropped
    const cards: Card[] = [];
    for (const action of actions) {
      const label = helper.act?.describe(db, row.ref, action);
      if (label && !cards.some((c) => c.label === label) && cards.length < CARDS)
        cards.push({ label, action, state: "open", result: "" });
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

// my tap on a card: its change runs through the app's own functions, and the card says what happened
export function actOn(db: DatabaseSync, settings: Settings, input: { id: string; card: number }): AskMessage[] {
  const m = db.prepare("SELECT app, ref, cards FROM ask_messages WHERE id = ?").get(input.id) as
    | { app: string; ref: string; cards: string }
    | undefined;
  if (!m) throw new Refused("that answer isn't there any more");
  const act = HELPERS[m.app]?.act;
  const cards = JSON.parse(m.cards || "[]") as Card[];
  const card = cards[input.card];
  if (!act || !card) throw new Refused("there is no such change to make");
  if (card.state !== "open") throw new Refused("that change was already made");
  try {
    card.result = act.run(db, settings, m.ref, card.action);
    card.state = "done";
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    card.result = e.message;
    card.state = "failed";
  }
  db.prepare("UPDATE ask_messages SET cards = ? WHERE id = ?").run(JSON.stringify(cards), input.id);
  return conversation(db, m.app, m.ref);
}

// start the page's conversation over
export function clearConversation(db: DatabaseSync, app: string, ref: string): void {
  if (stillWriting(db, app, ref)) throw new Refused("the model is still answering: wait for it");
  db.prepare("DELETE FROM ask_messages WHERE app = ? AND ref = ?").run(app, ref);
}

// kestrel restarted while an answer was being written: it can't finish now, so it says so instead of spinning
export function sweepAsks(db: DatabaseSync): void {
  db.prepare(
    "UPDATE ask_messages SET state = 'failed', error = 'kestrel restarted while it wrote: ask again' WHERE state = 'writing'",
  ).run();
}

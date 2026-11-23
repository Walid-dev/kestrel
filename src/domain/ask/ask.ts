// Ask, on any page: a conversation with the computer's model about what the page shows — a lesson, a quiz question
// with my answer, and later the listings, a note, a task. Each app says what its page shows (its helper, below); the
// conversation is kept per page, so leaving loses nothing and coming back continues it. The answer streams into its
// row as the model writes, and the page reads it as it grows. One answer at a time per page, on Ask's own model pick
// (the fast one unless I change it). Nothing leaves the computer.
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
import { Refused } from "../notes/documents.ts";

// each app's helper: what its page shows the model, found by the page's ref (a lesson's id; a quiz's id and question)
const HELPERS: Record<string, (db: DatabaseSync, ref: string) => AskPage | null> = {
  learn: lessonPage,
  quiz: quizPage,
};
export const ASK_APPS = Object.keys(HELPERS) as [string, ...string[]];

export type AskMessage = {
  id: string;
  role: "me" | "model";
  text: string;
  state: "writing" | "done" | "failed";
  error: string;
  model: string;
  at: string;
};

const HISTORY = 12; // the turns the model rereads; older ones stay on the page
const TURN_CHARS = 6000;

export function conversation(db: DatabaseSync, app: string, ref: string): AskMessage[] {
  return db
    .prepare(
      "SELECT id, role, text, state, error, model, at FROM ask_messages WHERE app = ? AND ref = ? ORDER BY rowid",
    )
    .all(app, ref) as AskMessage[];
}

const stillWriting = (db: DatabaseSync, app: string, ref: string) =>
  conversation(db, app, ref).some((m) => m.state === "writing");

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
  const page = helper(db, input.ref);
  if (!page) throw new Refused("that page isn't there any more");
  const before = conversation(db, input.app, input.ref);
  if (before.some((m) => m.state === "writing")) throw new Refused("the model is still answering: wait for it");
  const history: Turn[] = before
    .filter((m) => m.state === "done" && m.text)
    .slice(-HISTORY)
    .map((m) => ({ role: m.role === "me" ? "user" : "assistant", content: m.text.slice(0, TURN_CHARS) }));
  const at = new Date().toISOString();
  const model = modelFor(db, settings, "ask");
  const answer = randomUUID();
  const add = db.prepare(
    "INSERT INTO ask_messages (id, app, ref, role, text, state, model, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  add.run(randomUUID(), input.app, input.ref, "me", question, "done", "", at);
  add.run(answer, input.app, input.ref, "model", "", "writing", model, at);
  const done = write(db, settings, { id: answer, app: input.app, model }, page, history, question).catch(() => {
    // the database closed under it (a test's end, a stop): nothing left to tell
  });
  return { messages: conversation(db, input.app, input.ref), done };
}

async function write(
  db: DatabaseSync,
  settings: Settings,
  row: { id: string; app: string; model: string },
  page: AskPage,
  history: Turn[],
  question: string,
): Promise<void> {
  const live = begin("model", `Ask: ${page.title}`.slice(0, 120), page.link);
  live.step(`${row.model} answers`);
  const { system, messages } = askMessages(page, history, question);
  const grow = db.prepare("UPDATE ask_messages SET text = ? WHERE id = ? AND state = 'writing'");
  let last = 0;
  const got = await chatModel(
    { ...settings.models, careful: row.model, fast: row.model },
    { model: row.model, system, messages, maxTokens: 6000, thinking: true },
    (soFar) => {
      // the page reads the row about three times a second: writing it more often buys nothing
      if (Date.now() - last < 250) return;
      last = Date.now();
      grow.run(soFar, row.id);
    },
  );
  recordCall(db, `ask-${row.app}:v${ASK_VERSION}`, got);
  if (got.ok) db.prepare("UPDATE ask_messages SET text = ?, state = 'done' WHERE id = ?").run(got.value, row.id);
  else
    db.prepare("UPDATE ask_messages SET state = 'failed', error = ? WHERE id = ?").run(
      `${got.why}: ${got.detail}`.slice(0, 300),
      row.id,
    );
  live.end(got.ok ? "done" : "failed", got.ok ? "" : got.why);
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

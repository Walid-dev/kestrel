// Ask on Tasks: what the page shows the model (the open tasks, each with its id and whom it is for, and the ones
// closed lately with their notes) and the changes it may propose, each a card I tap: add a task, change one's words
// or whom it is for, mark one done with a note of what was done.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { AskPage } from "../../ai/ask/prompt.ts";
import { Refused } from "../notes/documents.ts";
import { addTask, checkTask, closeTask, editTask, listTasks } from "./tasks.ts";

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function tasksPage(db: DatabaseSync, ref: string): AskPage | null {
  if (ref !== "tasks") return null;
  const open = listTasks(db, "open");
  const done = listTasks(db, "done").slice(0, 15);
  return {
    app: "Tasks",
    what: "my task list: one line each, for me or an agent, closed with a short note of what was done",
    title: "Tasks",
    link: "/tasks",
    context: [
      `OPEN (${open.length}):`,
      ...(open.length ? open.map((t) => `- ${t.id}: ${t.text}${t.who ? ` (for ${t.who})` : ""}`) : ["none"]),
      "",
      "CLOSED LATELY:",
      ...(done.length
        ? done.map((t) => `- ${short(t.text, 120)}${t.note ? ` — ${short(t.note, 120)}` : ""}`)
        : ["none"]),
    ].join("\n"),
    tools: [
      "WHAT YOU CAN DO HERE",
      "- You can't change the list yourself. To change it, propose the change: kestrel shows a card, and I make it with",
      "  a tap. Write one short line that says what the card does, then one block per change. Never say a change is",
      "  made, and never explain the block:",
      "```action",
      '{"do": "add", "text": "<the task, one line>", "who": ""}',
      "```",
      '  do: "add" (text, who: whom it is for, "" for me), "edit" (id, and text or who), "done" (id, note: what was done).',
      "- A task's id is the text that starts its line, before the colon: copy it exactly; never make one up.",
    ].join("\n"),
  };
}

const Action = z.discriminatedUnion("do", [
  z.object({ do: z.literal("add"), text: z.string().min(1).max(500), who: z.string().max(80).default("") }),
  z.object({
    do: z.literal("edit"),
    id: z.string().min(1).max(80),
    text: z.string().min(1).max(500).optional(),
    who: z.string().max(80).optional(),
  }),
  z.object({ do: z.literal("done"), id: z.string().min(1).max(80), note: z.string().max(500).default("") }),
]);

export function describeTask(db: DatabaseSync, _ref: string, action: unknown): string | null {
  const a = Action.safeParse(action);
  if (!a.success) return null;
  if (a.data.do === "add") return `Add “${short(a.data.text, 140)}”${a.data.who ? ` for ${a.data.who}` : ""}`;
  const id = a.data.id;
  const task = listTasks(db, "open").find((t) => t.id === id);
  if (!task) return null; // a task that isn't open, or an id made up
  if (a.data.do === "done")
    return `Mark “${short(task.text, 100)}” done${a.data.note ? `: ${short(a.data.note, 120)}` : ""}`;
  if (a.data.text === undefined && a.data.who === undefined) return null;
  return `Change “${short(task.text, 80)}”${a.data.text ? ` to “${short(a.data.text, 100)}”` : ""}${a.data.who !== undefined ? `, for ${a.data.who || "me"}` : ""}`;
}

export function runTask(db: DatabaseSync, _settings: unknown, ref: string, action: unknown): string {
  if (!describeTask(db, ref, action)) throw new Refused("that change can't be made any more");
  const a = Action.parse(action);
  if (a.do === "add") {
    addTask(db, a.text, a.who);
    return "Added.";
  }
  if (a.do === "edit") {
    editTask(db, a.id, { text: a.text, who: a.who });
    return "Changed.";
  }
  if (a.note.trim()) closeTask(db, a.id, a.note);
  else checkTask(db, a.id);
  return "Done.";
}

export const tasksHelper = { page: tasksPage, act: { describe: describeTask, run: runTask } };

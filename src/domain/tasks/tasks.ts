// Tasks: my to-do list, for me and for the agents to pick later, as the old Hub's was: each task for someone (any
// agent, Claude Code, dsh, me), its words edited in place. An agent closes one with a short note of what was done;
// I tick mine off without one. Nothing here decides for me.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Refused } from "../notes/documents.ts";

export type Task = {
  id: string;
  text: string;
  who: string;
  done: boolean;
  note: string;
  added: string;
  closed: string | null;
  edited: string | null;
};

const row = (r: Record<string, unknown>): Task => ({
  id: String(r.id),
  text: String(r.text),
  who: String(r.who),
  done: Number(r.done) === 1,
  note: String(r.note),
  added: String(r.added),
  closed: r.closed === null ? null : String(r.closed),
  edited: r.edited == null ? null : String(r.edited),
});

export function addTask(db: DatabaseSync, text: string, who = "", id: string = randomUUID()): Task {
  if (text.trim() === "") throw new Refused("a task needs its words");
  db.prepare("INSERT INTO tasks (id, text, who, added) VALUES (?, ?, ?, ?)").run(
    id,
    text.trim(),
    who.trim(),
    new Date().toISOString(),
  );
  const made = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown>;
  return row(made);
}

export function listTasks(db: DatabaseSync, which: "open" | "done" | "all" = "all"): Task[] {
  const where = which === "open" ? "WHERE done = 0" : which === "done" ? "WHERE done = 1" : "";
  return (db.prepare(`SELECT * FROM tasks ${where} ORDER BY done, added DESC`).all() as Record<string, unknown>[]).map(
    row,
  );
}

export function closeTask(db: DatabaseSync, id: string, note: string): Task {
  const had = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!had) throw new Refused("no such task");
  if (note.trim() === "") throw new Refused("closing a task takes a short note of what was done");
  db.prepare("UPDATE tasks SET done = 1, note = ?, closed = ? WHERE id = ?").run(
    note.trim(),
    new Date().toISOString(),
    id,
  );
  return row(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown>);
}

// my own tick: done, no note asked (an agent's close keeps its note)
export function checkTask(db: DatabaseSync, id: string): Task {
  const had = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!had) throw new Refused("no such task");
  db.prepare("UPDATE tasks SET done = 1, closed = ? WHERE id = ?").run(new Date().toISOString(), id);
  return row(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown>);
}

// its words or whom it is for, changed in place
export function editTask(db: DatabaseSync, id: string, change: { text?: string; who?: string }): Task {
  const had = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!had) throw new Refused("no such task");
  if (change.text !== undefined) {
    const text = change.text.trim();
    if (!text) throw new Refused("a task needs its words");
    db.prepare("UPDATE tasks SET text = ?, edited = ? WHERE id = ?").run(
      text.slice(0, 2000),
      new Date().toISOString(),
      id,
    );
  }
  if (change.who !== undefined) db.prepare("UPDATE tasks SET who = ? WHERE id = ?").run(change.who.trim(), id);
  return row(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown>);
}

export function deleteTask(db: DatabaseSync, id: string): void {
  const gone = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  if (gone.changes === 0) throw new Refused("no such task");
}

export function reopenTask(db: DatabaseSync, id: string): Task {
  const had = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!had) throw new Refused("no such task");
  db.prepare("UPDATE tasks SET done = 0, closed = NULL WHERE id = ?").run(id);
  return row(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown>);
}

// The one-time carry from the old Hub's tasks file: { "task:<id>": { text, for, at, done } }. Ids are kept, so a
// rerun updates rather than doubles; the old file stays the authority for done until its retirement.
export function importOldTasks(db: DatabaseSync, old: unknown): { landed: number; skipped: string[] } {
  const skipped: string[] = [];
  let landed = 0;
  if (old === null || typeof old !== "object") return { landed, skipped: ["the tasks file is not an object"] };
  const put = db.prepare(
    `INSERT INTO tasks (id, text, who, done, note, added, closed) VALUES (?, ?, ?, ?, '', ?, NULL)
     ON CONFLICT (id) DO UPDATE SET text = excluded.text, who = excluded.who, done = excluded.done`,
  );
  for (const [key, value] of Object.entries(old)) {
    if (!key.startsWith("task:")) continue;
    const v = (value ?? {}) as Record<string, unknown>;
    const text = typeof v.text === "string" ? v.text.trim() : "";
    if (!text) {
      skipped.push(`a task without words: ${key}`);
      continue;
    }
    put.run(
      key,
      text,
      typeof v.for === "string" ? v.for : "",
      v.done === true ? 1 : 0,
      typeof v.at === "string" && v.at ? v.at : new Date().toISOString(),
    );
    landed++;
  }
  return { landed, skipped };
}

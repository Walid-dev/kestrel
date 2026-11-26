// What runs now, for Live: each long piece of work registers, writes its steps with their time as it goes, and ends
// with how it went. Kept in memory (the last day's endings too); the server rings the live stream on every change.
// Watching costs nothing: no model, no file, just this list.
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export type Kind =
  | "search"
  | "deep"
  | "model"
  | "mirror"
  | "backup"
  | "lesson"
  | "task"
  | "apply"
  | "notes"
  | "listing"
  | "research"
  | "quiz"
  | "letter"
  | "news"
  | "shopping";
export type Activity = {
  id: string;
  kind: Kind;
  title: string;
  link: string; // where the page can open it
  started: string;
  steps: { at: string; text: string }[];
  ended: string | null;
  outcome: "done" | "failed" | null;
  note: string;
};

export const activity = new EventEmitter();
activity.setMaxListeners(20);
const live = new Map<string, Activity>();
const ended: Activity[] = []; // newest first; the last day, 200 at most
const DAY = 86_400_000;

export function begin(kind: Kind, title: string, link = "") {
  const a: Activity = {
    id: randomUUID(),
    kind,
    title,
    link,
    started: new Date().toISOString(),
    steps: [],
    ended: null,
    outcome: null,
    note: "",
  };
  live.set(a.id, a);
  activity.emit("change");
  return {
    // again: the last step, further along (a search's count as its collector reports it), takes the last step's place
    // instead of adding a line per count
    step(text: string, again = false) {
      if (a.ended) return;
      const step = { at: new Date().toISOString(), text };
      if (again && a.steps.length) a.steps[a.steps.length - 1] = step;
      else a.steps.push(step);
      if (a.steps.length > 60) a.steps.shift();
      activity.emit("change");
    },
    end(outcome: "done" | "failed", note = "") {
      if (a.ended) return;
      a.ended = new Date().toISOString();
      a.outcome = outcome;
      a.note = note.slice(0, 200);
      live.delete(a.id);
      ended.unshift(a);
      activity.emit("ended", a);
      const cut = Date.now() - DAY;
      while (ended.length > 200 || (ended.length && Date.parse(ended[ended.length - 1].started) < cut)) ended.pop();
      activity.emit("change");
    },
  };
}

export const running = (): Activity[] => [...live.values()];
export const finished = (): Activity[] => ended.filter((a) => Date.parse(a.started) >= Date.now() - DAY);

// a mark that takes no time (a lesson graded, a task done, a stage set): it lands in the log as it happens
export function record(kind: Kind, title: string, link = "", note = "") {
  const a = begin(kind, title, link);
  a.end("done", note);
}

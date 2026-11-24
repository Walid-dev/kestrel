// Tasks: my to-do list, for me and for the agents to pick later, the old Hub's way. A box to write the task and whom
// it is for (any agent, Claude Code, dsh, me: a choice for the new task, not a filter); Enter adds and the newest comes
// first. The tasks are one list of rows: a tap on a task's words edits them in place (Enter or leaving saves, Escape
// puts them back); its note under them, then one meta line, whom it is for (a tap changes it) and when, at every
// width; a round box ticks it off. On a computer the list keeps the wide column and the done tasks and Ask take a
// rail beside it; on a phone they follow under it. Agents read the same list through the kestrel command and close one
// with a note (the box's hint says so).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ask } from "./ask.tsx";
import { enterSends } from "./keys.ts";
import { useConfirm } from "./ui/confirm.tsx";
import { cx } from "./ui/cx.ts";
import { EmptyState } from "./ui/empty.tsx";
import { Field } from "./ui/field.tsx";
import { List } from "./ui/list.tsx";
import { Page } from "./ui/page.tsx";
import { Pills, type Tone } from "./ui/pills.tsx";

type Task = {
  id: string;
  text: string;
  who: string;
  done: boolean;
  note: string;
  added: string;
  closed: string | null;
  edited: string | null;
};

// whom a task is for, each in its own colour; a who kestrel doesn't know is muted (pink means needs me, nothing else)
const WHO: [string, string, Tone][] = [
  ["any", "any agent", "accent"],
  ["claude", "Claude Code", "purple"],
  ["dsh", "dsh", "cyan"],
  ["me", "me", "green"],
];
const whoOf = (w: string): [string, string, Tone] => WHO.find(([k]) => k === (w || "any")) ?? [w, w, "muted"];
// when, as the meta line says it (Nov 23) and as its hover says it whole (Mon, Nov 23, 9:01 PM)
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${res.status}`);
  return data;
}

export function Tasks() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [who, setWho] = useState("any");
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error(`the tasks didn't load (${res.status})`);
      return (await res.json()) as { tasks: Task[] };
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });
  const add = useMutation({
    mutationFn: () => call("/api/tasks", "POST", { text: text.trim(), who }),
    onSuccess: () => {
      setText("");
      refresh();
    },
  });
  const act = useMutation({
    mutationFn: (a: { id: string; how: "check" | "reopen" | "delete" | "edit"; change?: Partial<Task> }) =>
      a.how === "delete"
        ? call(`/api/tasks/${a.id}`, "DELETE")
        : a.how === "edit"
          ? call(`/api/tasks/${a.id}`, "PATCH", a.change)
          : call(`/api/tasks/${a.id}/${a.how}`, "POST"),
    onSettled: refresh,
  });
  const all = tasks.data?.tasks ?? [];
  const open = all.filter((t) => !t.done);
  const done = all.filter((t) => t.done);
  const failed = [tasks, add, act].find((x) => x.isError);

  return (
    <Page
      width="wide"
      title="Tasks"
      line={
        <span>
          <b className="text-ink">{open.length}</b> open
          {done.length > 0 && (
            <>
              {" · "}
              <b className="text-ink">{done.length}</b> done
            </>
          )}
        </span>
      }
    >
      <div className="tasks-layout">
        <div className="grid gap-6">
          {/* the new task: its words, whom it is for; Enter adds. The pills choose, they don't filter: no counts */}
          <div className="grid gap-3">
            <Field
              label="New task"
              placeholder="What needs doing?"
              value={text}
              onChange={setText}
              onSend={() => add.mutate()}
              busy={add.isPending}
              sendLabel="Add"
              hint="Enter adds · tap a task to edit it · agents take one only when I ask, and close it with a note"
            />
            <Pills
              label="For"
              showLabel
              options={WHO.map(([value, label, tone]) => ({ value, label, tone }))}
              value={who}
              onChange={setWho}
            />
          </div>

          {failed && <p className="m-0 text-detail text-red">{(failed.error as Error).message}</p>}

          {tasks.data && open.length === 0 && <EmptyState title="Nothing open." line="Write the next thing above." />}
          {open.length > 0 && (
            <List label="Open tasks">
              {open.map((t) => (
                <Row key={t.id} t={t} act={act.mutate} busy={act.isPending && act.variables?.id === t.id} />
              ))}
            </List>
          )}
        </div>

        <div className="grid gap-6">
          {done.length > 0 && (
            <details>
              <summary className="disclosure">Done · {done.length}</summary>
              <div className="mt-2">
                <List label="Done tasks">
                  {done.map((t) => (
                    <Row key={t.id} t={t} act={act.mutate} busy={act.isPending && act.variables?.id === t.id} />
                  ))}
                </List>
              </div>
            </details>
          )}
          <Ask
            app="tasks"
            refId="tasks"
            title="Ask about my tasks"
            placeholder="Add, change or close tasks in words"
            starters={["What should I do first?", "Group what is open by theme", "Which ones look done already?"]}
            onChange={refresh}
          />
        </div>
      </div>
    </Page>
  );
}

type Act = (a: { id: string; how: "check" | "reopen" | "delete" | "edit"; change?: Partial<Task> }) => void;

// one task: the round box, its words (a tap edits them), its note, whom it is for (a tap changes it) and when, delete
function Row({ t, act, busy }: { t: Task; act: Act; busy: boolean }) {
  const [draft, setDraft] = useState<string | null>(null); // the words being edited, or null
  const sure = useConfirm();
  const [, label, tone] = whoOf(t.who);
  const save = () => {
    const next = (draft ?? "").trim();
    setDraft(null);
    if (next && next !== t.text) act({ id: t.id, how: "edit", change: { text: next } });
  };
  const nextWho = () => {
    const i = WHO.findIndex(([k]) => k === (t.who || "any"));
    act({ id: t.id, how: "edit", change: { who: WHO[(i + 1) % WHO.length][0] } });
  };
  return (
    // a row of the list: the round box, the words (the row's target: a tap anywhere on it edits them, three lines at
    // most until then), the note under them, then the meta line: whom it is for, a target of its own above the row's,
    // and when; the ✕ at its end (styles.css, .task-row)
    <li className={cx("list-row task-row", busy && "busy")}>
      {/* the round box keeps its small look inside a round icon button, whose area takes the tap */}
      <button
        type="button"
        aria-label={t.done ? "Not done" : "Done"}
        title={t.done ? "Not done" : "Done"}
        aria-pressed={t.done}
        className="btn btn-icon btn-quiet task-tick"
        onClick={() => act({ id: t.id, how: t.done ? "reopen" : "check" })}
      >
        <span className={cx("task-box", t.done && "task-box-done")}>
          {t.done && (
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.4"
              aria-hidden="true"
            >
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          )}
        </span>
      </button>
      {draft === null ? (
        <button
          type="button"
          title="Tap to edit"
          className={cx("list-open task-text", t.done && "task-text-done")}
          onClick={() => setDraft(t.text)}
        >
          <span className="line-clamp-3">{t.text}</span>
        </button>
      ) : (
        <textarea
          // biome-ignore lint/a11y/noAutofocus: the tap that opened it asked for the words
          autoFocus
          aria-label="The task's words"
          className="task-edit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDraft(null);
            else enterSends(save)(e);
          }}
        />
      )}
      {t.note && <span className="list-line task-note">{t.note}</span>}
      <span className="list-line task-meta">
        <button
          type="button"
          className={cx("chip chip-caps task-who", `tone-${t.done ? "muted" : tone}`)}
          title="Tap to change whom it is for"
          aria-label={`For ${label}: tap to change`}
          onClick={nextWho}
        >
          {label}
        </button>
        <span className="font-mono tabular-nums" title={when(t.edited ?? t.added)}>
          {day(t.edited ?? t.added)}
        </span>
        {t.edited && <span>· edited</span>}
      </span>
      <button
        type="button"
        aria-label="Delete"
        title="Delete"
        className="card-remove task-x"
        onClick={async () => {
          const yes = await sure({
            title: "Delete this task?",
            body: `“${t.text.length > 80 ? `${t.text.slice(0, 80)}…` : t.text}”`,
            yes: "Delete",
            danger: true,
          });
          if (yes) act({ id: t.id, how: "delete" });
        }}
      >
        ✕
      </button>
    </li>
  );
}

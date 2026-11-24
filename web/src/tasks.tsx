// Tasks: my to-do list, for me and for the agents to pick later, the old Hub's way. A box to write the task and whom
// it is for (any agent, Claude Code, dsh, me); Enter adds and the newest comes first. A tap on a task's words edits them
// in place (Enter or leaving saves, Escape puts them back); its who, when and note under it; a round box ticks it off.
// Done tasks fold below. Agents read the same list through the kestrel command and close one with a note.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ask } from "./ask.tsx";
import { enterSends } from "./keys.ts";
import { Card } from "./ui/card.tsx";
import { useConfirm } from "./ui/confirm.tsx";
import { cx } from "./ui/cx.ts";
import { EmptyState } from "./ui/empty.tsx";
import { Field } from "./ui/field.tsx";
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

// whom a task is for, each in its own colour
const WHO: [string, string, Tone][] = [
  ["any", "any agent", "accent"],
  ["claude", "Claude Code", "purple"],
  ["dsh", "dsh", "cyan"],
  ["me", "me", "green"],
];
const whoOf = (w: string): [string, string, Tone] => WHO.find(([k]) => k === (w || "any")) ?? [w, w, "pink"];
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
    <Page width="reading" title="Tasks" line={`${open.length} open${done.length ? ` · ${done.length} done` : ""}`}>
      {/* the new task: its words, whom it is for; Enter adds */}
      <Card>
        <Field
          label="New task"
          placeholder="What needs doing?"
          value={text}
          onChange={setText}
          onSend={() => add.mutate()}
          busy={add.isPending}
          sendLabel="Add"
          hint="Enter adds · Shift+Enter for a new line"
        />
        <Pills
          label="For"
          showLabel
          options={WHO.map(([value, label, tone]) => ({ value, label, tone }))}
          value={who}
          onChange={setWho}
        />
      </Card>

      {failed && <p className="m-0 text-detail text-red">{(failed.error as Error).message}</p>}

      {tasks.data && open.length === 0 && <EmptyState title="Nothing open." line="Write the next thing above." />}
      {open.length > 0 && (
        <ol className="m-0 grid list-none gap-2 p-0">
          {open.map((t) => (
            <Row key={t.id} t={t} act={act.mutate} busy={act.isPending && act.variables?.id === t.id} />
          ))}
        </ol>
      )}

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer py-3 text-detail text-muted">Done · {done.length}</summary>
          <ol className="m-0 mt-2 grid list-none gap-2 p-0">
            {done.map((t) => (
              <Row key={t.id} t={t} act={act.mutate} busy={act.isPending && act.variables?.id === t.id} />
            ))}
          </ol>
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
      <p className="m-0 text-small text-muted">
        Tap a task to edit it. Agents read this list through the kestrel command, pick a task only when you ask, and
        close it with a short note of what was done.
      </p>
    </Page>
  );
}

type Act = (a: { id: string; how: "check" | "reopen" | "delete" | "edit"; change?: Partial<Task> }) => void;

// one task: the round box, its words (a tap edits them), whom it is for (a tap changes it), when, its note, delete
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
    <li className={cx("card grid grid-cols-[auto_1fr_auto] items-start gap-3 !p-3", busy && "busy")}>
      {/* the round box keeps its small look; the area that takes the tap is a thumb's size around it */}
      <button
        type="button"
        aria-label={t.done ? "Not done" : "Done"}
        aria-pressed={t.done}
        className={cx(
          "relative mt-0.5 grid h-[22px] w-[22px] place-items-center rounded-full border-2 text-page after:absolute after:-inset-3 after:rounded-full",
          t.done ? "border-green bg-green" : "border-line bg-transparent",
        )}
        onClick={() => act({ id: t.id, how: t.done ? "reopen" : "check" })}
      >
        {t.done && (
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.4"
            aria-hidden="true"
          >
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        )}
      </button>
      <div className="min-w-0">
        {draft === null ? (
          <button
            type="button"
            title="Tap to edit"
            className={cx(
              "-mx-1 block w-full cursor-text whitespace-pre-wrap wrap-anywhere rounded-md px-1 text-left text-body",
              t.done ? "text-muted line-through" : "text-strong",
            )}
            onClick={() => setDraft(t.text)}
          >
            {t.text}
          </button>
        ) : (
          <textarea
            // biome-ignore lint/a11y/noAutofocus: the tap that opened it asked for the words
            autoFocus
            aria-label="The task's words"
            className="-mx-1 field-sizing-content w-full resize-none rounded-md bg-surface-2 px-1 text-body text-strong outline-none ring-1 ring-line"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) =>
              e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)
            }
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDraft(null);
              else enterSends(save)(e);
            }}
          />
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-small text-muted">
          {/* the chip's tap area grows mostly downward: upward it stops short of the words above, so a tap meant to
              edit them never changes whom the task is for */}
          <button
            type="button"
            className={cx(
              "chip relative after:absolute after:-inset-x-1 after:-top-1.5 after:-bottom-5",
              `tone-${t.done ? "muted" : tone}`,
            )}
            title="Tap to change whom it is for"
            onClick={nextWho}
          >
            {label}
          </button>
          <span>
            {when(t.edited ?? t.added)}
            {t.edited ? " · edited" : ""}
          </span>
          {t.note && <span className="basis-full text-green">{t.note}</span>}
        </div>
      </div>
      <button
        type="button"
        aria-label="Delete"
        title="Delete"
        className="card-remove"
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

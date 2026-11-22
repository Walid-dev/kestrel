// Tasks: my to-do list, for me and for the agents to pick later, the old Hub's way. A box to write the task and whom
// it is for (any agent, Claude Code, dsh, me); Enter adds and the newest comes first. A tap on a task's words edits them
// in place (Enter or leaving saves, Escape puts them back); its who, when and note under it; a round box ticks it off.
// Done tasks fold below. Agents read the same list through the kestrel command and close one with a note.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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
const WHO: [string, string, string][] = [
  ["any", "any agent", "tone-accent"],
  ["claude", "Claude Code", "tone-purple"],
  ["dsh", "dsh", "tone-cyan"],
  ["me", "me", "tone-green"],
];
const whoOf = (w: string) => WHO.find(([k]) => k === (w || "any")) ?? [w, w, "tone-pink"];
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
    <main className="grid max-w-3xl gap-3.5">
      <div className="flex items-baseline gap-3">
        <h2 className="font-cond m-0 text-[34px] font-bold uppercase leading-none tracking-tight">Tasks</h2>
        <span className="text-[13px]" style={{ color: "var(--muted)" }}>
          {open.length} open{done.length ? ` · ${done.length} done` : ""}
        </span>
      </div>

      {/* the new task: its words, whom it is for, Enter adds */}
      <section className="card grid gap-2.5 !p-3" style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.12)" }}>
        <textarea
          className="min-h-[46px] w-full resize-none bg-transparent px-1 py-1 text-[16px] leading-relaxed outline-none"
          style={{ color: "var(--strong)", fieldSizing: "content" } as React.CSSProperties}
          rows={1}
          placeholder="What needs doing?"
          aria-label="New task"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && text.trim()) {
              e.preventDefault();
              add.mutate();
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">For</span>
          {WHO.map(([k, label, tone]) => (
            <button key={k} type="button" className={`pill ${tone}`} aria-pressed={who === k} onClick={() => setWho(k)}>
              <span className="dot" /> {label}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-primary ml-auto inline-flex items-center gap-2"
            disabled={!text.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            {add.isPending && <span className="spin" />}
            Add
          </button>
        </div>
        <p className="m-0 text-[12px]" style={{ color: "var(--muted)" }}>
          Enter adds · Shift+Enter for a new line
        </p>
      </section>

      {failed && (
        <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
          {(failed.error as Error).message}
        </p>
      )}

      {tasks.data && open.length === 0 && (
        <p
          className="m-0 rounded-xl border border-dashed p-5 text-center text-sm"
          style={{ color: "var(--muted)", borderColor: "var(--line)" }}
        >
          Nothing open. Write the next thing above.
        </p>
      )}
      <ol className="m-0 grid list-none gap-2 p-0">
        {open.map((t) => (
          <Row key={t.id} t={t} act={act.mutate} busy={act.isPending && act.variables?.id === t.id} />
        ))}
      </ol>

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[13.5px]" style={{ color: "var(--muted)" }}>
            Done · {done.length}
          </summary>
          <ol className="m-0 mt-2 grid list-none gap-2 p-0">
            {done.map((t) => (
              <Row key={t.id} t={t} act={act.mutate} busy={act.isPending && act.variables?.id === t.id} />
            ))}
          </ol>
        </details>
      )}
      <p className="m-0 text-[12px]" style={{ color: "var(--muted)" }}>
        Tap a task to edit it. Agents read this list through the kestrel command, pick a task only when you ask, and
        close it with a short note of what was done.
      </p>
    </main>
  );
}

type Act = (a: { id: string; how: "check" | "reopen" | "delete" | "edit"; change?: Partial<Task> }) => void;

// one task: the round box, its words (a tap edits them), whom it is for (a tap changes it), when, its note, delete
function Row({ t, act, busy }: { t: Task; act: Act; busy: boolean }) {
  const [draft, setDraft] = useState<string | null>(null); // the words being edited, or null
  const [label, , tone] = whoOf(t.who);
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
    <li className={`card grid grid-cols-[auto_1fr_auto] items-start gap-3 !p-3 ${busy ? "busy" : ""}`}>
      <button
        type="button"
        aria-label={t.done ? "Not done" : "Done"}
        aria-pressed={t.done}
        className="mt-0.5 grid h-[22px] w-[22px] place-items-center rounded-full border-2"
        style={{
          borderColor: t.done ? "var(--green)" : "var(--line)",
          background: t.done ? "var(--green)" : "transparent",
          color: "var(--bg)",
        }}
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
            className="-mx-1 block w-full cursor-text rounded-md px-1 text-left text-[15.5px] leading-relaxed"
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              color: t.done ? "var(--muted)" : "var(--strong)",
              textDecoration: t.done ? "line-through" : undefined,
            }}
            onClick={() => setDraft(t.text)}
          >
            {t.text}
          </button>
        ) : (
          <textarea
            // biome-ignore lint/a11y/noAutofocus: the tap that opened it asked for the words
            autoFocus
            aria-label="The task's words"
            className="-mx-1 w-full resize-none rounded-md px-1 text-[15.5px] leading-relaxed outline-none"
            style={
              {
                fieldSizing: "content",
                color: "var(--strong)",
                background: "var(--surface-2)",
                boxShadow: "0 0 0 2px var(--accent)",
              } as React.CSSProperties
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) =>
              e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)
            }
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") setDraft(null);
            }}
          />
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--muted)" }}>
          <button
            type="button"
            className={`chip ${t.done ? "tone-muted" : tone}`}
            title="Tap to change whom it is for"
            onClick={nextWho}
          >
            {label}
          </button>
          <span>
            {when(t.edited ?? t.added)}
            {t.edited ? " · edited" : ""}
          </span>
          {t.note && (
            <span className="basis-full" style={{ color: "var(--green)" }}>
              {t.note}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-label="Delete"
        title="Delete"
        className="rounded-lg px-2 py-0.5 text-[18px] leading-none"
        style={{ color: "var(--muted)" }}
        onClick={() => {
          if (confirm(`Delete "${t.text.slice(0, 60)}"?`)) act({ id: t.id, how: "delete" });
        }}
      >
        ×
      </button>
    </li>
  );
}

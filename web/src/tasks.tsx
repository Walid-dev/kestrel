// Tasks: one line each. Enter adds; closing asks for the short note of what was done; done rows fold below.
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
};

// each person's tasks wear one colour, so a glance tells whose they are
const TONES = ["tone-accent", "tone-purple", "tone-yellow", "tone-orange", "tone-green", "tone-pink"];
const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const ago = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return Number.isNaN(days) ? "" : days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

export function Tasks() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [closing, setClosing] = useState(""); // the task whose note box is open
  const [note, setNote] = useState("");
  const [unfold, setUnfold] = useState(false);
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error(`the tasks didn't load (${res.status})`);
      return (await res.json()) as { tasks: Task[] };
    },
  });
  const done = async (res: Response) => {
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "the server refused it");
    return data;
  };
  const add = useMutation({
    mutationFn: async (words: string) =>
      done(
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: words }),
        }),
      ),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  const close = useMutation({
    mutationFn: async (input: { id: string; note: string }) =>
      done(
        await fetch(`/api/tasks/${input.id}/close`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: input.note }),
        }),
      ),
    onSuccess: () => {
      setClosing("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  const reopen = useMutation({
    mutationFn: async (id: string) => done(await fetch(`/api/tasks/${id}/reopen`, { method: "POST" })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
  const open = (tasks.data?.tasks ?? []).filter((t) => !t.done);
  const closed = (tasks.data?.tasks ?? []).filter((t) => t.done);
  const why = [add, close, reopen].find((m) => m.isError);
  return (
    <main className="grid gap-3.5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-cond m-0 text-[34px] font-bold uppercase leading-none tracking-tight">Tasks</h2>
        <span className="chip tone-pink">{open.length} open</span>
        <span className="chip tone-green">{closed.length} done</span>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate(text);
        }}
      >
        <input
          type="text"
          className="btn min-w-0 flex-1"
          placeholder="one line: what needs doing"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={add.isPending || !text.trim()}>
          Add
        </button>
      </form>
      {why && (
        <p className="text-sm" style={{ color: "var(--red)" }}>
          {String((why.error as Error).message)}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {open.map((t) => (
          <section
            key={t.id}
            className={`card card-link grid content-start gap-2 ${TONES[hash(t.who || "me") % TONES.length]}`}
            style={{ borderLeft: "3px solid var(--tone)" }}
          >
            <div className="flex items-center gap-2">
              <span className="chip">{t.who ? `for ${t.who}` : "for me"}</span>
              <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                {ago(t.added)}
              </span>
            </div>
            <p className="font-cond m-0 text-[18px] font-bold leading-snug" style={{ color: "var(--strong)" }}>
              {t.text}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                className="btn shrink-0"
                style={{ borderColor: "var(--green)", color: "var(--green)" }}
                onClick={() => {
                  setClosing((v) => (v === t.id ? "" : t.id));
                  setNote("");
                }}
              >
                ✓ Done
              </button>
            </div>
            {closing === t.id && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim()) close.mutate({ id: t.id, note });
                }}
              >
                <input
                  type="text"
                  className="btn min-w-0 flex-1"
                  placeholder="what was done, in a few words (Enter saves)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  // the note box just opened; the keyboard should be there already
                  // biome-ignore lint/a11y/noAutofocus: the box exists only after the Done tap
                  autoFocus
                />
                <button type="submit" className="btn btn-primary" disabled={close.isPending || !note.trim()}>
                  Save
                </button>
              </form>
            )}
          </section>
        ))}
      </div>
      {tasks.isError && (
        <p className="text-sm" style={{ color: "var(--red)" }}>
          {String((tasks.error as Error).message)}
        </p>
      )}
      {open.length === 0 && tasks.data && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Nothing open.
        </p>
      )}
      {closed.length > 0 && !unfold && (
        <button type="button" className="btn btn-quiet" onClick={() => setUnfold(true)}>
          {closed.length} done
        </button>
      )}
      {unfold &&
        closed.map((t) => (
          <section key={t.id} className="card flex items-baseline gap-3" style={{ opacity: 0.75 }}>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {t.text}
              {t.note && <span> — {t.note}</span>}
            </p>
            <button type="button" className="btn btn-quiet ml-auto shrink-0" onClick={() => reopen.mutate(t.id)}>
              Reopen
            </button>
          </section>
        ))}
      {unfold && (
        <button type="button" className="btn btn-quiet" onClick={() => setUnfold(false)}>
          fold the done away
        </button>
      )}
    </main>
  );
}

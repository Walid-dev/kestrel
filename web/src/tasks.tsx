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

export function Tasks() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [closing, setClosing] = useState(""); // the task whose note box is open
  const [note, setNote] = useState("");
  const [unfold, setUnfold] = useState(false);
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await (await fetch("/api/tasks")).json()) as { tasks: Task[] },
  });
  const done = async (res: Response) => {
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? `${res.status}`);
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
      <h2 className="font-cond text-xl font-bold">Tasks</h2>
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
      {open.map((t) => (
        <section key={t.id} className="card grid gap-2">
          <div className="flex items-baseline gap-3">
            <p className="font-cond min-w-0 flex-1 font-bold">{t.text}</p>
            {t.who && (
              <span className="font-mono shrink-0 text-[11px]" style={{ color: "var(--muted)" }}>
                for {t.who}
              </span>
            )}
            <button
              type="button"
              className="btn btn-quiet shrink-0"
              onClick={() => {
                setClosing((v) => (v === t.id ? "" : t.id));
                setNote("");
              }}
            >
              Close
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
                placeholder="what was done, in a few words"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                // the note box just opened; the keyboard should be there already
                // biome-ignore lint/a11y/noAutofocus: the box exists only after the Close tap
                autoFocus
              />
              <button type="submit" className="btn btn-primary" disabled={close.isPending || !note.trim()}>
                Done
              </button>
            </form>
          )}
        </section>
      ))}
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

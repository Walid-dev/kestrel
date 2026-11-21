// The Models screen: which model each use runs on. The door's models are the choices; one tap switches a use, the
// settings file stays the fallback.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type UseRow = { use: string; what: string; model: string; fallback: string };

export function Models() {
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: ["models"],
    queryFn: async () => {
      const res = await fetch("/api/models");
      if (!res.ok) throw new Error(`models: ${res.status}`);
      return (await res.json()) as { door: string[]; uses: UseRow[] };
    },
  });
  const set = useMutation({
    mutationFn: async (body: { use: string; model: string }) => {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["models"] }),
  });
  if (state.isError)
    return (
      <main className="grid gap-3.5">
        <h2 className="font-cond text-xl font-bold">Models</h2>
        <section className="card">
          <p className="text-sm" style={{ color: "var(--red)" }}>
            the screen could not load the picks: {String((state.error as Error).message)}
          </p>
        </section>
      </main>
    );
  if (!state.data) return null;
  const { door, uses } = state.data;
  const switchWhy = set.isError ? String((set.error as Error).message) : "";
  return (
    <main className="grid gap-3.5">
      <h2 className="font-cond text-xl font-bold">Models</h2>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Which model runs each job. The choices are what the computer's model door offers right now
        {door.length === 0 && " — the door isn't answering, so only the current picks show"}.
      </p>
      {switchWhy && (
        <p className="text-sm" style={{ color: "var(--red)" }}>
          the switch was refused: {switchWhy}
        </p>
      )}
      {uses.map((u) => (
        <section key={u.use} className="card grid gap-2">
          <div className="flex items-baseline gap-3">
            <h3 className="font-cond text-lg font-bold">{u.use}</h3>
            <span className="font-mono ml-auto text-[11px]" style={{ color: "var(--muted)" }}>
              fallback {u.fallback}
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {u.what}
          </p>
          <div className="flex flex-wrap gap-2">
            {(door.length ? door : [u.model]).map((m) => (
              <button
                key={m}
                type="button"
                className="btn"
                style={
                  m === u.model
                    ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" }
                    : undefined
                }
                disabled={set.isPending}
                onClick={() => set.mutate({ use: u.use, model: m })}
              >
                {m}
              </button>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

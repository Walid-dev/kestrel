// A search's settings, the old hunt page's Settings: this search (name, what it looks for, on or paused, how often),
// where it looks (the collector and its words), and what makes a good match (titles, skills, level, pay, places,
// freshness; a deal's price cap). New makes one from nothing. Saving writes the search's own file in the data folder,
// checked first; fields this page doesn't show are kept as they are.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

type Raw = Record<string, unknown>;
type Words = { want?: unknown; avoid?: unknown };

const list = (v: unknown): string => (Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "");
const split = (s: string): string[] =>
  s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 60);
// the collector's knobs this page names; any other stays as written
const KNOBS: [string, string, string][] = [
  ["TERM_WORDS", "Search words", "what the sites are asked for"],
  ["LOCATION", "Place", "a city, or remote"],
  ["HOURS_OLD", "Posted within (hours)", "older postings are skipped"],
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child passed in, which a wrapping label names
    <label className="grid gap-1">
      <span className="text-[13px] font-semibold" style={{ color: "var(--strong)" }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[12px]" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function SearchSettings() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editing = params.get("spec") ?? "";
  const fresh = params.get("new") === "deals" ? "deals" : "jobs";
  const [raw, setRaw] = useState<Raw | null>(null);
  const [id, setId] = useState(editing);
  const loaded = useQuery({
    queryKey: ["spec", editing],
    queryFn: async () => {
      const res = await fetch(`/api/search/specs/${encodeURIComponent(editing)}`);
      const data = (await res.json()) as { spec?: Raw; collectors?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      return data as { spec: Raw; collectors: string[] };
    },
    enabled: Boolean(editing),
  });
  const collectors = useQuery({
    queryKey: ["collectors"],
    queryFn: async () => (await (await fetch("/api/search/collectors")).json()) as { collectors: string[] },
  });
  useEffect(() => {
    if (editing && loaded.data) setRaw(loaded.data.spec);
    if (!editing && (!raw || raw.kind !== fresh))
      setRaw({
        name: "",
        kind: fresh,
        collector: "",
        about: "",
        enabled: true,
        everyMinutes: 360,
        env: {},
        scoring:
          fresh === "deals"
            ? { title: { want: [], avoid: [] }, price: { cap: 0 }, places: { words: [] }, freshDays: 7 }
            : {
                title: { want: [], avoid: [] },
                skills: [],
                level: { want: [], avoid: [] },
                pay: { floor: 0 },
                places: { words: [], remoteOk: true },
                freshDays: 7,
              },
      });
  }, [editing, loaded.data, fresh, raw]);
  const save = useMutation({
    mutationFn: async () => {
      const target = editing || id;
      const res = await fetch(`/api/search/specs/${encodeURIComponent(target)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(raw),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      return target;
    },
    onSuccess: (target) => navigate(`/searches?hunt=${encodeURIComponent(`${String(raw?.kind ?? "jobs")}:${target}`)}`),
  });

  if (loaded.isError)
    return (
      <main className="grid gap-3">
        <Link to="/searches" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Searches
        </Link>
        <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
          {String((loaded.error as Error).message)}
        </p>
      </main>
    );
  if (!raw) return null;
  const kind = raw.kind === "deals" ? "deals" : "jobs";
  const scoring = (raw.scoring ?? {}) as Record<string, unknown>;
  const env = (raw.env ?? {}) as Record<string, string>;
  const put = (patch: Raw) => setRaw((r) => ({ ...(r ?? {}), ...patch }));
  const putScore = (patch: Raw) => put({ scoring: { ...scoring, ...patch } });
  const putEnv = (k: string, v: string) => {
    const next = { ...env };
    if (v) next[k] = v;
    else delete next[k];
    put({ env: next });
  };
  const title = (scoring.title ?? {}) as Words;
  const level = (scoring.level ?? {}) as Words;
  const pay = (scoring.pay ?? {}) as { floor?: number };
  const price = (scoring.price ?? {}) as { cap?: number };
  const places = (scoring.places ?? {}) as { words?: unknown; remoteOk?: boolean };
  const others = Object.entries(env).filter(([k]) => !KNOBS.some(([n]) => n === k));

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-4">
      <Link to="/searches" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
        ← Searches
      </Link>
      <h2 className="font-cond m-0 text-[30px] font-bold uppercase leading-none tracking-tight">
        {editing ? `${String(raw.name || editing)} · Settings` : `A new ${kind === "jobs" ? "job" : "deal"} search`}
      </h2>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!save.isPending) save.mutate();
        }}
      >
        <section className="card grid gap-3">
          <span className="eyebrow">This search</span>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name">
              <input
                className="btn"
                value={String(raw.name ?? "")}
                onChange={(e) => {
                  put({ name: e.target.value });
                  if (!editing) setId(slug(e.target.value));
                }}
                placeholder={kind === "jobs" ? "Full-stack AI engineer" : "Office chair"}
              />
            </Field>
            {!editing && (
              <Field label="Its file name" hint="lowercase words and dashes">
                <input className="btn font-mono" value={id} onChange={(e) => setId(slug(e.target.value))} />
              </Field>
            )}
            <Field label="What it looks for" hint="one line, shown under the search's name">
              <input className="btn" value={String(raw.about ?? "")} onChange={(e) => put({ about: e.target.value })} />
            </Field>
            <Field
              label="How often"
              hint={raw.auto === false ? "only when you press Search now" : "hours between searches"}
            >
              <div className="flex gap-2">
                <input
                  className="btn min-w-0 flex-1"
                  type="number"
                  min={1}
                  disabled={raw.auto === false}
                  value={Math.round(Number(raw.everyMinutes ?? 360) / 60)}
                  onChange={(e) => put({ everyMinutes: Math.max(1, Number(e.target.value) || 1) * 60 })}
                />
                <button
                  type="button"
                  className="pill shrink-0"
                  aria-pressed={raw.auto === false}
                  onClick={() => put({ auto: raw.auto === false })}
                >
                  Only when I ask
                </button>
              </div>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {!editing &&
              (["jobs", "deals"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`pill ${k === "jobs" ? "tone-accent" : "tone-orange"}`}
                  aria-pressed={kind === k}
                  onClick={() => navigate(`/searches/settings?new=${k}`, { replace: true })}
                >
                  <span className="dot" /> {k === "jobs" ? "Jobs" : "Deals"}
                </button>
              ))}
            <button
              type="button"
              className="pill tone-green"
              aria-pressed={raw.enabled !== false}
              onClick={() => put({ enabled: true })}
            >
              <span className="dot" /> On
            </button>
            <button
              type="button"
              className="pill tone-muted"
              aria-pressed={raw.enabled === false}
              onClick={() => put({ enabled: false })}
            >
              <span className="dot" /> Paused
            </button>
          </div>
        </section>

        <section className="card grid gap-3">
          <span className="eyebrow">Where it looks</span>
          <Field label="Collector" hint="a script in the data folder's collectors; it prints the listings it finds">
            <select
              className="btn"
              value={String(raw.collector ?? "")}
              onChange={(e) => put({ collector: e.target.value })}
            >
              <option value="">Pick a collector</option>
              {[...new Set([...(collectors.data?.collectors ?? []), String(raw.collector ?? "")].filter(Boolean))].map(
                (c) => (
                  <option key={c} value={c}>
                    {c.replace(/^collectors\//, "")}
                  </option>
                ),
              )}
            </select>
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            {KNOBS.map(([k, label, hint]) => (
              <Field key={k} label={label} hint={hint}>
                <input className="btn" value={env[k] ?? ""} onChange={(e) => putEnv(k, e.target.value)} />
              </Field>
            ))}
          </div>
          {others.map(([k, v]) => (
            <Field key={k} label={k}>
              <input className="btn font-mono" value={v} onChange={(e) => putEnv(k, e.target.value)} />
            </Field>
          ))}
        </section>

        <section className="card grid gap-3">
          <span className="eyebrow">What makes a good match</span>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Titles to look for" hint="commas between them">
              <input
                className="btn"
                value={list(title.want)}
                onChange={(e) => putScore({ title: { ...title, want: split(e.target.value) } })}
              />
            </Field>
            <Field label="Titles to avoid">
              <input
                className="btn"
                value={list(title.avoid)}
                onChange={(e) => putScore({ title: { ...title, avoid: split(e.target.value) } })}
              />
            </Field>
            {kind === "jobs" ? (
              <>
                <Field label="Skills" hint="each one named in a posting adds to its score">
                  <input
                    className="btn"
                    value={list(scoring.skills)}
                    onChange={(e) => putScore({ skills: split(e.target.value) })}
                  />
                </Field>
                <Field label="Lowest pay, a year" hint="hourly and monthly pay are turned into a year first">
                  <input
                    className="btn"
                    type="number"
                    min={0}
                    value={pay.floor ?? 0}
                    onChange={(e) => putScore({ pay: { ...pay, floor: Number(e.target.value) || 0 } })}
                  />
                </Field>
                <Field label="Levels to look for">
                  <input
                    className="btn"
                    value={list(level.want)}
                    onChange={(e) => putScore({ level: { ...level, want: split(e.target.value) } })}
                  />
                </Field>
                <Field label="Levels to avoid">
                  <input
                    className="btn"
                    value={list(level.avoid)}
                    onChange={(e) => putScore({ level: { ...level, avoid: split(e.target.value) } })}
                  />
                </Field>
              </>
            ) : (
              <Field label="Price cap" hint="an ad over it is set aside">
                <input
                  className="btn"
                  type="number"
                  min={0}
                  value={price.cap ?? 0}
                  onChange={(e) => putScore({ price: { cap: Number(e.target.value) || 0 } })}
                />
              </Field>
            )}
            <Field label="Places" hint="a place named in the listing scores as near">
              <input
                className="btn"
                value={list(places.words)}
                onChange={(e) => putScore({ places: { ...places, words: split(e.target.value) } })}
              />
            </Field>
            <Field label="Fresh within (days)">
              <input
                className="btn"
                type="number"
                min={1}
                value={Number(scoring.freshDays ?? 7)}
                onChange={(e) => putScore({ freshDays: Math.max(1, Number(e.target.value) || 1) })}
              />
            </Field>
          </div>
          {kind === "jobs" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="pill tone-green"
                aria-pressed={places.remoteOk !== false}
                onClick={() => putScore({ places: { ...places, remoteOk: places.remoteOk === false } })}
              >
                <span className="dot" /> Remote counts as near
              </button>
            </div>
          )}
        </section>

        {save.isError && (
          <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
            {String((save.error as Error).message)}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={save.isPending || (!editing && !id)}>
            {save.isPending ? "Saving…" : editing ? "Save" : "Make the search"}
          </button>
          <Link to="/searches" className="btn btn-quiet">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}

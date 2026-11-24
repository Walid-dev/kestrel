// A search's settings, the old hunt page's Settings: this search (name, what it looks for, on or paused, how often),
// where it looks (the collector and its words), and what makes a good match (titles, skills, level, pay, places,
// freshness; a deal's price cap). New makes one from nothing. Saving writes the search's own file in the data folder,
// checked first; fields this page doesn't show are kept as they are.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Page } from "../ui/page.tsx";
import { Pills } from "../ui/pills.tsx";
import { Seg } from "../ui/seg.tsx";

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

// a setting: its name over its box, a hint under it
function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child passed in, which a wrapping label names
    <label className="grid content-start gap-1">
      <span className="text-small font-semibold text-strong">{label}</span>
      {children}
      {hint && <span className="text-small text-muted">{hint}</span>}
    </label>
  );
}

// a choice of two, as the shared bar: its name over it (read out as the group's name)
function Choice<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [V, string][];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-small font-semibold text-strong" aria-hidden="true">
        {label}
      </span>
      <Seg
        label={label}
        options={options.map(([v, name]) => ({ value: v, label: name }))}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

export function SearchSettings() {
  const navigate = useNavigate();
  const hintId = useId();
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
      <Page title="Settings" back={{ to: "/searches", label: "Searches" }} width="reading">
        <p className="m-0 text-detail text-red">{String((loaded.error as Error).message)}</p>
      </Page>
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
  const places = (scoring.places ?? {}) as { words?: unknown; remoteOk?: boolean; within?: unknown; closed?: unknown };
  const others = Object.entries(env).filter(([k]) => !KNOBS.some(([n]) => n === k));
  // the collectors in the data folder, and the one this search names even when its file has gone
  const pickable = [...new Set([...(collectors.data?.collectors ?? []), String(raw.collector ?? "")].filter(Boolean))];

  return (
    <Page
      back={{ to: "/searches", label: "Searches" }}
      eyebrow={editing ? "Settings" : undefined}
      title={editing ? String(raw.name || editing) : `A new ${kind === "jobs" ? "job" : "deal"} search`}
      width="reading"
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!save.isPending) save.mutate();
        }}
      >
        <section className="card grid gap-3">
          <span className="eyebrow">This search</span>
          <div className="grid gap-3 md:grid-cols-2">
            <Labeled label="Name">
              <input
                className="input"
                value={String(raw.name ?? "")}
                onChange={(e) => {
                  put({ name: e.target.value });
                  if (!editing) setId(slug(e.target.value));
                }}
                placeholder={kind === "jobs" ? "Full-stack AI engineer" : "Office chair"}
              />
            </Labeled>
            {!editing && (
              <Labeled label="Its file name" hint="lowercase words and dashes">
                <input className="input font-mono" value={id} onChange={(e) => setId(slug(e.target.value))} />
              </Labeled>
            )}
            <Labeled label="What it looks for" hint="one line, shown under the search's name">
              <input
                className="input"
                value={String(raw.about ?? "")}
                onChange={(e) => put({ about: e.target.value })}
              />
            </Labeled>
            <Labeled
              label="How often"
              hint={raw.auto === false ? "only when you press Search now" : "hours between searches"}
            >
              <div className="flex items-center gap-2">
                <input
                  className="input flex-1"
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
            </Labeled>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {!editing && (
              <Choice
                label="What it finds"
                options={[
                  ["jobs", "Jobs"],
                  ["deals", "Deals"],
                ]}
                value={kind}
                onChange={(k) => navigate(`/searches/settings?new=${k}`, { replace: true })}
              />
            )}
            <Choice
              label="State"
              options={[
                ["on", "On"],
                ["paused", "Paused"],
              ]}
              value={raw.enabled === false ? "paused" : "on"}
              onChange={(v) => put({ enabled: v === "on" })}
            />
          </div>
        </section>

        <section className="card grid gap-3">
          <span className="eyebrow">Where it looks</span>
          {/* every collector in sight, one tap to pick: pills, the app's way to choose, never a dropdown */}
          <div className="grid gap-1">
            <span className="text-small font-semibold text-strong" aria-hidden="true">
              Collector
            </span>
            {pickable.length > 0 ? (
              <Pills
                label="Collector"
                options={pickable.map((c) => ({ value: c, label: c.replace(/^collectors\//, "") }))}
                value={String(raw.collector ?? "") || null}
                onChange={(c) => put({ collector: c })}
                describedBy={hintId}
              />
            ) : (
              <p className="m-0 text-small text-muted">
                {collectors.isPending ? "Loading the collectors…" : "No collector yet."}
              </p>
            )}
            <span id={hintId} className="text-small text-muted">
              a script in the data folder's collectors; it prints the listings it finds
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {KNOBS.map(([k, label, hint]) => (
              <Labeled key={k} label={label} hint={hint}>
                <input className="input" value={env[k] ?? ""} onChange={(e) => putEnv(k, e.target.value)} />
              </Labeled>
            ))}
          </div>
          {others.map(([k, v]) => (
            <Labeled key={k} label={k}>
              <input className="input font-mono" value={v} onChange={(e) => putEnv(k, e.target.value)} />
            </Labeled>
          ))}
        </section>

        <section className="card grid gap-3">
          <span className="eyebrow">What makes a good match</span>
          <div className="grid gap-3 md:grid-cols-2">
            <Labeled label="Titles to look for" hint="commas between them">
              <input
                className="input"
                value={list(title.want)}
                onChange={(e) => putScore({ title: { ...title, want: split(e.target.value) } })}
              />
            </Labeled>
            <Labeled label="Titles to avoid">
              <input
                className="input"
                value={list(title.avoid)}
                onChange={(e) => putScore({ title: { ...title, avoid: split(e.target.value) } })}
              />
            </Labeled>
            {kind === "jobs" ? (
              <>
                <Labeled label="Skills" hint="each one named in a posting adds to its score">
                  <input
                    className="input"
                    value={list(scoring.skills)}
                    onChange={(e) => putScore({ skills: split(e.target.value) })}
                  />
                </Labeled>
                <Labeled label="Lowest pay, a year" hint="hourly and monthly pay are turned into a year first">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={pay.floor ?? 0}
                    onChange={(e) => putScore({ pay: { ...pay, floor: Number(e.target.value) || 0 } })}
                  />
                </Labeled>
                <Labeled label="Levels to look for">
                  <input
                    className="input"
                    value={list(level.want)}
                    onChange={(e) => putScore({ level: { ...level, want: split(e.target.value) } })}
                  />
                </Labeled>
                <Labeled label="Levels to avoid">
                  <input
                    className="input"
                    value={list(level.avoid)}
                    onChange={(e) => putScore({ level: { ...level, avoid: split(e.target.value) } })}
                  />
                </Labeled>
              </>
            ) : (
              <Labeled label="Price cap" hint="an ad over it is set aside">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={price.cap ?? 0}
                  onChange={(e) => putScore({ price: { cap: Number(e.target.value) || 0 } })}
                />
              </Labeled>
            )}
            <Labeled label="Places" hint="a place named in the listing scores as near">
              <input
                className="input"
                value={list(places.words)}
                onChange={(e) => putScore({ places: { ...places, words: split(e.target.value) } })}
              />
            </Labeled>
            {kind === "jobs" && (
              <Labeled label="Open only in" hint="a job open only elsewhere is set aside; the first word names it">
                <input
                  className="input"
                  value={list(places.within)}
                  onChange={(e) => putScore({ places: { ...places, within: split(e.target.value) } })}
                />
              </Labeled>
            )}
            {kind === "jobs" && (
              <Labeled label="Not open when the posting says" hint="words that keep people elsewhere out">
                <input
                  className="input"
                  value={list(places.closed)}
                  onChange={(e) => putScore({ places: { ...places, closed: split(e.target.value) } })}
                />
              </Labeled>
            )}
            <Labeled label="Fresh within (days)">
              <input
                className="input"
                type="number"
                min={1}
                value={Number(scoring.freshDays ?? 7)}
                onChange={(e) => putScore({ freshDays: Math.max(1, Number(e.target.value) || 1) })}
              />
            </Labeled>
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

        {save.isError && <p className="m-0 text-detail text-red">{String((save.error as Error).message)}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary btn-big" disabled={save.isPending || (!editing && !id)}>
            {save.isPending ? "Saving…" : editing ? "Save" : "Make the search"}
          </button>
          <Link to="/searches" className="btn btn-quiet">
            Cancel
          </Link>
        </div>
      </form>
    </Page>
  );
}

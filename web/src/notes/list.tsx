// Notes' front door: the documents already here, the files my folders offer, and Upload. Opening either leads to the
// reader.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { DocumentMeta } from "../../../src/shared/notes.ts";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

export function NotesList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [why, setWhy] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const docs = useQuery({
    queryKey: ["docs"],
    queryFn: () => getJson<{ documents: DocumentMeta[] }>("/api/notes/documents"),
  });
  const files = useQuery({
    queryKey: ["files"],
    queryFn: () => getJson<{ files: { path: string; name: string }[] }>("/api/notes/files"),
  });
  const open = useMutation({
    mutationFn: async (body: { kind: "open" | "upload"; payload: Record<string, string> }) => {
      const res = await fetch(`/api/notes/${body.kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body.payload),
      });
      const data = (await res.json()) as DocumentMeta & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      return data;
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["docs"] });
      navigate(`/notes/${doc.id}`);
    },
    onError: (e) => setWhy(e.message),
  });

  const opened = new Set((docs.data?.documents ?? []).map((d) => d.path).filter(Boolean));
  const offered = (files.data?.files ?? []).filter((f) => !opened.has(f.path));

  return (
    <main className="grid gap-3.5">
      <div className="flex items-baseline">
        <h2 className="font-cond text-xl font-bold">Notes</h2>
        <button
          type="button"
          className="font-mono ml-auto cursor-pointer rounded-full border px-3 py-1 text-xs"
          style={{ borderColor: "var(--line)", color: "var(--accent)" }}
          onClick={() => file.current?.click()}
        >
          Upload a text
        </button>
        <input
          ref={file}
          type="file"
          accept=".md,.markdown,.txt,.text"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) open.mutate({ kind: "upload", payload: { name: f.name, text: await f.text() } });
            e.target.value = "";
          }}
        />
      </div>
      {why && (
        <p
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--warn-soft)" }}
        >
          {why}
        </p>
      )}
      {(docs.data?.documents ?? []).map((d) => (
        <div key={d.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label={`Pick ${d.name} for a set`}
            checked={picked.includes(d.id)}
            onChange={(e) => setPicked((p) => (e.target.checked ? [...p, d.id] : p.filter((x) => x !== d.id)))}
            className="h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <Link
            to={`/notes/${d.id}`}
            className="min-w-0 flex-1 rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-px"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            <span className="font-cond text-lg font-bold">{d.name}</span>
            <span className="font-mono mt-1 block break-all text-xs" style={{ color: "var(--muted)" }}>
              {d.source === "upload" ? "upload" : d.path} · {Math.max(1, Math.round(d.chars / 1000))}k characters
            </span>
          </Link>
        </div>
      ))}
      {picked.length >= 2 && (
        <Link
          to={`/notes/set?ids=${picked.join(",")}`}
          className="font-cond rounded-xl px-4 py-2 text-center font-bold"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          Review {picked.length} together →
        </Link>
      )}
      {docs.data && docs.data.documents.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Nothing opened yet. Pick a file below, or upload one.
        </p>
      )}
      {offered.length > 0 && (
        <section
          className="rounded-2xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <h3 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
            From your folders
          </h3>
          <ul className="mt-2 grid gap-1.5">
            {offered.map((f) => (
              <li key={f.path}>
                <button
                  type="button"
                  className="cursor-pointer text-sm underline-offset-4 hover:underline"
                  style={{ color: "var(--accent)" }}
                  onClick={() => open.mutate({ kind: "open", payload: { path: f.path } })}
                >
                  {f.name}
                </button>
                <span className="font-mono block break-all text-xs" style={{ color: "var(--muted)" }}>
                  {f.path}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {files.data && files.data.files.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No folders are listed yet (settings.json, notes.folders), so Upload is the way in.
        </p>
      )}
    </main>
  );
}

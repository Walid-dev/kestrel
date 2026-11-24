// Notes' documents: the ones already here, the files my folders offer, and Upload. Notes itself opens on the last
// document I worked on; this list is its switcher, and the start when nothing is open yet. A row is its name, where
// it comes from and when it came; Select shows the ticks (for a set reviewed together) and each row's Forget.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { DocumentMeta } from "../../../src/shared/notes.ts";
import { useConfirm } from "../ui/confirm.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { List, Row } from "../ui/list.tsx";
import { Page } from "../ui/page.tsx";
import { sentence, shortPath } from "./parts.tsx";
import { LAST_DOC } from "./reader.tsx";

// the day a document came in, short ("Nov 24"), with the year when it isn't this one
const added = (iso: string) => {
  const d = new Date(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? undefined : "numeric";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year });
};

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
  // Select: the rows' ticks and Forget show; otherwise a row is one tap that opens it
  const [selecting, setSelecting] = useState(false);
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

  const sure = useConfirm();
  const forget = useMutation({
    mutationFn: async (d: DocumentMeta) => {
      const yes = await sure({
        title: `Forget ${d.name}?`,
        body:
          d.source === "upload"
            ? "An upload is gone for good, with its notes."
            : "The file stays in its folder; its notes here go.",
        yes: "Forget",
        danger: true,
      });
      if (!yes) return;
      await fetch(`/api/notes/documents/${d.id}`, { method: "DELETE" });
      setPicked((p) => p.filter((x) => x !== d.id));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["docs"] }),
  });
  // Notes opens on the document I last worked on; the list is the switcher (?list=1), or the start when none is open
  useEffect(() => {
    if (!docs.data || new URLSearchParams(location.search).has("list")) return;
    let last = "";
    try {
      last = localStorage.getItem(LAST_DOC) ?? "";
    } catch {
      // storage off: the list it is
    }
    if (last && docs.data.documents.some((d) => d.id === last)) navigate(`/notes/${last}`, { replace: true });
  }, [docs.data, navigate]);
  const documents = docs.data?.documents ?? [];
  const opened = new Set(documents.map((d) => d.path).filter(Boolean));
  const offered = (files.data?.files ?? []).filter((f) => !opened.has(f.path));
  // two names alike (two folders' plan.md): those rows show their whole path, so they can be told apart
  const names = [...documents.map((d) => d.name), ...offered.map((f) => f.name)];
  const clash = (name: string) => names.indexOf(name) !== names.lastIndexOf(name);
  const where = (path: string, name: string) => (
    <span className={clash(name) ? "font-mono min-w-0 break-all" : "font-mono min-w-0 truncate"} title={path}>
      {clash(name) ? path : shortPath(path).replace(/\/[^/]*$/, "")}
    </span>
  );
  // filled only as the empty page's one next step; beside a list of documents it is a plain button
  const upload = (filled: boolean) => (
    <button type="button" className={filled ? "btn btn-primary" : "btn"} onClick={() => file.current?.click()}>
      Upload a text
    </button>
  );

  return (
    <Page
      title="Notes"
      line="Read a document and leave notes on its words."
      // with nothing here yet, Upload is the empty state's own button; Select once there are two to pick
      actions={
        documents.length > 0 && (
          <>
            {documents.length > 1 && (
              <button
                type="button"
                className="btn"
                aria-pressed={selecting}
                title="Tick documents to review them together, or forget one"
                onClick={() => {
                  setSelecting((v) => !v);
                  setPicked([]);
                }}
              >
                {selecting ? "Done" : "Select"}
              </button>
            )}
            {upload(false)}
          </>
        )
      }
    >
      <input
        ref={file}
        type="file"
        accept="text/*,.md,.markdown,.txt,.text,.csv,.json,.rst,.org,.yaml,.yml,.toml,.ini,.log,.pdf,application/pdf"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            // the raw bytes go up, base64, so the server judges the file's own encoding
            const raw = new Uint8Array(await f.arrayBuffer());
            let bin = "";
            for (let i = 0; i < raw.length; i += 0x8000) bin += String.fromCharCode(...raw.subarray(i, i + 0x8000));
            open.mutate({ kind: "upload", payload: { name: f.name, bytes: btoa(bin) } });
          }
          e.target.value = "";
        }}
      />
      {why && (
        <p role="alert" className="m-0 rounded-lg border border-line bg-warn-soft px-3 py-2 text-detail">
          {sentence(why)}
        </p>
      )}
      {docs.data && documents.length === 0 ? (
        <EmptyState
          title="No documents yet."
          line={
            offered.length > 0
              ? "Upload a text or a PDF, or open a file from your folders below."
              : "Upload a text or a PDF to read it here and leave notes on its words."
          }
          action={upload(true)}
          // the setting is the fix only when no folder is listed
          detail={files.data && files.data.files.length === 0 ? "settings.json · notes.folders" : undefined}
        />
      ) : (
        documents.length > 0 && (
          <section className="grid gap-3" aria-label="My documents">
            {/* one list: each document's name opens it; its line says where it comes from (a chip) and its folder;
                its end says when it came, or, while selecting, holds the tick for a set and the ✕ */}
            <List cols>
              {documents.map((d) => (
                <Row
                  key={d.id}
                  to={`/notes/${d.id}`}
                  title={d.name}
                  line={
                    <span className="notes-line">
                      <span className="chip chip-caps tone-muted">{d.path ? "file" : "upload"}</span>
                      {d.path && where(d.path, d.name)}
                    </span>
                  }
                  end={
                    !selecting ? (
                      <span className="font-mono text-small text-muted tabular-nums">{added(d.addedAt)}</span>
                    ) : (
                      <>
                        <label className="notes-pick">
                          <input
                            type="checkbox"
                            aria-label={`Pick ${d.name} for a set`}
                            checked={picked.includes(d.id)}
                            onChange={(e) =>
                              setPicked((p) => (e.target.checked ? [...p, d.id] : p.filter((x) => x !== d.id)))
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="card-remove"
                          aria-label={`Forget ${d.name}`}
                          title={`Forget ${d.name}`}
                          disabled={forget.isPending && forget.variables?.id === d.id}
                          onClick={() => forget.mutate(d)}
                        >
                          ✕
                        </button>
                      </>
                    )
                  }
                />
              ))}
            </List>
            {selecting && picked.length >= 2 && (
              <Link to={`/notes/set?ids=${picked.join(",")}`} className="btn btn-primary justify-self-start">
                Review {picked.length} together →
              </Link>
            )}
          </section>
        )
      )}
      {offered.length > 0 && (
        <section className="grid gap-2" aria-labelledby="notes-folders">
          <h2 id="notes-folders" className="font-cond m-0 text-section">
            From your folders
          </h2>
          <List cols>
            {offered.map((f) => (
              <Row
                key={f.path}
                title={f.name}
                line={open.isPending && open.variables?.payload.path === f.path ? "Opening…" : where(f.path, f.name)}
                onOpen={() => {
                  if (!open.isPending) open.mutate({ kind: "open", payload: { path: f.path } });
                }}
              />
            ))}
          </List>
        </section>
      )}
    </Page>
  );
}

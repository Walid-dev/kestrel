// Several documents reviewed together: notes on each, one ask, one overview that covers them all — and each
// document's changes save on their own (the review's Save buttons, one per document).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { DocumentMeta, Draft, PlacedNote } from "../../../src/shared/notes.ts";
import { Review } from "./review.tsx";

export function NotesSet() {
  const [params] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  const queryClient = useQueryClient();
  const [speed, setSpeed] = useState<"careful" | "fast">("careful");
  const [review, setReview] = useState(false);
  const [why, setWhy] = useState("");
  const [saveWhy, setSaveWhy] = useState("");

  const docs = useQuery({
    queryKey: ["docs"],
    queryFn: async () => {
      const res = await fetch("/api/notes/documents");
      if (!res.ok) throw new Error(`documents: ${res.status}`);
      return (await res.json()) as { documents: DocumentMeta[] };
    },
  });
  const notes = useQuery({
    queryKey: ["set-notes", ids.join(",")],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      for (const id of ids) {
        const res = await fetch(`/api/notes/documents/${id}/notes`);
        counts[id] = res.ok
          ? ((await res.json()) as { notes: PlacedNote[] }).notes.filter((n) => n.state === "open").length
          : 0;
      }
      return counts;
    },
  });
  const draft = useQuery({
    queryKey: ["draft", ids[0] ?? ""],
    queryFn: async () => {
      const res = await fetch(`/api/notes/documents/${ids[0]}/draft`);
      if (!res.ok) throw new Error(`draft: ${res.status}`);
      return (await res.json()) as { draft: Draft | null };
    },
    enabled: ids.length > 0,
    refetchInterval: (q) => (q.state.data?.draft?.status === "making" ? 2000 : false),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["draft", ids[0] ?? ""] });
    for (const id of ids) {
      queryClient.invalidateQueries({ queryKey: ["doc", id] });
      queryClient.invalidateQueries({ queryKey: ["notes", id] });
    }
  };
  const ask = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notes/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documents: ids, speed }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSuccess: () => setWhy(""),
    onError: (e) => setWhy(e.message),
    onSettled: refresh,
  });
  const saveDoc = useMutation({
    mutationFn: async (documentId: string) => {
      const res = await fetch(`/api/notes/drafts/${draft.data?.draft?.id}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: documentId }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSuccess: () => setSaveWhy(""),
    onError: (e) => setSaveWhy(e.message),
    onSettled: refresh,
  });
  const discard = useMutation({
    mutationFn: async (draftId: string) => {
      await fetch(`/api/notes/drafts/${draftId}/discard`, { method: "POST" });
    },
    onSettled: () => {
      setReview(false);
      refresh();
    },
  });

  const picked = (docs.data?.documents ?? []).filter((d) => ids.includes(d.id));
  const current = draft.data?.draft ?? null;
  // when the ask finishes while I watch, the changes open by themselves
  const wasMaking = useRef(false);
  useEffect(() => {
    if (current?.status === "ready" && wasMaking.current) setReview(true);
    wasMaking.current = current?.status === "making";
  }, [current?.status]);
  const setDraft = current && ids.every((id) => current.documents.some((d) => d.id === id)) ? current : null;
  return (
    <main className="grid gap-3.5">
      <h2 className="font-cond text-xl font-bold">Review together</h2>
      {picked.map((d) => (
        <Link
          key={d.id}
          to={`/notes/${d.id}`}
          className="rounded-2xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <span className="font-cond text-lg font-bold">{d.name}</span>
          <span className="font-mono ml-3 text-xs" style={{ color: "var(--muted)" }}>
            {notes.data?.[d.id] ?? "…"} open notes
          </span>
        </Link>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {(!setDraft || setDraft.status === "failed") && (
          <>
            <button type="button" className="btn btn-primary" disabled={ask.isPending} onClick={() => ask.mutate()}>
              Ask for changes on {ids.length} documents
            </button>
            <div
              className="font-mono flex overflow-hidden rounded-full border text-xs"
              style={{ borderColor: "var(--line)" }}
            >
              {(["careful", "fast"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="cursor-pointer px-3 py-1.5"
                  style={
                    speed === s
                      ? { background: "var(--accent-soft)", color: "var(--accent)" }
                      : { color: "var(--muted)" }
                  }
                  onClick={() => setSpeed(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
        {setDraft?.status === "making" && (
          <span className="font-mono flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <span className="block h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
            the model is writing…
          </span>
        )}
        {setDraft?.status === "ready" && (
          <button type="button" className="btn btn-primary" onClick={() => setReview(true)}>
            Review the changes
          </button>
        )}
        {setDraft?.status === "failed" && (
          <button type="button" className="btn btn-danger" onClick={() => discard.mutate(setDraft.id)}>
            the ask failed — clear it
          </button>
        )}
      </div>
      {(why || setDraft?.status === "failed") && (
        <p
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--warn-soft)" }}
        >
          {why || setDraft?.error}
        </p>
      )}
      {review && setDraft?.status === "ready" && (
        <Review
          draft={setDraft}
          targets={Object.fromEntries(picked.map((d) => [d.id, d.path ?? "the upload, kept in kestrel"]))}
          texts={Object.fromEntries(Object.entries(setDraft.perDocument).map(([k, v]) => [k, v.oldText]))}
          onSave={(documentId) => saveDoc.mutate(documentId)}
          saving={saveDoc.isPending}
          saveWhy={saveWhy}
          onDiscard={() => discard.mutate(setDraft.id)}
          onClose={() => setReview(false)}
        />
      )}
    </main>
  );
}

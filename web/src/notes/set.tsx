// Several documents reviewed together: notes on each, one Apply, one overview that covers them all — and each
// document's changes save on their own (the review's Save buttons, one per document, each with its Keep or Drop).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { DocumentMeta, Draft, PlacedNote } from "../../../src/shared/notes.ts";
import { EmptyState } from "../ui/empty.tsx";
import { List, Row } from "../ui/list.tsx";
import { Page } from "../ui/page.tsx";
import { Apply } from "./apply.tsx";
import type { Pace } from "./parts.tsx";
import { Review } from "./review.tsx";

export function NotesSet() {
  const [params] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  const queryClient = useQueryClient();
  const [speed, setSpeed] = useState<Pace>("careful");
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
      const all: Record<string, PlacedNote[]> = {};
      for (const id of ids) {
        const res = await fetch(`/api/notes/documents/${id}/notes`);
        all[id] = res.ok ? ((await res.json()) as { notes: PlacedNote[] }).notes : [];
      }
      return all;
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
    queryClient.invalidateQueries({ queryKey: ["set-notes", ids.join(",")] });
    for (const id of ids) {
      queryClient.invalidateQueries({ queryKey: ["doc", id] });
      queryClient.invalidateQueries({ queryKey: ["notes", id] });
    }
  };
  const ask = useMutation({
    mutationFn: async () => {
      // Try again: the failed draft goes first, so only the new one stays
      const failed = draft.data?.draft;
      if (failed?.status === "failed") await fetch(`/api/notes/drafts/${failed.id}/discard`, { method: "POST" });
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
    mutationFn: async (input: { documentId: string; keep: number[] }) => {
      const res = await fetch(`/api/notes/drafts/${draft.data?.draft?.id}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: input.documentId, keep: input.keep }),
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
      setWhy("");
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
  const openNotes = Object.values(notes.data ?? {})
    .flat()
    .filter((n) => n.state === "open").length;
  const back = { to: "/notes?list=1", label: "Notes" };
  if (docs.data && picked.length === 0)
    return (
      <Page title="Review together" back={back}>
        <EmptyState
          title="No documents picked."
          line="Tick two documents or more in Notes, then Review them together."
          action={
            <Link to="/notes?list=1" className="btn btn-primary">
              Pick documents
            </Link>
          }
        />
      </Page>
    );
  return (
    <Page
      title="Review together"
      back={back}
      line="One Apply covers every document here; each one's changes save on their own."
    >
      <List cols label="The documents">
        {picked.map((d) => {
          const open = notes.data?.[d.id]?.filter((n) => n.state === "open").length;
          return (
            <Row
              key={d.id}
              title={d.name}
              to={`/notes/${d.id}`}
              end={
                <span className={`chip chip-caps ${open ? "tone-pink" : "tone-muted"}`}>
                  {open === undefined ? "…" : `${open} open note${open === 1 ? "" : "s"}`}
                </span>
              }
            />
          );
        })}
      </List>
      <div className="grid justify-items-start gap-2">
        <Apply
          open={openNotes}
          draft={setDraft}
          speed={speed}
          onSpeed={setSpeed}
          onApply={() => ask.mutate()}
          applying={ask.isPending}
          askWhy={why}
          onStop={() => setDraft && discard.mutate(setDraft.id)}
          onReview={() => setReview(true)}
          onDismiss={() => (setDraft?.status === "failed" ? discard.mutate(setDraft.id) : setWhy(""))}
        />
      </div>
      {review && setDraft?.status === "ready" && (
        <Review
          draft={setDraft}
          targets={Object.fromEntries(picked.map((d) => [d.id, d.path ?? "the upload, kept in kestrel"]))}
          texts={Object.fromEntries(Object.entries(setDraft.perDocument).map(([k, v]) => [k, v.oldText]))}
          noteText={Object.fromEntries(
            Object.values(notes.data ?? {})
              .flat()
              .map((n) => [n.id, n.text]),
          )}
          onSave={(documentId, keep) => saveDoc.mutate({ documentId, keep })}
          saving={saveDoc.isPending}
          saveWhy={saveWhy}
          onDiscard={() => discard.mutate(setDraft.id)}
          onClose={() => setReview(false)}
        />
      )}
    </Page>
  );
}

// The reader: the document as written, styled line by line (headings, bullets, fenced code), the text kept exact.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams } from "react-router";
import type { DocumentFull } from "../../../src/shared/notes.ts";

type Line = { n: number; text: string; kind: "h1" | "h2" | "h3" | "bullet" | "fence" | "code" | "blank" | "plain" };

export function lineKinds(text: string): Line[] {
  const out: Line[] = [];
  let inFence = false;
  const push = (text: string, kind: Line["kind"]) => out.push({ n: out.length, text, kind });
  for (const raw of text.split("\n")) {
    if (/^\s*```/.test(raw)) {
      push(raw, "fence");
      inFence = !inFence;
    } else if (inFence) push(raw, "code");
    else if (raw.startsWith("# ")) push(raw, "h1");
    else if (raw.startsWith("## ")) push(raw, "h2");
    else if (raw.startsWith("### ")) push(raw, "h3");
    else if (/^\s*[-*] /.test(raw)) push(raw, "bullet");
    else if (raw.trim() === "") push(raw, "blank");
    else push(raw, "plain");
  }
  return out;
}

const LOOK: Record<Line["kind"], string> = {
  h1: "font-cond text-2xl font-bold mt-4",
  h2: "font-cond text-xl font-bold mt-3",
  h3: "font-cond text-lg font-bold mt-2",
  bullet: "",
  fence: "font-mono text-sm",
  code: "font-mono text-sm",
  blank: "h-4",
  plain: "",
};

export function Reader() {
  const { id } = useParams();
  const doc = useQuery({
    queryKey: ["doc", id],
    queryFn: async () => {
      const res = await fetch(`/api/notes/documents/${id}`);
      if (!res.ok) throw new Error(`document: ${res.status}`);
      return (await res.json()) as DocumentFull;
    },
  });
  const lines = useMemo(() => (doc.data ? lineKinds(doc.data.text) : []), [doc.data]);
  if (doc.isError)
    return (
      <p
        className="rounded-xl border px-4 py-3 text-sm"
        style={{ borderColor: "var(--line)", background: "var(--warn-soft)" }}
      >
        This document didn't open: {String(doc.error.message)}
      </p>
    );
  if (!doc.data) return null;
  return (
    <main>
      <p className="font-mono mb-3 text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
        {doc.data.name}
      </p>
      <article
        className="rounded-2xl border p-5 leading-relaxed"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      >
        {lines.map((ln) => (
          <div
            key={ln.n}
            className={LOOK[ln.kind]}
            style={ln.kind === "code" || ln.kind === "fence" ? { color: "var(--muted)" } : undefined}
          >
            {ln.text || " "}
          </div>
        ))}
      </article>
    </main>
  );
}

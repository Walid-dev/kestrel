// The ask: the documents and my notes, with the answer's shape spelled out. The model proposes; the code places
// (src/domain/notes/place.ts) and I decide on the review screen. This module sees plain values only.
export type PromptDocument = { name: string; text: string };
export type PromptNote = { id: string; document: string; quote: string; text: string };

export function changesPrompt(documents: PromptDocument[], notes: PromptNote[]): { system: string; prompt: string } {
  const system = [
    "You rewrite exactly what the notes ask, in the writer's own documents, and nothing else.",
    'Answer JSON only, in this shape: {"overview": "<ONE string: a plain sentence or two per document, naming each document>",',
    '"changes": [{"document": "<name>", "find": "<the exact text to replace, copied from the document>",',
    '"replace": "<the new text, empty to remove>", "notes": ["<the ids this change answers>"]}],',
    '"unanswered": [{"note": "<id>", "reason": "<why the text alone cannot answer it>"}]}.',
    "Rules: copy find exactly, character for character, from the document it names; when the same words repeat,",
    "include enough surrounding text to point at the right one; answer every note or excuse it under unanswered;",
    "never invent a change no note asked for. Write plainly: the point first, short sentences.",
  ].join(" ");
  const parts: string[] = [];
  for (const d of documents) parts.push(`DOCUMENT ${d.name}:\n${d.text}`);
  parts.push(
    `THE NOTES:\n${notes
      .map(
        (n) =>
          `- ${n.id}, on ${n.quote === "" ? `the whole of ${n.document}` : `"${n.quote}" in ${n.document}`}: ${n.text}`,
      )
      .join("\n")}`,
  );
  return { system, prompt: parts.join("\n\n") };
}

// Small parts Notes' pages share: the reader and the set apply notes the same way, show a file's place the same way,
// and put the server's reasons in words the same way.
import { Seg } from "../ui/seg.tsx";

// the server's reasons start in lower case, as they read in its log; on screen a sentence starts with a capital
export const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// a model's failure in plain words: the server writes "the model didn't answer well: <kind> — <detail>", the kind
// being the client's outcome (src/ai/client.ts). Anything else (the ask itself refused) is already a sentence.
const KINDS: Record<string, string> = {
  down: "the computer's model isn't running (asleep or off)",
  timeout: "the model took too long",
  "too-long": "the document is too long for the model",
  unlisted: "the picked model isn't offered any more (see Models)",
  refusal: "the model stopped before it finished",
  shape: "the model's answer wasn't in the expected form",
};
export function plainWhy(error: string): string {
  const kind = /^the model didn't answer well: ([a-z-]+)/.exec(error)?.[1];
  return kind ? (KINDS[kind] ?? "the model didn't answer") : error;
}

// where a file is, short: the home folder as ~, and only the folder it sits in before its name
// ("~/…/documents/plan.md"); the whole path goes in the title, a hover or a long press away
export function shortPath(path: string): string {
  const home = path.replace(/^\/(?:Users|home)\/[^/]+(?=\/)/, "~");
  const parts = home.split("/");
  return parts.length > 4 ? `${parts[0] || ""}/…/${parts.slice(-2).join("/")}` : home;
}

// a PDF's text: the upload keeps the PDF's name (src/domain/notes/pdf.ts), and only a PDF upload may
export const isPdfText = (d: { name: string; source: string }) => d.source === "upload" && /\.pdf$/i.test(d.name);

// where a document comes from, as its chip says it on the list and in the reader alike
export const sourceOf = (d: { name: string; source: string }) =>
  isPdfText(d) ? "pdf" : d.source === "upload" ? "upload" : "file";

export type Pace = "careful" | "fast";

const PACES: { value: Pace; label: string; hint: string }[] = [
  { value: "careful", label: "Careful", hint: "Careful: the better edit, a few minutes" },
  { value: "fast", label: "Fast", hint: "Fast: quick, for small fixes" },
];

// which model applies the notes, with what each means under the bar; where a row has no room for that line (the
// phone's bar), the meaning stays in each option's title
export function Speed({ value, onChange, hint = true }: { value: Pace; onChange: (v: Pace) => void; hint?: boolean }) {
  return (
    <Seg
      label="Which model applies the notes"
      options={PACES.map((p) => ({
        value: p.value,
        label: <span title={p.hint}>{p.label}</span>,
        hint: hint ? p.hint : undefined,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}

// the model's pace, read from its name
export const paceOf = (model: string): Pace =>
  model.includes("Qwen") || model.includes("careful") ? "careful" : "fast";

// "the note", "3 notes"
export const notesWord = (n: number) => (n === 1 ? "the note" : `${n} notes`);

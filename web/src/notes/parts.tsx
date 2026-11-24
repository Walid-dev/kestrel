// Small parts Notes' pages share: the reader and Review together ask for an edit the same way, and every page shows
// the server's reasons the same way.

// the server's reasons start in lower case, as they read in its log; on screen a sentence starts with a capital
export const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type Pace = "careful" | "fast";

// which model writes the edit: one small switch, beside the button that asks
export function Speed({ value, onChange }: { value: Pace; onChange: (v: Pace) => void }) {
  return (
    <fieldset className="seg seg-modes note-speed" aria-label="Which model writes the edit">
      {(
        [
          ["careful", "Careful"],
          ["fast", "Fast"],
        ] as const
      ).map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </fieldset>
  );
}

// the model at work on the edit, named by its pace
export function Writing({ model }: { model: string }) {
  const pace = model.includes("Qwen") || model.includes("careful") ? "careful" : "fast";
  return (
    <span className="font-mono flex items-center gap-2 text-small text-muted" role="status">
      <span className="block size-2 animate-pulse rounded-full bg-accent" />
      The {pace} model is writing…
    </span>
  );
}

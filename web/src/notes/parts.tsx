// Small parts Notes' pages share: the reader and Review together ask for an edit the same way, and every page shows
// the server's reasons the same way.
import { Seg } from "../ui/seg.tsx";

// the server's reasons start in lower case, as they read in its log; on screen a sentence starts with a capital
export const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type Pace = "careful" | "fast";

// which model writes the edit: a small switch, beside the button that asks (no hint line: the toolbar stays one row)
export function Speed({ value, onChange }: { value: Pace; onChange: (v: Pace) => void }) {
  return (
    <Seg
      label="Which model writes the edit"
      options={[
        { value: "careful", label: "Careful" },
        { value: "fast", label: "Fast" },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

// the model at work on the edit, named by its pace
export function Writing({ model }: { model: string }) {
  const pace = model.includes("Qwen") || model.includes("careful") ? "careful" : "fast";
  return (
    <span className="font-mono flex items-center gap-2 text-small text-muted" role="status">
      <span className="dot tone-accent pulse" />
      The {pace} model is writing…
    </span>
  );
}

// /design: every shared part in its states, with made-up content and a line on when to use it. A new part is reviewed
// here before a page uses it. Out of the menu, reached by its address. The look lives in styles.css, the parts in
// web/src/ui/; this page only shows them.
import { type ReactNode, useState } from "react";
import type { Drawing as D } from "../../src/shared/blocks.ts";
import { Drawing } from "./drawing.tsx";
import { useConfirm } from "./ui/confirm.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Pills, type Tone } from "./ui/pills.tsx";

const COLOURS: { group: string; when: string; tokens: [string, string][] }[] = [
  {
    group: "Ground",
    when: "the surfaces, from the page up",
    tokens: [
      ["--bg", "the page"],
      ["--surface", "cards and boxes"],
      ["--surface-2", "sunk parts, the picked pill"],
      ["--line", "hairlines"],
    ],
  },
  {
    group: "Ink",
    when: "the words",
    tokens: [
      ["--strong", "headings"],
      ["--text", "body"],
      ["--muted", "secondary lines"],
    ],
  },
  {
    group: "The lead",
    when: "one colour that means act here",
    tokens: [
      ["--accent", "primary buttons, links, focus"],
      ["--accent-soft", "the active chip's ground"],
    ],
  },
  {
    group: "The working colours",
    when: "one meaning each, through the tones",
    tokens: [
      ["--green", "done, ok, diff plus"],
      ["--red", "danger, diff minus"],
      ["--orange", "warnings, deals"],
      ["--yellow", "waiting, the moon"],
      ["--purple", "Ask, deep work"],
      ["--pink", "the wolf, note marks"],
      ["--cyan", "drawings' fifth colour"],
    ],
  },
  {
    group: "The money scale",
    when: "a pay or a price, great to poor",
    tokens: [
      ["--great", "great"],
      ["--good", "good"],
      ["--fair", "fair"],
      ["--poor", "poor"],
    ],
  },
];

const TONES: Tone[] = ["accent", "green", "yellow", "orange", "red", "purple", "pink", "cyan", "muted"];

// a made-up topic's lessons: the long list the quiz will show
const LESSONS = [
  "What a model is",
  "Tokens",
  "The context window",
  "Prompts that work",
  "Examples in a prompt",
  "Temperature",
  "Embeddings",
  "Search by meaning",
  "Retrieval before answering",
  "Chunking a document",
  "Tools a model can call",
  "Agents and their loops",
  "Evals",
  "A judge model",
  "Hallucination and how to catch it",
  "Fine-tuning, and when not to",
  "Running a model on your own computer",
  "Quantization",
  "Speed: tokens per second",
  "Cost per answer",
  "Streaming the answer",
  "Structured answers",
  "Safety and refusals",
  "Privacy: what leaves the computer",
  "Putting it together",
].map((name, i) => ({ value: `l${i + 1}`, label: name, hint: `${4 + ((i * 5) % 9)} min` }));

const DRAWINGS: D[] = [
  { kind: "flow", title: "From a question to an answer", steps: ["Ask", "Search", "Read the pages", "Write"] },
  {
    kind: "compare",
    items: [
      { title: "Quick", points: ["One search", "An answer in a minute"] },
      { title: "Deep", points: ["Many searches", "Every page read", "A report"] },
    ],
  },
  {
    kind: "tree",
    title: "A hive",
    root: "The colony",
    branches: [
      { label: "Workers", leaves: ["Forage", "Build wax"] },
      { label: "Drones", leaves: ["Mate"] },
      { label: "The queen", leaves: ["Lays eggs"] },
    ],
  },
  {
    kind: "timeline",
    title: "A made-up week",
    events: [
      { when: "Monday", what: "The plan" },
      { when: "Wednesday", what: "The first draft" },
      { when: "Friday", what: "The review" },
    ],
  },
  {
    kind: "chart",
    title: "Jars sold",
    unit: "jars",
    bars: [
      { label: "Spring", value: 40 },
      { label: "Summer", value: 95 },
      { label: "Autumn", value: 60 },
    ],
  },
  { kind: "callout", tone: "tip", title: "Tip", text: "A short **tip** beside the point it helps." },
  { kind: "callout", tone: "warn", title: "Watch out", text: "A warning before the step that can go wrong." },
  { kind: "check", q: "What does Esc do in a box?", a: "It closes it, like Back and a tap outside." },
];

function Part({ title, when, wide, children }: { title: string; when: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`card grid content-start gap-4 ${wide ? "lg:col-span-2" : ""}`}>
      <div className="grid gap-1">
        <h3 className="font-cond m-0 text-[20px] font-bold leading-tight">{title}</h3>
        <p className="m-0 text-[14px]" style={{ color: "var(--muted)" }}>
          {when}
        </p>
      </div>
      {children}
    </section>
  );
}

function Swatch({ token, role }: { token: string; role: string }) {
  return (
    <div className="swatch">
      <i style={{ background: `var(${token})` }} />
      <span>
        {role}
        <code>{token}</code>
      </span>
    </div>
  );
}

export function Design() {
  const sure = useConfirm();
  const [one, setOne] = useState<string | null>("week");
  const [many, setMany] = useState<string[]>(["review", "interested"]);
  const [lesson, setLesson] = useState<string | null>("l3");
  const [seg, setSeg] = useState("lessons");
  const [mode, setMode] = useState("on");
  const [tile, setTile] = useState("bees");
  const [dialog, setDialog] = useState<"" | "plain" | "wide">("");
  const [typed, setTyped] = useState("");
  const [saved, setSaved] = useState("");
  const [answer, setAnswer] = useState("");
  const [cards, setCards] = useState(["A kept answer", "Another one"]);

  return (
    <main className="grid gap-5">
      <header className="grid gap-1.5">
        <span className="eyebrow">The design system</span>
        <h2 className="font-cond m-0 text-[34px] font-bold leading-none tracking-tight">The parts</h2>
        <p className="m-0 max-w-2xl text-[15px]" style={{ color: "var(--muted)" }}>
          Every shared part in its states. A new part is reviewed here before a page uses it. Each takes a few props,
          never a style: the look lives in styles.css, the parts in web/src/ui/.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Part title="Colours" when="Named by role. Light follows the system; dark is the default." wide>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {COLOURS.map((g) => (
              <div key={g.group} className="grid content-start gap-2.5">
                <span className="eyebrow">
                  {g.group} · {g.when}
                </span>
                {g.tokens.map(([t, r]) => (
                  <Swatch key={t} token={t} role={r} />
                ))}
              </div>
            ))}
          </div>
        </Part>

        <Part title="Type" when="Sans for reading, the condensed bold for headings, mono for data and labels.">
          <div className="grid gap-3">
            <p className="font-cond m-0 text-[28px] font-bold leading-tight" style={{ color: "var(--strong)" }}>
              A heading in Plex Condensed
            </p>
            <p className="m-0">Body text in Plex Sans: the point first, short sentences, one idea each.</p>
            <p className="m-0" style={{ color: "var(--muted)" }}>
              A secondary line, muted.
            </p>
            <span className="eyebrow">An eyebrow in mono</span>
            <code className="font-mono text-[13px]">~/made-up/path/to/a-file.md</code>
          </div>
        </Part>

        <Part title="Buttons" when=".btn for every button. A button names its action: Delete, Restore, never OK.">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn">
              Plain
            </button>
            <button type="button" className="btn btn-primary">
              Primary
            </button>
            <button type="button" className="btn btn-quiet">
              Quiet
            </button>
            <button type="button" className="btn btn-danger">
              Danger
            </button>
            <button type="button" className="btn btn-primary btn-danger">
              Delete
            </button>
            <button type="button" className="btn" disabled>
              Disabled
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-head">
              On a title line
            </button>
            <button type="button" className="btn btn-primary btn-big">
              Big: the page's one action
            </button>
          </div>
        </Part>

        <Part title="Chips and tones" when="A small coloured label: a state, a match, a source. One tone per meaning.">
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <span key={t} className={`chip tone-${t}`}>
                {t}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip chip-caps tone-purple">deep</span>
            <span className="chip chip-caps tone-accent">quick</span>
            <span className="chip tone-great">Great · 92</span>
            <span className="chip tone-poor">Poor · 31</span>
            <span className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--muted)" }}>
              <span className="dot tone-green pulse" /> a running dot
            </span>
          </div>
        </Part>

        <Part
          title="Pills"
          when="A choice shown whole, never a dropdown: one pick, or several. They wrap on a phone; thirty still read."
        >
          <Pills
            label="Posted"
            showLabel
            options={[
              { value: "day", label: "Today" },
              { value: "week", label: "This week" },
              { value: "any", label: "Any time" },
            ]}
            value={one}
            onChange={setOne}
          />
          <Pills
            label="Stage, several with counts and tones"
            showLabel
            multiple
            options={[
              { value: "review", label: "To review", count: 12, tone: "accent" },
              { value: "interested", label: "Interested", count: 4, tone: "green" },
              { value: "applied", label: "Applied", count: 2, tone: "purple" },
              { value: "no", label: "Not for me", count: 30, tone: "muted" },
            ]}
            value={many}
            onChange={setMany}
          />
        </Part>

        <Part title="Pills, a long list" when="A topic's 25 lessons, the quiz's pick: each with its length as a hint.">
          <Pills label="Lessons" showLabel options={LESSONS} value={lesson} onChange={setLesson} />
        </Part>

        <Part title="Seg" when="A choice among two or three, as one bar: the quiz's source, its length.">
          <fieldset className="seg" aria-label="From">
            {[
              ["lessons", "Lessons", "25"],
              ["interview", "Interview prep", "8"],
            ].map(([k, label, n]) => (
              <button key={k} type="button" aria-pressed={seg === k} onClick={() => setSeg(k)}>
                {label}
                <small>{n} ready</small>
              </button>
            ))}
          </fieldset>
          <fieldset className="seg seg-modes justify-self-start" aria-label="A hunt's switch">
            {[
              ["on", "On"],
              ["quiet", "Quiet"],
              ["paused", "Paused"],
            ].map(([k, label]) => (
              <button key={k} type="button" data-mode={k} aria-pressed={mode === k} onClick={() => setMode(k)}>
                {label}
              </button>
            ))}
          </fieldset>
        </Part>

        <Part title="Tile" when="A big choice with its name over what it holds: a topic, a pack.">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {[
              ["bees", "Bees", "12 lessons · 3 new"],
              ["wax", "Wax", "6 lessons"],
            ].map(([k, name, what]) => (
              <button key={k} type="button" className="tile" aria-pressed={tile === k} onClick={() => setTile(k)}>
                <b>{name}</b>
                <span>{what}</span>
              </button>
            ))}
          </div>
        </Part>

        <Part
          title="Cards"
          when="Every surface block. A card that opens lifts under the pointer; its ✕ asks first, with Confirm."
        >
          <div className="card !p-4">A plain card: a block of the page.</div>
          {cards.map((c) => (
            <div key={c} className="card card-link relative grid gap-1 !p-4">
              <div className="flex items-center gap-2">
                <span className="chip chip-caps tone-accent">quick</span>
                <span className="eyebrow ml-auto">today</span>
                <button
                  type="button"
                  className="card-remove"
                  aria-label={`Delete "${c}"`}
                  title="Delete"
                  onClick={async () => {
                    const yes = await sure({
                      title: "Delete this card?",
                      body: `“${c}” goes from this page until it reloads.`,
                      yes: "Delete",
                      danger: true,
                    });
                    if (yes) setCards((all) => all.filter((x) => x !== c));
                  }}
                >
                  ✕
                </button>
              </div>
              <button
                type="button"
                className="card-open font-cond text-left text-[19px] font-bold leading-tight"
                style={{ color: "var(--strong)" }}
              >
                {c}
              </button>
              <span className="text-[14px]" style={{ color: "var(--muted)" }}>
                A tap anywhere on it opens it; the ✕ sits above.
              </span>
            </div>
          ))}
          {cards.length < 2 && (
            <button
              type="button"
              className="btn btn-quiet justify-self-start"
              onClick={() => setCards(["A kept answer", "Another one"])}
            >
              Bring them back
            </button>
          )}
        </Part>

        <Part
          title="Dialog and Confirm"
          when="A box over the page. Esc, Back, a tap outside and the ✕ close it; typed words stay. Confirm asks before an action, the safe answer first when it can't be undone."
        >
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setDialog("plain")}>
              Open a dialog
            </button>
            <button type="button" className="btn" onClick={() => setDialog("wide")}>
              Open a wide one
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                const yes = await sure({
                  title: "Delete this answer?",
                  body: "“A made-up answer” and its sources are deleted for good.",
                  yes: "Delete",
                  danger: true,
                });
                setAnswer(yes ? "Delete" : "Cancel");
              }}
            >
              Ask to delete
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const yes = await sure({
                  title: "Bring this version back?",
                  body: "What the document says now is kept as a version too.",
                  yes: "Restore",
                });
                setAnswer(yes ? "Restore" : "Cancel");
              }}
            >
              Ask to restore
            </button>
          </div>
          <p className="m-0 text-[13.5px]" style={{ color: "var(--muted)" }}>
            {answer ? `The last answer: ${answer}.` : "No answer yet."}
            {saved && ` Saved: “${saved}”.`}
          </p>
          <Dialog
            open={dialog !== ""}
            onClose={() => setDialog("")}
            wide={dialog === "wide"}
            eyebrow="A made-up box"
            title={dialog === "wide" ? "A wide box, for reading" : "A short form"}
            actions={
              <>
                <button type="button" className="btn btn-quiet" onClick={() => setDialog("")}>
                  Cancel
                </button>
                <button type="submit" form="design-form" className="btn btn-primary">
                  Save
                </button>
              </>
            }
          >
            <form
              id="design-form"
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSaved(typed);
                setDialog("");
              }}
            >
              <p className="m-0">
                {dialog === "wide"
                  ? "A listing, a review, a report: the wide box takes the screen's width on a computer and nearly all of it on a phone."
                  : "Type, close it any way, open it again: the words are still here."}
              </p>
              <input
                className="btn w-full text-left"
                placeholder="A few words"
                data-autofocus=""
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
              <span className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
                Enter saves
              </span>
            </form>
          </Dialog>
        </Part>

        <Part title="Drawings" when="What Ask, Research and the lessons draw: one of each kind." wide>
          <div className="grid gap-5 md:grid-cols-2">
            {DRAWINGS.map((d, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of examples
              <div key={i} className="grid content-start gap-2">
                <span className="eyebrow">{d.kind}</span>
                <Drawing d={d} />
              </div>
            ))}
          </div>
        </Part>
      </div>
    </main>
  );
}

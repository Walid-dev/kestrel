// /design: every shared part in its states, with made-up content and a line on when to use it. A new part is reviewed
// here before a page uses it. Out of the menu, reached by its address. The look lives in styles.css, the parts in
// web/src/ui/; this page only shows them.
import { type CSSProperties, type ReactNode, useState } from "react";
import { Link } from "react-router";
import type { Drawing as D } from "../../src/shared/blocks.ts";
import { Drawing } from "./drawing.tsx";
import { Card } from "./ui/card.tsx";
import { useConfirm } from "./ui/confirm.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { EmptyState } from "./ui/empty.tsx";
import { Field } from "./ui/field.tsx";
import { Page, PageHead } from "./ui/page.tsx";
import { Pills, type Tone } from "./ui/pills.tsx";

// each role: its variable, what it is for, and the class that paints with it
const COLOURS: { group: string; when: string; tokens: [string, string, string][] }[] = [
  {
    group: "Ground",
    when: "the surfaces, from the page up",
    tokens: [
      ["--bg", "the page", "bg-page"],
      ["--surface", "cards and boxes", "bg-surface"],
      ["--surface-2", "sunk parts, the picked pill", "bg-surface-2"],
      ["--line", "hairlines", "border-line"],
    ],
  },
  {
    group: "Ink",
    when: "the words",
    tokens: [
      ["--strong", "headings", "text-strong"],
      ["--text", "body", "text-ink"],
      ["--muted", "secondary lines", "text-muted"],
    ],
  },
  {
    group: "The lead",
    when: "one colour that means act here",
    tokens: [
      ["--accent", "primary buttons, links, focus", "text-accent, bg-accent"],
      ["--accent-soft", "the active chip's ground", "bg-accent-soft"],
    ],
  },
  {
    group: "The working colours",
    when: "one meaning each, through the tones",
    tokens: [
      ["--green", "done, ok, at work now", "tone-green, text-green"],
      ["--red", "danger, diff minus", "tone-red, text-red"],
      ["--orange", "warnings, deals", "tone-orange"],
      ["--yellow", "waiting, the moon", "tone-yellow"],
      ["--purple", "Ask, deep work, learning", "tone-purple"],
      ["--pink", "needs me, the wolf, note marks", "tone-pink, text-pink"],
      ["--cyan", "review today, drawings' fifth colour", "tone-cyan"],
    ],
  },
  {
    group: "The money scale",
    when: "a pay or a price, great to poor",
    tokens: [
      ["--great", "great", "tone-great"],
      ["--good", "good", "tone-good"],
      ["--fair", "fair", "tone-fair"],
      ["--poor", "poor", "tone-poor"],
    ],
  },
];

// the type steps, largest first: the class, its size, when to use it, and the font it goes with
const STEPS: [string, string, string, string][] = [
  ["text-title", "34 px", "a page's title (PageHead sets it)", "font-cond font-bold"],
  ["text-lead", "24 px", "one big line: a number, an answer to say", "font-cond font-bold"],
  ["text-head", "19 px", "a card's or a section's heading", "font-cond font-bold"],
  ["text-read", "16.5 px", "what is read slowly: a lesson, a line to say", ""],
  ["text-body", "15.5 px", "running text, the page's own size", ""],
  ["text-detail", "14 px", "a card's description", "text-muted"],
  ["text-small", "13 px", "hints, meta lines, captions", "text-muted"],
  ["text-label", "11 px", "mono labels and counts", "font-mono text-muted"],
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
    // dates of different widths: the dots stay in one column
    kind: "timeline",
    title: "A made-up week",
    events: [
      { when: "Mon", what: "The plan" },
      { when: "Wednesday 12 March", what: "The first draft" },
      { when: "Fri", what: "The review" },
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
        <h2 className="font-cond m-0 text-head font-bold">{title}</h2>
        <p className="m-0 text-detail text-muted">{when}</p>
      </div>
      {children}
    </section>
  );
}

function Swatch({ token, role, cls }: { token: string; role: string; cls: string }) {
  return (
    <div className="swatch">
      {/* the colour itself is the point here: it reaches the swatch as a variable */}
      <i style={{ "--swatch": `var(${token})` } as CSSProperties} />
      <span>
        {role}
        <code>
          {token} · {cls}
        </code>
      </span>
    </div>
  );
}

// a frame around an example that is a page's own part (a head, a width)
function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="eyebrow">{label}</span>
      <div className="page rounded-2xl border border-dashed border-line p-4">{children}</div>
    </div>
  );
}

export function Design() {
  const sure = useConfirm();
  const [one, setOne] = useState<string | null>("week");
  const [many, setMany] = useState<string[]>(["review", "interested"]);
  const [lesson, setLesson] = useState<string | null>("l3");
  const [allLessons, setAllLessons] = useState(false);
  const [seg, setSeg] = useState("lessons");
  const [mode, setMode] = useState("on");
  const [tile, setTile] = useState("bees");
  const [dialog, setDialog] = useState<"" | "plain" | "wide">("");
  const [typed, setTyped] = useState("");
  const [saved, setSaved] = useState("");
  const [answer, setAnswer] = useState("");
  const [cards, setCards] = useState(["A kept answer", "Another one"]);
  const [slow, setSlow] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const [find, setFind] = useState("");
  // one long word with no space, as a pasted link is: the box must break it, never widen the page
  const [link, setLink] = useState(
    "https://example.com/made-up/beehive-sensors/a-very-long-path-with-no-spaces-in-it/and-a-query?hive=7&frame=12&reading=temperature-and-humidity",
  );

  return (
    <Page
      eyebrow="The design system"
      title="The parts"
      line="Every shared part in its states. A new part is reviewed here before a page uses it. Each takes a few props, never a style: the look lives in styles.css, the parts in web/src/ui/."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Part
          title="Colours"
          when="Named by role, and each a class: text-muted is color: var(--muted). Light follows the system; dark is the default. text-tone, bg-tone and border-tone read the nearest tone-*."
          wide
        >
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {COLOURS.map((g) => (
              <div key={g.group} className="grid content-start gap-2.5">
                <span className="eyebrow">
                  {g.group} · {g.when}
                </span>
                {g.tokens.map(([t, r, c]) => (
                  <Swatch key={t} token={t} role={r} cls={c} />
                ))}
              </div>
            ))}
          </div>
        </Part>

        <Part
          title="Type"
          when="Eight steps, each with its line height, from the sizes the pages used. Sans for reading, the condensed bold for headings, mono for data and labels."
        >
          <div className="grid gap-3">
            {STEPS.map(([cls, size, when, font]) => (
              <div key={cls} className="grid gap-0.5">
                <span className={`${cls} ${font}`}>{cls === "text-label" ? "SIX TO REVIEW" : "The point first"}</span>
                <code className="font-mono text-small text-muted">
                  {cls} · {size} · {when}
                </code>
              </div>
            ))}
          </div>
        </Part>

        <Part
          title="Page and PageHead"
          when="Every page starts with it: one title size, one case. A page with a parent gets the back link, its buttons on the same bar (it can stay on top while the page scrolls; when the back link would keep less than about twenty letters of its name, the buttons drop to a row of their own); a top page has its buttons beside the title. Two widths, both from the left edge under kestrel: wide for lists, reading for text."
        >
          <Frame label="A top page">
            <PageHead
              title="Tasks"
              line="Three open, two done this week."
              actions={
                <button type="button" className="btn">
                  Notify this phone
                </button>
              }
            />
          </Frame>
          <Frame label="A page with a parent">
            <PageHead
              back={{ to: "/design", label: "A made-up pack" }}
              eyebrow="Part 2 · Topic 2.3"
              title="How a load balancer picks a worker"
              line={<span className="chip chip-caps tone-cyan">Review today</span>}
              actions={
                <>
                  <button type="button" className="btn btn-primary">
                    ▶ Listen
                  </button>
                  <button type="button" className="btn">
                    Slow
                  </button>
                </>
              }
            />
          </Frame>
          <div className="grid gap-2">
            <span className="eyebrow">The two widths</span>
            <div className="grid gap-1.5">
              <span className="rounded-md bg-surface-2 px-3 py-1 text-small text-muted">wide: lists and grids</span>
              <span className="page-reading rounded-md bg-surface-2 px-3 py-1 text-small text-muted">
                reading: 768 px at most, for text
              </span>
            </div>
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
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled>
              Waiting
            </button>
            <button type="button" className="btn btn-primary" disabled>
              Not yet
            </button>
            <button type="button" className="btn" aria-pressed={slow} onClick={() => setSlow(!slow)}>
              Slow (stays on)
            </button>
            <button type="button" className="btn tone-red" aria-pressed="true">
              ■ Stop recording
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
          <p className="m-0 text-small text-muted">On a phone every button and pill stands 44 px tall.</p>
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
            <span className="chip chip-caps tone-pink">needs me</span>
            <span className="chip chip-caps tone-cyan">review today</span>
            <span className="chip chip-caps tone-purple">deep</span>
            <span className="chip tone-great">Great · 92</span>
            <span className="chip tone-poor">Poor · 31</span>
            <span className="flex items-center gap-1.5 text-small text-muted">
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

        <Part
          title="Pills, a long list"
          when="A topic's 25 lessons, the quiz's pick: each with its length as a hint. A long list starts short; an action pill (onPress) shows the rest, a button among the choices, never one of them."
        >
          <Pills
            label="Lessons"
            showLabel
            options={[
              ...(allLessons ? LESSONS : LESSONS.slice(0, 8)),
              {
                value: "more",
                label: allLessons ? "Show fewer" : `Show all ${LESSONS.length}`,
                onPress: () => setAllLessons(!allLessons),
              },
            ]}
            value={lesson}
            onChange={setLesson}
          />
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
          title="Card"
          when="Every surface block. A link card opens a page; a card with a title opens by it, and its ✕ asks first, with Confirm. A tone marks what matters now. A long word wraps; it never widens the page."
        >
          <Card>A plain card: a block of the page, its parts 12 px apart.</Card>
          <Card to="/design">A link card: the whole card opens a page, and lifts under the pointer.</Card>
          {cards.map((c) => (
            <Card
              key={c}
              title={c}
              onOpen={() => setDialog("plain")}
              meta={
                <>
                  <span className="chip chip-caps tone-accent">quick</span>
                  <span className="eyebrow ml-auto">today</span>
                </>
              }
              onRemove={async () => {
                const yes = await sure({
                  title: "Delete this card?",
                  body: `“${c}” goes from this page until it reloads.`,
                  yes: "Delete",
                  danger: true,
                });
                if (yes) setCards((all) => all.filter((x) => x !== c));
              }}
              removeLabel={`Delete “${c}”`}
            >
              A tap anywhere on it opens it; the ✕ sits above.
            </Card>
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
          <Card tone="pink" title="Two need me">
            A tone on its edge: needs me is pink everywhere.
          </Card>
          <Card title="Anunbrokenwordtoolongforanyphonescreenwrapsinsideitscard">The title breaks where it must.</Card>
        </Part>

        <Part
          title="EmptyState"
          when="Nothing here yet, in one voice: what is missing, what to do, the one next step; the setting it needs, small, only when a setting is the fix."
        >
          <EmptyState
            title="Nothing asked yet."
            line="Ask a question above: the answer is kept here, like a lesson."
            action={
              <Link to="/research" className="btn">
                Open Research
              </Link>
            }
          />
          <EmptyState
            title="Cost isn't set up yet."
            line="It reads the model server's logs once it knows where they are."
            detail="settings.json · omlxHome"
          />
        </Part>

        <Part
          title="Field"
          when="A box to write in: Enter sends, Shift+Enter makes a line, the round button sends too. 16 px, so a phone never zooms in. Without a send, it is a search."
        >
          <Field
            label="A made-up note"
            placeholder="Write a line, then Enter"
            value={note}
            onChange={setNote}
            onSend={() => {
              setSent((all) => [note.trim(), ...all].slice(0, 3));
              setNote("");
            }}
            sendLabel="Add"
          />
          {sent.length > 0 && <p className="m-0 text-small text-muted">Sent: {sent.join(" · ")}</p>}
          <Field
            label="A question"
            placeholder="A longer question starts three lines tall"
            value={typed}
            onChange={setTyped}
            onSend={() => setSaved(typed)}
            tall
          />
          <Field label="A pasted link" value={link} onChange={setLink} onSend={() => setLink("")} sendLabel="Save" />
          <Field label="Search the lessons" value={find} onChange={setFind} />
        </Part>

        <Part
          title="Dialog and Confirm"
          when="A box over the page. Esc, Back, a tap outside and the ✕ close it; typed words stay; the page behind stays still. Confirm asks before an action, the safe answer first when it can't be undone."
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
          <p className="m-0 text-small text-muted">
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
              <span className="font-mono text-label text-muted">Enter saves</span>
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
    </Page>
  );
}

// /design: every shared part in its states, with made-up content and a line on when to use it. A new part is reviewed
// here before a page uses it. Out of the menu, reached by its address. The look lives in styles.css, the parts in
// web/src/ui/; this page only shows them, at their real size: the control ladder measures itself on the device it is
// seen on (the drawn height and the height a tap takes).
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Drawing as D } from "../../src/shared/blocks.ts";
import { LIVE_ICON, LiveBadge, PipBody, type Status } from "./app.tsx";
import { Drawing } from "./drawing.tsx";
import { ICONS } from "./home.tsx";
import { Card } from "./ui/card.tsx";
import { useConfirm } from "./ui/confirm.tsx";
import { cx } from "./ui/cx.ts";
import { Dialog } from "./ui/dialog.tsx";
import { EmptyState } from "./ui/empty.tsx";
import { Field } from "./ui/field.tsx";
import { List, Row } from "./ui/list.tsx";
import { Page, PageHead } from "./ui/page.tsx";
import { Pills, type Tone } from "./ui/pills.tsx";
import { Seg } from "./ui/seg.tsx";

// each role: its variable, what it is for, and the class that paints with it
const COLOURS: { group: string; when: string; tokens: [string, string, string][] }[] = [
  {
    group: "Ground",
    when: "the surfaces, from the page up",
    tokens: [
      ["--bg", "the page", "bg-page"],
      ["--surface", "cards and lists", "bg-surface"],
      ["--surface-2", "sunk parts, inner blocks, a seg's bar", "bg-surface-2"],
      ["--surface-hover", "a card or a row under the pointer", "bg-surface-hover"],
    ],
  },
  {
    group: "Lines",
    when: "two roles",
    tokens: [
      ["--line", "structure: cards, lists, dividers, bars", "border-line"],
      ["--line-strong", "a control's edge, a hovered card", "border-line-strong"],
    ],
  },
  {
    group: "Ink",
    when: "the words",
    tokens: [
      ["--strong", "headings, picked options", "text-strong"],
      ["--text", "body", "text-ink"],
      ["--muted", "secondary lines", "text-muted"],
    ],
  },
  {
    group: "The lead",
    when: "one colour that means act here",
    tokens: [
      ["--accent", "the one filled button, links, focus", "text-accent, bg-accent"],
      ["--accent-soft", "a picked tile, my lines in Ask", "bg-accent-soft"],
    ],
  },
  {
    group: "The working colours",
    when: "one meaning each, through the tones",
    tokens: [
      ["--green", "done, ok, at work now", "tone-green, text-green"],
      ["--red", "danger, diff minus", "tone-red, text-red"],
      ["--orange", "warnings, the computer asleep", "tone-orange"],
      ["--yellow", "waiting, the moon", "tone-yellow"],
      ["--purple", "Ask, deep work, learning", "tone-purple"],
      ["--pink", "needs me, the wolf, note marks", "tone-pink, text-pink"],
      ["--cyan", "review today, drawings' fifth colour", "tone-cyan"],
      ["--indigo", "News: its word, its icon", "tone-indigo, text-indigo"],
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

// the type steps, largest first: the class, its size and line height under a mouse and on touch, its roles, and the
// font it goes with (a heading step carries its own weight: never font-bold beside it)
const STEPS: { cls: string; mouse: string; touch: string; roles: string; font: string }[] = [
  {
    cls: "text-title",
    mouse: "26/30",
    touch: "24/28",
    roles: "a top page's title, once per page, at 700 (PageHead sets it)",
    font: "font-cond",
  },
  {
    cls: "text-lead",
    mouse: "22/28",
    touch: "22/28",
    roles: "one big line: a child page's title at 700 (PageHead), a count, a Markdown h1",
    font: "font-cond",
  },
  {
    cls: "text-section",
    mouse: "18/24",
    touch: "18/24",
    roles: "a page's section, a dialog's title, a Markdown h2",
    font: "font-cond",
  },
  {
    cls: "text-head",
    mouse: "16/22",
    touch: "16/22",
    roles: "a card's title, Ask's, a Markdown h3",
    font: "font-cond",
  },
  {
    cls: "text-read",
    mouse: "16/26",
    touch: "16/26",
    roles: "what is read slowly: a lesson, a line to say, a document",
    font: "",
  },
  {
    cls: "text-body",
    mouse: "14/22",
    touch: "15/24",
    roles: "running text: a page's line, a task, an answer; at 500, a row's title",
    font: "",
  },
  {
    cls: "text-detail",
    mouse: "13/20",
    touch: "14/20",
    roles: "the UI's voice: every button, pill and seg, a card's description",
    font: "",
  },
  {
    cls: "text-small",
    mouse: "12/16",
    touch: "13/18",
    roles: "hints, meta lines, times, a row's second line; paths and money in mono",
    font: "",
  },
  {
    cls: "text-label",
    mouse: "11/16",
    touch: "11/16",
    roles: "eyebrows, legends, chip caps, counts: mono caps (.eyebrow)",
    font: "eyebrow",
  },
];

const TONES: Tone[] = ["accent", "green", "yellow", "orange", "red", "purple", "pink", "cyan", "indigo", "muted"];

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

// the three states the status shows, as the badge and the pip draw them
const STATES: Status[] = [{ kind: "asleep" }, { kind: "needs", n: 2 }, { kind: "working", n: 1 }];

function Part({ title, when, wide, children }: { title: string; when: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={cx("card grid content-start gap-4", wide && "lg:col-span-2")}>
      <div className="grid gap-1">
        <h2 className="m-0 font-cond text-head">{title}</h2>
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
      <div className="page rounded-xl border border-dashed border-line-strong p-4">{children}</div>
    </div>
  );
}

// A control at its real size, with what it measures on this device: its drawn height and the height a tap takes (on
// touch its transparent area, the ::after, reaches 44). Read from the page, again when the pointer or the size changes.
function Rung({ name, children }: { name: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState("");
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("button, a, input, fieldset, .field-box");
    if (!el) return;
    const read = () => {
      const drawn = el.getBoundingClientRect().height;
      const after = getComputedStyle(el, "::after");
      const area = after.position === "absolute" ? Number.parseFloat(after.height) || 0 : 0;
      setSize(`drawn ${Math.round(drawn)} · hit ${Math.round(Math.max(drawn, area))}`);
    };
    read();
    const touch = matchMedia("(pointer: coarse)");
    touch.addEventListener("change", read);
    window.addEventListener("resize", read);
    return () => {
      touch.removeEventListener("change", read);
      window.removeEventListener("resize", read);
    };
  }, []);
  return (
    <div className="grid content-start justify-items-start gap-1.5">
      <div ref={ref}>{children}</div>
      <code className="font-mono text-small text-muted">
        {name} · {size}
      </code>
    </div>
  );
}

export function Design() {
  const sure = useConfirm();
  const [one, setOne] = useState<string | null>("week");
  const [many, setMany] = useState<string[]>(["review", "interested"]);
  const [lesson, setLesson] = useState<string | null>("l3");
  const [allLessons, setAllLessons] = useState(false);
  const [from, setFrom] = useState("lessons");
  const [view, setView] = useState("now");
  const [mode, setMode] = useState("on");
  const [tile, setTile] = useState("bees");
  const [dialog, setDialog] = useState<"" | "plain" | "wide">("");
  const [typed, setTyped] = useState("");
  const [saved, setSaved] = useState("");
  const [answer, setAnswer] = useState("");
  const [cards, setCards] = useState(["A kept answer", "Another one"]);
  const [rows, setRows] = useState(["bee-yard.md", "frames.md", "made-up-field-guide.md"]);
  const [slow, setSlow] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const [find, setFind] = useState("");
  const [hive, setHive] = useState("");
  // one long word with no space, as a pasted link is: the box must break it, never widen the page
  const [link, setLink] = useState(
    "https://example.com/made-up/beehive-sensors/a-very-long-path-with-no-spaces-in-it/and-a-query?hive=7&frame=12&reading=temperature-and-humidity",
  );
  const removeRow = async (name: string) => {
    const yes = await sure({
      title: `Delete ${name}?`,
      body: "A made-up note: it comes back when the page reloads.",
      yes: "Delete",
      danger: true,
    });
    if (yes) setRows((all) => all.filter((r) => r !== name));
  };

  return (
    <Page
      eyebrow="The design system"
      title="The parts"
      line="Every shared part in its states, at its real size. A new part is reviewed here before a page uses it. Each takes a few props, never a style: the look lives in styles.css, the parts in web/src/ui/."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <Part
          title="The control ladder"
          when="Every control on one ladder. Under a mouse: 24 (small), 26 (a choice), 30 (a control), 36 (large). On touch they are drawn at 32, 36 and 44, and every target takes at least 44: a control drawn smaller gets a transparent area around it. Measured here, on this device."
          wide
        >
          <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
            <Rung name="small · .btn-sm">
              <button type="button" className="btn btn-sm">
                The page ↗
              </button>
            </Rung>
            <Rung name="choice · .pill">
              <button type="button" className="pill" aria-pressed="false">
                This week
              </button>
            </Rung>
            <Rung name="control · .seg">
              <fieldset className="seg" aria-label="An example">
                <button type="button" aria-pressed="true">
                  Now
                </button>
                <button type="button" aria-pressed="false">
                  Activity
                </button>
              </fieldset>
            </Rung>
            <Rung name="control · .btn">
              <button type="button" className="btn">
                Search now
              </button>
            </Rung>
            <Rung name="control · .btn-icon">
              <button type="button" className="btn btn-icon" aria-label="Start over" title="Start over">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                </svg>
              </button>
            </Rung>
            <Rung name="box · .input">
              <input className="input w-40" placeholder="A short answer" aria-label="A short answer" />
            </Rung>
            <Rung name="large · .btn-big">
              <button type="button" className="btn btn-primary btn-big">
                Start 10 questions
              </button>
            </Rung>
          </div>
          <p className="m-0 text-small text-muted">
            The height comes from min-height, the words centred, so every control of a step measures the same and a
            label that wraps still grows. A seg's options are a choice (26, 32 on touch) inside its bar. Two rows of
            controls keep their touch areas apart by their gap: 8 between rows of buttons, 12 between rows of pills.
          </p>
        </Part>

        <Part
          title="Type"
          when="Nine steps, each with its line height; a heading step carries its own weight (never font-bold beside it). Sans for reading, the condensed for headings, mono for labels, paths and numbers. Under a mouse | on touch."
          wide
        >
          <div className="grid gap-4 md:grid-cols-2">
            {STEPS.map((s) => (
              <div key={s.cls} className="grid content-start gap-1">
                <span className={cx(s.cls, s.font, "text-strong")}>
                  {s.cls === "text-label" ? "Six to review" : "The point first"}
                </span>
                <code className="font-mono text-small text-muted">
                  {s.cls} · {s.mouse}
                  {s.touch === s.mouse ? "" : ` | ${s.touch}`} · {s.roles}
                </code>
              </div>
            ))}
          </div>
          <p className="m-0 text-small text-muted">
            The weights that ship: Sans 400 to 600, Condensed 600 and 700, Mono 400 and 500. 700 is a page's title only;
            numbers are mono and tabular.
          </p>
        </Part>

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
          title="Page and PageHead"
          when="Every page starts with its own head: there is no bar above it. A top page: its title, its buttons beside it under a mouse (in a row under the line on touch). A head may carry an aside: a short statement past a thin rule, centred beside the eyebrow and the title, plain text that wraps as words do, in place of the line. A child page: the back row (the parent's name, its tools on the right), then a title a step down. Two widths, both from the left edge: wide for lists, reading (720) for text."
        >
          <Frame label="A top page">
            <PageHead
              titleAs="div"
              eyebrow="Mon 23 Nov"
              title="Tasks"
              line="Three open, two done this week."
              actions={
                <button type="button" className="btn">
                  Notify this phone
                </button>
              }
            />
          </Frame>
          <Frame label="A head with an aside (Home)">
            <PageHead
              titleAs="div"
              eyebrow="Mon 23 Nov"
              title="Home"
              aside="A short statement, centred beside the head."
            />
          </Frame>
          <Frame label="A child page">
            <PageHead
              titleAs="div"
              back={{ to: "/design", label: "A made-up pack" }}
              eyebrow="Part 2 · Topic 2.3"
              title="How a load balancer picks a worker"
              line={<span className="chip chip-caps tone-cyan">Review today</span>}
              actions={
                <>
                  <button type="button" className="btn btn-primary">
                    ▶ Listen
                  </button>
                  <button type="button" className="btn" aria-pressed={slow} onClick={() => setSlow(!slow)}>
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
                reading: 720 px at most, for text
              </span>
            </div>
          </div>
        </Part>

        <Part
          title="The shell's status"
          when="Where the eye goes for it. On touch, Live's tab carries a badge; under a mouse, the dock's Live item does too, and a pip sits in the bottom-right corner, in the lane the shell keeps free: its mark at rest, its words under the pointer (never on Live, which it opens). Asleep first, then needs me, then at work; when all is well, nothing. Asleep, the strip leads every page."
        >
          <div className="flex flex-wrap items-end gap-6">
            {STATES.map((s) => (
              <div key={s.kind} className="grid justify-items-center gap-1 text-muted">
                <span className="nav-icon">
                  {LIVE_ICON}
                  <LiveBadge status={s} />
                </span>
                <span className="font-mono text-label">{s.kind}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {STATES.map((s) => (
              <span key={s.kind} className="pip-demo">
                <PipBody status={s} />
              </span>
            ))}
            {STATES.map((s) => (
              <span key={s.kind} className="pip-demo pip-open">
                <PipBody status={s} />
              </span>
            ))}
          </div>
          <p className="asleep m-0">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11Z" />
            </svg>
            <span>Computer asleep since 21:40. You are reading the last copies; nothing can be saved right now.</span>
          </p>
        </Part>

        <Part
          title="Buttons"
          when=".btn for every button; a button names its action (Delete, Restore, never OK). One filled button per screen, the main action (a dialog is a screen of its own); a list's per-item actions stay plain. Full width only on touch, for the one action that ends a form."
        >
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary">
              Primary
            </button>
            <button type="button" className="btn">
              Plain
            </button>
            <button type="button" className="btn btn-quiet">
              Ghost
            </button>
            <button type="button" className="btn btn-danger">
              Danger
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled>
              Waiting
            </button>
            <button type="button" className="btn" aria-pressed={slow} onClick={() => setSlow(!slow)}>
              Slow (stays on)
            </button>
            <button type="button" className="btn tone-red" aria-pressed="true">
              ■ Stop recording
            </button>
            <button type="button" className="btn btn-sm">
              Edit in Notes →
            </button>
            <button type="button" className="btn btn-icon btn-quiet" aria-label="Close" title="Close">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="m-0 text-small text-muted">
            .btn-sm is a card's secondary action (the same as .btn on touch); .btn-icon a round button with only an
            icon, its name in aria-label and title; .btn-big the page's one main action at the end of a form (on the
            ladder, above). The filled danger button is Confirm's Delete.
          </p>
        </Part>

        <Part
          title="Chips, money and tones"
          when="A small coloured label: a state, a match, a source; one tone per meaning, its words on a tint of it. Money is mono and tabular, in its place on the money scale."
        >
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
            <span className="money tone-great">52k</span>
            <span className="money tone-fair">38k</span>
            <span className="money tone-poor">24k</span>
            <span className="flex items-center gap-1.5 text-small text-muted">
              <span className="dot tone-green pulse" /> a working dot
            </span>
          </div>
        </Part>

        <Part
          title="Seg"
          when="A view switch of two to four options, as one bar as wide as its words. What the pick means is one quiet line under it, read with the bar; never a second line inside an option. A hunt's switch marks the picked mode with a dot in its colour."
        >
          <Seg
            label="From"
            value={from}
            onChange={setFrom}
            options={[
              { value: "lessons", label: "Lessons", hint: "25 ready · from the lessons I have read" },
              { value: "interview", label: "Interview prep", hint: "8 ready · answers to say for a job" },
            ]}
          />
          <Seg
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: "now", label: "Now" },
              { value: "activity", label: "Activity" },
            ]}
          />
          <Seg
            label="A hunt's switch"
            modes
            value={mode}
            onChange={setMode}
            options={[
              { value: "on", label: "On", hint: "It runs on its own and tells me what it finds" },
              { value: "quiet", label: "Quiet", hint: "It runs on its own and says nothing" },
              { value: "paused", label: "Paused", hint: "It doesn't run until I turn it on" },
            ]}
          />
        </Part>

        <Part
          title="Pills"
          when="A choice shown whole, never a dropdown: one pick, or several. Picked is neutral (the accent is for acting). They wrap on a phone, 12 apart between rows; thirty still read."
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
              { value: "review", label: "To review", count: 12, tone: "muted" },
              { value: "interested", label: "Interested", count: 4, tone: "green" },
              { value: "applied", label: "Applied", count: 2, tone: "accent" },
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

        <Part
          title="Tile"
          when="A big choice, only when two or more options each need a line under the name (one option is a pill): a topic, a pack. Picked: the accent's edge and tint, and a check."
        >
          <div className="grid gap-2 sm:grid-cols-2">
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
          title="List and Row"
          when="Many small things as one card of rows, instead of a stack of small cards. The whole row is the target, with a chevron when it opens; what sits at its end stays a target of its own, and the ✕ waits out of sight under a mouse until the row is hovered. cols: two columns from 64rem."
          wide
        >
          <List label="Made-up notes">
            {rows.map((name, i) => (
              <Row
                key={name}
                to="/design"
                icon={<span className="text-accent">{ICONS.Notes}</span>}
                title={name}
                line={
                  <>
                    <span className="font-mono">~/notes/{name}</span> · {i + 1} Nov
                  </>
                }
                end={
                  <button
                    type="button"
                    className="card-remove"
                    aria-label={`Delete ${name}`}
                    title={`Delete ${name}`}
                    onClick={() => removeRow(name)}
                  >
                    ✕
                  </button>
                }
              />
            ))}
            <Row title="A row that opens nothing" line="No chevron, no hover" />
          </List>
          <List cols label="Made-up apps">
            {(
              [
                ["Searches", "text-great", "Hunts that run on their own"],
                ["Learn", "text-purple", "One lesson per page, read aloud"],
                ["Notes", "text-accent", "A document and my notes on it"],
                ["Tasks", "text-pink", "One line each"],
              ] as const
            ).map(([name, colour, what]) => (
              <Row
                key={name}
                to="/design"
                icon={<span className={colour}>{ICONS[name]}</span>}
                title={name}
                line={<span className="block truncate">{what}</span>}
              />
            ))}
          </List>
        </Part>

        <Part
          title="Card"
          when="A surface block, flat on its hairline. A link card opens a page (its ground comes up under the pointer); a card with a title opens by it, and its ✕ asks first, with Confirm. A tone marks what matters now with an edge on its left. Never a card in a card: a block inside one is .inner."
        >
          <Card>A plain card: a block of the page, its parts 12 px apart.</Card>
          <Card to="/design">A link card: the whole card opens a page.</Card>
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
              <div className="card-actions">
                <button type="button" className="btn btn-sm">
                  The page ↗
                </button>
              </div>
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
            A tone on its left edge: needs me is pink everywhere.
          </Card>
          <Card>
            <span className="eyebrow">Deep check</span>
            <p className="inner m-0 text-detail">An inner block: the sunk ground, no edge, inside a card.</p>
          </Card>
          <Card title="Anunbrokenwordtoolongforanyphonescreenwrapsinsideitscard">The title breaks where it must.</Card>
        </Part>

        <Part
          title="EmptyState"
          when="Nothing here yet, in one voice and in the flow, with no box around it: what is missing, what to do, the one next step; the setting it needs, small, only when a setting is the fix."
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
          when="A box to write in: Enter sends, Shift+Enter makes a line, the round button sends too; 36 under a mouse, 44 and 16 px on touch, so a phone never zooms in. tall starts at three lines. Without a send, it is a search."
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
          title="Input"
          when="A plain box (.input) where a form's button sends, not Enter alone: a setting, a short answer. One line, on the ladder: 30 under a mouse, 44 and 16 px on touch."
        >
          <label className="grid gap-1">
            <span className="text-small font-semibold text-strong">Hive name</span>
            <input
              className="input"
              placeholder="The bee yard"
              value={hive}
              onChange={(e) => setHive(e.target.value)}
            />
            <span className="text-small text-muted">shown on each reading</span>
          </label>
          <label className="grid gap-1">
            <span className="text-small font-semibold text-strong">Its file name</span>
            <input className="input font-mono" value="bee-yard" readOnly />
          </label>
        </Part>

        <Part
          title="Disclosure"
          when="A fold-out: a details whose summary is .disclosure, a control and not a heading: one row in the UI's voice with a ▶ that turns, the whole row the target, its words in ink when open. Never alone in a card of its own."
        >
          <details>
            <summary className="disclosure">How to read a frame</summary>
            <p className="m-0 text-detail">Hold it by its ends, over the box, and look for eggs first.</p>
          </details>
          <details>
            <summary className="disclosure">Done · 3</summary>
            <p className="m-0 text-detail text-muted">Three made-up tasks, ticked off.</p>
          </details>
        </Part>

        <Part
          title="Dialog and Confirm"
          when="A box over the page, 440 wide (the wide one 900). It eases in, and out where the browser can. Esc, Back, a tap outside and the ✕ close it; typed words stay; the page behind stays still. Its buttons sit at the right; on touch the main one takes the room. Confirm asks before an action, the safe answer first when it can't be undone."
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
                className="input w-full"
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

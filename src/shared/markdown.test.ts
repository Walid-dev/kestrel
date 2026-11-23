// The Markdown reader: each construct my documents use reads as VS Code shows it, every text run sits at its place in
// the source (run.text === source.slice(at, at + length)), a long document parses fast, and nothing unsafe opens:
// raw HTML stays text, and only http(s):, mailto: and relative links open. A PDF's text keeps its lines and its bullets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Block, bare, docKind, leaves, parse, plain, type Run, safeHref } from "./markdown.ts";

// a compact picture of what was parsed: blocks by kind, runs by kind, words in quotes
const show = (rs: Run[]): string =>
  rs
    .map((r) =>
      "kids" in r
        ? `${r.k}${r.k === "link" ? `<${r.href}>` : ""}(${show(r.kids)})`
        : r.k === "br"
          ? "⏎"
          : r.k === "code"
            ? `\`${r.text}\``
            : JSON.stringify(r.text),
    )
    .join(" ");
const shape = (bs: Block[]): unknown[] =>
  bs.map((b) => {
    if (b.k === "heading") return `h${b.level} ${show(b.runs)}`;
    if (b.k === "para") return `p ${show(b.runs)}`;
    if (b.k === "code") return `code:${b.lang} ${show(b.runs)}`;
    if (b.k === "hr") return "hr";
    if (b.k === "quote") return { quote: shape(b.blocks) };
    if (b.k === "list")
      return {
        [b.ordered ? `ol${b.start}` : "ul"]: b.items.map((it) =>
          it.check === null ? shape(it.blocks) : { [it.check ? "[x]" : "[ ]"]: shape(it.blocks) },
        ),
        tight: b.tight,
      };
    return {
      table: b.align,
      head: b.head.map((c) => show(c.runs)),
      rows: b.rows.map((r) => r.map((c) => show(c.runs))),
    };
  });
const md = (src: string) => shape(parse(src));

// the rule every run keeps, checked on everything a parse gives
function holds(src: string, bs: Block[]) {
  let after = -1;
  for (const l of leaves(bs)) {
    assert.equal(src.slice(l.at, l.at + l.text.length), l.text, `a run at ${l.at} doesn't match the source`);
    assert.ok(l.at >= after, `runs out of order at ${l.at}`); // in reading order, never overlapping
    after = l.at + l.text.length;
  }
}

test("ATX headings: six levels, closing hashes dropped, each with its address", () => {
  assert.deepEqual(md("# One\n## Two ##\n###### Six\n####### seven"), [
    'h1 "One"',
    'h2 "Two"',
    'h6 "Six"',
    'p "####### seven"',
  ]);
  const [a, b] = parse("# Plan: the *first* step\n# Plan: the first step") as Extract<Block, { k: "heading" }>[];
  assert.deepEqual([a.slug, b.slug], ["plan-the-first-step", "plan-the-first-step-1"]);
});

test("a line of = or - under text makes a heading too", () => {
  assert.deepEqual(md("Title\n===\n\nPart\n---"), ['h1 "Title"', 'h2 "Part"']);
});

test("paragraphs: lines run on, a blank line starts the next; two spaces or a backslash break the line", () => {
  assert.deepEqual(md("one\ntwo\n\nthree  \nfour\\\nfive   "), ['p "one\\ntwo"', 'p "three" ⏎ "four" ⏎ "five"']);
});

test("emphasis and strong, with * and _, nested; an underscore inside a word stays a letter", () => {
  assert.deepEqual(md("*a* _b_ **c** __d__ ***e*** snake_case_name"), [
    'p em("a") " " em("b") " " strong("c") " " strong("d") " " em(strong("e")) " snake_case_name"',
  ]);
  assert.deepEqual(md("**bold *and em* bold** and 2 * 3 * 4"), [
    'p strong("bold " em("and em") " bold") " and 2 * 3 * 4"',
  ]);
});

test("strikethrough with ~~", () => {
  assert.deepEqual(md("~~gone~~ and ~one~"), ['p del("gone") " and " del("one")']);
});

test("inline code keeps its words as written, marks and all", () => {
  assert.deepEqual(md("Run `node --run *check*` or `` a ` b ``."), [
    'p "Run " `node --run *check*` " or " `a ` b` "."',
  ]);
});

test("fenced code (``` and ~~~, with its language) and indented code", () => {
  assert.deepEqual(md("```ts\nconst a = 1;\n\nlet b;\n```\n~~~\nx\n~~~\n\n    four spaces\n    more"), [
    'code:ts "const a = 1;\\n\\nlet b;"',
    'code: "x"',
    'code: "four spaces\\n" "more"',
  ]);
  assert.deepEqual(md("```\nnever closed\n# not a heading"), ['code: "never closed\\n# not a heading"']);
});

test("lists: bullets, numbers from their start, tasks, nesting; tight unless a blank line parts them", () => {
  assert.deepEqual(md("- one\n  - nested\n- [ ] to do\n- [x] done\n\n3. three\n4. four"), [
    {
      ul: [['p "one"', { ul: [['p "nested"']], tight: true }], { "[ ]": ['p "to do"'] }, { "[x]": ['p "done"'] }],
      tight: true,
    },
    { ol3: [['p "three"'], ['p "four"']], tight: true },
  ]);
  assert.deepEqual(md("- a\n\n  more of a\n- b"), [{ ul: [['p "a"', 'p "more of a"'], ['p "b"']], tight: false }]);
});

test("blockquotes: blocks inside, nested quotes, and a lazy line carrying on", () => {
  assert.deepEqual(md("> # Said\n> it plainly\ncarried on\n> > deeper"), [
    { quote: ['h1 "Said"', 'p "it plainly\\ncarried on"', { quote: ['p "deeper"'] }] },
  ]);
});

test("links: inline with a title, bare addresses (punctuation left out), <autolinks>, relative and #parts", () => {
  assert.deepEqual(md('[the site](https://example.org "Title"), https://example.org/a_(b). www.example.com'), [
    'p link<https://example.org>("the site") ", " link<https://example.org/a_(b)>("https://example.org/a_(b)") ". " link<https://www.example.com>("www.example.com")',
  ]);
  assert.deepEqual(md("<https://example.org/x> [notes](docs/plan.md) [up](#part) [a **b**](/x)"), [
    'p link<https://example.org/x>("https://example.org/x") " " link<docs/plan.md>("notes") " " link<#part>("up") " " link</x>("a " strong("b"))',
  ]);
  const mail = ["someone", "example.com"].join("@"); // built here: a written address would trip the guard
  assert.deepEqual(md(`[write](mailto:${mail}) <${mail}>`), [
    `p link<mailto:${mail}>("write") " " link<mailto:${mail}>(${JSON.stringify(mail)})`,
  ]);
});

test("GFM tables: alignment, inline marks in cells, an escaped pipe, short rows filled", () => {
  assert.deepEqual(md("| Name | Age | Note |\n|:--|--:|:-:|\n| Ann | **3** | a \\| b |\n| Bob |\n\nafter"), [
    {
      table: ["left", "right", "center"],
      head: ['"Name"', '"Age"', '"Note"'],
      rows: [
        ['"Ann"', 'strong("3")', '"a " "| b"'],
        ['"Bob"', "", ""],
      ],
    },
    'p "after"',
  ]);
});

test("horizontal rules: ---, ***, ___ and spaced ones", () => {
  assert.deepEqual(md("---\n***\n___\n- - -\n* * *"), ["hr", "hr", "hr", "hr", "hr"]);
});

test("escapes: a backslash before punctuation shows the character, never its mark", () => {
  assert.deepEqual(md("\\*not em\\* \\# \\[x](y) \\`no code\\`"), ['p "*not em" "* " "# " "[x](y) " "`no code" "`"']);
});

test("raw HTML never renders: it stays words, as written", () => {
  assert.deepEqual(md("<script>alert(1)</script>\n\n<b>bold</b> &amp; <img src=x onerror=alert(1)>"), [
    'p "<script>alert(1)</script>"',
    'p "<b>bold</b> &amp; <img src=x onerror=alert(1)>"',
  ]);
});

test("a link opens only http(s):, mailto: or a relative address; any other stays text", () => {
  for (const bad of [
    "[x](javascript:alert(1))",
    "[x](JavaScript:alert(1))",
    "[x](data:text/html,hi)",
    "[x](vbscript:msgbox)",
    "[x](file:///etc/passwd)",
    "[x](<java\tscript:alert(1)>)",
    "<javascript:alert(1)>",
    "![x](javascript:alert(1))",
  ])
    assert.deepEqual(md(bad), [`p ${JSON.stringify(bad)}`], bad);
  assert.equal(safeHref(" https://example.org "), "https://example.org");
  assert.equal(safeHref("a b.md"), "a%20b.md");
  assert.equal(safeHref("java\nscript:alert(1)"), null);
});

test("a note's quote reads as the page shows it: the paired marks between its words left out", () => {
  assert.equal(bare("two full frames** of"), "two full frames of");
  assert.equal(bare("run `node --run check` ~~now~~"), "run node --run check now");
});

test("an image shows as a link to it, its words the alt text: nothing is fetched", () => {
  assert.deepEqual(md("![a hive](https://example.org/hive.png)"), ['p link<https://example.org/hive.png>("a hive")']);
});

test("every run sits at its place in a long mixed document, and 5,000 lines parse fast", () => {
  const part = [
    "# Part {n}: a *made-up* plan",
    "",
    "Some **bold**, some _em_, ~~gone~~, `code`, a [link](https://example.org/{n}) and https://example.org/b{n}.",
    "A second line  ",
    "broken hard, then \\*escaped\\*.",
    "",
    "> A quote with **bold**",
    "lazy on",
    "> - and a list inside",
    "",
    "- one *em*",
    "  - nested `code`",
    "    1. deeper",
    "- [x] done task",
    "- [ ] open task with <b>html</b>",
    "",
    "1. first",
    "2. second",
    "",
    "| Col | **Bold** | Right |",
    "|:----|:--------:|------:|",
    "| a \\| b | `c` | [d](#part-{n}) |",
    "",
    "```js",
    "const x = {n};",
    "```",
    "",
    "    indented {n}",
    "",
    "---",
    "",
  ];
  const src = Array.from({ length: 162 }, (_, n) => part.join("\n").replaceAll("{n}", String(n))).join("\n");
  assert.ok(src.split("\n").length >= 5000);
  const t0 = performance.now();
  const bs = parse(src);
  const ms = performance.now() - t0;
  holds(src, bs);
  assert.ok(leaves(bs).length > 6000);
  assert.ok(ms < 400, `5,000 lines took ${Math.round(ms)} ms`);
  // and every construct inside a quote and a list item keeps its place too
  const nested = "> - a **b** `c`\n>   more [d](x.md)\n> \n>   > e\n>   > ~~f~~";
  holds(nested, parse(nested));
});

test("a PDF's text keeps its lines, and a line starting with •, ◦, ▪ or – is a list item", () => {
  const cv = [
    "Jordan Example",
    "Head Keeper",
    "",
    "EXPERIENCE",
    "• Ran 40 hives",
    "◦ Raised the queens",
    "▪ Kept the books",
    "– Sold the honey at https://example.org/honey.",
    "Keeper, 2017 to 2021",
  ].join("\n");
  const bs = parse(cv, "lines");
  holds(cv, bs);
  assert.deepEqual(shape(bs), [
    'p "Jordan Example" ⏎ "Head Keeper"',
    'h3 "EXPERIENCE"',
    {
      ul: [
        ['p "Ran 40 hives"', { ul: [['p "Raised the queens"']], tight: true }],
        [
          'p "Kept the books"',
          {
            ul: [['p "Sold the honey at " link<https://example.org/honey>("https://example.org/honey") "."']],
            tight: true,
          },
        ],
      ],
      tight: true,
    },
    'p "Keeper, 2017 to 2021"',
  ]);
  // a section's title in capitals is a heading, even with no blank line around it (PDFKit gives none); a line of
  // capitals that reads like a list or a sentence is not
  assert.deepEqual(shape(parse("Robin Example\nSUMMARY\nKeeper of bees.\nSKILLS & TOOLS\nAWS, GCP, K8S", "lines")), [
    'p "Robin Example"',
    'h3 "SUMMARY"',
    'p "Keeper of bees."',
    'h3 "SKILLS & TOOLS"',
    'p "AWS, GCP, K8S"',
  ]);
  // no Markdown in a PDF's text: its stars and underscores are its own
  assert.equal(
    plain((parse("C++ *and* __init__", "lines")[0] as Extract<Block, { k: "para" }>).runs),
    "C++ *and* __init__",
  );
});

test("how a document reads follows its name: Markdown, a PDF's or a text's lines, or code", () => {
  assert.deepEqual(
    ["voice.md", "notes.markdown", "cv.pdf", "todo.txt", "README", "settings.yaml", "data.json"].map(docKind),
    ["markdown", "markdown", "lines", "lines", "lines", "code", "code"],
  );
  assert.deepEqual(shape(parse("a: 1\n# not a heading", "code")), ['code: "a: 1\\n# not a heading"']);
});

test("a CRLF document reads as its LF twin: a fence closes, a heading drops its \\r", () => {
  const crlf = "# Title #\r\n\r\n```js\r\ncode\r\nmore\r\n```\r\nafter\r\n";
  const bs = parse(crlf);
  holds(crlf, bs);
  assert.deepEqual(shape(bs), ['h1 "Title"', 'code:js "code\\r\\nmore"', 'p "after"']);
});

test("lazy lines under one list item or quote parse in linear time", () => {
  const lazy = Array.from({ length: 5000 }, (_, n) => `lazy line ${n}`).join("\n");
  for (const src of [`- ${lazy}`, `> ${lazy}`]) {
    const t0 = performance.now();
    holds(src, parse(src));
    const ms = performance.now() - t0;
    assert.ok(ms < 100, `5,000 lazy lines took ${Math.round(ms)} ms`);
  }
});

// every link a parse would open
function hrefs(bs: Block[]): string[] {
  const out: string[] = [];
  const runs = (rs: Run[]) => {
    for (const r of rs)
      if (r.k === "link") {
        out.push(r.href);
        runs(r.kids);
      } else if ("kids" in r) runs(r.kids);
  };
  const walk = (list: Block[]) => {
    for (const b of list)
      if (b.k === "heading" || b.k === "para") runs(b.runs);
      else if (b.k === "quote") walk(b.blocks);
      else if (b.k === "list") for (const it of b.items) walk(it.blocks);
      else if (b.k === "table") for (const c of [...b.head, ...b.rows.flat()]) runs(c.runs);
  };
  walk(bs);
  return out;
}

test("random documents keep the rules: runs at their places, in order, never empty, no unsafe link", () => {
  const atoms = [
    "a",
    "word ",
    " ",
    "  ",
    "\t",
    "\n",
    "\r\n",
    "\n\n",
    "*",
    "**",
    "_",
    "__",
    "~~",
    "`",
    "```",
    "~~~",
    "\\",
    "\\*",
    "[",
    "]",
    "(",
    ")",
    "](x.md)",
    "](javascript:alert(1))",
    "](data:text/html,x)",
    "<",
    ">",
    "> ",
    "<b>",
    "</b>",
    "<https://example.org>",
    "https://example.org/a",
    "www.example.org",
    "# ",
    "## ",
    "- ",
    "1. ",
    "- [x] ",
    "    ",
    "|",
    " | ",
    "|---|---|",
    "\\|",
    "---",
    "•",
    "◦ ",
    "– ",
  ];
  // a small seeded generator, so a failure repeats
  let seed = 7;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let n = 0; n < 2000; n++) {
    const len = 1 + Math.floor(next() * 40);
    const src = Array.from({ length: len }, () => atoms[Math.floor(next() * atoms.length)]).join("");
    for (const kind of ["markdown", "lines"] as const) {
      const bs = parse(src, kind);
      holds(src, bs);
      for (const l of leaves(bs)) assert.ok(l.text.length > 0, `an empty run at ${l.at} in ${JSON.stringify(src)}`);
      for (const h of hrefs(bs)) assert.equal(safeHref(h), h.trim().replaceAll(" ", "%20"), `unsafe ${h}`);
      for (const h of hrefs(bs)) assert.ok(!/^\s*(javascript|data):/i.test(h), `unsafe ${h} in ${JSON.stringify(src)}`);
    }
  }
});

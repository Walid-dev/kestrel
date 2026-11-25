# Decision log

One entry per decision: the date, what was decided, why, and what was rejected. Newest on top. Entries are short and
technical; the plan and the runbook carry the detail.

## Decided

- **2026-11-25 · One look: Searches and News are the references; the shared parts their pages share.**
  The parts every page repeats move into `web/src/ui/`, each shown on /design: `Figures` (a page's strip of cells;
  Home's look, `.home-figs` renamed `.figs`; three across on a phone, two when three would leave one alone, one row
  from 48rem), `SectionHead` (the section step, its count in small muted mono, a tone dot when the colour means
  something), `Card`'s `end` (the top line's right end: the date or the source), `figure` (the key number beside the
  title) and `actions`, `FilterPanel` and `FilterRow` (Searches' filter card), `WithRail` and `RailPart` (News'
  main column and right rail, a part headed by an eyebrow). Searches' and News' own files stay as they are: the filter
  rows and the rail are one rule each in styles.css, under both the shared names and theirs (`.search-part`,
  `.news-layout`). Rejected: renaming the references' classes in the same change (their pages would change for no
  look); a part per page (three figure strips, two filter cards, six two-column grids were the cause).
- **2026-11-25 · One app map; each page's eyebrow and the open tab in its app's colour.**
  `web/src/ui/apps.tsx` holds each app's address, icon and colour (Home's colours, moved from home.tsx; the icons from
  home.tsx, app.tsx and news/card.tsx). PageHead's `app` tints the eyebrow; the tab bar and the dock draw the open
  place's icon in its colour (the wolf pink, Live in ink) with its name in ink and no ground behind it, the others
  grey. `Tone` gains teal (Quiz) and magenta (Writing). Every page gets an eyebrow: a top page's says what the app
  holds, a child page's where it sits. Rejected: the accent for the open tab (one blue for every app, and a ground
  behind the icon).
- **2026-11-25 · Small coloured words read 4.5:1 in light too; marks keep the tone.**
  Measured in light, chips read 2.9 to 4.3:1 on their tint (yellow the lowest), red words 3.7, accent links 4.1 to 4.2;
  dark was 4.5 or more everywhere. `--tone-text` (100% in dark, 70% in light) is how much of the tone small words take,
  the rest the ink: chips, tinted eyebrows, `text-tone`, the colour classes (the theme's `--color-*`), `.btn-danger`,
  the back link, an action pill and the drawings' labels; 4.6:1 at least in light, dark unchanged. Marks keep the tone
  (3:1): dots, edges, bars, icons, the ★, so `text-yellow` stays the tone and a word in yellow is `text-tone
  tone-yellow`. Searches' and News' chips darken a little, in light only. Rejected: darker light tokens (every dot,
  edge and the ★ would darken too).
- **2026-11-25 · No tint behind words.**
  A block of words in a tone sits on the sunk ground with a 3 px edge in its tone and its tinted eyebrow or chip:
  `.callout`, `.read-box`, `.quiz-answer`, the drawings' tip, warning and check. Ask's proposed changes (`.ask-card`)
  keep a 2 px edge (the accent, green done, red failed) on the sunk ground; a picked `.tile` keeps the accent's edge and
  ✓ on its own ground. Rejected: lighter tints (still a coloured ground, and a red verdict on a blue page reads wrong).

- **2026-11-25 · Stars on News: each keeps a copy of its story; All days lists them under Starred.**
  Each story card has the star beside Ask and Look deeper: Searches' pill (a yellow ★, Star or Starred), now the
  shared `Star` in `web/src/ui/star.tsx`, shown on /design; Searches' listing sheet uses it too, so both pages draw
  one part. A star keeps
  a copy of the story as its brief told it (headline, text, section, figure, links) with its day, its brief and its
  number, in `news_stars` (migration 028), with no foreign key: deleting a day keeps its stars, and the day's Confirm
  says how many stay. All days gets a Seg, Days | Starred: the stars newest-starred first, each a row (headline;
  section chip, day, first source) that opens its day at the story while that day's page shows its brief, else the
  kept copy in a Dialog (its line says "its kept copy"); the head's line counts them. Unstarring a kept copy asks
  first (it goes for good); unstarring a live one from the list doesn't ask, and its row stays in place, struck
  through, until the page is left, its ★ giving the star back at the same place. Routes:
  `PUT` and `DELETE /api/news/stars/:brief/:n` (zod: a brief's id, a number from 1 to 999 written plainly, so `0x3`,
  `1e2` and `01` are 400; 404 past the brief's last
  story), `GET /api/news/stars`; `GET /api/news` carries each story's star and its day's count, `/api/news/days` each
  day's and the total. A copy is about 1.5 KB; the list comes whole. Why one list across days, not a filter: a day
  holds 6 to 10 stories, so a filter inside a day finds little; a starred story is looked for days later. A test now
  checks that each migration number is used once, from 1: two branches built side by side may each add the next
  number, and a database already at it would never run the second. Rejected: a flag inside the brief's JSON (gone
  with the day); a star that holds its day against deletion (each delete would ask about stars).
- **2026-11-25 · Research asks its questions on the research's own model.**
  `research-ask` leaves the fast list and, with no pick of its own, runs on whatever model `research` runs on (its
  pick, else the careful model), so a research never switches models between its questions and its answer. The two
  local models don't fit in the computer's memory together: a switch costs about 25 s to swap, and the first answer
  after it about 25 s more, on every research that asks first. The Models page still picks each use on its own; the
  questions' description (its hover text) says they follow Research unless picked apart, and their Fallback line shows
  Research's model.
  The questions' call gets 6000 tokens with thinking on (was 2000, set for the fast model): the careful model thinks
  longer, and a call that spends its budget thinking fails, which Research takes as "no questions". No eval covers
  this call. Rejected: a fixed default on the careful model (a pick on Research alone would bring the swap back).
  Replaces: the 2026-11-22 entry's "the fast model, a few seconds".
- **2026-11-25 · Home: the news card without section dots; the head's aside as plain text.**
  The card's headlines lose their section's dot (too much colour on Home); News keeps its indigo word, and the page
  keeps its sections' colours. PageHead's `aside` becomes one statement (any node, no longer two set lines) read as
  plain text: the small step with its own line height, wrapping as words do (balanced: two lines on a narrow phone,
  one from 393 wide), centred on the eyebrow and the title past a thin rule, never stretched to sit level with them.
  Rejected: the statement as the head's line under the title (it reads as well, but adds a row above the news card,
  and a page's line says where things stand, not what the app is). Replaces: the 2026-11-24 entry's aside "level with
  their two lines" and the card's section dots.
- **2026-11-25 · The morning news at 08:00; the page says when.**
  The brief's default time moves from 06:30 to 08:00 (`NewsSettings.time`; due from the set time until noon, a failed
  morning retried once, as before). A `news.time` in the data folder's settings.json wins over the default; deploy
  writes only the Tailscale login there, never news defaults. The News page's foot says the time in effect beside
  Make it now ("Written each morning at 8:00 AM"), from `GET /api/news`'s `time`, in the browser's time format, as
  the empty states and Home's card do; with the news off in the settings, it says "The morning news is off in the
  settings". Replaces: the 2026-11-24
  entry's 06:30.
- **2026-11-25 · The old setup searches the chair hunt again for two weeks; Search now asks it for a deal hunt too.**
  For two weeks the old setup runs the chair searches on its clock (its hunt On) and kestrel's chair hunt is Paused;
  kestrel shows the ads through the mirror. Later kestrel takes all searching over, its collectors and browser its
  own (a plan of its own). A deal hunt whose searches here are all Paused or off, and that the
  mirror brings, sends Search now to the old setup's `POST /api/search-now` (`{"hunt": <its key there>}`). The key
  is the old setup's own rule, `hunt:` and the spec's hunt line lowercased; the import keeps it on each deal it
  carries (`data.oldHunt`), and `listHunts` reports it as the hunt's `old`. Its answers: started; paused; busy;
  waiting until the soonest of its searches is free; every search off (`off`); no such hunt, and any other answer, an
  error. Such a hunt keeps its On/Quiet/Paused switch (the switch shows when the hunt has a search here that is on),
  so it can be turned On here when the two weeks end; its facts come from the mirror, not from its last run here. A deal hunt
  without that key keeps kestrel's own Search now. The rows carry the key from the first mirror after the deploy.
  Rejected: deriving the key from the hunt's name alone (a Paused hunt of kestrel's own would be sent to the old
  setup and refused); reading the old specs folder at each request.
- **2026-11-25 · Search now can't be pressed while its search runs.**
  From the press until the run ends the button says "Searching…" with a small spinner and is disabled: kestrel's own
  runs while any of the hunt's searches is in the line; the press stays pending until the hunts are read again, so
  there is no gap. A run of the old setup started here counts as one of the hunt's searches (`running`, and
  `oldSearching`) until the old setup's Live, read through `settings.oldLive`, shows it ended: seen searching (its
  lock), then not; or not seen searching within 30 s (it ended at once or never started). While its Live can't be
  read, until a mirror lands after the press; never past 2 hours. The old Live was chosen over the mirror because it
  knows within seconds (a mirror lands about 5 minutes after a round, and Searches would stay busy that long). A
  second press from another device adds nothing to the line; a second press at the old setup's door (a double tap,
  another device) is answered "started" without reaching it, as the hunt is marked before the door is asked. The old
  setup's own timer round counts too: its lock is one for all its hunts, so while its Live says it searches, every
  hunt whose Search now goes there reads as searching (its Search now would only answer busy). The press is pending
  for its own hunt only. Busy and waiting answers keep their plain line. The idle words keep the width; on touch the
  busy word ("Searching", no dots) lies over the padding, so a phone's head row never wraps.
- **2026-11-25 · Searches opens the last hunt picked on this device.** Opened with no hunt in its address (the tab
  bar, the dock, Home's apps), Searches opens the hunt picked last here (`kestrel-search-hunt` in the browser's
  storage); when that hunt is gone, the first job hunt, as before.
- **2026-11-25 · Live says what a search is doing.** A run of kestrel's own writes one sentence, as the old Live did:
  its name, its place in the line's round and what its collector found so far ("Model A · Kijiji: 3 of 20, 42 ads
  so far"). The collector's stderr lines stream in (`runCollector`'s `onLine`); only the count travels, never the
  line's words, and each new count takes the sentence's place (`step(text, again)` in `platform/activity.ts`). A
  count is a number before ads, jobs or listings that doesn't follow "of" ("read 4 of 6 job pages" is a total), and
  it never goes down within a run. The round is the runs the line took since it was last empty: the scheduler's tick
  queues its due searches together (the line still runs them one at a time), so a scheduled round says "3 of 20"
  too; a run alone says "searching". The old setup's search shows as one card on Now from its Live (`searching` and
  its lines): its newest search step, timed from its round's first line ("Search time…: N searches to run", else the
  steps back to a 15-minute pause); its deep checks' and follow-ups' steps, written to the same log, are left out.
  Work at work reads
  alike on Live whatever its kind: the green edge and dot, the kind in muted words; the Activity log's search chip is
  muted, never purple.
- **2026-11-25 · Research's sources read as quiet links.** The site name after a claim is small and regular, in a
  softened accent (60% accent, 40% muted ink: 6.2:1 on a dark card, 4.7:1 on a light one, where the light accent
  alone is 4.2:1). On hover an underline, and the accent drawn a quarter toward the body ink (darker in light,
  lighter in dark: the contrast only grows; the plain accent was 4.2:1 on a light card). Two sources with nothing
  between them ([1, 3], [2][3]) part with the facts line's dot, drawn by `Inline` (`learn/blocks.tsx`): a CSS
  sibling rule can't see the words between two links. It was a bold blue pill.
- **2026-11-25 · The collector door names the browser's failure.** A refused connection to the agent's browser is
  "isn't running"; Playwright's "Browser context management is not supported" is the agent's Chrome open with no
  window ("has no window open: the next run tries again"); another failure at its DevTools door "couldn't connect",
  with Playwright's own words when short. Each was "isn't running" before.

- **2026-11-24 · The jobspy wrapper is retired; kestrel's job hunts come through the mirror until the cutover.**
  `scripts/collectors/jobspy.mjs` is deleted. Its LinkedIn reads went out from this computer's address outside the
  old setup's LinkedIn cap; its Indeed reader used Indeed's private app API, a way past the site's bot check; and it
  searched US Indeed, since it set no country. No setting fixed all three. Until the cutover a job hunt's finds come
  only from the old setup, mirrored a few minutes after each of its rounds, and Search now starts the old setup's own
  (the entry below). kestrel's own job searching waits for the cutover, which needs real collectors in the data
  folder. A job spec there that points at the wrapper is switched off or removed before the deploy: one that is on
  fails at each interval and takes its hunt's Search now. The Settings page drops the wrapper's three named settings
  (search words, place, hours); a spec's `env` shows under its own names. Rejected: keeping Indeed alone, set to Canada (still the private app API). Replaces: the 2026-11-21 entry's
  "generic jobspy wrapper until cutover".
- **2026-11-24 · Search now on a job hunt the old setup runs starts the old setup's own.**
  A job hunt with no search of its own here that is on (one mirrored from the old setup) shows Search now. kestrel
  posts `{"hunt": <the old hunt's id>}` to the old server's `POST /api/jobs/search-now`, at the origin of
  `settings.oldLive`, through `toOldSetup` (JSON, no Origin header). The old hunt's id is the hunt's key: the import
  keeps it as its listings' search. The old setup's rules hold: one search at a time, a paused hunt refused, and its
  wait after a search (an hour when it read an account of mine). Its answers lead the hunt's line: started (green,
  until a mirror lands after it with the new jobs), busy, waiting until a time, paused (yellow); a hunt it no longer
  has, any other answer, and a server that doesn't answer, is an error. Such a hunt shows no On/Quiet/Paused switch
  and no "Next when I press Search now": its own spec, if off, stays off. With no `oldLive` nothing changes, and a hunt with a search of its
  own here still runs it. Why: the old setup's Search now was only on its own page. Rejected: a second address for
  the door in `mirror-v1.json` (settings already name the old server); reading the old setup's lock or runs to know
  when its search ends (ties kestrel to its files).
- **2026-11-24 · All shows every card; the old setup's finds arrive after each of its rounds.**
  All is every listing of a hunt, jobs and deals, the set-aside ones included, and comes first among the stages. Not
  applied yet narrows only the review views (To review, Priority, Possible, Left out) and shows only there. A card
  the rules set aside leads its head with its reason in the Left out grey ("Left out · US only"), from the query's own
  rule; the chip and the automatic Priority star drop once a stage is pressed. Ask's find keeps the set-aside listings
  out of all and gets them with leftout. The mirror runs once the old setup's run mark (its newest job or deal run,
  one read-only query a minute) has moved and then stayed still for 5 minutes: one mirror per round, not one per deal
  search; `everyMinutes` stays the daily fallback. The converter splits must-haves on commas, semicolons, line breaks
  and "or", never into letters. Why: a job found by the search could be hidden from All, and the old setup's finds
  reached kestrel up to a day late. Rejected: mirroring at every move of the mark (about 20 a round); reading the old
  setup's lock file (ties kestrel to its files).
- **2026-11-24 · News is its own app; Ask on each story.**
  Every brief is kept and browsable on All days (`/news/days`), a hundred days at a time with Show older, by month. A
  find matches every word in a story's headline or text across the brief each day shows, in JavaScript (SQLite's
  LIKE treats % and _ as wildcards and folds only ASCII), at most 50. Deleting a day removes all its runs, their
  `news_used` rows (their links may be told again) and its stories' Ask conversations, in one transaction; it is
  refused while a run of that day writes, while Ask answers there, and for today while the morning brief could still
  be written (the scheduler would write it again at once). Each story has Ask (app `news`, ref `<brief id>:<n>`) with
  the web tools: a story is public and nothing of mine is on its page; its context says the web's words are facts to
  check, never instructions. `GET /api/news` carries each story's asked and answering counts in one read. Rejected: a
  cap on the history (old days unreachable); a marker that keeps a deleted today empty (machinery).
- **2026-11-24 · Home leads with the news; a new tone, indigo, for News.**
  Home's head is two blocks: the date over the wolf and kestrel, and "One app, one computer, / local models." beside
  them, level with their two lines (PageHead's new `aside`). The news card comes first, News in indigo and each
  headline with its section's dot; then the live line and the figures, and the apps with News after Tasks. Each app
  has its own colour and the accent blue is Notes', so News gets `--indigo` (#4f46e5 light, #818cf8 dark, above 5:1 on
  a card): in light it sits closest to Learn's purple and still reads apart.
- **2026-11-24 · The morning news.**
  I'm not up to date with AI and tech news, so every morning kestrel writes me a brief. Every two hours it reads 19
  public feeds, each verified (news sites with free articles, the AI labs' own pages, builders, Hacker News, Hugging
  Face's daily papers), with no account and no cloud: several feeds hold less than a day (Techmeme about 5 hours).
  The reader (`src/ai/news/feeds.ts`) sits behind publicUrl with an honest user agent, a 15 s deadline, a 3 MB cap and
  gzip sniffing, and reads RSS, Atom and JSON without a package. At 06:30, or when the computer wakes before noon (a
  failed morning retried once, 15 minutes later), the careful model makes two calls: the pick (6 to 10 stories, from a
  broad list of interests in settings, `news.interests`: one passing debate is an example, never the beat) and the
  write (plain words around the facts, the real technical terms kept). The code then keeps only links from what was
  gathered, cuts any web address from the model's words, and checks every number against its sources (value, unit
  and currency; an ungrounded one flags the story). Migration 027 keeps the items, the sources' health and every
  brief. Make it now rewrites today's brief, and an empty run never replaces a full one. Home shows the top three
  headlines; `/news` the whole brief, the earlier days and each source's state. Nothing about me is in the prompts.
  Rejected: paywalled feeds (FT, WSJ, NYT, Bloomberg, The Information), Google News (redirect links), web searches in
  the daily run (undated, noisy).
- **2026-11-24 · Notes shows its work; a printed document reads like one.**
  While notes are applied, the notes column (a bar on a phone) shows the steps, the time so far and what it usually
  takes, Stop as a quiet action, and the review opens by itself. The print page leaves no room for the browser's
  header and footer (a zero page margin, the margins moved into the page): they had printed the page's address, with
  this computer's network name, on a CV meant for employers. A PDF's text joins only the lines that clearly continue a
  sentence (a lower-case start, or a line ending on a comma, a hyphen or a small word), so a role line never merges
  into a bullet; a document that starts like a CV prints like one (the name large, the contact lines small, ruled
  headings, roles in bold, real bullets, 10.5 pt type).
- **2026-11-24 · Searches' head as short facts; Cost in colour; Home's figures small.**
  The line under a hunt's name is now its facts (the last search and what it found, the next one); a 429 is a
  THROTTLED chip whose sentence opens on a tap, with the description, behind About. "+ New search" is visible on the
  page (it was only in the title's switcher). Cost's money takes the money scale's tones, and what running here saved
  against the cloud is green. Home's figures shrank and gained what's next.

- **2026-11-24 · Every page to the Searches standard; Notes' Apply; the chat page never blocks.**
  The Searches page is the bar: one card anatomy repeated, numbers in mono on scales and tones, few chips, almost no
  prose, grids that use the width, one filled button per screen. A study scored every page against it; the lowest
  were rebuilt. Cost: a strip of five figures, the 30-day chart (the period's days lit), one aligned table by model
  with the cloud price as a pill, prices behind a fold, one period switch driving every number. Research: the landing
  fills the height with the ask, the answers kept and About me in two columns. Notes: "Apply N notes" is the one
  filled button, where the notes are (the pinned column's head on a computer, a bar over the tab bar on a phone),
  then the review (keep or drop each change), Save, and a line offering Download and Save as PDF; a draft waiting is
  said in the notes column (migration 026); the print page tells Android to pick Save as PDF as the printer. Home's
  brief became figures, each opening its page; Learn and a pack lead with a figures card; Live's head counts as its
  cards do; Writing and Practice lost their paragraphs. Kestrel's Chat page lost its head on a phone (the tab bar says
  Chat) and shows its own-window link only when the frame reports it isn't up. The light accent stays as it is.

- **2026-11-24 · Every page in the new look.**
  Four groups took the spec's page entries, each built, reviewed and fixed. Searches: the title is the hunt switcher
  (its dialog ends with + New hunt); the filters fold on touch and sit one row per part under a mouse (the first
  listing moved from 1134 px down a phone to about 400); a card's Apply is a plain button, so the grid shows no filled
  one; the listing sheet keeps one filled Apply. Applications: the after-sending counts in the line under the title,
  Notify this phone at the page's foot. Learn and the quiz: content-width Segs with hint lines, a question page's h1
  is the question itself, one primary per screen (a lesson's Listen; the grades plain). Notes: Doc takes the page's
  own tools into its head (`tools`), so the reader's buttons fit two rows on a phone; the floating Note button is a
  soft accent, not filled. Research's About me is one row. Home, Live, Chat, Cost, Tasks and Models: Lists in place of
  stacks of small cards, Cost's period a Seg, Models' picker a Dialog of Pills, Tasks' who chip on its own line on a
  narrow phone (a tap on the words always edits the words). Known couplings to recheck if Doc or Seg change: Notes'
  `.doc-tools` and Research's `.seg-field` use `display: contents` on narrow screens.

- **2026-11-24 · A smaller, calmer look; no bar on top.**
  The fonts read too big and some buttons huge. A measuring pass over every page at a phone's and a computer's size
  fed two proposals (compact; calm) and a judge, who took the compact one as the base. Type: nine steps, UI text 13,
  running text 14, a top page's title 26 (34 before), a child page's 22; one touch block makes small, detail and body a
  step bigger. Controls: one ladder, 24 / 26 / 30 / 36 under a mouse (38 to 78 before), 32 / 36 / 44 drawn on touch,
  every touch area exactly 44 through an invisible `::after` (reversing the 2026-11-23 rejection: an overlap sweep
  found no clash with the row gaps the rule sets). Cards flat, radius 12; one filled button per screen; motion in five
  tokens, all off under reduced motion. The top bar went (its chip repeated the Live tab's dot): each page starts at
  its title, the wolf is Home in the tab bar and the dock, Live carries the status as a badge, and under a mouse the
  same mark sits in a corner, never on Live. The light accent stays #3d74f0 (4.06:1 for its words; kept by choice on 2026-11-24).

- **2026-11-24 · One file per page; a bad request answers 400; test copies never reach the models.**
  The web app was one 566 KB file: each page is now its own file (React's `lazy`, one table in `web/src/pages.tsx`),
  so a cold `/searches` sends 108 KB of script instead of 566 (brotli); the tabs' pages are fetched quietly after the
  first paint. The service worker lists no files: `/assets/` (hashed, so safe) is cache-first, everything else
  network-first with `cache: "no-cache"`, so a page the browser kept from before a deploy never wins; one visit leaves
  every page's file in its cache. Its cache is never pruned yet (about 270 KB a deploy). A request the server can't
  read answers 400 in plain words (malformed JSON, a validator's refusal), every other failure a 500 with no path
  (`src/server/errors.ts`). Outside the deployed app, a model or voice door that settings.json doesn't name is a dead
  local address (`DEAD_DOOR`), so a development run, a test or a builder's screen check fails fast instead of asking
  the computer's models; a live eval reaches the real door on purpose (`liveModels`: MODEL_DEFAULTS, `--url` or
  `KESTREL_MODEL_URL`). Left: a raw zod error shown as `[object Object]` needs one shared validator hook.

- **2026-11-23 · A last audit of the merged app, and its fixes.**
  One read-only pass over every page at a phone's width, sideways and a computer's found nothing broken and 17 places
  where pages disagreed or read rough; all fixed. One stage map gives Searches' colours (To review muted everywhere);
  chips keep their meanings (pink only for needs me). A plain text box is `.input`, never `.btn`; head buttons have one
  size, set by PageHead; fold-out headings are `.disclosure`, 44 px on touch. The listing sheet keeps only its title
  and ✕ in view. On a phone turned sideways the Notes reader shows the document's first lines. A quiz model whose door
  is down answers 503, not 400.

- **2026-11-23 · Every page on the shared parts (v0.9 step 3).**
  Searches, Writing, Research, Home, Live, Chat, Applications, the quiz, Tasks, Models, Cost and Ask's box moved onto
  Page, Card, EmptyState, Field, Pills, Dialog and the token classes, each to zero one-off inline values, each checked
  beside the earlier build at a phone's width, sideways and a computer's, in dark and light, then reviewed. The
  listing sheet became the wide Dialog (its own scroll lock went). Applications' state picker is Pills with counts;
  Stop on an application keeps its two-choice question, since Confirm has one yes. Show all is an action pill, not a
  stand-in value. Cost keeps its figures when a refresh fails; Models names each recorded call by its use. The UI
  audit's page findings were fixed with the move (one title size and case, labelled choices, the pay pill's contrast
  in light, tap targets). Notes moved last: on a phone a document now starts 100 to 130 px higher; a 404 says the
  document is gone instead of retrying. With every page at zero, the design check's baseline is empty: any new one-off
  inline value fails the check.

- **2026-11-23 · The tokens as classes, the page parts, the phone's floor, and a ratchet on one-offs (v0.9 step 2).**
  `@theme inline` names the role variables as classes read at run time (`text-muted`, `bg-surface`…), so one switch
  still flips dark and light; 28 font sizes in use fold into 8 named steps. Page/PageHead (one title size and case, a
  back bar, two widths from one left edge: titles sat at 40, 64, 256 or 394 px), Card, EmptyState, Field and `cx()`
  join `web/src/ui/`, and Learn moved onto them first. Navigation follows the pointer, not the width: phones turned
  sideways and touch tablets had none. On touch every control is 44 px and every text box 16 px (three made iOS zoom).
  A dialog's scroll lock pins the body, since `overflow: hidden` is ignored in a home-screen app (WebKit bug 259568).
  `scripts/check-design.ts` counts one-off inline values per file and fails when a count rises (432 left in 22 files,
  the next wave's work). Rejected: a component library or cva (no new package); invisible hit boxes for the 44 px floor
  (they overlap in wrapped rows); failing on every existing one-off at once (the pages move one at a time).

- **2026-11-23 · Ten server fixes from a review of the night, each with a test that failed before it.**
  An Ask answer that breaks ends as failed (it stayed "writing" until a restart, refusing every question). Nightly
  copies are named to the minute (two on one date failed for hours); a failed copy tries again an hour later, not
  every minute (one failed Live entry each time). Retry and a stopped chat picked up again keep "one open application
  per link". Ask's tools are chosen per page: on my own words (Interview prep, the Personal group, interview quizzes)
  no web tool, and on a page with the web the read tool opens neither a Notes document nor a lesson of my own. "Due"
  has one meaning, a lesson I graded whose review date has come, counted by one function on every screen; Practice
  keeps the due lessons that have a question before its 20-row limit (20 due guides had filled it, so it said
  "Nothing due" while Learn said 21) and counts guides due as "reread". A deep check a restart cut short ends as failed
  at start. The page reader opens public addresses only: by name, by address after resolving, through the redirects
  a HEAD shows, older IPv6 forms included; a page that answers HEAD and GET differently can still pass, since the
  model door fetches on its own (a door-side refusal of private addresses is the full fix, later). zod reads Live's
  Stop, Pause and Activity and the old setup's chats; a failed old-database import closes its file; a failed tick's
  log line carries no path. Left: malformed JSON answers 500, not 400, on every route (one change to root.onError).
- **2026-11-23 · A quiz on the lessons I pick; quizzes archive and delete.**
  Under a topic, its packs and lessons show as Pills, several at once (the pack `<select>` went); nothing picked is
  the whole topic; a line says what the quiz draws from. Every picked id is checked against the area, the topic and
  the packs, or the start is refused in words. Picked lessons may go round their other questions; a whole topic or a
  pack asks each lesson once, as before. Migration 025 adds `quizzes.archived`: Archive takes a quiz off the list and
  Restore brings it back (no question asked, since it undoes); Delete asks through Confirm and removes the quiz and its
  Ask messages, while my answers stay (they still decide what comes back first). The list lost its hidden limit of 12:
  every started quiz, the first 8 done ones, then Show all. Due on the quiz is Learn's own lesson state, the same on
  the tiles, the header and the pills.

- **2026-11-23 · Every document reads through one part: Read, Edit, Side by side, Download, Save as PDF.**
  `src/shared/markdown.ts` parses Markdown in kestrel's own code (no package), and every text run keeps its source
  offsets, so notes mark rendered words and a selection maps back to the exact characters. Raw HTML stays text; only
  http(s), mailto and relative links open. `web/src/ui/doc.tsx` shows a document: Read, Edit (a mono editor; Cmd/Ctrl+S
  saves; unsaved words wait on the device) and, at 1024 px and wider, Side by side. A hand edit saves like a draft
  (versions, Undo, encoding kept) and only on the revision it started from: a 409 reloads the newer text and keeps my
  words. A PDF's text keeps its lines; •, ◦, ▪ and – start list items; a short line in capitals is a section title.
  Save as PDF is a print page in its own tab (`/notes/<id>/print`), since a home-screen app on the iPhone can't print
  in place; its body text is Helvetica Neue, because Chrome prints the variable IBM Plex Sans as Type 3 fonts whose
  words read back broken, bad for a CV an employer's system reads. kestrel keeps no copy of an uploaded PDF, so
  there's no original to download; the line under the title says so. From the home screen a download goes through
  the share sheet, where a plain download ends on a screen with no way back (WebKit bug 290847). Rejected: a Markdown
  package (the no-new-package rule; offsets needed anyway), server-side PDF making (machinery), a WYSIWYG editor.

- **2026-11-23 · Shared Dialog, Confirm and Pills (v0.9, step 2 begun).**
  The browser's `confirm()` and `<select>` go: they can't take the app's look, and the pop-up looks foreign on the
  iPhone. `web/src/ui/` holds Dialog (native `showModal`), Confirm (`useConfirm()`, a promise) and Pills (buttons with
  `aria-pressed` in a fieldset, as `.seg` already was). A second Confirm while one is open answers no at once, and a
  route change answers no, so a double tap or Back never deletes twice or on a page left behind. In light mode the
  filled red action uses `--poor` (4.7:1; `--red` reads 3.5:1). The Switch hunt menu became a button that opens the
  hunts as pills, so the title line stays clean. Rejected: a dialog package (Radix and the like) under the
  no-new-package rule; native radios for Pills, since `.seg` already used `aria-pressed` and both read well.

- **2026-11-23 · One set of read tools for Ask (v0.8, step 3).**
  `src/domain/ask/tools.ts` holds read (a lesson, a listing or a document by id), web and page, each with when it
  helps and its shape; Ask's prompt lists those its page allows and its loop runs them beside the page's own find.
  Pages of my own (Notes, Writing, Applications, Tasks) read only: no web tool, so nothing of mine reaches a search.
  Research and the deep checks keep their fixed steps over the same web functions. Rejected: an MCP server for
  them (one app's own agents; MCP waits for a second program, step 4).
- **2026-11-23 · One catalog of drawings (v0.8, steps 1 and 2); a review of every text an application sends.**
  Seven kinds (flow, compare, tree, timeline, chart, callout, check) live in `src/shared/blocks.ts`: when each helps,
  its shape, and a reader that keeps what fits; one that doesn't read shows as words. One renderer draws them for
  Ask, Research and the lessons. Ask's prompt (v4) and Research's (v3) list them from the catalog; Markdown keeps
  text, lists, code and tables. The readers are plain TypeScript, not zod, since the page reads the same file. The
  image and video link waits: local models invent addresses. Eval: 15 of 18 live runs pass on both models
  (`docs/eval/2026-11-23-blocks.md`). Writing reviews each try as the company would read it (the match, the fit,
  generic lines, the voice, the facts); the review's better version replaces the draft only when the applications'
  check passes it, and the first draft stays in the try's notes. The apply skill's `apply-review` calls the same
  review (`POST /api/letters/review`). v0.9 is the design system, after v0.8. Rejected: a model-only match check (a
  letter that doesn't name its company is marked by code, whatever the model says).
- **2026-11-23 · Stop and Pause from kestrel; Enter sends; About me in Notes; deletes on every list.**
  Live's chat card and the Chat page carry Stop. On an application it asks: only this one (the next queued one
  starts), or this one and the queue (the queue pauses first, so nothing starts between). The queue line on Live has
  Pause and Play. Both go through kestrel's server to the old setup's existing routes (`/api/chat/stop`, which calls
  dsh's keyed `/chat/stop`, and `/api/queue/pause`, whose pause also holds kestrel's claims), so neither dsh nor hunt
  changed. Search cards and the listing sheet show the application's state (Queued, Applying, Needs me, Sent; Apply
  again after Not sent) in place of a fixed Apply. Text boxes show the focus by their border, not a ring. Enter sends
  in every box with a send button; Shift+Enter makes a line. The flow drawing lies across the page, a colour per step,
  and turns vertical when narrow. A quiz can ask new questions, each written by the model away from the lesson's own.
  Research and Writing's tries delete from their cards. About me left Research's page for a file opened in Notes, like
  the voice and the stories (versions kept; its path is in `platform/paths.ts`). A PDF's text says it never changes
  the PDF, and downloads or copies. Rejected: a stop route of kestrel's own into dsh (it would need dsh's key).
- **2026-11-23 · Notes reads like a lesson and keeps every version; lessons teach the field.**
  Picking words shows a Note button beside them (no mode to switch on); the page says what it is and how notes work;
  "Turn my notes into an edit" waits for a note instead of failing. Every save and undo keeps the words they replaced
  (migration 024), and Restore brings any of them back, never over a file changed outside kestrel. My voice and stories
  are reworked there (Writing opens them; its own editor went), so they have one way to change and a history. Outside
  my Personal packs, Ask, the quiz's questions and its explanations teach the field, not my setup; the 20 AI and
  Platform lessons written through my setup were rewritten by the careful model into the field's terms, the old text
  kept in the data folder's backups. Research lays its report beside its sources; the flow drawing became a vertical
  stepper. Chat on a computer opens dsh through its door, so the first visit carries the sign-in. Rejected: a lesson
  rewrite by hand, one by one.
- **2026-11-23 · One Ask on every page; Ask draws; PDFs through the computer's own engine.**
  Ask is one box, the page wide, at the same kind of place on every app; its head opens and closes it (kept per app
  in this browser). Notes' moves under the document (its side column was too narrow); Searches' sits under the
  title and its own Ask button opens it. Research, Writing and Applications get it (Applications proposes Retry as a
  card); Interview prep's answer-packs open on Learn's lesson page, which has it. Ask draws two kinds of picture the
  page lays out itself, a flow and a comparison, named in its prompt as JSON blocks: a model can't place a hand-made
  diagram's coordinates well in a chat, so Learn's diagrams stay for lessons. A PDF upload in Notes becomes its text
  through Apple's PDFKit, the engine Preview uses, in a small program of its own process that deploy builds: nothing
  to install, Apple's updates, and nothing in a PDF runs. Rejected: pdf.js through unpdf (a 3 MB package running
  inside kestrel). Writing takes Learn's tiles and headings; "Left to do only" became "Not applied yet".
- **2026-11-23 · Ask reads like a lesson; the switch in three colours; left to do only.**
  Ask's answer takes the lessons' boxes: the direct answer in its own tile, headings as a lesson's, each point of a
  list in a tile with its mark, a quote in the example's box (labelled by a short line before it); a one-line head
  and a line to ask with its send button inside, tightening in a narrow column instead of wrapping. The quiz shows
  what I said and the lesson's answer side by side as tiles. The hunt switch lights each mode in its own colour as
  the old pages did (On green, Quiet amber, Paused red). "Left to do only" (on by default) hides from the review
  views a job that has an application or that I applied to. The deep check chip stays one colour, its verdict's.
- **2026-11-23 · kestrel pings my phone, and the chair hunt lives here.**
  kestrel sends pings through ntfy, the old setup's channel (my yes): each channel's topic is read from its file at
  send time and never printed or kept. This lifts v0.3's "no push service that leaves the computer" for pings only;
  what a ping says is the deal (model, price against the usual, place, site), as the old ones did. A deal hunt that is
  On pings after a run for the new deals in view at 65% of the usual price or under, one ping per run. The 20 chair
  searches run at the old timer's 10:00 and 20:00, On; their first catch-up ran Quiet, so no ad already pinged by the
  old setup pinged again, and the old chair hunt is Paused (its own switch). The job hunt is Quiet: kestrel doesn't
  ping for jobs while the old Job Hunt does. Rejected for now: the old Deal Hunt's model read of every ad (the rules
  and a deep check on tap stand in for it).
- **2026-11-23 · Searches' head as the old hunt page, with its switch; Live shows the agent's steps.**
  The title, On / Quiet / Paused (written to the hunt's search files: auto and alerts), Search now, + New hunt,
  Settings and Ask on one row, the other hunts in a menu at its end; under it the goal and a status line (the last
  search added up over its go, the best find, the next search). Cards: the model's read blue, the deep check chip blue
  with only its verdict coloured, the last opened card marked, the picked filters shown while folded; applying green
  everywhere, and Home's live line opens Live. Live shows an application's chat step by step, read from the old
  setup's Live until kestrel reads dsh's chats itself (`settings.oldLive`).
- **2026-11-23 · Ask on Notes and Tasks.**
  Notes proposes notes (on exact words, or the whole document) that my tap adds; the page's own Ask for changes then
  edits, so a document keeps one way to change. Tasks proposes adding, changing and closing tasks. Both follow the
  Searches blocks; the domain tests cover a dropped card and each tap; a live question on each list was checked.
- **2026-11-23 · Ask acts on Searches: a find it runs, changes it proposes as cards.**
  The model sees the hunt (its counts, its best open listings, each line starting with the listing's id). It asks
  kestrel for more with a fenced `find` block (words, remote, pay, price, a stage, a match), whose matches go back to
  it before it answers, two looks at most; it proposes a change with a fenced `action` block (a stage, a deep check,
  an application), which becomes a card under the answer that only my tap runs, through the page's own functions.
  Blocks never show as code; a change on a listing that isn't there is dropped, and a link to one becomes plain
  words. Chosen over the door's tool calls: the blocks stream with the answer, need nothing from the client and read
  the same on both models; the live eval passed 24 of 24 on the final prompt, after three prompt changes it measured
  (docs/eval/2026-11-23-ask-searches.md), so Ask keeps the fast model. Rejected: a change made without a tap.
- **2026-11-23 · The apply queue gets its hands: the old setup's runner.**
  Apply queued in kestrel, and nothing ever claimed the queue: the old runner (hunt serve, one task at a time) now
  takes kestrel's next application once nothing works and its own queue is empty, starts the agent's chat as before,
  and reports the end back (sent, not sent and why, or waiting at the computer). kestrel's searches wait while an
  application is at work, and its claim waits while a search of kestrel's runs. Rejected for now: kestrel starting
  the chat itself (it would need the old runner's chat reading, report and ping again: the cutover's work).
- **2026-11-23 · A job open only elsewhere is set aside.**
  A search's scoring may say where a job must be open (`places.within`, the first word naming it) and what a posting
  says when it isn't (`places.closed`); a job whose place names somewhere else, marked US only, or whose text closes
  it is set aside with why, at scoring, on a spec save and in the nightly mirror. A short code in capitals counts only
  as its own word; a junk place line or a bare two-letter code keeps the job. A dry run on the real listings came
  first: what it newly set aside was all outside.
- **2026-11-23 · One tab per job search; searches at set times.**
  A job search without a hunt of its own no longer stamps its name on what it finds (migration 022 clears it), so its
  finds and the carried-over ones share one tab. A search may run at set times of the day (`times`), sleep-proof,
  ahead of moving the deal searches here on the old timer's hours.
- **2026-11-23 · The look: a plain dock, a colour per app, Chat from edge to edge, the Quiz start made over.**
  The dock's coloured tiles go (they didn't look good); on Home no two apps share a colour (Searches green, Learn
  purple, Quiz teal, Writing magenta: two new tokens). On a phone, Chat fills the screen between its title and the
  bottom bar, with no frame around it. The Quiz start page: the started quiz large with a ring, the new quiz as
  bars and tiles with one button that says what it starts, two columns on a computer. dsh's chats page drops its
  cards inside kestrel's frame, and keeps the old app menu when opened on its own (the setup's log, 2026-11-23).
- **2026-11-22 · Ask on every page, one conversation per page.**
  One Ask for every app (web/src/ask.tsx, /api/ask): each app's helper writes what its page shows; the
  conversation is kept per page (ask_messages, by app and ref); the answer is Markdown, streamed into its row and
  read by the page while it grows, so leaving the page loses nothing. One model use, `ask` (it replaces
  `learn-ask`; a saved pick carries over), the fast model by default after the live eval
  (docs/eval/2026-11-22-ask.md); the eval now scores Ask's prompt. Built on Learn's lessons and the quiz's
  questions; actions (reading ones at once, changing ones as a card to tap) come per app, Searches first
  (docs/tasks/v0.7-ask.md). Rejected: a JSON answer of ten lines (it could not stream, nor hold code or a table);
  Server-Sent Events per answer (polling a row while one writes is simpler and survives leaving the page).
- **2026-11-22 · A quiz is kept as I take it.**
  The questions, my answers and marks, and my place live in `quizzes`; the quiz page lists the started ones to
  continue and the ended ones with their score; a question opens again from the score, with its Ask. A question
  written for a lesson without a check is kept in the quiz. Rejected: keeping the quiz in the browser (leaving lost
  it).
- **2026-11-22 · A deep check's verdict in its colour; one colour per app.**
  The deep check chip takes its verdict's colour (apply or buy mint, maybe or negotiate orange, skip coral). Every
  app has its own colour, the same on Home's cards and on the dock's tiles. Rejected: one blue chip for every
  verdict (good and bad looked alike).
- **2026-11-22 · The money scale, loading that shows, and colour by meaning.**
  A pay or price pill takes the old hunt pages' scale by match or deal (mint, lime, amber, coral); the model's read
  is purple, the deep check blue, remote cyan; Learn's packs wear their parent's colour (Personal green, AI purple,
  Platform blue) and Review today is cyan. While a filter's results load, the old cards and counts stay dimmed
  under a sweeping bar (keepPreviousData), the first load shows skeletons, and a pressed stage shows at once.
  Rejected: one green for every good thing (the page read as a wall of green).
- **2026-11-22 · The quiz explains; Research asks, knows me and names its sources.**
  After each question the fast model writes the answer as a small lesson (in one line, break it down, an
  analogy, code when technical, the usual mistake, a line to remember), started while I answer and kept per
  question; I don't know counts as a miss. Research may ask up to three questions first (the fast model, a few
  seconds); About me and the context folder's files go into the writing prompt only, never into a search query;
  each [n] becomes a link named for its site. Rejected: a richer marking call (slower, and the mark is not the
  explanation).
- **2026-11-22 · Writing, not Cover letters; Tasks the old Hub's way; notes on just the words.**
  The writing lab writes a letter, a form's answer or any text for a job, each the application's way, a PDF only
  for a letter. Tasks takes the old Hub's list: whom a task is for, words edited in place, a round tick that asks me
  no note (an agent's close keeps its note), delete. A note's selection is decided once, when the pointer lifts: a
  click handler after the note box took the focus had found the selection gone and noted the paragraph.
- **2026-11-22 · A dock at a computer's edge; Chat by device.**
  On a computer the right edge slides in every app, the old pages' dock. Chat on a computer opens dsh's own app at
  the address its browser is signed in to, in a tab; on a phone it frames the chats page and opens its own window
  through dsh's door. Rejected: framing dsh on a computer through the private network's name, where the computer's
  browser is not signed in.
- **2026-11-22 · Research, Quiz and the letter lab reuse what exists.**
  Research answers in the lesson shape (the blocks Learn already draws, read by Listen), from the model door's own
  search and fetch: quick reads three pages from one search, deep reads six from the searches the model plans; each
  answer is kept. Quiz asks the lessons' own checks (missed lately first, then due, then the rest); the model only
  marks, or writes a question for a lesson without one; the answers are kept so misses come back. The letter lab reads
  the apply skill's letter step from the skill file at run time, writes with my voice, stories and facts, runs the
  applications' own check (each finding back to the model, two fixes at most) and their own PDF tool; voice and
  stories are edited in place, the old words kept in the data folder. Rejected: a letter prompt of kestrel's own (it
  would drift from the skill); a quiz that moves Learn's review ladder (not asked; the answers are kept for later).
- **2026-11-22 · The chair hunt runs in kestrel when asked, with the old collectors.**
  `convert-v1-specs --deals` turns the 20 old deal specs into kestrel searches that run the old collectors through
  node with the old engine's knobs (term, pages, price range, age), under the same file names, so each owns the
  listings the import brought. `auto: false` keeps them off the clock while the old setup still runs them twice a
  day; Search now runs every search of a hunt in the background and counts them down. The deal rules follow the old
  specs: required and excluded title words, a price floor and cap, the ad's age. Rejected: porting the collectors
  (they work, and Facebook's needs the agent's Chrome as it is); both setups on the clock (twice the load on the
  sites).
- **2026-11-22 · Cards keep the model's read; the page opens on To review.**
  The model's read is short and stays on the card; the deep check shows its verdict as a chip, or a blue button that
  starts one, and its report waits in the open listing. The page opens on To review, best first (Priority also counts
  jobs already applied to). Reset is a round button by the search box, always there, lit when a filter differs.
- **2026-11-22 · Chat frames dsh's chats page, in kestrel's look.**
  The chats page sent `frame-ancestors 'none'`, which blanked kestrel's Chat. It now allows the same machine name on
  any port, and nothing else, and wears kestrel's colours and IBM Plex fonts; the old app menu is gone. The page
  lives in the local dsh additions, outside this repo; the frame rule needs a dsh restart.
- **2026-11-22 · v1's stages, the activity log, Learn's parents, the phone bar.**
  To review, Possible and Left out follow v1's rules exactly (left out: new, set aside by a rule, no note; v1's fair
  is weak). An ended activity is kept, so Live's Activity shows the week with a link to each piece of work, and Live
  opens on it when nothing runs. Packs sit under a parent (Personal first, then the technical ones). The phone has a
  bottom bar: Home, Searches, Chat, Learn, Live. A search's settings page writes its file and rescores what it found;
  a skills list split into letters reads back as words (it had scored every posting great).
- **2026-11-22 · Two flakes fixed at the root, and room to think.**
  The deploy retries `launchctl bootstrap` for ten seconds: bootout returns before launchd lets the old service go,
  so every first deploy failed with status 5. A web search that comes back empty or refused is tried once more after
  two seconds. A model answer that ran out of room while thinking says so (the stream's finish reason), and the letter
  and Research budgets cover the thinking and the answer.
- **2026-11-22 · Port the old pages' strengths, not just their features.**
  The first pass built thin screens; the second ports what v1 already does well, checked against its own pages:
  Learn takes the old Learn's method (review from memory, Say it, Record me, the 1-1-3-7-16-35 ladder) and the
  guides' pages (a topic per lesson with its blocks and hand-placed diagrams); Searches takes the hunt page (tabs,
  stages with counts, cards with the pay or price pill, the match bar, the model's read, the whole listing on a
  tap); Live and Cost come over whole. Rejected: inventing new layouts where v1's were already settled by use.

- **2026-11-22 · Packs live in an area: Learn or Interview prep.**
  Learn is for learning; work-specific content (the work topic, the answer files for jobs and projects) starts in
  Interview prep, with the interview helper. One column and one tap move a pack either way, so where work content
  finally lives stays my call. Rejected: deleting or splitting the content — the move is reversible.

- **2026-11-22 · The import reads v1's owner column.**
  v1 keeps my own marks apart from the listing: stars, notes, and every application attempt. The import now carries
  them (193 attempts into Applications, the employer from `company`, the model's read, 42 deep checks), and a deal
  spec's head (hunt, model) groups the deals; a retired spec joins the only deal hunt. Deep checks run here as in
  v1: oMLX's own fetch and search, then the careful model, with a Models-screen use to pick it.

- **2026-11-22 · The computer's voice and ears are one local server.**
  Listen speaks with the Kokoro server v1 already runs (cached in the data folder), and the interview helper hears
  with its Parakeet; both doors must be loopback, like the model door. The device's voice is the fallback.

- **2026-11-21 · The v0.4+v0.5 sweep: one agent round, the rest triaged by hand.**
  The sweep's finders confirmed one serious miss — imported lesson ids hold slashes, so no imported lesson could
  open — plus a dozen honesty gaps (raw 500s for missing things, calm empty states over failed loads, a hot mic
  when the finger lifted during the grant, the brief capped at the practice queue's first page, import CLIs able
  to land real content in the dev folder). All are closed in one commit with tests. Process change, his ask
  ("do not overuse our usage"): verification fan-outs are done — findings are triaged in the main conversation
  by reading the named lines, and the independent read stays with the second model's review rounds.

- **2026-11-21 · A deal is its link; a job is its org and title.**
  The real deal items broke UNIQUE (search, dedupe): second-hand posts share titles and carry no seller name, so
  org|title is the wrong identity there. The engine's dedupe now follows the spec's kind — jobs keep org|title (a
  repost under a new link is the same job), deals use the link (two same-titled chairs are two chairs). The v1
  import carries the old deals the same way: 426 landed, the vocabulary mapped onto the one status set
  (contacted→applied, not→passed, sold→closed), the 0–10 score onto the 0–100 card. Rejected: widening the status
  vocabulary for deals — one set keeps every screen and filter shared.

- **2026-11-21 · The Learn import maps each old shape to the one lesson shape.**
  The old lessons land as packs by topic, their one-line short opening the explanation. A guide contributes its
  term entries as lessons (the {like} analogy lines read plain) and its glossary as a closing Words lesson; the
  prose stays on the old page until retirement. An interview answer file becomes an answer-pack: the A lines are
  the say lines, M/P/W the explanation, the K points the example, and the question itself a check — so Practice
  can quiz prepared answers and Live can find them. Stable ids everywhere: a rerun updates, never doubles. The
  real run: 12 packs, 325 lessons.

- **2026-11-21 · The door's ear is not a chat model.**
  Live transcribes through the door's own ear, found by name (EAR in src/ai/asr.ts), and the Models screen's picks
  filter ears out — a switch to one is refused. The ear's files fail to load in oMLX right now ("not supported for
  stt"); kestrel's side relays that in plain words and works unchanged once the door reloads it.

- **2026-11-21 · Ask's fallback is the careful model; the second live eval is on record.**
  The Ask eval ran live, 13 of 16 (docs/eval/2026-11-21-learn-ask.md): the careful model 8 of 8, the fast one 5 of
  8, every failure a line too long to say in one breath. Ask is awaited and Listen speaks it, so the fallback in
  `modelFor` moves to the careful model; the Models screen still switches it per use. Rejected: loosening the
  one-breath rule to fit the fast model — the rule serves the ear, not the model.

- **2026-11-21 · The v0.2 sweep's eleven findings are fixed in two rounds.**
  An orchestrated sweep (finders per lens, adversarial verifiers) confirmed eleven distinct findings; all are
  closed with tests: filters moved into SQL before the window (a starred row can never vanish behind newer rows);
  dedupe scoped to its own search, so two searches sharing a link each keep their own score; the scheduler takes one
  tick at a time, lands a crash as a run row, and one broken spec no longer stops the rest; pay annualizes its
  period before the floor and the card shows the honest range; the nightly mirror reports on the Searches page;
  the Models screen shows load failures and refused switches; phone form controls hold 16px so the keyboard never
  zooms; run-now refuses a switched-off search; the service log carries one-line errors, never stacks; and the
  fixtures went fictional, so the public tests read as fixtures, not as anyone's hunt. Two reported findings were
  checked and found false (the importer dying mid-loop; the backward clock).

- **2026-11-21 · The v0.2 plan review's three findings are in the contract.**
  (1) The collector door's whole contract is stated and built: a script runs in its own folder with the spec's env
  and budgets, browser-down is its own problem kind, and runs go one at a time whoever asks — the collectors share
  one browser tab. (2) The import is idempotent with the old database as the status authority until cutover; its dry
  run proves stars and scores, not just row counts; a converter turns the old hunt specs into data-folder files; pay
  carries its period and an hourly wage annualizes before the floor. (3) The side-by-side week never double-drives
  the browser: the old setup keeps the browser scripts, kestrel mirrors nightly through the import and runs only its
  generic jobspy wrapper until cutover. Also from the review: a Models pick must be one the loopback door offers (the
  switch is refused when the door is down), and the old "refuses a model not listed in my settings" line in AGENTS.md
  now states the real rule.

- **2026-11-21 · Auto mode for v0.2–v0.5; the search engine is generic, the sites are data.**
  The builder builds the remaining versions without per-step GOs, pushing continuously to this repo only; reviews
  run per version by orchestrated agents and at the end by a second model over the whole repo. For Searches, the
  repo holds a generic engine (specs, runs, limits, scoring, reporting) and speaks the old setup's collector
  convention; the per-site scripts and my search terms live in the data folder, since they are personal and
  site-fragile. Rejected: porting site scrapers into a public repo.

- **2026-11-21 · Round 2 is applied: ten findings, ten commits, each with its test.**
  The rules it added: the model door must be loopback — documents never leave the computer; a change must cite a
  real open note on its own document, and a note the model forgets is named, never dropped; documents travel to the
  model under their full path, so same-named files cannot cross; undo refuses a file changed since the save; a
  mixed-line-endings file is refused rather than rewritten; uploads send their raw bytes for the server to judge;
  the review diff is bounded; settings errors are path-free; content decides what is text. The outcome table:
  docs/review/round-2-v0.1.md.

- **2026-11-21 · Darker ground, the neon working colours, pink kept; Enter submits; the review opens itself.**
  The One Dark structure stays, on a darker ground (`#15171c`) with brighter text, and the working colours step up to
  the editor-neon shades the code palette uses — pink comes back for the note marks. Enter submits in any box
  (Shift+Enter makes the line), the app's rule from here on. When an ask finishes while the screen is open, the
  review opens by itself. Clicking outside a box closes it, like Esc and Android's Back — the common flows hold
  everywhere.

- **2026-11-21 · The colours are the editor's own theme; noting is a mode.**
  The palette is Atom One Dark, read from the editor's theme file (and One Light for light mode): blue `#61afef`
  leads, with the theme's purple, green, orange, yellow and red as the working colours; the pink accent is retired.
  Buttons speak with one voice (`.btn` in styles.css, the hunt pages' size), headings use `--strong`. The review
  reads as a code diff: minus lines red, plus lines green, the whole document when it is small, the changed parts
  with context when it is big; a draft keeps the text it was made from for that. Noting is off by default: a switch
  turns it on, and then selecting words or tapping a line asks for the note at once; each note in the rail carries
  its own delete.
  Replaces: the pink-led palette of the same day. Rejected: pink as the main colour; the two-colour inline word diff.

- **2026-11-21 · The models for Notes, and how they are asked.**
  The first live eval (docs/eval/2026-11-21-changes.md): 31 of 32 runs pass. Qwen3.8-27B-oQ4e-mtp is the careful
  model (16 of 16, 9–40 s) and Ornith-1.5-35B-A3B-MLX-4bit the fast one (15 of 16, 2–53 s; one empty answer on the
  trickiest case, which the app turns into a failed draft). Asks run with thinking on — the fast model drifts from
  the shape without it. The model door's JSON mode stays off for the big write: its grammar pushed both models into
  top-level arrays; the prompt asks for one object, and the client parses the whole text, falls back to the brace
  slice, and unwraps a one-object array. Defaults live in `src/platform/config.ts` (MODEL_DEFAULTS); settings.json
  overrides them in the deployed app (outside it, a door the file doesn't name is a dead one: 2026-11-24).
  Rejected: the door's JSON mode; thinking off for the fast model.

- **2026-11-21 · The palette is the code palette; the mark is a wolf's face.**
  The second look judgment: the copper palette didn't fit either. The ground is now the hunt pages' dark
  (`#11141b` family) and light; the colours are the editor's code palette, the same shades `/hub/code.js` uses —
  pink `#ff757f` as the accent, violet, green and orange, each app card's glyph in its own one. The type is the
  hunt's: IBM Plex Sans for text, Sans Condensed for headings and the wordmark, Mono for data, all served from
  `web/public/fonts`. The mark is one wolf-face polygon, the eyes cut back to the ground, the same points in
  `web/src/mark.tsx`, `favicon.svg` and `scripts/make-icons.ts` (a ray-cast polygon fill, sampled 3×3; first a
  howling silhouette, swapped for the face on the same day's ask). GO 2 was given on this design.
  Replaces: the 2026-11-20 palette and feather mark; the entry below keeps that day's other fix (the fonts are
  really served).

- **2026-11-20 · The design system is kestrel's own.**
  The gate-2 look judgment failed the guides' palette: flat, not polished. Two causes fixed. The palette is now
  kestrel's (warm graphite, cream, copper — the bird's colours), dark and light, all tokens in `web/src/styles.css`.
  And the IBM Plex fonts were named but never served, so every screen fell back to system fonts; they are now served
  from `web/public/fonts` (Sans variable, Serif for the wordmark and headings, Mono for data), never from the
  internet. One feather mark, drawn once and reused (`web/src/mark.tsx`, `favicon.svg`, `scripts/make-icons.ts`).
  Rejected: keeping the guides' palette; loading fonts from a CDN.

- **2026-11-20 · Navigation: a launcher, then one app at a time.**
  Home is the launcher. An app takes the whole screen, on the phone and on the computer; the top bar's mark returns
  home; the browser's Back always works (real routes, no overlays that trap it). Built from the Notes screens on.
  Rejected: apps beside each other on one page, as the old setup's hub does.

- **2026-11-17 · Deploy takes main, or a gate branch being judged.**
  A gate's GO is a judgment of the deployed app, which happens before the merge; so deploy accepts `gate-*` besides
  main. Committed code only still holds: deploy refuses a dirty tree and checks out an exact commit.
  Rejected: merging before the judgment, which would put unjudged work on main.

- **2026-11-16 · The review's round 1 is applied.**
  Ten findings, all fixed in the plan: the guard moved to the first build step, so nothing is pushed unguarded; its
  scope now covers email addresses, phone numbers and this computer's user and host names; Notes resolves symbolic
  links before the folder rule and takes UTF-8 only; the pre-migration copy is SQLite's own snapshot (VACUUM INTO),
  proven with WAL data; offline is checked on an opened document with notes; a note being typed survives closing the
  app; a model refusal is a tested failure; npm's 7-day rule is described as the filter it is; dialogs open with
  showModal(), which Android's Back closes. docs/review/round-1-plan.md has the findings and the outcome.

- **2026-11-16 · Decision entries are short and technical.**
  What was decided and why, in a few lines; no quotes, no personal details.

- **2026-11-16 · One design system for every screen.**
  One set of tokens (colors, type, spacing) and shared components, so no screen drifts into a look of its own. The
  tokens start from the learning guides' design (IBM Plex, the same dark and light palettes) and are set at the
  app-shell step, judged on the phone and the computer. The result must feel polished on both.
  Rejected: styling screens one by one.

- **2026-11-16 · The repository is public, with generic names.**
  Public needs no sharing setup and keeps the privacy rules honest: the repo holds code and made-up data only.
  App names say what a thing does, not whose it is: Notes, Searches, Applications, Learn.
  Rejected: a private repo; names tied to one use (Job Hunt, Deal Hunt).

- **2026-11-15 · Claude Code builds; a second model reviews.**
  The builder works one step at a time; every step is one commit, explained first and committed on a GO. Codex
  reviews the plan before a version is built (round 1) and the code after (round 2); plan findings are fixed in one
  commit, code findings one commit each with a failing test, one GO per batch.
  Rejected: a local model as the builder, driven by step cards (sessions exceeded the computer's memory; the process
  needed 35 files for three steps).

- **2026-11-15 · Three independent reviews before round 1.**
  The draft plan was reviewed for buildability, simplicity and fit: 74 findings, all applied. The serious ones: the
  sign-in rule admitted other devices; launchd would have run uncommitted code on real data; the first push came
  before the guard; the guard read a file no step created; the eval came after the feature it tests; text replacement
  had no rule for repeated matches.

- **2026-11-15 · Fresh history; only main and gate branches are pushed.**
  The plan is the first commit. Earlier work stays on the computer in `old/*` branches, which the pre-push hook
  refuses.

- **2026-11-15 · One branch per build gate, Conventional Commits.**
  Gate 1 (the plan) commits on main. Each build gate is `gate-<N>-<name>`, merged with a merge commit on its GO.
  Messages: `<type>(<scope>): <what changed>`; v0.1 is tagged at the review gate's GO.

- **2026-11-15 · Only the next version is planned step by step.**
  Steps planned weeks ahead go stale. Each version's runbook is written, and reviewed, when its turn comes.

- **2026-11-15 · Notes is the first app.**
  It is small and self-contained, and it proves every layer: the database, the phone app, the model client, an eval,
  and writing to a real file. Searches and Applications come next.
  Rejected: Tasks first (too little daily value); Applications first (the riskiest part, better on a proven base).

- **2026-11-15 · One source of truth.**
  Each fact is stored once, and every page and agent reads it there instead of keeping a copy.

- **2026-11-15 · One package, one Node process.**
  The process serves the API and the app's files, and runs the background jobs. Folders and one lint rule keep the
  parts apart.
  Rejected: a workspace of packages; separate server, worker and model-queue services.

- **2026-11-15 · Node 26 runs the TypeScript directly.**
  Type stripping is stable in Node 26 (long-term support until 2029-04-30), so the server has no build step. Node
  26.11 or later, for `node:sqlite`'s current class names. Only erasable TypeScript: no enum, namespace or parameter
  properties.

- **2026-11-15 · npm, exact versions, releases at least 7 days old.**
  npm comes with Node, and one package needs no workspace; `.npmrc` keeps the rules in the repo. The age rule is a
  filter (min-release-age): npm picks an older qualifying version or fails, it does not wait.
  Rejected: pnpm workspaces.

- **2026-11-15 · SQLite through `node:sqlite`, with plain SQL.**
  Numbered `.sql` migrations tracked with `PRAGMA user_version`; a small `tx()` helper; WAL mode and STRICT tables.
  The database is copied before migrations run with SQLite's own snapshot (`VACUUM INTO`), which includes committed
  WAL-mode changes; an applied migration is never edited: a fix is a new migration.
  `node:sqlite` is built in, and a few tables need no ORM; zod checks what comes in.
  Rejected: Drizzle 1.0 (its `node:sqlite` support is a release candidate). Fallback: Drizzle 0.45 with
  better-sqlite3.

- **2026-11-15 · Hono 4 for the server, zod 4 at every input, plain fetch to the model server.**
  Hono is small and typed; fetch is built in, and one client of under a hundred lines covers JSON answers and
  streaming.
  Rejected: the openai package (built for an API the local model server doesn't offer); the Vercel AI SDK (an agent
  framework's weight).

- **2026-11-15 · The app: React 19 and Vite 8, kept lean.**
  React Router in its simplest mode, TanStack Query for server data, Tailwind 4 with the tokens in one file, native
  HTML elements first (a panel is a `<dialog>` opened with `showModal()`, which Android's Back closes). Measured on this computer: the server's
  tools are 10 packages and 127 MB; the app adds about 50 packages and 65 MB.
  Rejected: htmx with server-rendered pages (lightest, but weaker offline and less app-like; the runner-up); Preact
  (no lighter on disk with Vite 8); Next.js (heaviest, and a poor fit for offline and background work).

- **2026-11-15 · Installable, and read-only offline.**
  A static manifest and one hand-written service worker, network first with a 3-second fallback to the last copy
  ("Computer asleep since …").
  Rejected: offline writes with sync (among the hardest parts of any app); vite-plugin-pwa (322 packages).

- **2026-11-15 · Live updates wait for v0.3.**
  In v0.1 a screen refetches when it comes back to the front, and polls while a draft is being made. One
  server-sent-events stream arrives with Applications, which actually has live state.

- **2026-11-15 · Every request carries my Tailscale login.**
  Tailscale Serve adds it for my devices and strips forged copies; there is no local-request exception, because a
  request from any program or page on the computer looks local too. Deploy reads the login from Tailscale and writes
  it into the settings. Writes must come from the app's own address.
  Rejected: trusting requests made on the computer itself.

- **2026-11-15 · launchd runs committed main only, from a second checkout.**
  `node --run deploy` refuses uncommitted changes and other branches, updates a separate worktree, builds there and
  restarts. A crash can then never restart unreviewed code on real data.

- **2026-11-15 · Personal data lives in one folder outside the repo.**
  `~/Library/Application Support/kestrel/` holds the database, uploads and `settings.json`, and only the deployed app
  uses it; development, tests and evals run on a folder of made-up data. Logs hold ids, counts, durations and kinds
  of error, never words, names or paths.

- **2026-11-15 · A guard in the git hooks, as the first build step.**
  Before every commit and push: gitleaks for keys and passwords, any staged file `.gitignore` covers, home paths with
  a user name, email addresses, phone-number shapes, and this computer's user and host names, read when the guard
  runs. It never prints what it found. Free-form details (an employer, a search's words) have no pattern: they stay a
  rule for the builder and the reviews. The whole history is scanned before the first push, and the guard is built
  before any other commit.
  Rejected: a hand-written list of private terms (one more file to maintain); per-line fingerprints.

- **2026-11-15 · Few tests, each for a behaviour that would be noticed if it broke.**
  Node's built-in test runner; Biome and TypeScript 7 as the only checkers; one `node --run check` command, run by
  the pre-commit hook. Edge cases are handled in code; a test is added when one actually breaks.
  Rejected: Vitest on the server; ESLint and Prettier; CI on hosted runners for now.

- **2026-11-15 · Evals are written before each AI feature.**
  A few labelled, made-up cases and a scorer in code; the stand-in model runs inside the check; a live run on the
  local models picks the default model before the feature is first used.
  Rejected: Inspect AI (a second language toolchain); promptfoo (608 packages, telemetry on by default); vitest-evals
  (pre-1.0).

- **2026-11-15 · The app's AI runs on the computer's own models.**
  Through the existing model queue (Qwen careful, Ornith fast) until the queue moves into kestrel. The client refuses
  a model not listed in the settings. A cloud model only per feature, chosen explicitly and shown on screen; Notes
  never uses one.

- **2026-11-15 · Notes edits text files where they are.**
  Text files from settings-listed folders, or uploads, up to 200 KB: UTF-8 only, paths resolved through symbolic
  links before the folder rule. The reader shows the file as written, so a note is a range of the file's own
  characters. The model answers with an overview and find-and-replace changes tied to
  the notes; code places each change only where its text matches once (or nearest its note), and lists the rest. A
  draft stays until saved or discarded; save requires the file unchanged since the draft, keeps encoding and line
  endings, and keeps one previous version for Undo.
  Rejected: rewriting the whole file with the model (slow, and it can reword untouched parts); anchoring notes on
  rendered Markdown; a version folder per file.

- **2026-11-15 · Guides join Learn (v0.4).**
  A guide is data in the guide prompt's format, one lesson per page, read aloud; its check questions become practice
  cards.

- **2026-11-15 · Chats stay in the existing chat app; kestrel links to them.**

- **2026-11-15 · Not now.**
  An MCP server (commands come first), a Python bench, a Rust track. A notification channel is decided in v0.3,
  where it is first needed.

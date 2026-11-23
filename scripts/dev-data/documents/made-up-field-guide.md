# The hive year: a made-up field guide

A made-up guide for development: every kind of block and mark a document of mine uses, so the reader, the editor and
the print page can be checked on something long. **Nothing here is real.** It is _made up_, start to end, and some of
it is ~~wrong~~ on purpose. Commands look like `node --run check`; links look like [the guide's site](https://example.org/guide)
or a bare address, https://example.org/hives, and www.example.org works too.

A line with two spaces at its end  
breaks there, and so does one with a backslash\
at its end. Otherwise lines run on
into one paragraph, the way Markdown reads them.

## Contents

1. [Spring: waking the hive](#spring-waking-the-hive)
2. [Summer: room to grow](#summer-room-to-grow)
3. [Autumn: honey and stores](#autumn-honey-and-stores)
4. [Winter: the quiet months](#winter-the-quiet-months)
5. [The records](#the-records)

---

## Spring: waking the hive

The first warm day decides the season. A keeper who opens the hive too early chills the brood; one who opens it too
late finds a colony that has already made its own plans. **Wait for a still day above 14 °C**, open quickly, and close
again before the bees notice the cold.

### What to check first

- The queen, or signs of her:
  - eggs standing upright in the cells
  - a tight, even pattern of capped brood
    - patchy brood can mean an old queen
    - or a disease: look closer before deciding
- Stores: at least **two full frames** of honey
- The floor: dead bees are normal, a carpet of them is not

### The spring list

- [x] Clean the floor and the entrance
- [x] Weigh each hive by lifting one side
- [ ] Mark the queens that are not marked yet
- [ ] Order frames for the summer boxes

> A calm hive in April is worth two strong ones in June.
>
> - Calm is a sign of a good queen
> - Strength comes later, with the flowers
>
> > Or so the old keepers say, and they are mostly right.

#### A note on timing

The dates below are a made-up region's; a colder place starts later.

| Week | Task                        |     Who     |   Time |
| :--- | :-------------------------- | :---------: | -----: |
| 10   | First look, stores only     | One keeper  | 10 min |
| 12   | Full check, queen and brood | Two keepers | 25 min |
| 14   | Add the first box           | One keeper  | 15 min |
| 16   | Swarm watch begins          |  Everyone   | weekly |

## Summer: room to grow

A colony that runs out of room swarms. Give it room **before** it needs it: one box ahead of the bees, always.

3. Add a box when seven of ten frames are full.
4. Check for queen cells every seven days.
5. Split a colony that has started cells, rather than cut them out.

A loose list, with room between its points:

- Room above the brood keeps the queen laying.

  An empty box on top also gives the foragers somewhere to put the nectar.

- Water close by saves the bees long trips on hot days.

- Shade in the afternoon keeps the brood from overheating.

### The swarm check, as code

The check, written as a small made-up function:

```js
// true when the colony is getting ready to swarm
function readyToSwarm(hive) {
  const cells = hive.frames.flatMap((f) => f.queenCells);
  return cells.some((c) => c.state === "capped") || hive.fullFrames / hive.frames.length > 0.7;
}
```

And a long line, which scrolls inside its own frame instead of pushing the page sideways on a phone:

```text
week 12 · hive 3 · queen seen · brood 7 frames · stores 3 frames · temper calm · queen cells none · room 2 boxes · next check week 13
```

The same idea as an indented block:

    hive 1: room
    hive 2: room, water
    hive 3: split

## Autumn: honey and stores

Take only what the colony can spare. The rule of thumb in this made-up guide: **leave 18 kg** for a strong colony,
more for a weak one. The rest is yours.

| Hive | Boxes | Frames full | Honey taken | Left for winter | Treated | Queen age | Temper    | Notes                                                                                     |
| ---- | ----: | ----------: | ----------: | --------------: | :-----: | --------: | --------- | ----------------------------------------------------------------------------------------- |
| 1    |     3 |          24 |       12 kg |           20 kg |   yes   |    1 year | calm      | strong, a good queen: the best of the four this year, and the one to split from in spring |
| 2    |     2 |          14 |        4 kg |           18 kg |   yes   |   2 years | calm      | needs watching                                                                            |
| 3    |     2 |          11 |        none |           16 kg |   yes   |       new | lively    | fed in October                                                                            |
| 4    |     3 |          26 |       15 kg |           21 kg |   no    |   3 years | defensive | requeen in spring                                                                         |

Escaped marks show as themselves: \*not emphasis\*, \# not a heading, \[not a link\](nowhere), and 2 \* 3 = 6.

## Winter: the quiet months

Leave them alone. Lift each hive once a month to feel its weight; feed only when it feels light.

> **Never open a hive below 10 °C.** The cluster breaks and the bees chill.

Raw HTML is never drawn, only shown as written: <b>this is not bold</b>, and <script>alert("no")</script> stays words.
A link that could run code stays words too: [click me](javascript:alert(1)).

An image shows as a link to it, so nothing is fetched by itself: ![a made-up hive](https://example.org/hive.png).

## The records

Keep one line per visit. The form below is the one the made-up team uses.

### A visit

1. Date and weather
2. Hive number
3. What was seen:
   - the queen, or eggs
   - brood frames
   - stores frames
4. What was done
5. What to do next time

### The year in numbers

| Month   | Visits | Honey (kg) |
| :------ | -----: | ---------: |
| April   |      8 |          0 |
| June    |     14 |         22 |
| August  |     10 |         31 |
| October |      6 |          9 |

---

The end of the made-up guide. Back to the [contents](#contents).

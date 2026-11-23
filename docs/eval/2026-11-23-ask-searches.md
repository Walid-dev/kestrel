# The fourth live eval: Ask on Searches, a find and the changes it proposes (2026-11-23)

Every case from `evals/searches/cases.json`, twice per model, through the real model door (`node
evals/searches/run.ts --live --model both --runs 2 --md`). A made-up hunt of six listings in view becomes the page the
app builds (`searchAskPage`), its tools included, and each question goes through Ask's own prompt and the
conversation client, with the app's budget (6,000 tokens, thinking on). The scorer reads the blocks in the answer: a
find when the answer lies beyond the listings in view, a change proposed for the right listing and never claimed as
made, no block for a question about the work itself, and links only to listings that exist.

**24 of 24 runs pass on the final prompt.** Qwen (careful): 12 of 12, 3.1–34.4 s, 10.0 s on average. Ornith (fast):
12 of 12, 1.9–12.7 s, 5.4 s on average.

How the prompt got there, one change per run:

1. The first prompt: Qwen 6 of 6, Ornith 3 of 6. Ornith made up a listing's id for a link, left out a stage's card
   once, and twice said a change was made before any tap.
2. The prompt says the model can't change anything itself (it proposes, a card shows, my tap makes it) and that an
   id is the text that starts a listing's line: 21 of 24. Every change and link passed on both models; three answers
   ran a find for a question about the work itself.
3. The prompt says when a find is needed and when not: 19 of 24. Fewer needless finds, but three answers named the
   top listing without linking it, and one link carried an id made up after the prompt's own example id.
4. The link rule without an example id ("each time you name a listing, link it"): 24 of 24.

**The outcome: Ask keeps the fast model by default.** It passed every case on the final prompt in about half the
careful model's time. The rest holds by construction, whatever the model writes: a change runs only on my tap,
through the page's own functions; a card for a listing that isn't there is dropped; and a link to one becomes plain
words before the answer is kept. A model's slip costs a missing card or an extra look, never a wrong change.

| case              | model                       | run | result | time  |
| ----------------- | --------------------------- | --- | ------ | ----- |
| beyond-the-view   | Qwen3.8-27B-oQ4e-mtp        | 1   | pass   | 13.5s |
| beyond-the-view   | Qwen3.8-27B-oQ4e-mtp        | 2   | pass   | 4.4s  |
| from-the-view     | Qwen3.8-27B-oQ4e-mtp        | 1   | pass   | 11.5s |
| from-the-view     | Qwen3.8-27B-oQ4e-mtp        | 2   | pass   | 7.2s  |
| pass-on-one       | Qwen3.8-27B-oQ4e-mtp        | 1   | pass   | 4.9s  |
| pass-on-one       | Qwen3.8-27B-oQ4e-mtp        | 2   | pass   | 3.5s  |
| deep-check        | Qwen3.8-27B-oQ4e-mtp        | 1   | pass   | 3.9s  |
| deep-check        | Qwen3.8-27B-oQ4e-mtp        | 2   | pass   | 3.1s  |
| apply-to-one      | Qwen3.8-27B-oQ4e-mtp        | 1   | pass   | 3.7s  |
| apply-to-one      | Qwen3.8-27B-oQ4e-mtp        | 2   | pass   | 3.8s  |
| about-the-subject | Qwen3.8-27B-oQ4e-mtp        | 1   | pass   | 34.4s |
| about-the-subject | Qwen3.8-27B-oQ4e-mtp        | 2   | pass   | 25.9s |
| beyond-the-view   | Ornith-1.5-35B-A3B-MLX-4bit | 1   | pass   | 12.7s |
| beyond-the-view   | Ornith-1.5-35B-A3B-MLX-4bit | 2   | pass   | 4.1s  |
| from-the-view     | Ornith-1.5-35B-A3B-MLX-4bit | 1   | pass   | 5.5s  |
| from-the-view     | Ornith-1.5-35B-A3B-MLX-4bit | 2   | pass   | 5.0s  |
| pass-on-one       | Ornith-1.5-35B-A3B-MLX-4bit | 1   | pass   | 9.3s  |
| pass-on-one       | Ornith-1.5-35B-A3B-MLX-4bit | 2   | pass   | 2.4s  |
| deep-check        | Ornith-1.5-35B-A3B-MLX-4bit | 1   | pass   | 2.2s  |
| deep-check        | Ornith-1.5-35B-A3B-MLX-4bit | 2   | pass   | 2.5s  |
| apply-to-one      | Ornith-1.5-35B-A3B-MLX-4bit | 1   | pass   | 2.4s  |
| apply-to-one      | Ornith-1.5-35B-A3B-MLX-4bit | 2   | pass   | 1.9s  |
| about-the-subject | Ornith-1.5-35B-A3B-MLX-4bit | 1   | pass   | 8.9s  |
| about-the-subject | Ornith-1.5-35B-A3B-MLX-4bit | 2   | pass   | 8.3s  |
